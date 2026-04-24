import { DynamicStructuredTool } from "@langchain/core/tools";
import * as fs from "fs";
import * as path from "path";
import { z } from "zod";
import {
  detectDatabases,
  detectDatabaseTechnologies,
  detectLanguageWithDetails,
  isServiceDirectoryWithDetails,
} from "./StackDetectionTool.js";

/**
 * WorkspaceAnalyzerTool - Analyzes a workspace directory containing multiple microservices
 * Detects service directories and analyzes each one
 *
 * Uses StackDetectionTool for centralized stack detection logic
 */
export const WorkspaceAnalyzerTool = new DynamicStructuredTool({
  name: "analyze_workspace",
  description:
    "Analyzes a workspace directory containing multiple microservices. Detects service directories, analyzes each service, and maps dependencies. Input: workspacePath (absolute path to workspace root).",
  schema: z.object({
    workspacePath: z
      .string()
      .describe("Absolute path to the workspace directory containing multiple microservices"),
  }),
  func: async ({ workspacePath }) => {
    try {
      const result = {
        workspaceName: path.basename(workspacePath),
        totalServices: 0,
        services: [] as any[],
        summary: {
          languages: {} as Record<string, number>,
          databases: [] as string[],
          messageQueues: [] as string[],
          totalEndpoints: 0,
        },
      };

      // Scan workspace for services using centralized detection
      const scanWorkspace = (dir: string, depth: number = 0) => {
        if (depth > 2) return; // Limit recursion depth

        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          if (entry.name.startsWith(".") || entry.name === "node_modules") continue;

          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory()) {
            // Use centralized service detection
            const serviceCheck = isServiceDirectoryWithDetails(fullPath);

            if (serviceCheck.isService) {
              // Found a service - use centralized language detection
              const languageInfo = detectLanguageWithDetails(fullPath);

              const serviceInfo = {
                name: entry.name,
                path: fullPath,
                language: languageInfo.name || "Unknown",
                runtime: languageInfo.runtime || "Unknown",
                relativePath: path.relative(workspacePath, fullPath),
              };

              result.services.push(serviceInfo);

              // Update summary
              result.summary.languages[serviceInfo.language] =
                (result.summary.languages[serviceInfo.language] || 0) + 1;
              result.totalServices++;
            } else {
              // Recurse into subdirectories
              scanWorkspace(fullPath, depth + 1);
            }
          }
        }
      };

      scanWorkspace(workspacePath);

      // Analyze each service in detail using centralized detection
      for (const service of result.services) {
        // Check for databases using centralized detection
        const dockerComposePath = path.join(service.path, "docker-compose.yml");
        const dockerComposeYamlPath = path.join(service.path, "docker-compose.yaml");

        for (const composePath of [dockerComposePath, dockerComposeYamlPath]) {
          if (fs.existsSync(composePath)) {
            try {
              const content = fs.readFileSync(composePath, "utf-8");

              // Use centralized database detection
              const detectedDbs = detectDatabases(content);
              const detectedQueues = detectDatabases(content);

              for (const db of detectedDbs) {
                if (!result.summary.databases.includes(db)) {
                  result.summary.databases.push(db);
                }
              }

              // Check for message queues
              const queueKeywords = ["kafka", "rabbitmq", "redis", "bull", "bullmq", "amqp"];
              const lowerContent = content.toLowerCase();
              for (const queue of queueKeywords) {
                if (lowerContent.includes(queue)) {
                  const queueName = queue.charAt(0).toUpperCase() + queue.slice(1);
                  if (
                    !result.summary.messageQueues.includes(queueName) &&
                    !["PostgreSQL", "MySQL", "MongoDB", "Redis"].includes(queueName)
                  ) {
                    if (queue === "rabbitmq") {
                      if (!result.summary.messageQueues.includes("RabbitMQ")) {
                        result.summary.messageQueues.push("RabbitMQ");
                      }
                    } else if (queue === "kafka") {
                      if (!result.summary.messageQueues.includes("Kafka")) {
                        result.summary.messageQueues.push("Kafka");
                      }
                    } else if (queue === "bull" || queue === "bullmq") {
                      if (!result.summary.messageQueues.includes("Bull Queue")) {
                        result.summary.messageQueues.push("Bull Queue");
                      }
                    }
                  }
                }
              }
            } catch {
              // Ignore read errors
            }
            break;
          }
        }

        // Check for message queues in package.json using centralized detection
        const packageJsonPath = path.join(service.path, "package.json");
        if (fs.existsSync(packageJsonPath)) {
          try {
            const content = fs.readFileSync(packageJsonPath, "utf-8");
            const pkg = JSON.parse(content);
            const dbTech = detectDatabaseTechnologies(pkg);

            // Add ORMs to the service info
            if (dbTech.orms.length > 0) {
              service.orms = dbTech.orms;
            }

            // Check for message queues
            const deps = { ...pkg.dependencies, ...pkg.devDependencies };
            const queueDeps = Object.keys(deps).filter(
              (dep) =>
                dep.includes("kafka") ||
                dep.includes("rabbitmq") ||
                dep.includes("bull") ||
                dep.includes("amqp"),
            );

            for (const dep of queueDeps) {
              const lowerDep = dep.toLowerCase();
              if (lowerDep.includes("kafka") && !result.summary.messageQueues.includes("Kafka")) {
                result.summary.messageQueues.push("Kafka");
              }
              if (
                (lowerDep.includes("rabbitmq") || lowerDep.includes("amqp")) &&
                !result.summary.messageQueues.includes("RabbitMQ")
              ) {
                result.summary.messageQueues.push("RabbitMQ");
              }
              if (
                lowerDep.includes("bull") &&
                !result.summary.messageQueues.includes("Bull Queue")
              ) {
                result.summary.messageQueues.push("Bull Queue");
              }
            }
          } catch {
            // Ignore parse errors
          }
        }
      }

      return JSON.stringify(result, null, 2);
    } catch (error) {
      return `Error analyzing workspace: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
});

/**
 * BatchServiceAnalyzerTool - Analyzes multiple services in batch
 * Uses StackDetectionTool for centralized detection
 */
export const BatchServiceAnalyzerTool = new DynamicStructuredTool({
  name: "analyze_services_batch",
  description:
    "Analyzes multiple microservices in batch. Input: servicePaths (array of absolute paths to service directories).",
  schema: z.object({
    servicePaths: z.array(z.string()).describe("Array of absolute paths to service directories"),
  }),
  func: async ({ servicePaths }) => {
    try {
      const results = {
        totalAnalyzed: servicePaths.length,
        services: [] as any[],
        errors: [] as string[],
      };

      for (const servicePath of servicePaths) {
        try {
          const serviceName = path.basename(servicePath);

          // Use centralized service detection
          const serviceCheck = isServiceDirectoryWithDetails(servicePath);

          // Use centralized language detection
          const languageInfo = detectLanguageWithDetails(servicePath);

          // Basic analysis
          const analysis = {
            name: serviceName,
            path: servicePath,
            exists: fs.existsSync(servicePath),
            isDirectory: fs.statSync(servicePath).isDirectory(),
            isService: serviceCheck.isService,
            language: languageInfo.name || "Unknown",
            runtime: languageInfo.runtime || "Unknown",
            techStack: [] as string[],
            hasDockerfile: fs.existsSync(path.join(servicePath, "Dockerfile")),
            hasDockerCompose:
              fs.existsSync(path.join(servicePath, "docker-compose.yml")) ||
              fs.existsSync(path.join(servicePath, "docker-compose.yaml")),
            hasTests:
              fs.existsSync(path.join(servicePath, "tests")) ||
              fs.existsSync(path.join(servicePath, "__tests__")),
            hasCI: fs.existsSync(path.join(servicePath, ".github", "workflows")),
          };

          // Detect tech stack using centralized detection
          if (serviceCheck.isService) {
            if (languageInfo.name) {
              analysis.techStack.push(languageInfo.name);
            }

            // Check for specific frameworks
            const packageJsonPath = path.join(servicePath, "package.json");
            if (fs.existsSync(packageJsonPath)) {
              try {
                const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
                const dbTech = detectDatabaseTechnologies(pkg);

                if (dbTech.orms.length > 0) {
                  analysis.techStack.push(...dbTech.orms);
                }
                if (dbTech.databases.length > 0) {
                  analysis.techStack.push(...dbTech.databases);
                }
              } catch {
                // Ignore parse errors
              }
            }
          }

          results.services.push(analysis);
        } catch (err) {
          results.errors.push(`Error analyzing ${servicePath}: ${err}`);
        }
      }

      return JSON.stringify(results, null, 2);
    } catch (error) {
      return `Error in batch analysis: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
});
