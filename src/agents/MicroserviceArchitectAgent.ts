import * as path from "node:path";
import { type BaseMessage, HumanMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { ArchitectureDocumenterTool } from "../tools/ArchitectureDocumenterTool.js";
import { DependencyMapperTool } from "../tools/DependencyMapperTool.js";
import {
  DatabaseSchemaAnalyzer,
  FederationMapperTool,
  GraphQLAnalyzerTool,
} from "../tools/GraphQLAnalyzerTool.js";
import { ProfessionalDocumenterTool } from "../tools/ProfessionalDocumenterTool.js";
import { ServiceAnalyzerTool } from "../tools/ServiceAnalyzerTool.js";
import { BatchServiceAnalyzerTool, WorkspaceAnalyzerTool } from "../tools/WorkspaceAnalyzerTool.js";

/**
 * MicroserviceArchitectAgent - An AI agent that analyzes microservice architectures
 * and generates comprehensive documentation including:
 * - Service analysis (tech stack, endpoints, dependencies)
 * - Dependency mapping (inter-service communication)
 * - Architecture documentation (markdown files)
 */
export class MicroserviceArchitectAgent {
  private model: ChatOpenAI;
  private tools = [
    ServiceAnalyzerTool,
    DependencyMapperTool,
    ArchitectureDocumenterTool,
    ProfessionalDocumenterTool,
    WorkspaceAnalyzerTool,
    BatchServiceAnalyzerTool,
    GraphQLAnalyzerTool,
    FederationMapperTool,
    DatabaseSchemaAnalyzer,
  ];
  private modelWithTools;

  constructor() {
    this.model = new ChatOpenAI({
      model: process.env.LLM_MODEL || "gpt-4o",
      temperature: 0,
      apiKey: process.env.LLM_API_KEY,
      configuration: {
        baseURL: process.env.LLM_BASE_URL,
      },
    });
    this.modelWithTools = this.model.bindTools(this.tools);
  }

  async analyzeService(servicePath: string): Promise<Record<string, unknown> | null> {
    console.log(`🔍 Analyzing service at: ${servicePath}`);

    const messages: BaseMessage[] = [
      new HumanMessage(
        `Please analyze the microservice at path "${servicePath}". Extract its tech stack, API endpoints, databases, and dependencies.`,
      ),
    ];

    const result = await this.modelWithTools.invoke(messages);

    if (result.tool_calls && result.tool_calls.length > 0) {
      const toolCall = result.tool_calls[0];
      if (toolCall && toolCall.name === "analyze_service") {
        const output = await ServiceAnalyzerTool.invoke({
          servicePath: toolCall.args.servicePath as string,
        });
        try {
          return JSON.parse(output) as Record<string, unknown>;
        } catch {
          return { result: output };
        }
      }
    }

    return null;
  }

  async mapDependencies(projectRoot: string): Promise<Record<string, unknown> | null> {
    console.log(`🔗 Mapping dependencies for project at: ${projectRoot}`);

    const messages: BaseMessage[] = [
      new HumanMessage(
        `Please map all dependencies between microservices in the project at "${projectRoot}". Identify HTTP calls, shared databases, and message queue connections.`,
      ),
    ];

    const result = await this.modelWithTools.invoke(messages);

    if (result.tool_calls && result.tool_calls.length > 0) {
      const toolCall = result.tool_calls[0];
      if (toolCall && toolCall.name === "map_dependencies") {
        const output = await DependencyMapperTool.invoke({
          projectRoot: toolCall.args.projectRoot as string,
        });
        try {
          return JSON.parse(output) as Record<string, unknown>;
        } catch {
          return { result: output };
        }
      }
    }

    return null;
  }

  async generateProfessionalDocumentation(
    outputPath: string,
    servicesData: object,
    dependenciesData: object,
    projectRoot: string,
  ): Promise<Record<string, unknown> | null> {
    console.log(`📝 Generating professional architecture documentation...`);

    const args = {
      outputPath,
      projectPath: projectRoot,
      servicesData: JSON.stringify(servicesData),
      dependenciesData: JSON.stringify(dependenciesData),
    };

    const output = await ProfessionalDocumenterTool.invoke(args);
    try {
      return JSON.parse(output) as Record<string, unknown>;
    } catch {
      return { result: output };
    }
  }

  async generateDocumentation(
    outputPath: string,
    servicesData: object,
    dependenciesData: object,
  ): Promise<Record<string, unknown> | null> {
    console.log(`📝 Generating documentation at: ${outputPath}`);

    const messages: BaseMessage[] = [
      new HumanMessage(
        `Please generate comprehensive architecture documentation at "${outputPath}" using the provided service analysis and dependency data.`,
      ),
    ];

    const result = await this.modelWithTools.invoke(messages);

    if (result.tool_calls && result.tool_calls.length > 0) {
      const toolCall = result.tool_calls[0];
      if (toolCall && toolCall.name === "document_architecture") {
        const args = {
          outputPath: toolCall.args.outputPath as string,
          projectPath: toolCall.args.projectPath as string,
          servicesData: JSON.stringify(servicesData),
          dependenciesData: JSON.stringify(dependenciesData),
        };
        const output = await ArchitectureDocumenterTool.invoke(args);
        try {
          return JSON.parse(output) as Record<string, unknown>;
        } catch {
          return { result: output };
        }
      }
    }

    return null;
  }

  async analyzeWorkspace(workspacePath: string): Promise<Record<string, unknown> | null> {
    console.log(`📁 Analyzing workspace at: ${workspacePath}`);

    const messages: BaseMessage[] = [
      new HumanMessage(
        `Please analyze the workspace at path "${workspacePath}". Detect all microservice directories and extract workspace-level information.`,
      ),
    ];

    const result = await this.modelWithTools.invoke(messages);

    if (result.tool_calls && result.tool_calls.length > 0) {
      const toolCall = result.tool_calls[0];
      if (toolCall && toolCall.name === "analyze_workspace") {
        const output = await WorkspaceAnalyzerTool.invoke({
          workspacePath: toolCall.args.workspacePath as string,
        });
        try {
          return JSON.parse(output) as Record<string, unknown>;
        } catch {
          return { result: output };
        }
      }
    }

    return null;
  }

  async analyzeServicesBatch(servicePaths: string[]): Promise<Record<string, unknown> | null> {
    console.log(`📦 Analyzing batch of ${servicePaths.length} services`);

    const messages: BaseMessage[] = [
      new HumanMessage(
        `Please analyze this batch of ${servicePaths.length} services. Extract basic information from each service.`,
      ),
    ];

    const result = await this.modelWithTools.invoke(messages);

    if (result.tool_calls && result.tool_calls.length > 0) {
      const toolCall = result.tool_calls[0];
      if (toolCall && toolCall.name === "analyze_services_batch") {
        const output = await BatchServiceAnalyzerTool.invoke({
          servicePaths: toolCall.args.servicePaths as string[],
        });
        try {
          return JSON.parse(output) as Record<string, unknown>;
        } catch {
          return { result: output };
        }
      }
    }

    return null;
  }

  async runFullAnalysis(projectRoot: string, outputPath: string): Promise<Record<string, unknown>> {
    console.log("🚀 Starting full microservice architecture analysis...\n");

    // Step 1: Analyze workspace to discover services
    const workspaceAnalysis = await this.analyzeWorkspace(projectRoot);

    if (!workspaceAnalysis || (workspaceAnalysis.totalServices as number) === 0) {
      console.log("⚠️ No services found in workspace");
      return { services: {}, dependencies: {}, documentation: null };
    }

    console.log(`📊 Found ${workspaceAnalysis.totalServices} services in workspace`);

    // Step 2: Analyze each service in detail
    const services: Record<string, unknown> = {};
    const servicesList = workspaceAnalysis.services as Array<{ path: string }>;
    const servicePaths = servicesList.map((s) => s.path);

    console.log(`🔍 Analyzing ${servicePaths.length} services individually...`);

    // Analyze each service individually (more reliable than batch)
    for (const servicePath of servicePaths) {
      const serviceName = path.basename(servicePath);
      console.log(`  Analyzing ${serviceName}...`);

      const serviceData = await this.analyzeService(servicePath);
      if (serviceData) {
        services[serviceName] = serviceData;
        console.log(`    ✓ Found: ${serviceName}`);
      } else {
        // Fallback: create basic service info
        services[serviceName] = {
          name: serviceName,
          path: servicePath,
          description: "Service detected in workspace",
          techStack: ["Unknown"],
          databases: [],
          endpoints: [],
        };
        console.log(`    ⚠ Basic info for: ${serviceName}`);
      }
    }

    console.log(`✅ Analyzed ${Object.keys(services).length} services`);

    // Step 3: Map dependencies
    const dependencies = await this.mapDependencies(projectRoot);

    // Step 4: Generate documentation
    const docs = await this.generateProfessionalDocumentation(
      outputPath,
      services,
      dependencies || {},
      projectRoot,
    );

    return {
      services,
      dependencies,
      documentation: docs,
      workspace: workspaceAnalysis,
    };
  }
}
