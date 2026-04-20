import { tool } from "@langchain/core/tools";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";

/**
 * Maps dependencies between microservices in a project.
 * Detects:
 * - HTTP API calls between services
 * - Shared database connections
 * - Message queue connections (RabbitMQ, Kafka, etc.)
 * - Shared libraries/modules
 */
export const DependencyMapperTool = tool(
  async (input: { projectRoot: string }) => {
    const { projectRoot } = input;
    const resolvedPath = path.resolve(projectRoot);

    if (!fs.existsSync(resolvedPath)) {
      return JSON.stringify({
        error: `Path does not exist: ${resolvedPath}`,
      });
    }

    const dependencies: Record<string, any> = {
      services: {},
      connections: [],
      sharedDatabases: [],
      messageQueues: [],
      serviceRegistry: null,
    };

    // Find all service directories
    const serviceDirs = findServiceDirectories(resolvedPath);

    // Analyze each service
    for (const servicePath of serviceDirs) {
      const serviceName = path.basename(servicePath);
      dependencies.services[serviceName] = {
        path: servicePath,
        dependsOn: [],
        provides: [],
      };

      // Scan for HTTP client calls
      const httpCalls = scanForHttpCalls(servicePath);
      dependencies.services[serviceName].dependsOn = httpCalls;

      // Scan for database connections
      const dbConnections = scanForDatabaseConnections(servicePath);
      dependencies.services[serviceName].databases = dbConnections;

      // Add to shared databases list
      for (const db of dbConnections) {
        if (!dependencies.sharedDatabases.includes(db)) {
          dependencies.sharedDatabases.push(db);
        }
      }

      // Scan for message queue connections
      const mqConnections = scanForMessageQueueConnections(servicePath);
      dependencies.services[serviceName].messageQueues = mqConnections;

      for (const mq of mqConnections) {
        if (!dependencies.messageQueues.includes(mq)) {
          dependencies.messageQueues.push(mq);
        }
      }
    }

    // Build connection graph
    dependencies.connections = buildConnectionGraph(dependencies.services);

    // Check for service registry (like Consul, Eureka, etc.)
    dependencies.serviceRegistry = detectServiceRegistry(resolvedPath);

    return JSON.stringify(dependencies, null, 2);
  },
  {
    name: "map_dependencies",
    description: "Maps dependencies between microservices including HTTP calls, shared databases, and message queues",
    schema: z.object({
      projectRoot: z.string().describe("Root path of the microservices project"),
    }),
  }
);

function findServiceDirectories(projectRoot: string): string[] {
  const entries = fs.readdirSync(projectRoot, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules")
    .map((e) => path.join(projectRoot, e.name))
    .filter((dir) => {
      return (
        fs.existsSync(path.join(dir, "package.json")) ||
        fs.existsSync(path.join(dir, "Dockerfile")) ||
        fs.existsSync(path.join(dir, "docker-compose.yml"))
      );
    });
}

function scanForHttpCalls(servicePath: string): string[] {
  const httpClients: string[] = [];
  const srcPath = path.join(servicePath, "src");

  if (!fs.existsSync(srcPath)) return httpClients;

  const files = fs.readdirSync(srcPath, { recursive: true }) as string[];

  for (const file of files) {
    const fullPath = path.join(srcPath, file);
    if (!fs.statSync(fullPath).isFile()) continue;
    if (!file.endsWith(".ts") && !file.endsWith(".js")) continue;

    const content = fs.readFileSync(fullPath, "utf-8");

    // Match axios, fetch, http client patterns
    const patterns = [
      /axios\.(get|post|put|delete|patch)\(['"`]([^'"`]+)/g,
      /fetch\(['"`]([^'"`]+)/g,
      /http\.(get|post|put|delete|patch)\(['"`]([^'"`]+)/g,
      /request\(['"`]([^'"`]+)/g,
      /baseURL\s*[=:]\s*['"`]([^'"`]+)/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const url = match[1] || match[2];
        if (url && (url.includes("http://") || url.includes("https://"))) {
          httpClients.push(url);
        }
      }
    }

    // Match service name references in imports or configs
    const servicePatterns = [
      /process\.env\.([A-Z_]*SERVICE[A-Z_]*_URL)/g,
      /http:\/\/([a-z-]+):\d+/g,
      /https:\/\/([a-z-]+):\d+/g,
    ];

    for (const pattern of servicePatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const service = match[1];
        if (service && !httpClients.includes(service)) {
          httpClients.push(service.toLowerCase().replace(/_url$/, "").replace(/_/g, "-"));
        }
      }
    }
  }

  return [...new Set(httpClients)];
}

function scanForDatabaseConnections(servicePath: string): string[] {
  const databases: string[] = [];
  const packageJsonPath = path.join(servicePath, "package.json");

  if (fs.existsSync(packageJsonPath)) {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    const dbPackages: Record<string, string> = {
      pg: "PostgreSQL",
      mysql2: "MySQL",
      mongodb: "MongoDB",
      mongoose: "MongoDB",
      redis: "Redis",
      ioredis: "Redis",
      "@prisma/client": "Prisma",
      typeorm: "TypeORM",
      sequelize: "Sequelize",
      knex: "Knex.js",
      "@elastic/elasticsearch": "Elasticsearch",
      "cassandra-driver": "Cassandra",
      "neo4j-driver": "Neo4j",
      influx: "InfluxDB",
    };

    for (const [pkgName, dbName] of Object.entries(dbPackages)) {
      if (deps[pkgName]) {
        databases.push(dbName);
      }
    }
  }

  return [...new Set(databases)];
}

function scanForMessageQueueConnections(servicePath: string): string[] {
  const queues: string[] = [];
  const packageJsonPath = path.join(servicePath, "package.json");

  if (fs.existsSync(packageJsonPath)) {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    const mqPackages: Record<string, string> = {
      amqplib: "RabbitMQ",
      kafkajs: "Kafka",
      "@aws-sdk/client-sqs": "AWS SQS",
      sqs: "AWS SQS",
      "@azure/service-bus": "Azure Service Bus",
      "google-cloud-pubsub": "Google Cloud Pub/Sub",
      nats: "NATS",
      "mqtt": "MQTT",
    };

    for (const [pkgName, mqName] of Object.entries(mqPackages)) {
      if (deps[pkgName]) {
        queues.push(mqName);
      }
    }
  }

  // Also scan for docker-compose references
  const composePath = path.join(servicePath, "docker-compose.yml");
  if (fs.existsSync(composePath)) {
    const compose = fs.readFileSync(composePath, "utf-8").toLowerCase();
    if (compose.includes("rabbitmq")) queues.push("RabbitMQ");
    if (compose.includes("kafka")) queues.push("Kafka");
    if (compose.includes("redis")) queues.push("Redis");
  }

  return [...new Set(queues)];
}

function buildConnectionGraph(services: Record<string, any>): Array<{from: string; to: string; type: string}> {
  const connections: Array<{from: string; to: string; type: string}> = [];
  const serviceNames = Object.keys(services);

  for (const [serviceName, data] of Object.entries(services)) {
    for (const dependency of data.dependsOn || []) {
      // Check if dependency is another service in the project
      for (const otherService of serviceNames) {
        if (dependency.toLowerCase().includes(otherService.toLowerCase())) {
          connections.push({
            from: serviceName,
            to: otherService,
            type: "http",
          });
        }
      }
    }

    // Check shared databases
    for (const db of data.databases || []) {
      for (const otherService of serviceNames) {
        if (otherService !== serviceName) {
          const otherDb = services[otherService]?.databases || [];
          if (otherDb.includes(db)) {
            connections.push({
              from: serviceName,
              to: otherService,
              type: `shared-${db.toLowerCase().replace(/\s/g, "-")}`,
            });
          }
        }
      }
    }
  }

  return connections;
}

function detectServiceRegistry(projectRoot: string): string | null {
  const dockerComposePath = path.join(projectRoot, "docker-compose.yml");
  
  if (!fs.existsSync(dockerComposePath)) return null;

  const compose = fs.readFileSync(dockerComposePath, "utf-8").toLowerCase();

  const registries = [
    { name: "Consul", pattern: /consul/ },
    { name: "Eureka", pattern: /eureka/ },
    { name: "etcd", pattern: /etcd/ },
    { name: "ZooKeeper", pattern: /zookeeper/ },
    { name: "Kubernetes", pattern: /kubernetes|k8s/ },
  ];

  for (const registry of registries) {
    if (registry.pattern.test(compose)) {
      return registry.name;
    }
  }

  return null;
}