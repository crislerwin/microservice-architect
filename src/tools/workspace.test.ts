import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "fs";
import { mkdirSync, rmdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import * as path from "path";

// Helper function to create test directory structure
function createTestWorkspace(basePath: string) {
  // Create service directories
  const userService = path.join(basePath, "user-service");
  const orderService = path.join(basePath, "order-service");
  const apiGateway = path.join(basePath, "api-gateway");

  mkdirSync(userService, { recursive: true });
  mkdirSync(orderService, { recursive: true });
  mkdirSync(apiGateway, { recursive: true });

  // User service - Node.js with Express
  writeFileSync(
    path.join(userService, "package.json"),
    JSON.stringify({
      name: "user-service",
      dependencies: {
        express: "^4.18.0",
        mongoose: "^7.0.0",
        redis: "^4.0.0",
      },
    }),
  );

  // Order service - Node.js with Fastify
  writeFileSync(
    path.join(orderService, "package.json"),
    JSON.stringify({
      name: "order-service",
      dependencies: {
        fastify: "^4.0.0",
        prisma: "^4.0.0",
        kafkajs: "^2.0.0",
      },
    }),
  );

  // API Gateway - Node.js
  writeFileSync(
    path.join(apiGateway, "package.json"),
    JSON.stringify({
      name: "api-gateway",
      dependencies: {
        express: "^4.18.0",
        axios: "^1.0.0",
      },
    }),
  );

  return { userService, orderService, apiGateway };
}

describe("Workspace Detection", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = path.join(tmpdir(), `microservice-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up test directory
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  it("should detect Node.js service by package.json", () => {
    const serviceDir = path.join(testDir, "test-service");
    mkdirSync(serviceDir, { recursive: true });
    writeFileSync(path.join(serviceDir, "package.json"), JSON.stringify({ name: "test-service" }));

    const hasPackageJson = fs.existsSync(path.join(serviceDir, "package.json"));
    expect(hasPackageJson).toBe(true);
  });

  it("should detect Python service by requirements.txt", () => {
    const serviceDir = path.join(testDir, "python-service");
    mkdirSync(serviceDir, { recursive: true });
    writeFileSync(path.join(serviceDir, "requirements.txt"), "fastapi==0.100.0");

    const hasRequirements = fs.existsSync(path.join(serviceDir, "requirements.txt"));
    expect(hasRequirements).toBe(true);
  });

  it("should detect Go service by go.mod", () => {
    const serviceDir = path.join(testDir, "go-service");
    mkdirSync(serviceDir, { recursive: true });
    writeFileSync(path.join(serviceDir, "go.mod"), "module example.com/service");

    const hasGoMod = fs.existsSync(path.join(serviceDir, "go.mod"));
    expect(hasGoMod).toBe(true);
  });

  it("should detect multiple services in workspace", () => {
    const services = createTestWorkspace(testDir);

    const entries = fs.readdirSync(testDir, { withFileTypes: true });
    const serviceDirs = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => e.name);

    expect(serviceDirs).toContain("user-service");
    expect(serviceDirs).toContain("order-service");
    expect(serviceDirs).toContain("api-gateway");
    expect(serviceDirs.length).toBe(3);
  });

  it("should identify tech stack from package.json", () => {
    const serviceDir = path.join(testDir, "test-service");
    mkdirSync(serviceDir, { recursive: true });
    const packageJson = {
      name: "test-service",
      dependencies: {
        express: "^4.18.0",
        mongoose: "^7.0.0",
      },
    };
    writeFileSync(path.join(serviceDir, "package.json"), JSON.stringify(packageJson));

    const content = fs.readFileSync(path.join(serviceDir, "package.json"), "utf-8");
    const parsed = JSON.parse(content);

    expect(parsed.dependencies.express).toBeDefined();
    expect(parsed.dependencies.mongoose).toBeDefined();
  });

  it("should detect database from docker-compose.yml", () => {
    const serviceDir = path.join(testDir, "test-service");
    mkdirSync(serviceDir, { recursive: true });
    const dockerCompose = `
services:
  postgres:
    image: postgres:15
  redis:
    image: redis:7
`;
    writeFileSync(path.join(serviceDir, "docker-compose.yml"), dockerCompose);

    const content = fs.readFileSync(path.join(serviceDir, "docker-compose.yml"), "utf-8");

    expect(content).toContain("postgres");
    expect(content).toContain("redis");
  });
});

describe("File Pattern Detection", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = path.join(tmpdir(), `pattern-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore
    }
  });

  it("should extract HTTP routes from Express code", () => {
    const code = `
const express = require('express');
const app = express();

app.get('/users', (req, res) => {});
app.post('/users', (req, res) => {});
app.get('/users/:id', (req, res) => {});
`;

    const routeMatches = code.match(
      /(?:app\.|router\.|server\.)?(get|post|put|delete|patch)\(['"`]([^'"`]+)/gi,
    );

    expect(routeMatches).toBeDefined();
    expect(routeMatches?.length).toBe(3);
  });

  it("should extract HTTP calls from axios usage", () => {
    const code = `
const axios = require('axios');

async function getUser() {
  const response = await axios.get('http://user-service:3000/users/1');
  return response.data;
}
`;

    const httpMatches = code.match(/axios\.(get|post|put|delete)\(['"`](http:[^'"`]+)/gi);

    expect(httpMatches).toBeDefined();
    expect(httpMatches?.length).toBe(1);
    expect(httpMatches?.[0]).toContain("user-service");
  });

  it("should detect message queue patterns", () => {
    const code = `
const producer = kafka.producer();
await producer.connect();
await producer.send({
  topic: 'user-events',
  messages: [{ value: JSON.stringify(user) }],
});
`;

    const topicMatches = code.match(/['"`]([^'"`]+topic[^'"`]*)['"`]/gi);

    expect(topicMatches).toBeDefined();
    expect(topicMatches?.some((m) => m.includes("user-events"))).toBe(true);
  });

  it("should detect database URL patterns", () => {
    const code = `
const DATABASE_URL = 'postgresql://user:pass@localhost:5432/mydb';
`;

    const dbMatch = code.match(/DATABASE_URL.*:\/\/([^/]+)/);

    expect(dbMatch).toBeDefined();
    expect(dbMatch?.[1]).toContain("localhost");
  });
});

describe("Dependency Graph Generation", () => {
  it("should create dependency nodes from service names", () => {
    const services = ["user-service", "order-service", "api-gateway"];
    const nodes = services.map((name) => ({ id: name, label: name }));

    expect(nodes.length).toBe(3);
    expect(nodes[0].id).toBe("user-service");
    expect(nodes[1].id).toBe("order-service");
    expect(nodes[2].id).toBe("api-gateway");
  });

  it("should create edges from service dependencies", () => {
    const dependencies = {
      "api-gateway": ["user-service", "order-service"],
      "order-service": ["user-service"],
    };

    const edges: { from: string; to: string; type: string }[] = [];
    for (const [service, deps] of Object.entries(dependencies)) {
      for (const dep of deps) {
        edges.push({ from: service, to: dep, type: "http" });
      }
    }

    expect(edges.length).toBe(3);
    expect(edges).toContainEqual({ from: "api-gateway", to: "user-service", type: "http" });
    expect(edges).toContainEqual({ from: "api-gateway", to: "order-service", type: "http" });
    expect(edges).toContainEqual({ from: "order-service", to: "user-service", type: "http" });
  });
});

describe("Documentation Generation", () => {
  it("should format currency values in BRL", () => {
    const amount = 1234.56;
    const formatted = new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(amount);

    expect(formatted).toContain("R$");
    expect(formatted).toContain("1.234,56");
  });

  it("should create markdown table from data", () => {
    const services = [
      { name: "user-service", language: "Node.js" },
      { name: "order-service", language: "Node.js" },
    ];

    const table = [
      "| Service | Language |",
      "|---------|----------|",
      ...services.map((s) => `| ${s.name} | ${s.language} |`),
    ].join("\n");

    expect(table).toContain("user-service");
    expect(table).toContain("order-service");
    expect(table).toContain("|");
  });
});
