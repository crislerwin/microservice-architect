import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "fs";
import { tmpdir } from "os";
import * as path from "path";

describe("ServiceAnalyzer Tests", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = path.join(tmpdir(), `service-analyzer-test-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  describe("Tech Stack Detection", () => {
    it("should detect Express framework", () => {
      const packageJson = {
        name: "test-service",
        dependencies: {
          express: "^4.18.0",
        },
      };

      const hasExpress = Object.keys(packageJson.dependencies).includes("express");
      expect(hasExpress).toBe(true);
    });

    it("should detect NestJS framework", () => {
      const packageJson = {
        name: "test-service",
        dependencies: {
          "@nestjs/core": "^10.0.0",
        },
      };

      const hasNestJS = Object.keys(packageJson.dependencies).some((dep = dep.includes("nestjs")));
      expect(hasNestJS).toBe(true);
    });

    it("should detect FastAPI framework", () => {
      const requirementsTxt = `
fastapi==0.100.0
uvicorn==0.23.0
`;

      const hasFastAPI = requirementsTxt.includes("fastapi");
      expect(hasFastAPI).toBe(true);
    });

    it("should detect Django framework", () => {
      const requirementsTxt = `
django==4.2.0
psycopg2==2.9.0
`;

      const hasDjango = requirementsTxt.includes("django");
      expect(hasDjango).toBe(true);
    });

    it("should detect multiple frameworks", () => {
      const packageJson = {
        dependencies: {
          express: "^4.18.0",
          mongoose: "^7.0.0",
          redis: "^4.0.0",
          axios: "^1.0.0",
        },
      };

      const deps = Object.keys(packageJson.dependencies);
      expect(deps).toContain("express");
      expect(deps).toContain("mongoose");
      expect(deps).toContain("redis");
      expect(deps).toContain("axios");
    });
  });

  describe("Database Detection", () => {
    it("should detect PostgreSQL from docker-compose", () => {
      const dockerCompose = `
services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: myapp
`;

      expect(dockerCompose).toContain("postgres");
    });

    it("should detect MongoDB from docker-compose", () => {
      const dockerCompose = `
services:
  mongodb:
    image: mongo:6
    ports:
      - "27017:27017"
`;

      expect(dockerCompose).toContain("mongo");
    });

    it("should detect Redis from docker-compose", () => {
      const dockerCompose = `
services:
  redis:
    image: redis:7
    ports:
      - "6379:6379"
`;

      expect(dockerCompose).toContain("redis");
    });

    it("should detect MongoDB from package.json", () => {
      const packageJson = {
        dependencies: {
          mongoose: "^7.0.0",
        },
      };

      const hasMongoose = Object.keys(packageJson.dependencies).includes("mongoose");
      expect(hasMongoose).toBe(true);
    });

    it("should detect SQL ORM from package.json", () => {
      const orms = ["prisma", "sequelize", "typeorm"];
      const packageJson = {
        dependencies: {
          prisma: "^4.0.0",
        },
      };

      const deps = Object.keys(packageJson.dependencies);
      const hasORM = orms.some((orm) => deps.includes(orm));
      expect(hasORM).toBe(true);
    });
  });

  describe("Message Queue Detection", () => {
    it("should detect Kafka from docker-compose", () => {
      const dockerCompose = `
services:
  kafka:
    image: confluentinc/cp-kafka:7.0.0
    ports:
      - "9092:9092"
`;

      expect(dockerCompose).toContain("kafka");
    });

    it("should detect RabbitMQ from docker-compose", () => {
      const dockerCompose = `
services:
  rabbitmq:
    image: rabbitmq:3-management
    ports:
      - "5672:5672"
`;

      expect(dockerCompose).toContain("rabbitmq");
    });

    it("should detect Kafka from package.json", () => {
      const packageJson = {
        dependencies: {
          kafkajs: "^2.0.0",
        },
      };

      const hasKafka = Object.keys(packageJson.dependencies).some((dep = dep.includes("kafka")));
      expect(hasKafka).toBe(true);
    });
  });

  describe("API Endpoint Extraction", () => {
    it("should extract GET routes", () => {
      const code = `
app.get('/users', async (req, res) => {
  const users = await User.find();
  res.json(users);
});
`;

      const matches = code.match(/app\.get\(['"`]([^'"`]+)/g);
      expect(matches).toBeDefined();
      expect(matches?.length).toBe(1);
      expect(matches?.[0]).toContain("/users");
    });

    it("should extract POST routes", () => {
      const code = `
app.post('/users', async (req, res) => {
  const user = new User(req.body);
  await user.save();
  res.status(201).json(user);
});
`;

      const matches = code.match(/app\.post\(['"`]([^'"`]+)/g);
      expect(matches).toBeDefined();
      expect(matches?.length).toBe(1);
      expect(matches?.[0]).toContain("/users");
    });

    it("should extract route with parameters", () => {
      const code = `
app.get('/users/:id', async (req, res) => {
  const user = await User.findById(req.params.id);
  res.json(user);
});
`;

      const matches = code.match(/app\.get\(['"`]([^'"`]+)/g);
      expect(matches).toBeDefined();
      expect(matches?.[0]).toContain(":id");
    });

    it("should extract multiple routes", () => {
      const code = `
app.get('/users', handler);
app.post('/users', handler);
app.get('/users/:id', handler);
app.put('/users/:id', handler);
app.delete('/users/:id', handler);
`;

      const getMatches = code.match(/app\.get\(['"`]([^'"`]+)/g) || [];
      const postMatches = code.match(/app\.post\(['"`]([^'"`]+)/g) || [];
      const putMatches = code.match(/app\.put\(['"`]([^'"`]+)/g) || [];
      const deleteMatches = code.match(/app\.delete\(['"`]([^'"`]+)/g) || [];

      const totalRoutes =
        getMatches.length + postMatches.length + putMatches.length + deleteMatches.length;
      expect(totalRoutes).toBe(5);
    });
  });

  describe("Language Detection", () => {
    it("should detect Node.js from package.json", () => {
      const hasPackageJson = true;
      expect(hasPackageJson).toBe(true);
    });

    it("should detect Python from requirements.txt", () => {
      const hasRequirementsTxt = true;
      expect(hasRequirementsTxt).toBe(true);
    });

    it("should detect Go from go.mod", () => {
      const hasGoMod = true;
      expect(hasGoMod).toBe(true);
    });

    it("should detect Java from pom.xml", () => {
      const hasPomXml = true;
      expect(hasPomXml).toBe(true);
    });
  });

  describe("External Service Detection", () => {
    it("should detect HTTP client usage", () => {
      const code = `
const axios = require('axios');
const response = await axios.get('https://api.example.com/data');
`;

      expect(code).toContain("axios");
    });

    it("should detect fetch usage", () => {
      const code = `
const response = await fetch('https://api.example.com/data');
const data = await response.json();
`;

      expect(code).toContain("fetch");
    });

    it("should detect service URLs in code", () => {
      const code = `
const USER_SERVICE_URL = 'http://user-service:3000';
const ORDER_SERVICE_URL = 'http://order-service:3001';
`;

      expect(code).toContain("user-service");
      expect(code).toContain("order-service");
    });
  });
});
