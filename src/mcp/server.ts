#!/usr/bin/env bun

/**
 * MCP Server for Microservice Architect
 *
 * Uses MCP SDK v1.x API (Server class with request handlers)
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { DependencyMapperTool } from "../tools/DependencyMapperTool.js";
import { LLMCodeAnalyzerTool } from "../tools/LLMCodeAnalyzerTool.js";
import { ProfessionalDocumenterTool } from "../tools/ProfessionalDocumenterTool.js";
import { CodeQualityAnalyzerTool } from "../tools/CodeQualityAnalyzerTool.js";
// Import the tools from the existing codebase
import { ServiceAnalyzerTool } from "../tools/ServiceAnalyzerTool.js";
import { WorkspaceAnalyzerTool } from "../tools/WorkspaceAnalyzerTool.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define the tools for MCP
const tools: Tool[] = [
  {
    name: "analyze_service",
    description:
      "Analyzes a microservice to extract tech stack, API endpoints, databases, Docker configuration, and dependencies. Provides detailed insights into a single service.",
    inputSchema: {
      type: "object",
      properties: {
        servicePath: {
          type: "string",
          description: "Absolute path to the service directory to analyze",
        },
      },
      required: ["servicePath"],
    },
  },
  {
    name: "analyze_workspace",
    description:
      "Analyzes a workspace directory containing multiple microservices. Detects all service directories, identifies tech stacks, and provides a workspace-level overview with summary statistics.",
    inputSchema: {
      type: "object",
      properties: {
        workspacePath: {
          type: "string",
          description: "Absolute path to the workspace directory containing multiple microservices",
        },
      },
      required: ["workspacePath"],
    },
  },
  {
    name: "analyze_code_llm",
    description:
      "Uses LLM to provide intelligent analysis of a codebase's architecture, patterns, tech stack, and design decisions. Reads key files and provides architectural insights.",
    inputSchema: {
      type: "object",
      properties: {
        projectPath: {
          type: "string",
          description: "Absolute path to the project root directory to analyze",
        },
        maxFileLines: {
          type: "number",
          description: "Maximum lines to read from each source file (default: 100)",
        },
      },
      required: ["projectPath"],
    },
  },
  {
    name: "map_dependencies",
    description:
      "Maps dependencies between microservices in a project. Detects HTTP API calls between services, shared database connections, message queue connections, and service registry usage.",
    inputSchema: {
      type: "object",
      properties: {
        projectRoot: {
          type: "string",
          description: "Root path of the microservices project to analyze",
        },
      },
      required: ["projectRoot"],
    },
  },
  {
    name: "generate_documentation",
    description:
      "Generates comprehensive architecture documentation including README, C4 model diagrams, service catalogs, API documentation, runbooks, and dependency matrices. Creates a complete documentation suite.",
    inputSchema: {
      type: "object",
      properties: {
        outputPath: {
          type: "string",
          description: "Directory where documentation will be generated",
        },
        projectPath: {
          type: "string",
          description: "Path to the project being documented",
        },
      },
      required: ["outputPath", "projectPath"],
    },
  },
  {
    name: "analyze_code_quality",
    description:
      "Analyzes source code for software engineering principle violations including DRY (duplicate code), cyclomatic complexity, circular dependencies, code smells (God classes, long functions, deep nesting), and unused imports. Generates detailed quality reports with refactoring suggestions.",
    inputSchema: {
      type: "object",
      properties: {
        servicePath: {
          type: "string",
          description: "Absolute path to the service directory to analyze",
        },
        serviceName: {
          type: "string",
          description: "Name of the service (for reporting)",
        },
        config: {
          type: "object",
          properties: {
            complexityThreshold: {
              type: "number",
              description: "Cyclomatic complexity threshold (default: 15)",
              default: 15,
            },
            minDuplicateLines: {
              type: "number",
              description: "Minimum lines for duplicate detection (default: 5)",
              default: 5,
            },
            maxFileLines: {
              type: "number",
              description: "Maximum lines per file before warning (default: 500)",
              default: 500,
            },
            maxFunctionLines: {
              type: "number",
              description: "Maximum lines per function (default: 50)",
              default: 50,
            },
            includeTests: {
              type: "boolean",
              description: "Include test files in analysis (default: false)",
              default: false,
            },
          },
          description: "Configuration options",
        },
      },
      required: ["servicePath", "serviceName"],
    },
  },
];

/**
 * Create and configure the MCP server
 */
export function createMCPServer(): Server {
  const server = new Server(
    {
      name: "microservice-architect",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  // Handle tool list requests
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools,
    };
  });

  // Handle tool call requests
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      let result: string;

      switch (name) {
        case "analyze_service": {
          const { servicePath } = args as { servicePath: string };

          if (!fs.existsSync(servicePath)) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      error: `Path does not exist: ${servicePath}`,
                      hint: "Please provide an absolute path to the service directory",
                    },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }

          result = await ServiceAnalyzerTool.invoke({ servicePath });
          break;
        }

        case "analyze_workspace": {
          const { workspacePath } = args as { workspacePath: string };

          if (!fs.existsSync(workspacePath)) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      error: `Path does not exist: ${workspacePath}`,
                      hint: "Please provide an absolute path to the workspace directory",
                    },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }

          const workspaceResult = await WorkspaceAnalyzerTool.invoke({ workspacePath });
          result = JSON.stringify(workspaceResult, null, 2);
          break;
        }

        case "analyze_code_llm": {
          const { projectPath, maxFileLines = 100 } = args as {
            projectPath: string;
            maxFileLines?: number;
          };

          if (!fs.existsSync(projectPath)) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      error: `Path does not exist: ${projectPath}`,
                      hint: "Please provide an absolute path to the project directory",
                    },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }

          result = await LLMCodeAnalyzerTool.invoke({ projectPath, maxFileLines });
          break;
        }

        case "map_dependencies": {
          // Support both projectRoot and projectPath for compatibility
          const { projectRoot, projectPath } = args as {
            projectRoot?: string;
            projectPath?: string;
          };
          const resolvedRoot = projectRoot || projectPath;

          if (!resolvedRoot) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      error: `Missing required parameter: projectRoot or projectPath`,
                      hint: "Please provide either projectRoot or projectPath parameter",
                    },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }

          if (!fs.existsSync(resolvedRoot)) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      error: `Path does not exist: ${resolvedRoot}`,
                      hint: "Please provide an absolute path to the project root",
                    },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }

          const depsResult = await DependencyMapperTool.invoke({ projectRoot: resolvedRoot });
          result = JSON.stringify(depsResult, null, 2);
          break;
        }

        case "generate_documentation": {
          const { outputPath, projectPath } = args as { outputPath: string; projectPath: string };

          if (!outputPath || !projectPath) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      error: `Missing required parameters: outputPath and projectPath are required`,
                      hint: "Please provide both outputPath and projectPath parameters",
                    },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }

          // Create output directory if it doesn't exist
          if (!fs.existsSync(outputPath)) {
            fs.mkdirSync(outputPath, { recursive: true });
          }

          // First analyze the workspace
          const workspaceData = await WorkspaceAnalyzerTool.invoke({ workspacePath: projectPath });
          const dependenciesData = await DependencyMapperTool.invoke({ projectRoot: projectPath });

          // Generate documentation
          const services =
            workspaceData && typeof workspaceData === "object" && "services" in workspaceData
              ? workspaceData.services
              : {};
          const docsResult = await ProfessionalDocumenterTool.invoke({
            projectPath,
            outputPath,
            servicesData: JSON.stringify(services),
            dependenciesData: JSON.stringify(dependenciesData || {}),
          });

          result = docsResult;
          break;
        }

        case "analyze_code_quality": {
          const { servicePath, serviceName, config } = args as {
            servicePath: string;
            serviceName: string;
            config?: {
              complexityThreshold?: number;
              minDuplicateLines?: number;
              maxFileLines?: number;
              maxFunctionLines?: number;
              includeTests?: boolean;
            };
          };

          if (!servicePath) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      error: `Missing required parameter: servicePath`,
                      hint: "Please provide the servicePath parameter",
                    },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }

          if (!fs.existsSync(servicePath)) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      error: `Path does not exist: ${servicePath}`,
                      hint: "Please provide an absolute path to the service directory",
                    },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }

          result = await CodeQualityAnalyzerTool.invoke({
            servicePath,
            serviceName: serviceName || "unnamed-service",
            config,
          });
          break;
        }

        default:
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    error: `Unknown tool: ${name}`,
                    availableTools: tools.map((t) => t.name),
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
      }

      // Parse and pretty-print the result
      let parsedResult: unknown;
      try {
        parsedResult = JSON.parse(result);
      } catch {
        parsedResult = { result };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(parsedResult, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                error: errorMessage,
                tool: name,
                hint: "Make sure required environment variables are set (LLM_API_KEY, etc.)",
              },
              null,
              2,
            ),
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

/**
 * Start the MCP server with stdio transport
 */
export async function startServer(): Promise<void> {
  const server = createMCPServer();
  const transport = new StdioServerTransport();

  // Log startup message to stderr (stdout is used for MCP communication)
  console.error("🚀 Microservice Architect MCP Server starting...");
  console.error("Available tools:");
  console.error("  - analyze_service: Analyze a single microservice");
  console.error("  - analyze_workspace: Analyze a workspace with multiple services");
  console.error("  - analyze_code_llm: LLM-powered codebase analysis");
  console.error("  - analyze_code_quality: Static code quality analysis (complexity, DRY, smells)");
  console.error("  - map_dependencies: Map dependencies between services");
  console.error("  - generate_documentation: Generate comprehensive docs");
  console.error("\nServer ready! Waiting for MCP client connections...\n");

  await server.connect(transport);
}
