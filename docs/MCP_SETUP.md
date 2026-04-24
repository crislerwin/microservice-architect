# 📘 MCP Server Configuration Guide

Guia completo para configurar o Microservice Architect MCP Server em diversos editores e assistentes de IA.

> **Versão**: 1.0.0  
> **Última atualização**: 2026-04-23

## 📋 Índice
- [Cursor](#cursor)
- [Claude Desktop](#claude-desktop)
- [Claude Code](#claude-code)
- [Outros Editores](#outros-editores)

---

## 🖱️ Cursor

### Instalação via Docker (Recomendado)

1. **Abra as configurações do Cursor**:
   - `Cmd/Ctrl + Shift + P` → "MCP: Add Server"
   - Ou vá em: Settings → Features → MCP Servers

2. **Adicione o servidor**:

```json
{
  "mcpServers": {
    "microservice-architect": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-v",
        "/home/crislerwintler/projects:/projects:ro",
        "-e",
        "LLM_BASE_URL=http://host.docker.internal:11434/v1",
        "-e",
        "LLM_MODEL=kimi-k2.5:cloud",
        "microservice-architect-mcp:latest"
      ],
      "env": {
        "LLM_API_KEY": "ollama"
      }
    }
  }
}
```

3. **Verifique a conexão**:
   - O ícone MCP deve ficar verde ✅
   - Ferramentas disponíveis: `analyze_service`, `analyze_workspace`, `map_dependencies`, etc.

### Instalação Local (Desenvolvimento)

```json
{
  "mcpServers": {
    "microservice-architect": {
      "command": "npx",
      "args": [
        "tsx",
        "/home/crislerwintler/projects/microservice-architect/src/mcp/index.ts"
      ],
      "env": {
        "LLM_API_KEY": "ollama",
        "LLM_BASE_URL": "http://127.0.0.1:11434/v1",
        "LLM_MODEL": "kimi-k2.5:cloud"
      }
    }
  }
}
```

---

## 🤖 Claude Desktop

### Configuração

1. **Abra o arquivo de configuração**:
   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
   - **Linux**: `~/.config/Claude/claude_desktop_config.json`

2. **Adicione o servidor MCP**:

```json
{
  "mcpServers": {
    "microservice-architect": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-v",
        "/home/crislerwintler/projects:/projects:ro",
        "-e",
        "LLM_BASE_URL=http://host.docker.internal:11434/v1",
        "-e",
        "LLM_MODEL=kimi-k2.5:cloud",
        "microservice-architect-mcp:latest"
      ],
      "env": {
        "LLM_API_KEY": "ollama"
      }
    }
  }
}
```

3. **Reinicie o Claude Desktop**

4. **Verifique**:
   - Clique no 🔧 ícone de ferramentas
   - Deve aparecer "microservice-architect" com as ferramentas disponíveis

### Comando Rápido (Mac/Linux)

```bash
# Crie/editar o arquivo de configuração
mkdir -p ~/Library/Application\ Support/Claude
cat > ~/Library/Application\ Support/Claude/claude_desktop_config.json << 'EOF'
{
  "mcpServers": {
    "microservice-architect": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-v",
        "${HOME}/projects:/projects:ro",
        "-e",
        "LLM_BASE_URL=http://host.docker.internal:11434/v1",
        "microservice-architect-mcp:latest"
      ]
    }
  }
}
EOF
```

---

## 💻 Claude Code

### Uso Direto

```bash
# No diretório do projeto
claude code

# Durante a sessão, peça para usar a ferramenta:
# "Por favor, analise a arquitetura deste projeto usando o microservice-architect"
```

### Configuração Persistente

Adicione ao seu `.claude/settings.json`:

```json
{
  "mcpServers": [
    {
      "name": "microservice-architect",
      "transport": {
        "type": "stdio",
        "command": "docker",
        "args": [
          "run",
          "-i",
          "--rm",
          "-v",
          "${workspaceFolder}:/projects/workspace:ro",
          "microservice-architect-mcp:latest"
        ]
      }
    }
  ]
}
```

---

## 🔧 Outros Editores

### VS Code (com Cline ou Roo Code)

```json
{
  "cline.mcpServers": [
    {
      "name": "microservice-architect",
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-v",
        "${workspaceFolder}:/projects:ro",
        "microservice-architect-mcp:latest"
      ]
    }
  ]
}
```

### Zed Editor

```json
{
  "assistant": {
    "version": "2",
    "default_model": {
      "provider": "openai",
      "model": "gpt-4o"
    },
    "enable_experimental_live_diff": true
  },
  "lsp": {
    "microservice-architect": {
      "binary": {
        "path": "docker",
        "arguments": [
          "run",
          "-i",
          "--rm",
          "-v",
          "${workspaceFolder}:/projects:ro",
          "microservice-architect-mcp:latest"
        ]
      }
    }
  }
}
```

---

## 🧪 Testando a Configuração

### 1. Verifique se o servidor está rodando

```bash
# Teste via docker diretamente
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | \
  docker run -i microservice-architect-mcp:latest
```

### 2. Analise um projeto

No Cursor/Claude, diga:

```
Analise a arquitetura do projeto em /projects/go-clean-api usando analyze_service
```

### 3. Verifique a resposta

Deve retornar algo como:
```json
{
  "techStack": {
    "language": "Go",
    "framework": "Gin",
    "database": "PostgreSQL"
  },
  "endpoints": [...],
  "dependencies": [...]
}
```

---

## 🔧 Troubleshooting

### Erro: "Connection refused"

**Causa**: Ollama não está acessível no host

**Solução**:
```bash
# Verifique se Ollama está rodando
curl http://localhost:11434/api/tags

# No Docker, use host.docker.internal
# No Linux, talvez precise de:
docker run --network="host" ...
```

### Erro: "Project not found"

**Causa**: Caminho do volume incorreto

**Solução**: Verifique se o caminho absoluto está correto:
```bash
# Teste o caminho
ls -la /home/crislerwintler/projects/go-clean-api

# Use caminho completo no volume
-v /home/crislerwintler/projects:/projects:ro
```

### Erro: "Permission denied"

**Solução**: Adicione `:ro` (read-only) no final do volume
```
-v /path/to/project:/projects/project:ro
```

---

## 📚 Ferramentas Disponíveis

| Ferramenta | Descrição | Exemplo |
|------------|-----------|---------|
| `analyze_service` | Analisa um serviço individual | `analyze_service` → `{servicePath: "/projects/api"}` |
| `analyze_workspace` | Analisa workspace com múltiplos serviços | `analyze_workspace` → `{workspacePath: "/projects"}` |
| `analyze_code_llm` | Análise inteligente com LLM | `analyze_code_llm` → `{projectPath: "/projects", maxFileLines: 100}` |
| `map_dependencies` | Mapeia dependências entre serviços | `map_dependencies` → `{projectRoot: "/projects"}` |
| `generate_documentation` | Gera documentação completa | `generate_documentation` → `{projectPath: "/projects", outputPath: "/output"}` |

---

## 🎯 Exemplos de Uso

### Analisar um projeto Go

```
"Por favor, analise o projeto em /projects/go-clean-api e me diga:
1. Qual o framework usado?
2. Quais os endpoints disponíveis?
3. Quais dependências principais?"
```

### Gerar documentação

```
"Gere documentação completa do projeto em /projects/go-clean-api
e salve em /output usando a ferramenta generate_documentation"
```

### Mapear dependências

```
"Mapeie todas as dependências entre os serviços no workspace /projects"
```

---

**Para mais detalhes, consulte o README.md principal do projeto.**
