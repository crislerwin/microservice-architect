import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";

/**
 * WorkspaceAnalyzerTool - Analyzes a workspace directory containing multiple microservices
 * Detects service directories and analyzes each one
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

      // Helper function to detect if a directory is a service
      const isServiceDirectory = (dir: string): boolean => {
        const indicators = [
          "package.json",
          "requirements.txt",
          "go.mod",
          "pom.xml",
          "Dockerfile",
          "docker-compose.yml",
          "src",
        ];
        return indicators.some((indicator) =>
          fs.existsSync(path.join(dir, indicator))
        );
      };

      // Helper function to detect service language
      const detectLanguage = (dir: string): string => {
        if (fs.existsSync(path.join(dir, "package.json"))) return "Node.js";
        if (fs.existsSync(path.join(dir, "requirements.txt"))) return "Python";
        if (fs.existsSync(path.join(dir, "go.mod"))) return "Go";
        if (fs.existsSync(path.join(dir, "pom.xml"))) return "Java";
        return "Unknown";
      };

      // Scan workspace for services
      const scanWorkspace = (dir: string, depth: number = 0) => {
        if (depth > 2) return; // Limit recursion depth

        const entries = fs.readdirSync(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
          
          const fullPath = path.join(dir, entry.name);
          
          if (entry.isDirectory()) {
            if (isServiceDirectory(fullPath)) {
              // Found a service
              const serviceName = entry.name;
              const language = detectLanguage(fullPath);
              
              const serviceInfo = {
                name: serviceName,
                path: fullPath,
                language,
                relativePath: path.relative(workspacePath, fullPath),
              };
              
              result.services.push(serviceInfo);
              
              // Update summary
              result.summary.languages[language] = (result.summary.languages[language] || 0) + 1;
              result.totalServices++;
            } else {
              // Recurse into subdirectories
              scanWorkspace(fullPath, depth + 1);
            }
          }
        }
      };

      scanWorkspace(workspacePath);

      // Analyze each service in detail
      for (const service of result.services) {
        // Check for databases
        const dockerComposePath = path.join(service.path, "docker-compose.yml");
        if (fs.existsSync(dockerComposePath)) {
          const content = fs.readFileSync(dockerComposePath, "utf-8");
          if (content.includes("postgres") && !result.summary.databases.includes("PostgreSQL")) {
            result.summary.databases.push("PostgreSQL");
          }
          if (content.includes("mysql") && !result.summary.databases.includes("MySQL")) {
            result.summary.databases.push("MySQL");
          }
          if (content.includes("mongo") && !result.summary.databases.includes("MongoDB")) {
            result.summary.databases.push("MongoDB");
          }
          if (content.includes("redis") && !result.summary.databases.includes("Redis")) {
            result.summary.databases.push("Redis");
          }
        }

        // Check for message queues
        const packageJsonPath = path.join(service.path, "package.json");
        if (fs.existsSync(packageJsonPath)) {
          const content = fs.readFileSync(packageJsonPath, "utf-8");
          if (content.includes("kafka") && !result.summary.messageQueues.includes("Kafka")) {
            result.summary.messageQueues.push("Kafka");
          }
          if (content.includes("rabbitmq") && !result.summary.messageQueues.includes("RabbitMQ")) {
            result.summary.messageQueues.push("RabbitMQ");
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
 */
export const BatchServiceAnalyzerTool = new DynamicStructuredTool({
  name: "analyze_services_batch",
  description:
    "Analyzes multiple microservices in batch. Input: servicePaths (array of absolute paths to service directories).",
  schema: z.object({
    servicePaths: z
      .array(z.string())
      .describe("Array of absolute paths to service directories"),
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
          
          // Basic analysis
          const analysis = {
            name: serviceName,
            path: servicePath,
            exists: fs.existsSync(servicePath),
            isDirectory: fs.statSync(servicePath).isDirectory(),
            techStack: [] as string[],
            hasDockerfile: fs.existsSync(path.join(servicePath, "Dockerfile")),
            hasDockerCompose: fs.existsSync(path.join(servicePath, "docker-compose.yml")),
            hasTests: fs.existsSync(path.join(servicePath, "tests")) || 
                      fs.existsSync(path.join(servicePath, "__tests__")),
            hasCI: fs.existsSync(path.join(servicePath, ".github", "workflows")),
          };

          // Detect tech stack
          if (fs.existsSync(path.join(servicePath, "package.json"))) {
            analysis.techStack.push("Node.js");
          }
          if (fs.existsSync(path.join(servicePath, "requirements.txt"))) {
            analysis.techStack.push("Python");
          }
          if (fs.existsSync(path.join(servicePath, "go.mod"))) {
            analysis.techStack.push("Go");
          }
          if (fs.existsSync(path.join(servicePath, "pom.xml"))) {
            analysis.techStack.push("Java");
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
