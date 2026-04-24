# Microservice Architect MCP Server - Docker

Docker container for running the Microservice Architect MCP server with support for Ollama or OpenAI.

## 🚀 Quick Start

### 1. Build the Image
```bash
docker build -t microservice-architect-mcp .
```

### 2. Run with Project Mounting

#### Analyze a Single Project
```bash
# Mount your project to /projects and analyze
docker run -i --rm \
  -v /home/crislerwintler/projects/go-clean-api:/projects/go-clean-api:ro \
  -e LLM_BASE_URL=http://host.docker.internal:11434/v1 \
  microservice-architect-mcp

# Then send MCP requests via stdin:
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"analyze_service","arguments":{"servicePath":"/projects/go-clean-api"}}}' | docker run -i --rm \
  -v /home/crislerwintler/projects/go-clean-api:/projects/go-clean-api:ro \
  -e LLM_BASE_URL=http://host.docker.internal:11434/v1 \
  microservice-architect-mcp
```

#### Analyze Multiple Projects (Workspace Mode)
```bash
# Mount multiple projects
docker run -i --rm \
  -v /home/crislerwintler/projects:/projects:ro \
  -e LLM_BASE_URL=http://host.docker.internal:11434/v1 \
  microservice-architect-mcp
```

### 3. With docker-compose (Recommended)
```bash
# Create output directory
mkdir -p ./output

# Start with Ollama
docker-compose up --build

# Or with custom project path
PROJECTS_PATH=/path/to/your/projects docker-compose up
```

## 📁 Volume Mounts

The container expects projects to be mounted at `/projects`:

| Host Path | Container Path | Purpose |
|-----------|----------------|---------|
| `/path/to/project` | `/projects/project-name` | Read-only access to analyze |
| `./output` | `/output` | Generated documentation |

### Examples

```bash
# Single project
docker run -i -v /home/user/my-api:/projects/my-api:ro microservice-architect-mcp

# Multiple projects (workspace)
docker run -i -v /home/user/projects:/projects:ro microservice-architect-mcp

# With output for generated docs
docker run -i \
  -v /home/user/projects:/projects:ro \
  -v /home/user/docs:/output \
  microservice-architect-mcp
```

## 🔧 Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_API_KEY` | `ollama` | API key for LLM (any value for Ollama) |
| `LLM_BASE_URL` | `http://host.docker.internal:11434/v1` | Ollama endpoint |
| `LLM_MODEL` | `kimi-k2.5:cloud` | Model name |
| `PROJECTS_PATH` | `./examples` | Host path to mount as `/projects` |
| `OUTPUT_PATH` | `./output` | Host path to mount as `/output` |

## 🐳 Usage Examples

### With Ollama (Local LLM)
```bash
# Ensure Ollama is running on host
docker run -d -v ollama:/root/.ollama -p 11434:11434 --name ollama ollama/ollama

# Run MCP server with project
docker run -i --rm \
  -v /home/crislerwintler/projects/go-clean-api:/projects/go-clean-api:ro \
  -e LLM_BASE_URL=http://host.docker.internal:11434/v1 \
  -e LLM_MODEL=kimi-k2.5:cloud \
  microservice-architect-mcp
```

### With OpenAI
```bash
docker run -i --rm \
  -v /home/crislerwintler/projects/go-clean-api:/projects/go-clean-api:ro \
  -e LLM_API_KEY=$OPENAI_API_KEY \
  -e LLM_BASE_URL=https://api.openai.com/v1 \
  -e LLM_MODEL=gpt-4o-mini \
  microservice-architect-mcp
```

## 🧪 Testing

```bash
# Test MCP server
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | \
  docker run -i microservice-architect-mcp

# Analyze a project
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"analyze_service","arguments":{"servicePath":"/projects/go-clean-api"}}}' | \
  docker run -i -v /home/crislerwintler/projects/go-clean-api:/projects/go-clean-api:ro microservice-architect-mcp
```

## 🏗️ Architecture

Multi-stage build:
1. **Builder stage**: Compiles TypeScript with Bun
2. **Production stage**: Minimal Alpine image (~150MB)

Security features:
- Non-root user (`mcp:1001`)
- Read-only volume mounts
- Health checks
