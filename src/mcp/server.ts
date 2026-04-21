import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Define Tool type locally since it's not exported
interface Tool {
  name: string;
  description: string;
  inputSchema: object;
}
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

// Import the tools from the existing codebase
// We'll import the tool functions directly
import { ServiceAnalyzerTool } from "../tools/ServiceAnalyzerTool.js";
import { WorkspaceAnalyzerTool } from "../tools/WorkspaceAnalyzerTool.js";
import { DependencyMapperTool } from "../tools/DependencyMapperTool.js";
import { ArchitectureDocumenterTool } from "../tools/ArchitectureDocumenterTool.js";
import { ProfessionalDocumenterTool } from "../tools/ProfessionalDocumenterTool.js";
import { LLMCodeAnalyzerTool } from "../tools/LLMCodeAnalyzerTool.js";

// Get the directory name for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * MCP Server for Microservice Architect
 * 
 * Exposes the following tools:
 * - analyze_service: Analyze a single microservice
 * - analyze_workspace: Analyze a workspace containing multiple microservices
 * - analyze_code_llm: LLM-powered codebase analysis
 * - map_dependencies: Map dependencies between services
 * - generate_documentation: Generate comprehensive architecture documentation
 */

// Define the tools for MCP
const tools: Tool[] = [
  {
    name: "analyze_service",
    description: "Analyzes a microservice to extract tech stack, API endpoints, databases, Docker configuration, and dependencies. Provides detailed insights into a single service.",
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
    description: "Analyzes a workspace directory containing multiple microservices. Detects all service directories, identifies tech stacks, and provides a workspace-level overview with summary statistics.",
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
    description: "Uses LLM (Large Language Model) to provide intelligent analysis of a codebase's architecture, patterns, tech stack, and design decisions. Reads key files and provides architectural insights.",
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
    description: "Maps dependencies between microservices in a project. Detects HTTP API calls between services, shared database connections, message queue connections (RabbitMQ, Kafka, etc.), and service registry usage.",
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
    description: "Generates comprehensive architecture documentation including README, C4 model diagrams, service catalogs, API documentation, runbooks, and dependency matrices. Creates a complete documentation suite.",
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
    }
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
          
          // Validate path exists
          if (!fs.existsSync(servicePath)) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    error: `Path does not exist: ${servicePath}`,
                    hint: "Please provide an absolute path to the service directory",
                  }, null, 2),
                },
              ],
              isError: true,
            };
          }

          // Call the ServiceAnalyzerTool
          result = await ServiceAnalyzerTool.invoke({ servicePath });
          break;
        }

        case "analyze_workspace": {
          const { workspacePath } = args as { workspacePath: string };
          
          // Validate path exists
          if (!fs.existsSync(workspacePath)) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    error: `Path does not exist: ${workspacePath}`,
                    hint: "Please provide an absolute path to the workspace directory",
                  }, null, 2),
                },
              ],
              isError: true,
            };
          }

          // Call the WorkspaceAnalyzerTool
          result = await WorkspaceAnalyzerTool.invoke({ workspacePath });
          break;
        }

        case "analyze_code_llm": {
          const { projectPath, maxFileLines } = args as { projectPath: string; maxFileLines?: number };
          
          // Validate path exists
          if (!fs.existsSync(projectPath)) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    error: `Path does not exist: ${projectPath}`,
                    hint: "Please provide an absolute path to the project directory",
                  }, null, 2),
                },
              ],
              isError: true,
            };
          }

          // Check if LLM is configured
          if (!process.env.LLM_API_KEY) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    error: "LLM_API_KEY environment variable is not set",
                    hint: "Set LLM_API_KEY to use the LLM-powered analysis. You can also set LLM_MODEL and LLM_BASE_URL for custom configuration.",
                  }, null, 2),
                },
              ],
              isError: true,
            };
          }

          // Call the LLMCodeAnalyzerTool
          result = await LLMCodeAnalyzerTool.invoke({ projectPath, maxFileLines });
          break;
        }

        case "map_dependencies": {
          const { projectRoot } = args as { projectRoot: string };
          
          // Validate path exists
          if (!fs.existsSync(projectRoot)) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    error: `Path does not exist: ${projectRoot}`,
                    hint: "Please provide an absolute path to the project root directory",
                  }, null, 2),
                },
              ],
              isError: true,
            };
          }

          // Call the DependencyMapperTool
          result = await DependencyMapperTool.invoke({ projectRoot });
          break;
        }

        case "generate_documentation": {
          const { outputPath, projectPath } = args as { outputPath: string; projectPath: string };
          
          // Create output directory if it doesn't exist
          if (!fs.existsSync(outputPath)) {
            fs.mkdirSync(outputPath, { recursive: true });
          }

          // First analyze the workspace to get service data
          const workspaceResult = await WorkspaceAnalyzerTool.invoke({ workspacePath: projectPath });
          const workspaceData = JSON.parse(workspaceResult);

          if (workspaceData.error || workspaceData.totalServices === 0) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    error: "No services found in workspace",
                    hint: "Make sure the projectPath contains microservices with package.json or Dockerfile",
                  }, null, 2),
                },
              ],
              isError: true,
            };
          }

          // Map dependencies
          const depsResult = await DependencyMapperTool.invoke({ projectRoot: projectPath });

          // Generate professional documentation
          result = await ProfessionalDocumenterTool.invoke({
            outputPath,
            projectPath,
            servicesData: workspaceResult,
            dependenciesData: depsResult,
          });
          break;
        }

        default:
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: `Unknown tool: ${name}`,
                  availableTools: tools.map((t) => t.name),
                }, null, 2),
              },
            ],
            isError: true,
          };
      }

      // Parse and format the result
      let parsedResult;
      try {
        parsedResult = JSON.parse(result);
      } catch {
        parsedResult = { result };
      }

      return {
        content: [
          {
            type: "text",
            text: typeof parsedResult === "string" ? parsedResult : JSON.stringify(parsedResult, null, 2),
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
                error: `Tool execution failed: ${errorMessage}`,
                tool: name,
              },
              null,
              2
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
  console.error("  - map_dependencies: Map dependencies between services");
  console.error("  - generate_documentation: Generate comprehensive docs");
  console.error("\nServer ready! Waiting for MCP client connections...\n");

  await server.connect(transport);
}
