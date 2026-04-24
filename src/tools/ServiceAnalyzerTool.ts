import { tool } from "@langchain/core/tools";
import * as fs from "fs";
import * as path from "path";
import { z } from "zod";
import {
  detectDatabases,
  detectFramework,
  detectLanguageWithDetails,
  detectMessageQueues,
  detectORMs,
  isServiceDirectory,
} from "./StackDetectionTool.js";

/**
 * Analyzes a microservice to extract:
 * - Tech stack (dependencies, runtime)
 * - API endpoints
 * - Database connections
 * - Environment variables
 * - Dockerfile configuration
 *
 * Uses StackDetectionTool for centralized stack detection logic
 */
export const ServiceAnalyzerTool = tool(
  async (input: { servicePath: string }) => {
    const { servicePath } = input;
    const resolvedPath = path.resolve(servicePath);

    if (!fs.existsSync(resolvedPath)) {
      return JSON.stringify({
        error: `Path does not exist: ${resolvedPath}`,
      });
    }

    const analysis: Record<string, any> = {
      path: resolvedPath,
      name: path.basename(resolvedPath),
      techStack: {},
      endpoints: [],
      databases: [],
      envVars: [],
      docker: null,
    };

    // Use StackDetectionTool for language detection
    const languageInfo = detectLanguageWithDetails(resolvedPath);

    // Analyze package.json
    const packageJsonPath = path.join(resolvedPath, "package.json");
    if (fs.existsSync(packageJsonPath)) {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));

      // Use centralized framework detection
      const framework = detectFramework(pkg);
      const orms = detectORMs(pkg);

      analysis.techStack = {
        language: languageInfo.name || "JavaScript/TypeScript",
        runtime: languageInfo.engines
          ? `Node.js ${languageInfo.engines}`
          : languageInfo.runtime || "Node.js",
        framework: framework,
        orms: orms,
        dependencies: Object.keys(pkg.dependencies || {}),
        devDependencies: Object.keys(pkg.devDependencies || {}),
      };

      // Check for message queues in dependencies
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      const queueDeps = Object.keys(deps).filter(
        (dep) =>
          dep.includes("kafka") ||
          dep.includes("rabbitmq") ||
          dep.includes("bull") ||
          dep.includes("amqp"),
      );

      if (queueDeps.length > 0) {
        analysis.techStack.messageQueues = detectMessageQueues(queueDeps.join(" "));
      }
    }

    // Analyze Dockerfile
    const dockerfilePath = path.join(resolvedPath, "Dockerfile");
    if (fs.existsSync(dockerfilePath)) {
      const dockerfile = fs.readFileSync(dockerfilePath, "utf-8");
      analysis.docker = parseDockerfile(dockerfile);
    }

    // Analyze docker-compose.yml using centralized database detection
    const composePath = path.join(resolvedPath, "docker-compose.yml");
    const composeYamlPath = path.join(resolvedPath, "docker-compose.yaml");

    for (const composeFilePath of [composePath, composeYamlPath]) {
      if (fs.existsSync(composeFilePath)) {
        const compose = fs.readFileSync(composeFilePath, "utf-8");
        // Use centralized detection functions
        analysis.databases = detectDatabases(compose);
        analysis.messageQueues = detectMessageQueues(compose);
        break;
      }
    }

    // Analyze source files for endpoints (support multiple languages)
    const srcPaths = ["src", "internal", "cmd", "pkg", "lib", "app"];
    for (const srcDir of srcPaths) {
      const srcPath = path.join(resolvedPath, srcDir);
      if (fs.existsSync(srcPath)) {
        const endpoints = scanForEndpoints(srcPath);
        if (endpoints.length > 0) {
          analysis.endpoints.push(...endpoints);
        }
      }
    }

    // Also try root for simple Go projects
    if (analysis.endpoints.length === 0 && languageInfo.name === "Go") {
      const goFiles = fs
        .readdirSync(resolvedPath)
        .filter((f) => f.endsWith(".go") && !f.includes("_test"));
      for (const file of goFiles.slice(0, 3)) {
        const filePath = path.join(resolvedPath, file);
        const content = fs.readFileSync(filePath, "utf-8");
        // Quick scan for Gin/Echo/Fiber routes
        const routePatterns = [
          /\.GET\(["']([^"']+)/g,
          /\.POST\(["']([^"']+)/g,
          /\.PUT\(["']([^"']+)/g,
          /\.DELETE\(["']([^"']+)/g,
          /\.PATCH\(["']([^"']+)/g,
        ];
        for (const pattern of routePatterns) {
          let match;
          while ((match = pattern.exec(content)) !== null) {
            analysis.endpoints.push(match[1]);
          }
        }
      }
    }

    // Analyze .env.example for environment variables
    const envExamplePath = path.join(resolvedPath, ".env.example");
    if (fs.existsSync(envExamplePath)) {
      analysis.envVars = parseEnvFile(envExamplePath);
    }

    return JSON.stringify(analysis, null, 2);
  },
  {
    name: "analyze_service",
    description:
      "Analyzes a microservice to extract tech stack, API endpoints, databases, and dependencies",
    schema: z.object({
      servicePath: z.string().describe("Path to the service directory"),
    }),
  },
);

function parseDockerfile(dockerfile: string): Record<string, any> {
  const lines = dockerfile.split("\n");
  const info: Record<string, any> = {
    baseImage: null,
    ports: [],
    commands: [],
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("FROM ")) {
      info.baseImage = trimmed.replace("FROM ", "").split(" ")[0];
    } else if (trimmed.startsWith("EXPOSE ")) {
      info.ports.push(trimmed.replace("EXPOSE ", ""));
    } else if (trimmed.startsWith("CMD ") || trimmed.startsWith("ENTRYPOINT ")) {
      info.commands.push(trimmed);
    }
  }

  return info;
}

function scanForEndpoints(srcPath: string): string[] {
  const endpoints: string[] = [];
  const files = fs.readdirSync(srcPath, { recursive: true }) as string[];

  for (const file of files) {
    const fullPath = path.join(srcPath, file);
    const stat = fs.statSync(fullPath);

    if (stat.isFile() && (file.endsWith(".ts") || file.endsWith(".js"))) {
      const content = fs.readFileSync(fullPath, "utf-8");

      // Match common endpoint patterns
      const patterns = [
        /app\.(get|post|put|delete|patch)\(['"`]([^'"`]+)/g,
        /router\.(get|post|put|delete|patch)\(['"`]([^'"`]+)/g,
        /\.(get|post|put|delete|patch)\(['"`](\/[^'"`]+)/g,
        /@(Get|Post|Put|Delete|Patch)\(['"`]([^'"`]+)/g,
      ];

      for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          endpoints.push(`${match[1].toUpperCase()} ${match[2]}`);
        }
      }
    }
  }

  return [...new Set(endpoints)];
}

function parseEnvFile(envPath: string): string[] {
  const content = fs.readFileSync(envPath, "utf-8");
  const lines = content.split("\n");
  const vars: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)/);
      if (match) {
        vars.push(match[1]);
      }
    }
  }

  return vars;
}
