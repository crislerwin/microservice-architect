import { DynamicStructuredTool } from "@langchain/core/tools";
import * as fs from "fs";
import * as path from "path";
import { z } from "zod";

/**
 * GraphQLAnalyzerTool - Analyzes GraphQL schemas and operations in microservices
 * Extracts:
 * - Queries and mutations
 * - Types and inputs
 * - Federation directives (@key, @extends, @external)
 * - Data sources (tables, collections)
 * - Relationships between services
 */
export const GraphQLAnalyzerTool = new DynamicStructuredTool({
  name: "analyze_graphql",
  description:
    "Analyzes GraphQL schemas and operations in microservices. Extracts queries, mutations, types, federation directives, and data sources. Input: servicePath (absolute path to service directory).",
  schema: z.object({
    servicePath: z
      .string()
      .describe("Absolute path to the service directory containing GraphQL schemas"),
  }),
  func: async ({ servicePath }) => {
    try {
      const result = {
        serviceName: path.basename(servicePath),
        schema: {
          queries: [] as any[],
          mutations: [] as any[],
          subscriptions: [] as any[],
          types: [] as any[],
          inputs: [] as any[],
          enums: [] as any[],
        },
        federation: {
          isFederated: false,
          entities: [] as string[],
          extends: [] as string[],
          externalReferences: [] as any[],
          keys: [] as any[],
        },
        dataSources: {
          tables: [] as string[],
          collections: [] as string[],
          databases: [] as string[],
        },
        relationships: [] as any[],
      };

      // Find GraphQL schema files
      const schemaPaths = [
        path.join(servicePath, "schema.graphql"),
        path.join(servicePath, "src", "schema.graphql"),
        path.join(servicePath, "graphql", "schema.graphql"),
        path.join(servicePath, "src", "graphql", "schema.graphql"),
        path.join(servicePath, "typeDefs.graphql"),
      ];

      let schemaContent = "";
      let schemaFileFound = "";

      for (const schemaPath of schemaPaths) {
        if (fs.existsSync(schemaPath)) {
          schemaContent = fs.readFileSync(schemaPath, "utf-8");
          schemaFileFound = schemaPath;
          break;
        }
      }

      // Also check for .ts/.js files with GraphQL definitions
      if (!schemaContent) {
        const searchPaths = [path.join(servicePath, "src"), path.join(servicePath, "graphql")];

        for (const searchPath of searchPaths) {
          if (!fs.existsSync(searchPath)) continue;

          const files = fs.readdirSync(searchPath, { recursive: true }) as string[];
          for (const file of files) {
            if (typeof file === "string" && (file.endsWith(".ts") || file.endsWith(".js"))) {
              const fullPath = path.join(searchPath, file);
              if (fs.existsSync(fullPath)) {
                const content = fs.readFileSync(fullPath, "utf-8");
                if (
                  content.includes("gql`") ||
                  content.includes("typeDefs") ||
                  content.includes("@key")
                ) {
                  schemaContent += content + "\n";
                }
              }
            }
          }
        }
      }

      // Parse GraphQL content
      if (schemaContent) {
        // Extract Query definitions
        const queryMatches = schemaContent.match(/type\s+Query\s*{([^}]+)}/s);
        if (queryMatches) {
          const queryFields = queryMatches[1].match(/(\w+)\s*\([^)]*\)?\s*:\s*[^\n]+/g);
          if (queryFields) {
            result.schema.queries = queryFields.map((field) => {
              const match = field.match(/(\w+)\s*\(([^)]*)\)?\s*:\s*(.+)/);
              return {
                name: match?.[1] || field.trim(),
                args: match?.[2]?.split(/,\s*/).filter(Boolean) || [],
                returnType: match?.[3]?.trim() || "Unknown",
              };
            });
          }
        }

        // Extract Mutation definitions
        const mutationMatches = schemaContent.match(/type\s+Mutation\s*{([^}]+)}/s);
        if (mutationMatches) {
          const mutationFields = mutationMatches[1].match(/(\w+)\s*\([^)]*\)?\s*:\s*[^\n]+/g);
          if (mutationFields) {
            result.schema.mutations = mutationFields.map((field) => {
              const match = field.match(/(\w+)\s*\(([^)]*)\)?\s*:\s*(.+)/);
              return {
                name: match?.[1] || field.trim(),
                args: match?.[2]?.split(/,\s*/).filter(Boolean) || [],
                returnType: match?.[3]?.trim() || "Unknown",
              };
            });
          }
        }

        // Extract custom Types
        const typeMatches = schemaContent.match(
          /type\s+(?!Query|Mutation|Subscription)(\w+)\s*{([^}]+)}/g,
        );
        if (typeMatches) {
          result.schema.types = typeMatches.map((type) => {
            const match = type.match(/type\s+(\w+)\s*{([^}]+)}/s);
            return {
              name: match?.[1] || "Unknown",
              fields:
                match?.[2]
                  ?.trim()
                  .split("\n")
                  .map((f) => f.trim())
                  .filter(Boolean) || [],
            };
          });
        }

        // Extract Federation directives
        if (
          schemaContent.includes("@key") ||
          schemaContent.includes("@extends") ||
          schemaContent.includes("@external")
        ) {
          result.federation.isFederated = true;

          // Find @key directives
          const keyMatches = schemaContent.match(/@key\s*\(\s*fields:\s*["']([^"']+)["']\s*\)/g);
          if (keyMatches) {
            result.federation.keys = keyMatches.map((k) => {
              const match = k.match(/fields:\s*["']([^"']+)["']/);
              return match?.[1] || "";
            });
          }

          // Find entities
          const entityMatches = schemaContent.match(/type\s+(\w+)\s+[^@]*@key/g);
          if (entityMatches) {
            result.federation.entities = entityMatches
              .map((m) => {
                const match = m.match(/type\s+(\w+)/);
                return match?.[1] || "";
              })
              .filter(Boolean);
          }

          // Find @extends
          const extendsMatches = schemaContent.match(/@extends/g);
          if (extendsMatches) {
            result.federation.extends = ["Query", "Mutation"]; // Common extended types
          }

          // Find @external references
          const externalMatches = schemaContent.match(/(\w+):\s*\w+\s*@external/g);
          if (externalMatches) {
            result.federation.externalReferences = externalMatches.map((m) => {
              const match = m.match(/(\w+):/);
              return {
                field: match?.[1] || "",
                service: "external",
              };
            });
          }
        }

        // Extract database/table references from field names or comments
        const tablePatterns = [
          /@db\.table\(['"`]([^'"`]+)['"`]\)/g,
          /@collection\(['"`]([^'"`]+)['"`]\)/g,
          /@table\(['"`]([^'"`]+)['"`]\)/g,
        ];

        for (const pattern of tablePatterns) {
          const matches = schemaContent.matchAll(pattern);
          for (const match of matches) {
            if (match[1]) {
              result.dataSources.tables.push(match[1]);
            }
          }
        }

        // Infer collections from type names (MongoDB convention)
        const collectionTypes = result.schema.types.filter(
          (t) =>
            t.name.toLowerCase().endsWith("collection") ||
            t.name.toLowerCase().endsWith("document"),
        );
        result.dataSources.collections = collectionTypes.map((t) => t.name);

        // Find relationships (@resolveReference, @requires)
        const relationshipMatches = schemaContent.match(
          /(\w+):\s*\w+!?\s*@requires|(\w+)\s*\([^)]*\)\s*:\s*\w+!?\s*@resolveReference/g,
        );
        if (relationshipMatches) {
          result.relationships = relationshipMatches.map((r) => ({
            type: "federation",
            description: r.trim(),
          }));
        }
      }

      // Check for Prisma schema
      const prismaPaths = [
        path.join(servicePath, "prisma", "schema.prisma"),
        path.join(servicePath, "schema.prisma"),
      ];

      for (const prismaPath of prismaPaths) {
        if (fs.existsSync(prismaPath)) {
          const prismaContent = fs.readFileSync(prismaPath, "utf-8");

          // Extract models (tables)
          const modelMatches = prismaContent.match(/model\s+(\w+)\s*{([^}]+)}/g);
          if (modelMatches) {
            modelMatches.forEach((model) => {
              const match = model.match(/model\s+(\w+)/);
              if (match?.[1]) {
                result.dataSources.tables.push(match[1]);
              }
            });
          }

          // Extract datasource
          const datasourceMatch = prismaContent.match(/datasource\s+(\w+)\s*{([^}]+)}/s);
          if (datasourceMatch) {
            const providerMatch = datasourceMatch[2].match(/provider\s*=\s*["']([^"']+)["']/);
            if (providerMatch) {
              result.dataSources.databases.push(providerMatch[1]);
            }
          }
        }
      }

      // Check for MongoDB schemas
      const mongoPaths = [
        path.join(servicePath, "src", "models"),
        path.join(servicePath, "models"),
      ];

      for (const mongoPath of mongoPaths) {
        if (fs.existsSync(mongoPath)) {
          const files = fs.readdirSync(mongoPath);
          files.forEach((file) => {
            if (file.endsWith(".ts") || file.endsWith(".js")) {
              const collectionName = file.replace(/\.(ts|js)$/, "");
              if (!result.dataSources.collections.includes(collectionName)) {
                result.dataSources.collections.push(collectionName);
              }
            }
          });
        }
      }

      // Remove duplicates
      result.dataSources.tables = [...new Set(result.dataSources.tables)];
      result.dataSources.collections = [...new Set(result.dataSources.collections)];
      result.dataSources.databases = [...new Set(result.dataSources.databases)];

      return JSON.stringify(result, null, 2);
    } catch (error) {
      return `Error analyzing GraphQL: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
});

/**
 * FederationMapperTool - Maps GraphQL Federation relationships between services
 */
export const FederationMapperTool = new DynamicStructuredTool({
  name: "map_federation",
  description:
    "Maps GraphQL Federation relationships between services. Identifies entity ownership, references, and gateway composition. Input: projectRoot (absolute path to project root).",
  schema: z.object({
    projectRoot: z
      .string()
      .describe("Absolute path to the project root containing all federated services"),
  }),
  func: async ({ projectRoot }) => {
    try {
      const result = {
        gateway: null as string | null,
        services: [] as any[],
        entities: {} as Record<string, { owner: string; fields: string[]; referencedBy: string[] }>,
        supergraph: [] as any[],
      };

      const fs = require("fs");
      const path = require("path");

      // Find gateway
      const gatewayIndicators = ["gateway", "federation-gateway", "supergraph"];
      const entries = fs.readdirSync(projectRoot, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const name = entry.name.toLowerCase();
        if (gatewayIndicators.some((ind) => name.includes(ind))) {
          result.gateway = entry.name;
          break;
        }

        // Check for @apollo/gateway or @graphql-tools/stitch
        const packageJsonPath = path.join(projectRoot, entry.name, "package.json");
        if (fs.existsSync(packageJsonPath)) {
          const content = fs.readFileSync(packageJsonPath, "utf-8");
          if (content.includes("@apollo/gateway") || content.includes("graphql-tools")) {
            result.gateway = entry.name;
            break;
          }
        }
      }

      // Analyze each service for federation
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith(".")) continue;

        const servicePath = path.join(projectRoot, entry.name);
        const serviceInfo = {
          name: entry.name,
          entities: [] as string[],
          owns: [] as string[],
          references: [] as any[],
        };

        // Search for GraphQL files
        const searchForSchemas = (dir: string) => {
          if (!fs.existsSync(dir)) return;

          const files = fs.readdirSync(dir, { withFileTypes: true });
          for (const file of files) {
            const fullPath = path.join(dir, file.name);

            if (file.isDirectory()) {
              searchForSchemas(fullPath);
            } else if (file.name.endsWith(".graphql") || file.name.endsWith(".gql")) {
              const content = fs.readFileSync(fullPath, "utf-8");

              // Find entities owned by this service
              const entityMatches = content.match(/type\s+(\w+)\s+[^@]*@key/g);
              if (entityMatches) {
                entityMatches.forEach((m: string) => {
                  const match = m.match(/type\s+(\w+)/);
                  if (match?.[1]) {
                    serviceInfo.entities.push(match[1]);
                    serviceInfo.owns.push(match[1]);

                    if (!result.entities[match[1]]) {
                      result.entities[match[1]] = {
                        owner: entry.name,
                        fields: [],
                        referencedBy: [],
                      };
                    }
                  }
                });
              }

              // Find references to external entities
              const externalMatches = content.match(/(\w+):\s*\w+\s*@external/g);
              if (externalMatches) {
                externalMatches.forEach((m: string) => {
                  const match = m.match(/(\w+):/);
                  if (match?.[1]) {
                    serviceInfo.references.push({
                      field: match[1],
                      service: "external",
                    });
                  }
                });
              }
            }
          }
        };

        searchForSchemas(servicePath);

        if (serviceInfo.entities.length > 0 || serviceInfo.references.length > 0) {
          result.services.push(serviceInfo);
        }
      }

      // Build supergraph
      for (const [entity, info] of Object.entries(result.entities)) {
        const entityServices = result.services.filter((s) =>
          s.references.some((r: any) => r.entity === entity),
        );
        info.referencedBy = entityServices.map((s) => s.name);

        result.supergraph.push({
          entity,
          owner: info.owner,
          referencedBy: info.referencedBy,
        });
      }

      return JSON.stringify(result, null, 2);
    } catch (error) {
      return `Error mapping federation: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
});

/**
 * DatabaseSchemaAnalyzer - Analyzes database schemas and tenant configurations
 */
export const DatabaseSchemaAnalyzer = new DynamicStructuredTool({
  name: "analyze_database_schemas",
  description:
    "Analyzes database schemas, tenant configurations, and table/collection usage. Input: servicePath (absolute path to service).",
  schema: z.object({
    servicePath: z.string().describe("Absolute path to the service directory"),
  }),
  func: async ({ servicePath }) => {
    try {
      const result = {
        serviceName: path.basename(servicePath),
        database: {
          type: null as string | null,
          tenantStrategy: null as string | null, // separate-db, schema-per-tenant, shared
        },
        tables: [] as any[],
        collections: [] as any[],
        queries: [] as any[],
        mutations: [] as any[],
      };

      // Check for Prisma
      const prismaPath = path.join(servicePath, "prisma", "schema.prisma");
      if (fs.existsSync(prismaPath)) {
        const prismaContent = fs.readFileSync(prismaPath, "utf-8");

        // Detect database type
        const providerMatch = prismaContent.match(/provider\s*=\s*["']([^"']+)["']/);
        if (providerMatch) {
          result.database.type = providerMatch[1];
        }

        // Detect tenant strategy
        if (prismaContent.includes("@@schema") || prismaContent.includes("@tenant")) {
          result.database.tenantStrategy = "schema-per-tenant";
        } else if (prismaContent.includes("tenantId") || prismaContent.includes("tenant_id")) {
          result.database.tenantStrategy = "shared-with-tenant-id";
        }

        // Extract models
        const modelMatches = prismaContent.matchAll(/model\s+(\w+)\s*{([^}]+)}/gs);
        for (const match of modelMatches) {
          const modelName = match[1];
          const modelBody = match[2];

          const fields = modelBody.match(/(\w+)\s+\w+[^\n]*/g)?.map((f) => f.trim()) || [];

          result.tables.push({
            name: modelName,
            fields: fields.map((f) => {
              const parts = f.split(/\s+/);
              return { name: parts[0], type: parts[1] || "Unknown" };
            }),
            hasTenantId: fields.some((f) => f.includes("tenantId") || f.includes("tenant_id")),
          });
        }
      }

      // Check for MongoDB Mongoose schemas
      const modelsPath = path.join(servicePath, "src", "models");
      if (fs.existsSync(modelsPath)) {
        const files = fs.readdirSync(modelsPath);
        files.forEach((file) => {
          if (file.endsWith(".ts")) {
            const content = fs.readFileSync(path.join(modelsPath, file), "utf-8");
            const collectionName = file.replace(".ts", "");

            // Extract schema fields
            const fieldMatches = content.match(/(\w+):\s*{(\s*type:[^}]+)}/g);
            const fields =
              fieldMatches
                ?.map((m) => {
                  const match = m.match(/(\w+):\s*{/);
                  return match?.[1];
                })
                .filter(Boolean) || [];

            result.collections.push({
              name: collectionName,
              fields,
              hasTenantId: content.includes("tenantId") || content.includes("tenant_id"),
            });
          }
        });
      }

      // Check for database queries
      const srcPath = path.join(servicePath, "src");
      if (fs.existsSync(srcPath)) {
        const scanForQueries = (dir: string) => {
          if (!fs.existsSync(dir)) return;
          const files = fs.readdirSync(dir, { withFileTypes: true });

          for (const file of files) {
            const fullPath = path.join(dir, file.name);

            if (file.isDirectory()) {
              scanForQueries(fullPath);
            } else if (file.name.endsWith(".ts")) {
              const content = fs.readFileSync(fullPath, "utf-8");

              // Find Prisma queries
              const prismaQueries = content.match(
                /prisma\.(\w+)\.(findMany|findUnique|findFirst|create|update|delete|upsert)/g,
              );
              if (prismaQueries) {
                prismaQueries.forEach((q) => {
                  const parts = q.split(".");
                  if (parts.length >= 3) {
                    result.queries.push({
                      table: parts[1],
                      operation: parts[2],
                      source: file.name,
                    });
                  }
                });
              }

              // Find MongoDB queries
              const mongoQueries = content.match(
                /\.(find|findOne|findById|create|updateOne|deleteOne)\(/g,
              );
              if (mongoQueries) {
                result.queries.push({
                  type: "mongodb",
                  operations: mongoQueries.map((q) => q.replace("(", "")),
                  source: file.name,
                });
              }
            }
          }
        };

        scanForQueries(srcPath);
      }

      return JSON.stringify(result, null, 2);
    } catch (error) {
      return `Error analyzing database: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
});
