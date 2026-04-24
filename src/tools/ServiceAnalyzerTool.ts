import * as fs from "node:fs";
import * as path from "node:path";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import {
  detectDatabases,
  detectFramework,
  detectLanguageWithDetails,
  detectMessageQueues,
} from "./StackDetectionTool.js";

interface ServiceAnalysis {
  path: string;
  name: string;
  techStack: Record<string, unknown>;
  endpoints: string[];
  databases: string[];
  messageQueues?: string[];
  envVars: string[];
  docker: unknown;
  hasTests?: boolean;
  [key: string]: unknown;
}

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
      return JSON.stringify({ error: `Path does not exist: ${resolvedPath}` });
    }

    const analysis: ServiceAnalysis = {
      path: resolvedPath,
      name: path.basename(resolvedPath),
      techStack: {},
      endpoints: [],
      databases: [],
      envVars: [],
      docker: null,
    };

    const languageInfo = detectLanguageWithDetails(resolvedPath);
    analysis.techStack.language = languageInfo.name || "Unknown";
    analysis.techStack.runtime = languageInfo.runtime || "Unknown";

    // Language-specific handlers
    if (languageInfo.name === "Go") {
      analyzeGo(resolvedPath, analysis);
    } else if (
      languageInfo.name === "JavaScript/TypeScript" ||
      languageInfo.name === "TypeScript"
    ) {
      analyzeNodeJS(resolvedPath, analysis);
    } else if (languageInfo.name === "Python") {
      analyzePython(resolvedPath, analysis);
    } else if (languageInfo.name === "Java") {
      analyzeJava(resolvedPath, analysis);
    } else if (languageInfo.name === "Rust") {
      analyzeRust(resolvedPath, analysis);
    }

    // Common analysis
    analyzeCommon(resolvedPath, analysis);

    return JSON.stringify(analysis, null, 2);
  },
  {
    name: "analyze_service",
    description:
      "Analyzes any service to extract tech stack, API endpoints, databases. Supports Go, Python, Java, Rust, Node.js.",
    schema: z.object({
      servicePath: z.string().describe("Path to the service directory"),
    }),
  },
);

function analyzeGo(projectPath: string, analysis: Record<string, unknown>) {
  const techStack = analysis.techStack as Record<string, unknown>;

  const goModPath = path.join(projectPath, "go.mod");
  if (fs.existsSync(goModPath)) {
    const goMod = fs.readFileSync(goModPath, "utf-8");
    const moduleMatch = goMod.match(/^module\s+(.+)$/m);
    if (moduleMatch) techStack.module = moduleMatch[1];

    const goVersionMatch = goMod.match(/^go\s+(\d+\.\d+)/m);
    if (goVersionMatch) techStack.goVersion = goVersionMatch[1];

    const requireMatch = goMod.match(/require\s*\(([^)]+)\)/ms);
    if (requireMatch) {
      const deps = requireMatch[1]
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("//"))
        .map((line) => line.split(" ")[0])
        .filter((dep): dep is string => !!dep && !dep.includes("indirect"));

      techStack.dependencies = deps;

      if (deps.some((d) => d.includes("gin-gonic/gin"))) techStack.framework = "Gin";
      else if (deps.some((d) => d.includes("gorilla/mux"))) techStack.framework = "Gorilla Mux";
      else if (deps.some((d) => d.includes("labstack/echo"))) techStack.framework = "Echo";

      if (deps.some((d) => d.includes("jackc/pgx") || d.includes("lib/pq")))
        techStack.database = "PostgreSQL";
      else if (deps.some((d) => d.includes("go-sql-driver/mysql"))) techStack.database = "MySQL";

      if (deps.some((d) => d.includes("gorm.io"))) techStack.orm = "GORM";
    }
  }

  const handlerPaths = [
    path.join(projectPath, "internal", "infra", "http", "handler"),
    path.join(projectPath, "internal", "handler"),
    path.join(projectPath, "handler"),
    path.join(projectPath, "api"),
    path.join(projectPath, "cmd"),
  ];

  for (const handlerPath of handlerPaths) {
    if (fs.existsSync(handlerPath)) {
      analysis.endpoints = scanForEndpointsGo(handlerPath);
      break;
    }
  }

  // Also scan root if no handlers found
  if ((analysis.endpoints as string[]).length === 0) {
    const goFiles = fs
      .readdirSync(projectPath)
      .filter((f) => f.endsWith(".go") && !f.includes("_test"));
    for (const file of goFiles.slice(0, 3)) {
      const filePath = path.join(projectPath, file);
      const content = fs.readFileSync(filePath, "utf-8");
      const routePatterns = [
        /\.GET\(["']([^"']+)/g,
        /\.POST\(["']([^"']+)/g,
        /\.PUT\(["']([^"']+)/g,
        /\.DELETE\(["']([^"']+)/g,
        /\.PATCH\(["']([^"']+)/g,
      ];
      for (const pattern of routePatterns) {
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(content)) !== null) {
          (analysis.endpoints as string[]).push(match[1]);
        }
      }
    }
  }

  analysis.hasTests = fs
    .readdirSync(projectPath, { recursive: true })
    .some((f) => typeof f === "string" && f.endsWith("_test.go"));
}

function analyzeNodeJS(projectPath: string, analysis: Record<string, unknown>) {
  const techStack = analysis.techStack as Record<string, unknown>;

  const packageJsonPath = path.join(projectPath, "package.json");
  if (fs.existsSync(packageJsonPath)) {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
    const framework = detectFramework(pkg);
    techStack.framework = framework;
    techStack.dependencies = Object.keys(pkg.dependencies || {});
    techStack.devDependencies = Object.keys(pkg.devDependencies || {});

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
      techStack.messageQueues = detectMessageQueues(queueDeps.join(" "));
    }
  }

  // Analyze source files for endpoints (support multiple languages)
  const srcPaths = ["src", "internal", "cmd", "pkg", "lib", "app"];
  for (const srcDir of srcPaths) {
    const srcPath = path.join(projectPath, srcDir);
    if (fs.existsSync(srcPath)) {
      const endpoints = scanForEndpointsNodeJS(srcPath);
      if (endpoints.length > 0) {
        (analysis.endpoints as string[]).push(...endpoints);
      }
    }
  }
}

function analyzePython(projectPath: string, analysis: Record<string, unknown>) {
  const techStack = analysis.techStack as Record<string, unknown>;

  const requirementsPath = path.join(projectPath, "requirements.txt");
  if (fs.existsSync(requirementsPath)) {
    const content = fs.readFileSync(requirementsPath, "utf-8");
    const deps = content
      .split("\n")
      .map((line) => line.trim().split("==")[0])
      .filter((line) => line);
    techStack.dependencies = deps;
  }
}

function analyzeJava(projectPath: string, analysis: Record<string, unknown>) {
  const techStack = analysis.techStack as Record<string, unknown>;

  const pomPath = path.join(projectPath, "pom.xml");
  const gradlePath = path.join(projectPath, "build.gradle");

  if (fs.existsSync(pomPath)) techStack.buildTool = "Maven";
  else if (fs.existsSync(gradlePath)) techStack.buildTool = "Gradle";
}

function analyzeRust(projectPath: string, analysis: Record<string, unknown>) {
  const techStack = analysis.techStack as Record<string, unknown>;

  const cargoPath = path.join(projectPath, "Cargo.toml");
  if (fs.existsSync(cargoPath)) {
    const cargo = fs.readFileSync(cargoPath, "utf-8");
    const depsMatch = cargo.match(/\[dependencies\]([^[]+)/);
    if (depsMatch) {
      const deps = depsMatch[1]
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.includes("="))
        .map((line) => line.split("=")[0].trim());
      techStack.dependencies = deps;
    }
  }
}

function analyzeCommon(projectPath: string, analysis: ServiceAnalysis) {
  // Analyze Dockerfile
  const dockerfilePath = path.join(projectPath, "Dockerfile");
  if (fs.existsSync(dockerfilePath)) {
    const dockerfile = fs.readFileSync(dockerfilePath, "utf-8");
    analysis.docker = parseDockerfile(dockerfile);
  }

  // Analyze docker-compose.yml using centralized database detection
  const composePaths = [
    path.join(projectPath, "docker-compose.yml"),
    path.join(projectPath, "docker-compose.yaml"),
  ];

  for (const composePath of composePaths) {
    if (fs.existsSync(composePath)) {
      const compose = fs.readFileSync(composePath, "utf-8");
      analysis.databases = detectDatabases(compose);
      analysis.messageQueues = detectMessageQueues(compose);
      break;
    }
  }

  // Analyze .env files for environment variables
  const envPaths = [".env.example", ".env.sample", ".env"];
  for (const envFile of envPaths) {
    const envPath = path.join(projectPath, envFile);
    if (fs.existsSync(envPath)) {
      analysis.envVars = parseEnvFile(envPath);
      break;
    }
  }
}

function scanForEndpointsGo(srcPath: string): string[] {
  const endpoints: string[] = [];
  const files = fs.readdirSync(srcPath, { recursive: true }) as string[];

  for (const file of files) {
    if (!file.endsWith(".go")) continue;
    const fullPath = path.join(srcPath, file);
    const content = fs.readFileSync(fullPath, "utf-8");

    const pattern = /\.(GET|POST|PUT|DELETE|PATCH)\s*\(\s*["`]([^"`]+)/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      endpoints.push(`${match[1]} ${match[2]}`);
    }
  }

  return [...new Set(endpoints)];
}

function scanForEndpointsNodeJS(srcPath: string): string[] {
  const endpoints: string[] = [];
  const files = fs.readdirSync(srcPath, { recursive: true }) as string[];

  for (const file of files) {
    const fullPath = path.join(srcPath, file);
    const stat = fs.statSync(fullPath);

    if (stat.isFile() && (file.endsWith(".ts") || file.endsWith(".js"))) {
      const content = fs.readFileSync(fullPath, "utf-8");
      const patterns = [
        /app\.(get|post|put|delete|patch)\(['"`]([^'"`]+)/g,
        /router\.(get|post|put|delete|patch)\(['"`]([^'"`]+)/g,
      ];

      for (const pattern of patterns) {
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(content)) !== null) {
          endpoints.push(`${match[1].toUpperCase()} ${match[2]}`);
        }
      }
    }
  }

  return [...new Set(endpoints)];
}

function parseDockerfile(dockerfile: string): Record<string, unknown> {
  const lines = dockerfile.split("\n");
  const info: Record<string, unknown> = {
    baseImage: null,
    ports: [],
    commands: [],
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("FROM ")) info.baseImage = trimmed.replace("FROM ", "").split(" ")[0];
    else if (trimmed.startsWith("EXPOSE ")) info.ports.push(trimmed.replace("EXPOSE ", ""));
    else if (trimmed.startsWith("CMD ") || trimmed.startsWith("ENTRYPOINT "))
      info.commands.push(trimmed);
  }

  return info;
}

function parseEnvFile(envPath: string): string[] {
  const content = fs.readFileSync(envPath, "utf-8");
  const lines = content.split("\n");
  const vars: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)/);
      if (match) vars.push(match[1]);
    }
  }

  return vars;
}
