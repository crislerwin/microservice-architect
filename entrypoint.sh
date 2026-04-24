#!/bin/sh
# MCP Server Docker Entrypoint
# Configures environment and starts the MCP server

set -e

# Check if /projects directory has content
if [ -d "/projects" ]; then
    PROJECT_COUNT=$(find /projects -maxdepth 1 -type d | wc -l)
    echo "📁 Projects mounted: $((PROJECT_COUNT - 1)) directories in /projects"
    
    # List first few projects
    echo "📂 Available projects:"
    ls -1 /projects | head -5 | while read line; do
        echo "   • $line"
    done
    echo ""
else
    echo "⚠ Warning: No /projects directory mounted."
    echo "   Mount your projects with: -v /path/to/projects:/projects:ro"
    echo ""
fi

# Default to Ollama if not specified
if [ -z "$LLM_BASE_URL" ]; then
    # Try to detect if Ollama is running on host
    if curl -s http://host.docker.internal:11434/api/tags > /dev/null 2>&1; then
        echo "✓ Ollama detected on host at http://host.docker.internal:11434"
        export LLM_BASE_URL="http://host.docker.internal:11434/v1"
        export LLM_API_KEY="${LLM_API_KEY:-ollama}"
        export LLM_MODEL="${LLM_MODEL:-kimi-k2.5:cloud}"
    else
        echo "⚠ Warning: Ollama not detected on host. Set LLM_BASE_URL to use external LLM."
    fi
fi

# Validate required environment
if [ -z "$LLM_API_KEY" ] && [ -z "$OPENAI_API_KEY" ]; then
    echo "⚠ Warning: No LLM_API_KEY or OPENAI_API_KEY set. Analysis tools may fail."
fi

echo "🚀 Starting Microservice Architect MCP Server..."
echo "   Model: ${LLM_MODEL:-not set}"
echo "   Base URL: ${LLM_BASE_URL:-not set}"
echo ""
echo "💡 Usage example:"
echo '   echo '\''{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"analyze_service","arguments":{"servicePath":"/projects/go-clean-api"}}}'\'' | docker run -i microservice-architect-mcp'
echo ""

# Start the MCP server
exec bun run /app/dist/mcp/index.js "$@"
