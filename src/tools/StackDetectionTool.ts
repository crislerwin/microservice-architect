import { tool } from "@langchain/core/tools";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";

/**
 * Centralized constants for framework detection
 * Maps package names to their framework identifiers
 */
export const FRAMEWORKS = {
  // Web frameworks
  express: { name: "Express.js", category: "web" },
  fastify: { name: "Fastify", category: "web" },
  koa: { name: "Koa", category: "web" },
  hapi: { name: "Hapi", category: "web" },
  
  // Full-stack/meta frameworks
  "@nestjs/core": { name: "NestJS", category: "fullstack" },
  next: { name: "Next.js", category: "fullstack" },
  nuxt: { name: "Nuxt.js", category: "fullstack" },
  "@remix-run/node": { name: "Remix", category: "fullstack" },
  "@sveltejs/kit": { name: "SvelteKit", category: "fullstack" },
  
  // Modern/fast runtimes
  hono: { name: "Hono", category: "web" },
  elysia: { name: "Elysia", category: "web" },
  "@hono/node-server": { name: "Hono", category: "web" },
  
  // Microservices/Services
  "@grpc/grpc-js": { name: "gRPC", category: "rpc" },
  "apollo-server": { name: "Apollo GraphQL", category: "graphql" },
  "@apollo/server": { name: "Apollo Server", category: "graphql" },
  mercurius: { name: "Mercurius", category: "graphql" },
  
  // Testing
  jest: { name: "Jest", category: "testing" },
  vitest: { name: "Vitest", category: "testing" },
  mocha: { name: "Mocha", category: "testing" },
  cypress: { name: "Cypress", category: "testing" },
  playwright: { name: "Playwright", category: "testing" },
} as const;

/**
 * Centralized constants for database detection
 * Maps database identifiers to their canonical names
 */
export const DATABASES = {
  // SQL databases
  postgres: { name: "PostgreSQL", category: "sql" },
  postgresql: { name: "PostgreSQL", category: "sql" },
  mysql: { name: "MySQL", category: "sql" },
  mariadb: { name: "MariaDB", category: "sql" },
  sqlite: { name: "SQLite", category: "sql" },
  "@prisma/client": { name: "Prisma", category: "orm" },
  prisma: { name: "Prisma", category: "orm" },
  typeorm: { name: "TypeORM", category: "orm" },
  sequelize: { name: "Sequelize", category: "orm" },
  drizzle: { name: "Drizzle", category: "orm" },
  
  // NoSQL databases
  mongodb: { name: "MongoDB", category: "nosql" },
  mongo: { name: "MongoDB", category: "nosql" },
  mongoose: { name: "Mongoose", category: "nosql" },
  redis: { name: "Redis", category: "nosql" },
  elasticsearch: { name: "Elasticsearch", category: "nosql" },
  cassandra: { name: "Cassandra", category: "nosql" },
  couchdb: { name: "CouchDB", category: "nosql" },
  neo4j: { name: "Neo4j", category: "nosql" },
  influxdb: { name: "InfluxDB", category: "nosql" },
  timescaledb: { name: "TimescaleDB", category: "nosql" },
  
  // Message queues (often used like databases)
  kafka: { name: "Kafka", category: "queue" },
  "@confluentinc/kafka-javascript": { name: "Kafka", category: "queue" },
  rabbitmq: { name: "RabbitMQ", category: "queue" },
  amqplib: { name: "RabbitMQ", category: "queue" },
  amqp: { name: "RabbitMQ", category: "queue" },
  bull: { name: "Bull Queue", category: "queue" },
  "bullmq": { name: "BullMQ", category: "queue" },
} as const;

/**
 * Centralized constants for language detection
 * Maps file indicators to languages and runtime info
 */
export const LANGUAGES = {
  // Node.js / JavaScript / TypeScript
  "package.json": { name: "JavaScript/TypeScript", runtime: "Node.js", priority: 1 },
  "package-lock.json": { name: "JavaScript/TypeScript", runtime: "Node.js", priority: 2 },
  "bun.lockb": { name: "JavaScript/TypeScript", runtime: "Bun", priority: 2 },
  "yarn.lock": { name: "JavaScript/TypeScript", runtime: "Node.js", priority: 2 },
  "pnpm-lock.yaml": { name: "JavaScript/TypeScript", runtime: "Node.js", priority: 2 },
  "tsconfig.json": { name: "TypeScript", runtime: "Node.js", priority: 3 },
  
  // Python
  "requirements.txt": { name: "Python", runtime: "Python", priority: 1 },
  "Pipfile": { name: "Python", runtime: "Python", priority: 2 },
  "pyproject.toml": { name: "Python", runtime: "Python", priority: 2 },
  "setup.py": { name: "Python", runtime: "Python", priority: 3 },
  
  // Go
  "go.mod": { name: "Go", runtime: "Go", priority: 1 },
  "go.sum": { name: "Go", runtime: "Go", priority: 2 },
  
  // Java
  "pom.xml": { name: "Java", runtime: "JVM", priority: 1 },
  "build.gradle": { name: "Java", runtime: "JVM", priority: 1 },
  "gradlew": { name: "Java", runtime: "JVM", priority: 3 },
  
  // Rust
  "Cargo.toml": { name: "Rust", runtime: "Rust", priority: 1 },
  "Cargo.lock": { name: "Rust", runtime: "Rust", priority: 2 },
  
  // Ruby
  "Gemfile": { name: "Ruby", runtime: "Ruby", priority: 1 },
  "Gemfile.lock": { name: "Ruby", runtime: "Ruby", priority: 2 },
  
  // PHP
  "composer.json": { name: "PHP", runtime: "PHP", priority: 1 },
  "composer.lock": { name: "PHP", runtime: "PHP", priority: 2 },
  
  // C# / .NET
  ".csproj": { name: "C#", runtime: ".NET", priority: 1 },
  ".sln": { name: "C#", runtime: ".NET", priority: 2 },
} as const;

/**
 * Service indicators - files/directories that suggest a directory is a service
 */
export const SERVICE_INDICATORS = [
  "package.json",
  "requirements.txt",
  "go.mod",
  "pom.xml",
  "Dockerfile",
  "docker-compose.yml",
  "docker-compose.yaml",
  "src",
  "Cargo.toml",
  "Gemfile",
  "composer.json",
  ".csproj",
];

/**
 * Detection result type
 */
export interface StackDetectionResult {
  framework: string | null;
  language: string | null;
  runtime: string | null;
  databases: string[];
  messageQueues: string[];
  orms: string[];
  isService: boolean;
}

/**
 * Detects framework from package.json dependencies
 * @param pkg - The parsed package.json object
 * @returns The detected framework name or "Unknown"
 */
export function detectFramework(pkg: any): string {
  const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };
  
  for (const [dep, info] of Object.entries(FRAMEWORKS)) {
    if (deps[dep]) {
      return info.name;
    }
  }
  
  return "Unknown";
}

/**
 * Detects framework with full details
 * @param pkg - The parsed package.json object
 * @returns Object with framework name, category, or null
 */
export function detectFrameworkDetails(pkg: any): { name: string; category: string } | null {
  const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };
  
  for (const [dep, info] of Object.entries(FRAMEWORKS)) {
    if (deps[dep]) {
      return { name: info.name, category: info.category };
    }
  }
  
  return null;
}

/**
 * Detects all frameworks used in a project
 * @param pkg - The parsed package.json object
 * @returns Array of detected frameworks
 */
export function detectAllFrameworks(pkg: any): { name: string; category: string }[] {
  const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };
  const frameworks: { name: string; category: string }[] = [];
  
  for (const [dep, info] of Object.entries(FRAMEWORKS)) {
    if (deps[dep]) {
      frameworks.push({ name: info.name, category: info.category });
    }
  }
  
  return frameworks;
}

/**
 * Detects databases from docker-compose.yml content
 * @param composeContent - The content of docker-compose.yml as string
 * @returns Array of detected database names
 */
export function detectDatabases(composeContent: string): string[] {
  const databases: string[] = [];
  const lowerCompose = composeContent.toLowerCase();
  
  for (const [key, info] of Object.entries(DATABASES)) {
    if (info.category !== "queue" && lowerCompose.includes(key.toLowerCase())) {
      databases.push(info.name);
    }
  }
  
  return [...new Set(databases)];
}

/**
 * Detects message queues from docker-compose.yml content
 * @param composeContent - The content of docker-compose.yml as string
 * @returns Array of detected message queue names
 */
export function detectMessageQueues(composeContent: string): string[] {
  const queues: string[] = [];
  const lowerCompose = composeContent.toLowerCase();
  
  for (const [key, info] of Object.entries(DATABASES)) {
    if (info.category === "queue" && lowerCompose.includes(key.toLowerCase())) {
      queues.push(info.name);
    }
  }
  
  return [...new Set(queues)];
}

/**
 * Detects ORMs and database libraries from package.json
 * @param pkg - The parsed package.json object
 * @returns Array of detected ORMs
 */
export function detectORMs(pkg: any): string[] {
  const orms: string[] = [];
  const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };
  
  for (const [dep, info] of Object.entries(DATABASES)) {
    if (info.category === "orm" && deps[dep]) {
      orms.push(info.name);
    }
  }
  
  return orms;
}

/**
 * Detects all database-related technologies from package.json
 * @param pkg - The parsed package.json object
 * @returns Object containing databases, ORMs, and clients
 */
export function detectDatabaseTechnologies(pkg: any): {
  orms: string[];
  clients: string[];
  databases: string[];
} {
  const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };
  const result = {
    orms: [] as string[],
    clients: [] as string[],
    databases: [] as string[],
  };
  
  for (const [dep, info] of Object.entries(DATABASES)) {
    if (deps[dep]) {
      if (info.category === "orm") {
        result.orms.push(info.name);
      } else if (info.category === "nosql" || info.category === "sql") {
        result.databases.push(info.name);
      }
    }
  }
  
  return result;
}

/**
 * Detects language from directory contents
 * @param dirPath - Path to the directory
 * @returns Object with language name and runtime, or null
 */
export function detectLanguage(dirPath: string): { name: string; runtime: string } | null {
  let bestMatch: { name: string; runtime: string; priority: number } | null = null;
  
  for (const [indicator, info] of Object.entries(LANGUAGES)) {
    const indicatorPath = path.join(dirPath, indicator);
    if (fs.existsSync(indicatorPath)) {
      if (!bestMatch || info.priority < bestMatch.priority) {
        bestMatch = { name: info.name, runtime: info.runtime, priority: info.priority };
      }
    }
  }
  
  if (bestMatch) {
    return { name: bestMatch.name, runtime: bestMatch.runtime };
  }
  
  return null;
}

/**
 * Detects language with additional details from package.json if available
 * @param dirPath - Path to the directory
 * @returns Detailed language information
 */
export function detectLanguageWithDetails(dirPath: string): {
  name: string;
  runtime: string;
  engines?: string;
} {
  const baseInfo = detectLanguage(dirPath);
  
  if (!baseInfo) {
    return { name: "Unknown", runtime: "Unknown" };
  }
  
  // Check for package.json for more details
  const packageJsonPath = path.join(dirPath, "package.json");
  if (fs.existsSync(packageJsonPath) && baseInfo.runtime === "Node.js") {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
      return {
        ...baseInfo,
        engines: pkg.engines?.node || undefined,
      };
    } catch {
      // Ignore parse errors
    }
  }
  
  return baseInfo;
}

/**
 * Checks if a directory is a service directory
 * @param dirPath - Path to check
 * @returns True if the directory appears to be a service
 */
export function isServiceDirectory(dirPath: string): boolean {
  // Check for Bun-specific lockfile (should have package.json too)
  const hasBunLock = fs.existsSync(path.join(dirPath, "bun.lockb"));
  const hasPackageJson = fs.existsSync(path.join(dirPath, "package.json"));
  
  if (hasBunLock && !hasPackageJson) {
    return false; // bun.lockb alone doesn't indicate a service without package.json
  }
  
  return SERVICE_INDICATORS.some((indicator) =>
    fs.existsSync(path.join(dirPath, indicator))
  );
}

/**
 * Checks if a directory is a service with additional validation
 * @param dirPath - Path to check
 * @returns Object with isService flag and detected indicators
 */
export function isServiceDirectoryWithDetails(dirPath: string): {
  isService: boolean;
  indicators: string[];
  language: string | null;
} {
  const indicators: string[] = [];
  
  for (const indicator of SERVICE_INDICATORS) {
    if (fs.existsSync(path.join(dirPath, indicator))) {
      indicators.push(indicator);
    }
  }
  
  // Special case: bun.lockb without package.json
  const hasBunLock = indicators.includes("bun.lockb");
  const hasPackageJson = indicators.includes("package.json");
  
  if (hasBunLock && !hasPackageJson) {
    return {
      isService: false,
      indicators: [],
      language: null,
    };
  }
  
  const language = detectLanguage(dirPath);
  
  return {
    isService: indicators.length > 0,
    indicators,
    language: language?.name || null,
  };
}

/**
 * Performs complete stack detection on a directory
 * @param dirPath - Path to analyze
 * @returns Complete stack detection result
 */
export function detectStack(dirPath: string): StackDetectionResult {
  const result: StackDetectionResult = {
    framework: null,
    language: null,
    runtime: null,
    databases: [],
    messageQueues: [],
    orms: [],
    isService: false,
  };
  
  // Check if it's a service
  const serviceCheck = isServiceDirectoryWithDetails(dirPath);
  result.isService = serviceCheck.isService;
  
  if (!result.isService) {
    return result;
  }
  
  // Detect language
  const languageInfo = detectLanguageWithDetails(dirPath);
  result.language = languageInfo.name;
  result.runtime = languageInfo.runtime;
  
  // Analyze package.json for frameworks and ORMs
  const packageJsonPath = path.join(dirPath, "package.json");
  if (fs.existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
      result.framework = detectFramework(pkg);
      result.orms = detectORMs(pkg);
      
      // Check for message queues in dependencies
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      for (const [dep, info] of Object.entries(DATABASES)) {
        if (info.category === "queue" && deps?.[dep]) {
          result.messageQueues.push(info.name);
        }
      }
      result.messageQueues = [...new Set(result.messageQueues)];
    } catch {
      // Ignore parse errors
    }
  }
  
  // Analyze docker-compose.yml for databases
  const composePaths = [
    path.join(dirPath, "docker-compose.yml"),
    path.join(dirPath, "docker-compose.yaml"),
  ];
  
  for (const composePath of composePaths) {
    if (fs.existsSync(composePath)) {
      try {
        const content = fs.readFileSync(composePath, "utf-8");
        result.databases = detectDatabases(content);
        const queues = detectMessageQueues(content);
        result.messageQueues = [...new Set([...result.messageQueues, ...queues])];
      } catch {
        // Ignore read errors
      }
      break;
    }
  }
  
  return result;
}

/**
 * StackDetectionTool - A dedicated LangChain tool for detecting tech stacks
 * 
 * Analyzes a directory to detect:
 * - Programming language and runtime
 * - Framework (from package.json)
 * - Databases (from docker-compose.yml)
 * - Message queues
 * - ORMs
 * - Service validation
 */
export const StackDetectionTool = tool(
  async (input: { directoryPath: string }) => {
    const { directoryPath } = input;
    const resolvedPath = path.resolve(directoryPath);
    
    if (!fs.existsSync(resolvedPath)) {
      return JSON.stringify({
        error: `Path does not exist: ${resolvedPath}`,
        exists: false,
        isService: false,
      });
    }
    
    const stats = fs.statSync(resolvedPath);
    if (!stats.isDirectory()) {
      return JSON.stringify({
        error: `Path is not a directory: ${resolvedPath}`,
        exists: true,
        isService: false,
      });
    }
    
    const result = detectStack(resolvedPath);
    
    return JSON.stringify({
      path: resolvedPath,
      exists: true,
      isDirectory: true,
      ...result,
    }, null, 2);
  },
  {
    name: "detect_stack",
    description: "Analyzes a directory to detect the complete tech stack including language, framework, databases, message queues, and ORMs",
    schema: z.object({
      directoryPath: z.string().describe("Path to the directory to analyze"),
    }),
  }
);

/**
 * BatchStackDetectionTool - Detects stacks for multiple directories
 */
export const BatchStackDetectionTool = tool(
  async (input: { directoryPaths: string[] }) => {
    const results: Array<{
      path: string;
      exists: boolean;
      isService: boolean;
      error?: string;
      stack?: StackDetectionResult;
    }> = [];
    
    for (const dirPath of input.directoryPaths) {
      const resolvedPath = path.resolve(dirPath);
      
      if (!fs.existsSync(resolvedPath)) {
        results.push({
          path: resolvedPath,
          exists: false,
          isService: false,
          error: "Path does not exist",
        });
        continue;
      }
      
      const stats = fs.statSync(resolvedPath);
      if (!stats.isDirectory()) {
        results.push({
          path: resolvedPath,
          exists: true,
          isService: false,
          error: "Path is not a directory",
        });
        continue;
      }
      
      const stack = detectStack(resolvedPath);
      results.push({
        path: resolvedPath,
        exists: true,
        isService: stack.isService,
        stack,
      });
    }
    
    return JSON.stringify(results, null, 2);
  },
  {
    name: "detect_stacks_batch",
    description: "Analyzes multiple directories to detect their tech stacks in batch",
    schema: z.object({
      directoryPaths: z.array(z.string()).describe("Array of directory paths to analyze"),
    }),
  }
);

// Export all utilities for use in other tools
export default StackDetectionTool;