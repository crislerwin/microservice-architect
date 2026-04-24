#!/usr/bin/env node
/**
 * MCP Server Entry Point for Microservice Architect
 *
 * This is the entry point for the MCP (Model Context Protocol) server.
 * It uses stdio transport for communication with MCP clients like
 * Claude Desktop, Cursor, and other MCP-compatible tools.
 *
 * Usage:
 *   bun run mcp-server
 *   or
 *   npx tsx src/mcp/index.ts
 *
 * Environment Variables:
 *   - LLM_API_KEY: API key for LLM provider (OpenAI, etc.) - Required for analyze_code_llm
 *   - LLM_MODEL: Model to use (default: gpt-4o)
 *   - LLM_BASE_URL: Custom base URL for LLM API (optional)
 */

import { startServer } from "./server.js";

// Handle uncaught errors
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
  process.exit(1);
});

// Start the server
startServer().catch((error) => {
  console.error("Failed to start MCP server:", error);
  process.exit(1);
});
