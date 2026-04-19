import { tool } from "@langchain/core/tools";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";

/**
 * Analyzes a microservice to extract:
 * - Tech stack (dependencies, runtime)
 * - API endpoints
 * - Database connections
 * - Environment variables
 * - Dockerfile configuration
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

    // Analyze package.json
    const packageJsonPath = path.join(resolvedPath, "package.json");
    if (fs.existsSync(packageJsonPath)) {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
      analysis.techStack = {
        language: "JavaScript/TypeScript",
        runtime: pkg.engines?.node ? `Node.js ${pkg.engines.node}` : "Node.js",
        framework: detectFramework(pkg),
        dependencies: Object.keys(pkg.dependencies || {}),
        devDependencies: Object.keys(pkg.devDependencies || {}),
      };
    }

    // Analyze Dockerfile
    const dockerfilePath = path.join(resolvedPath, "Dockerfile");
    if (fs.existsSync(dockerfilePath)) {
      const dockerfile = fs.readFileSync(dockerfilePath, "utf-8");
      analysis.docker = parseDockerfile(dockerfile);
    }

    // Analyze docker-compose.yml
    const composePath = path.join(resolvedPath, "docker-compose.yml");
    if (fs.existsSync(composePath)) {
      const compose = fs.readFileSync(composePath, "utf-8");
      analysis.databases = detectDatabases(compose);
    }

    // Analyze source files for endpoints
    const srcPath = path.join(resolvedPath, "src");
    if (fs.existsSync(srcPath)) {
      analysis.endpoints = scanForEndpoints(srcPath);
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
    description: "Analyzes a microservice to extract tech stack, API endpoints, databases, and dependencies",
    schema: z.object({
      servicePath: z.string().describe("Path to the service directory"),
    }),
  }
);

function detectFramework(pkg: any): string {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  if (deps["express"]) return "Express.js";
  if (deps["fastify"]) return "Fastify";
  if (deps["@nestjs/core"]) return "NestJS";
  if (deps["next"]) return "Next.js";
  if (deps["@remix-run/node"]) return "Remix";
  if (deps["koa"]) return "Koa";
  if (deps["hono"]) return "Hono";
  if (deps["elysia"]) return "Elysia";
  return "Unknown";
}

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

function detectDatabases(compose: string): string[] {
  const databases: string[] = [];
  const dbKeywords = [
    "postgres", "mysql", "mongodb", "redis", "elasticsearch",
    "cassandra", "couchdb", "neo4j", "influxdb", "timescaledb",
    "mariadb", "sqlite"
  ];

  const lowerCompose = compose.toLowerCase();
  for (const db of dbKeywords) {
    if (lowerCompose.includes(db)) {
      databases.push(db);
    }
  }

  return [...new Set(databases)];
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