# 🤖 Microservice Architect MCP Server

A Model Context Protocol (MCP) server that exposes the Microservice Architect agent's capabilities as tools for AI assistants like Claude Desktop, Cursor, and other MCP-compatible clients.

## What is MCP?

[MCP (Model Context Protocol)](https://modelcontextprotocol.io) is an open protocol that standardizes how applications provide context to Large Language Models (LLMs). Think of it as a USB-C port for AI applications - it provides a standardized way to connect AI models to tools, data sources, and capabilities.

**Why MCP is useful:**
- 🔌 **Standardized Integration**: Works across different AI clients (Claude Desktop, Cursor, etc.)
- 🛠️ **Tool Discovery**: AI assistants can discover and use tools dynamically
- 🔒 **Secure**: Tools run in isolated processes with explicit permissions
- 📝 **Type-Safe**: JSON Schema-based input validation
- 🔄 **Stateful**: Maintains context across multiple interactions

## 📦 Installation

### Prerequisites

- Node.js 18+ or Bun
- A microservices project to analyze

### Step 1: Clone and Install Dependencies

```bash
# Clone the repository
git clone https://github.com/crislerwin/microservice-architect.git
cd microservice-architect

# Install dependencies
npm install
# or
bun install
```

### Step 2: Configure Environment Variables (Optional)

For LLM-powered analysis, set these environment variables:

```bash
# Required for analyze_code_llm tool
export LLM_API_KEY="your-api-key"

# Optional - defaults shown
export LLM_MODEL="gpt-4o"        # LLM model to use
export LLM_BASE_URL=""          # Custom API base URL (if using alternative provider)
```

## 🔧 Configuration for MCP Clients

### Claude Desktop

1. Open Claude Desktop settings:
   - **macOS**: `Cmd + ,` or `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows**: `%APPDATA%/Claude/claude_desktop_config.json`

2. Add the MCP server configuration:

```json
{
  "mcpServers": {
    "microservice-architect": {
      "command": "bun",
      "args": ["run", "mcp-server"],
      "cwd": "/path/to/microservice-architect",
      "env": {
        "LLM_API_KEY": "your-api-key",
        "LLM_MODEL": "gpt-4o"
      }
    }
  }
}
```

> **Using npm instead of bun?** Replace `"command": "bun"` with `"command": "npx"` and `"args": ["run", "mcp-server"]` with `"args": ["tsx", "src/mcp/index.ts"]`.

3. Restart Claude Desktop

4. You should see a 🔨 hammer icon in the chat input - click it to see available tools!

### Cursor

1. Open Cursor settings: `Cmd/Ctrl + ,`

2. Navigate to **Features** → **MCP**

3. Click **Add New MCP Server**

4. Configure:
   - **Name**: `microservice-architect`
   - **Type**: `command`
   - **Command**: `bun run mcp-server` (or `npx tsx src/mcp/index.ts`)

5. Set environment variables in your shell or include them in the command:
   ```bash
   LLM_API_KEY=your-key bun run mcp-server
   ```

### Other MCP Clients

Most MCP clients support stdio-based servers. Use this configuration:

```json
{
  "name": "microservice-architect",
  "transport": "stdio",
  "command": "bun",
  "args": ["run", "mcp-server"],
  "cwd": "/absolute/path/to/microservice-architect"
}
```

## 🛠️ Available Tools

### 1. analyze_service

Analyzes a single microservice to extract tech stack, API endpoints, databases, Docker configuration, and dependencies.

**Input:**
```json
{
  "servicePath": "/absolute/path/to/my-service"
}
```

**Output:**
```json
{
  "path": "/path/to/my-service",
  "name": "my-service",
  "techStack": {
    "language": "TypeScript",
    "runtime": "Node.js 18.x",
    "framework": "Express",
    "dependencies": ["express", "prisma", ...]
  },
  "endpoints": ["GET /api/users", "POST /api/users"],
  "databases": ["PostgreSQL"],
  "docker": {
    "baseImage": "node:18-alpine",
    "ports": ["3000"]
  }
}
```

**Example usage:**
```
"Please analyze the service at /home/user/projects/api-gateway"
```

---

### 2. analyze_workspace

Analyzes a workspace directory containing multiple microservices. Detects all service directories and provides a workspace-level overview.

**Input:**
```json
{
  "workspacePath": "/absolute/path/to/workspace"
}
```

**Output:**
```json
{
  "workspaceName": "my-project",
  "totalServices": 5,
  "services": [
    { "name": "api-gateway", "language": "TypeScript", "runtime": "Node.js" },
    { "name": "user-service", "language": "TypeScript", "runtime": "Node.js" }
  ],
  "summary": {
    "languages": { "TypeScript": 5 },
    "databases": ["PostgreSQL", "Redis"],
    "messageQueues": ["RabbitMQ"],
    "totalEndpoints": 45
  }
}
```

**Example usage:**
```
"Analyze my workspace at /home/user/projects/ecommerce-platform"
```

---

### 3. analyze_code_llm

Uses LLM to provide intelligent analysis of a codebase's architecture, patterns, and design decisions. **Requires LLM_API_KEY**.

**Input:**
```json
{
  "projectPath": "/absolute/path/to/project",
  "maxFileLines": 100
}
```

**Output:**
```json
{
  "success": true,
  "analysis": {
    "primaryLanguage": "TypeScript",
    "runtime": "Node.js",
    "webFramework": "NestJS",
    "architecturePattern": "Clean Architecture",
    "databases": [
      { "name": "PostgreSQL", "type": "SQL", "purpose": "Primary database" }
    ],
    "externalServices": [
      { "name": "Stripe", "purpose": "Payment processing", "integrationType": "REST API" }
    ],
    "notableDecisions": [
      { "decision": "Using CQRS pattern", "rationale": "Separates read/write concerns" }
    ],
    "summary": "A well-structured NestJS application..."
  }
}
```

**Example usage:**
```
"Do an LLM analysis of the codebase at /home/user/projects/api to understand the architecture"
```

---

### 4. map_dependencies

Maps dependencies between microservices including HTTP API calls, shared databases, and message queue connections.

**Input:**
```json
{
  "projectRoot": "/absolute/path/to/project"
}
```

**Output:**
```json
{
  "services": {
    "api-gateway": { "dependsOn": ["user-service"], "databases": [] },
    "user-service": { "dependsOn": [], "databases": ["PostgreSQL"] }
  },
  "connections": [
    { "from": "api-gateway", "to": "user-service", "type": "http" }
  ],
  "sharedDatabases": ["PostgreSQL"],
  "messageQueues": ["RabbitMQ"]
}
```

**Example usage:**
```
"Map all dependencies between services in /home/user/projects/ecommerce"
```

---

### 5. generate_documentation

Generates comprehensive architecture documentation including C4 diagrams, service catalogs, API docs, runbooks, and dependency matrices.

**Input:**
```json
{
  "outputPath": "/absolute/path/to/output/docs",
  "projectPath": "/absolute/path/to/project"
}
```

**Output:**
```json
{
  "success": true,
  "generatedFiles": [
    "README.md",
    "c4/01-context.md",
    "c4/02-container.md",
    "services/catalog.md",
    "api-contracts/user-service.md",
    "runbooks/user-service.md"
  ],
  "stats": {
    "totalServices": 5,
    "totalFiles": 12,
    "hasC4Diagrams": true
  }
}
```

**Example usage:**
```
"Generate documentation for my project at /home/user/projects/ecommerce in /home/user/docs"
```

---

## 💡 Usage Examples

### Example 1: Analyze Your Microservices Architecture

```
User: "Please analyze my microservices project at /home/user/ecommerce-platform"

Assistant: I'll analyze your workspace and then map the dependencies between services.

[Uses analyze_workspace tool]
[Uses map_dependencies tool]

I found 5 services in your workspace:
- api-gateway (TypeScript/Node.js)
- user-service (TypeScript/Node.js) 
- order-service (TypeScript/Node.js)
- payment-service (TypeScript/Node.js)
- notification-service (TypeScript/Node.js)

Dependencies:
- api-gateway depends on user-service and order-service
- order-service depends on payment-service
- payment-service uses PostgreSQL and Redis
```

### Example 2: Generate Documentation

```
User: "Generate comprehensive documentation for my project"

Assistant: I'll generate professional architecture documentation for your project.

[Uses generate_documentation tool]

✅ Documentation generated successfully!

Created 12 files:
- README.md - Overview and navigation
- c4/01-context.md - C4 Context diagram
- c4/02-container.md - C4 Container diagram
- services/catalog.md - Service catalog
- api-contracts/*.md - API documentation for each service
- runbooks/*.md - Operational runbooks

View the documentation at: /home/user/ecommerce-docs
```

### Example 3: Deep LLM Analysis

```
User: "Do a deep analysis of my api-gateway service"

Assistant: I'll analyze the api-gateway service using LLM-powered analysis.

[Uses analyze_service tool]
[Uses analyze_code_llm tool]

The api-gateway uses:
- **Framework**: Express.js with TypeScript
- **Pattern**: API Gateway pattern with rate limiting
- **Key insight**: Implements circuit breaker for resilience
- **Notable decision**: Uses Redis for distributed rate limiting
```

---

## 🔍 Troubleshooting

### "Path does not exist" Error

Make sure you're providing **absolute paths**:
- ❌ `~/projects/my-service`
- ✅ `/home/user/projects/my-service`

### LLM Analysis Not Working

Check that you've set the `LLM_API_KEY` environment variable:
```bash
export LLM_API_KEY="your-api-key"
```

### Tools Not Appearing in Claude/Cursor

1. Check the server logs for errors
2. Verify the configuration JSON is valid
3. Restart the MCP client after configuration changes
4. Check that the `cwd` path is correct and absolute

### Permission Denied

Ensure the user running the MCP client has read access to:
- The microservice-architect directory
- The target project directories being analyzed

---

## 📁 Project Structure

```
microservice-architect/
├── src/
│   ├── mcp/
│   │   ├── index.ts          # MCP server entry point
│   │   └── server.ts         # MCP server implementation
│   ├── tools/                # Analysis tools
│   │   ├── ServiceAnalyzerTool.ts
│   │   ├── WorkspaceAnalyzerTool.ts
│   │   ├── DependencyMapperTool.ts
│   │   ├── LLMCodeAnalyzerTool.ts
│   │   └── ...
│   └── agents/
│       └── MicroserviceArchitectAgent.ts
├── package.json
├── README-MCP.md             # This file
└── ...
```

---

## 🤝 Contributing

Contributions are welcome! Please see the main repository for contribution guidelines.

---

## 📄 License

MIT License - see LICENSE file for details.

---

## 🔗 Resources

- [MCP Documentation](https://modelcontextprotocol.io)
- [MCP Specification](https://spec.modelcontextprotocol.io)
- [Claude Desktop](https://claude.ai/download)
- [Cursor](https://cursor.sh)

---

**Happy analyzing! 🚀**

If you have questions or issues, please open an issue on the GitHub repository.
