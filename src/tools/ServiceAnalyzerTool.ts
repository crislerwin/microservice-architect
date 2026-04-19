import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";

/**
 * Analyzes microservice source code to extract:
 * - Service name and description
 * - API endpoints
 * - Dependencies (databases, message queues, external services)
 * - Tech stack
 */
export const ServiceAnalyzerTool = new DynamicStructuredTool({
  name: "analyze_service",
  description:
    "Analyzes a microservice codebase to extract its API endpoints, dependencies, and configuration. Input: servicePath (absolute path to service directory).",
  schema: z.object({
    servicePath: z
      .string()
      .describe("Absolute path to the microservice directory"),
  }),
  func: async ({ servicePath }) => {
    try {
      const analysis = {
        serviceName: path.basename(servicePath),
        endpoints: [] as string[],
        dependencies: [] as string[],
        techStack: [] as string[],
        databases: [] as string[],
        messageQueues: [] as string[],
        externalServices: [] as string[],
      };

      // Check package.json for Node.js services
      const packageJsonPath = path.join(servicePath, "package.json");
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(
          fs.readFileSync(packageJsonPath, "utf-8")
        );
        analysis.techStack.push("Node.js");
        
        // Extract dependencies
        const deps = {
          ...packageJson.dependencies,
          ...packageJson.devDependencies,
        };

        if (deps["express"]) analysis.techStack.push("Express");
        if (deps["fastify"]) analysis.techStack.push("Fastify");
        if (deps["nestjs"]) analysis.techStack.push("NestJS");
        if (deps["prisma"] || deps["sequelize"] || deps["typeorm"]) {
          analysis.databases.push("SQL (via ORM)");
        }
        if (deps["mongoose"] || deps["mongodb"]) {
          analysis.databases.push("MongoDB");
        }
        if (deps["redis"]) analysis.databases.push("Redis");
        if (deps["kafka"] || deps["kafkajs"]) {
          analysis.messageQueues.push("Kafka");
        }
        if (deps["rabbitmq"] || deps["amqplib"]) {
          analysis.messageQueues.push("RabbitMQ");
        }
        if (deps["axios"] || deps["fetch"]) {
          analysis.externalServices.push("HTTP Clients");
        }
      }

      // Check docker-compose.yml
      const dockerComposePath = path.join(servicePath, "docker-compose.yml");
      if (fs.existsSync(dockerComposePath)) {
        const dockerContent = fs.readFileSync(dockerComposePath, "utf-8");
        if (dockerContent.includes("postgres")) analysis.databases.push("PostgreSQL");
        if (dockerContent.includes("mysql")) analysis.databases.push("MySQL");
        if (dockerContent.includes("mongo")) analysis.databases.push("MongoDB");
        if (dockerContent.includes("redis")) analysis.databases.push("Redis");
        if (dockerContent.includes("kafka")) analysis.messageQueues.push("Kafka");
      }

      // Check for Python services
      const requirementsPath = path.join(servicePath, "requirements.txt");
      if (fs.existsSync(requirementsPath)) {
        analysis.techStack.push("Python");
        const reqContent = fs.readFileSync(requirementsPath, "utf-8");
        if (reqContent.includes("fastapi")) analysis.techStack.push("FastAPI");
        if (reqContent.includes("flask")) analysis.techStack.push("Flask");
        if (reqContent.includes("django")) analysis.techStack.push("Django");
      }

      // Check for Go services
      const goModPath = path.join(servicePath, "go.mod");
      if (fs.existsSync(goModPath)) {
        analysis.techStack.push("Go");
      }

      // Check for Java services
      const pomPath = path.join(servicePath, "pom.xml");
      if (fs.existsSync(pomPath)) {
        analysis.techStack.push("Java/Spring");
      }

      // Look for API endpoint definitions
      const srcPath = path.join(servicePath, "src");
      if (fs.existsSync(srcPath)) {
        const scanForEndpoints = (dir: string) => {
          const files = fs.readdirSync(dir);
          for (const file of files) {
            const fullPath = path.join(dir, file);
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
              scanForEndpoints(fullPath);
            } else if (
              file.endsWith(".ts") ||
              file.endsWith(".js") ||
              file.endsWith(".py") ||
              file.endsWith(".go") ||
              file.endsWith(".java")
            ) {
              const content = fs.readFileSync(fullPath, "utf-8");
              // Extract route definitions
              const routeMatches = content.match(
                /(?:app\.|router\.|server\.)?(get|post|put|delete|patch)\(['"`]([^'"`]+)/gi
              );
              if (routeMatches) {
                analysis.endpoints.push(...routeMatches.map((m) => m.toString()));
              }
            }
          }
        };
        scanForEndpoints(srcPath);
      }

      // Remove duplicates
      analysis.endpoints = [...new Set(analysis.endpoints)];
      analysis.dependencies = [...new Set([...analysis.databases, ...analysis.messageQueues])];

      return JSON.stringify(analysis, null, 2);
    } catch (error) {
      return `Error analyzing service: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
});
