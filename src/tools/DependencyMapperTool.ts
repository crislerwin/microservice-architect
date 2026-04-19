import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";

/**
 * Maps dependencies between microservices by analyzing:
 * - HTTP calls to other services
 * - Database sharing
 * - Message queue publications/subscriptions
 * - Shared libraries
 */
export const DependencyMapperTool = new DynamicStructuredTool({
  name: "map_dependencies",
  description:
    "Maps dependencies between microservices. Input: projectRoot (absolute path to project root containing all services).",
  schema: z.object({
    projectRoot: z
      .string()
      .describe("Absolute path to the project root directory containing all microservices"),
  }),
  func: async ({ projectRoot }) => {
    try {
      const services: Record<
        string,
        {
          calls: string[];
          calledBy: string[];
          sharedDatabases: string[];
          publishesTo: string[];
          subscribesTo: string[];
        }
      > = {};

      // Find all service directories
      const entries = fs.readdirSync(projectRoot, { withFileTypes: true });
      const serviceDirs = entries
        .filter((e) => e.isDirectory() && !e.name.startsWith(".") && !e.name.startsWith("node_modules"))
        .map((e) => path.join(projectRoot, e.name));

      // Initialize service objects
      for (const servicePath of serviceDirs) {
        const serviceName = path.basename(servicePath);
        services[serviceName] = {
          calls: [],
          calledBy: [],
          sharedDatabases: [],
          publishesTo: [],
          subscribesTo: [],
        };

        // Scan source files for inter-service calls
        const scanForCalls = (dir: string) => {
          if (!fs.existsSync(dir)) return;
          const files = fs.readdirSync(dir);
          for (const file of files) {
            const fullPath = path.join(dir, file);
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory() && file !== "node_modules") {
              scanForCalls(fullPath);
            } else if (
              file.endsWith(".ts") ||
              file.endsWith(".js") ||
              file.endsWith(".py") ||
              file.endsWith(".go")
            ) {
              const content = fs.readFileSync(fullPath, "utf-8");

              // Look for HTTP calls to other services
              const httpPatterns = [
                /fetch\(['"`](http:\/\/[^'"`]+)/gi,
                /axios\.(get|post|put|delete)\(['"`](http:\/\/[^'"`]+)/gi,
                /http\.request\(['"`](http:\/\/[^'"`]+)/gi,
              ];

              for (const pattern of httpPatterns) {
                const matches = content.match(pattern);
                if (matches) {
                  for (const match of matches) {
                    // Extract service name from URL
                    const urlMatch = match.match(/http:\/\/([^:]+)/);
                    if (urlMatch) {
                      const targetService = urlMatch[1];
                      if (targetService !== serviceName && !services[serviceName].calls.includes(targetService)) {
                        services[serviceName].calls.push(targetService);
                      }
                    }
                  }
                }
              }

              // Look for message queue patterns
              if (content.includes("producer") || content.includes("publish")) {
                const topicMatches = content.match(/['"`]([^'"`]+topic[^'"`]*)['"`]/gi);
                if (topicMatches) {
                  services[serviceName].publishesTo.push(
                    ...topicMatches.map((m) => m.replace(/['"`]/g, ""))
                  );
                }
              }

              if (content.includes("consumer") || content.includes("subscribe")) {
                const topicMatches = content.match(/['"`]([^'"`]+topic[^'"`]*)['"`]/gi);
                if (topicMatches) {
                  services[serviceName].subscribesTo.push(
                    ...topicMatches.map((m) => m.replace(/['"`]/g, ""))
                  );
                }
              }

              // Look for database references
              const dbPatterns = [
                /DATABASE_URL.*\/\/([^\/]+)/,
                /DB_HOST['"`]?\s*[=:]\s*['"`]([^'"`]+)/,
              ];
              for (const pattern of dbPatterns) {
                const match = content.match(pattern);
                if (match) {
                  services[serviceName].sharedDatabases.push(match[1]);
                }
              }
            }
          }
        };

        scanForCalls(servicePath);
      }

      // Build reverse dependencies (calledBy)
      for (const [serviceName, deps] of Object.entries(services)) {
        for (const calledService of deps.calls) {
          if (services[calledService] && !services[calledService].calledBy.includes(serviceName)) {
            services[calledService].calledBy.push(serviceName);
          }
        }
      }

      // Generate dependency graph
      const dependencyGraph = {
        nodes: Object.keys(services).map((name) => ({ id: name, label: name })),
        edges: [] as { from: string; to: string; type: string }[],
      };

      for (const [serviceName, deps] of Object.entries(services)) {
        for (const called of deps.calls) {
          dependencyGraph.edges.push({ from: serviceName, to: called, type: "http" });
        }
      }

      return JSON.stringify(
        {
          services,
          summary: {
            totalServices: Object.keys(services).length,
            httpConnections: dependencyGraph.edges.length,
            servicesWithDatabase: Object.entries(services).filter(
              ([, d]) => d.sharedDatabases.length > 0
            ).length,
            servicesWithMessaging: Object.entries(services).filter(
              ([, d]) => d.publishesTo.length > 0 || d.subscribesTo.length > 0
            ).length,
          },
          dependencyGraph,
        },
        null,
        2
      );
    } catch (error) {
      return `Error mapping dependencies: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
});
