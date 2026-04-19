import { ChatOpenAI } from "@langchain/openai";
import {
  type BaseMessage,
  HumanMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { ServiceAnalyzerTool } from "@/tools/ServiceAnalyzerTool.ts";
import { DependencyMapperTool } from "@/tools/DependencyMapperTool.ts";
import { ArchitectureDocumenterTool } from "@/tools/ArchitectureDocumenterTool.ts";
import {
  WorkspaceAnalyzerTool,
  BatchServiceAnalyzerTool,
} from "@/tools/WorkspaceAnalyzerTool.ts";

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
    WorkspaceAnalyzerTool,
    BatchServiceAnalyzerTool,
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

  async analyzeService(servicePath: string) {
    console.log(`🔍 Analyzing service at: ${servicePath}`);

    const messages: BaseMessage[] = [
      new HumanMessage(
        `Please analyze the microservice at path "${servicePath}". Extract its tech stack, API endpoints, databases, and dependencies.`
      ),
    ];

    const result = await this.modelWithTools.invoke(messages);

    if (result.tool_calls && result.tool_calls.length > 0) {
      const toolCall = result.tool_calls[0];
      if (toolCall.name === "analyze_service") {
        const output = await ServiceAnalyzerTool.invoke(toolCall.args);
        return JSON.parse(output);
      }
    }

    return null;
  }

  async mapDependencies(projectRoot: string) {
    console.log(`🔗 Mapping dependencies for project at: ${projectRoot}`);

    const messages: BaseMessage[] = [
      new HumanMessage(
        `Please map all dependencies between microservices in the project at "${projectRoot}". Identify HTTP calls, shared databases, and message queue connections.`
      ),
    ];

    const result = await this.modelWithTools.invoke(messages);

    if (result.tool_calls && result.tool_calls.length > 0) {
      const toolCall = result.tool_calls[0];
      if (toolCall.name === "map_dependencies") {
        const output = await DependencyMapperTool.invoke(toolCall.args);
        return JSON.parse(output);
      }
    }

    return null;
  }

  async generateDocumentation(
    outputPath: string,
    servicesData: object,
    dependenciesData: object
  ) {
    console.log(`📝 Generating documentation at: ${outputPath}`);

    const messages: BaseMessage[] = [
      new HumanMessage(
        `Please generate comprehensive architecture documentation at "${outputPath}" using the provided service analysis and dependency data.`
      ),
    ];

    const result = await this.modelWithTools.invoke(messages);

    if (result.tool_calls && result.tool_calls.length > 0) {
      const toolCall = result.tool_calls[0];
      if (toolCall.name === "document_architecture") {
        const args = {
          ...toolCall.args,
          servicesData: JSON.stringify(servicesData),
          dependenciesData: JSON.stringify(dependenciesData),
        };
        const output = await ArchitectureDocumenterTool.invoke(args);
        return JSON.parse(output);
      }
    }

    return null;
  }

  async analyzeWorkspace(workspacePath: string) {
    console.log(`📁 Analyzing workspace at: ${workspacePath}`);

    const messages: BaseMessage[] = [
      new HumanMessage(
        `Please analyze the workspace at path "${workspacePath}". Detect all microservice directories and extract workspace-level information.`
      ),
    ];

    const result = await this.modelWithTools.invoke(messages);

    if (result.tool_calls && result.tool_calls.length > 0) {
      const toolCall = result.tool_calls[0];
      if (toolCall.name === "analyze_workspace") {
        const output = await WorkspaceAnalyzerTool.invoke(toolCall.args);
        return JSON.parse(output);
      }
    }

    return null;
  }

  async analyzeServicesBatch(servicePaths: string[]) {
    console.log(`📦 Analyzing batch of ${servicePaths.length} services`);

    const messages: BaseMessage[] = [
      new HumanMessage(
        `Please analyze this batch of ${servicePaths.length} services. Extract basic information from each service.`
      ),
    ];

    const result = await this.modelWithTools.invoke(messages);

    if (result.tool_calls && result.tool_calls.length > 0) {
      const toolCall = result.tool_calls[0];
      if (toolCall.name === "analyze_services_batch") {
        const output = await BatchServiceAnalyzerTool.invoke(toolCall.args);
        return JSON.parse(output);
      }
    }

    return null;
  }

  async runFullAnalysis(projectRoot: string, outputPath: string) {
    console.log("🚀 Starting full microservice architecture analysis...\n");

    // Step 1: Analyze workspace to discover services
    const workspaceAnalysis = await this.analyzeWorkspace(projectRoot);
    
    if (!workspaceAnalysis || workspaceAnalysis.totalServices === 0) {
      console.log("⚠️ No services found in workspace");
      return { services: {}, dependencies: {}, documentation: null };
    }

    console.log(`📊 Found ${workspaceAnalysis.totalServices} services in workspace`);

    // Step 2: Analyze each service in detail
    const services: Record<string, any> = {};
    const servicePaths = workspaceAnalysis.services.map((s: any) => s.path);
    
    // Analyze in batches for efficiency
    const batchSize = 5;
    for (let i = 0; i < servicePaths.length; i += batchSize) {
      const batch = servicePaths.slice(i, i + batchSize);
      const batchResults = await this.analyzeServicesBatch(batch);
      
      if (batchResults) {
        batchResults.services.forEach((service: any) => {
          services[service.name] = service;
        });
      }
    }

    // Step 3: Map dependencies
    const dependencies = await this.mapDependencies(projectRoot);

    // Step 4: Generate documentation
    const docs = await this.generateDocumentation(
      outputPath,
      services,
      dependencies || {}
    );

    return {
      services,
      dependencies,
      documentation: docs,
      workspace: workspaceAnalysis,
    };
  }

  private getServiceDirectories(projectRoot: string): string[] {
    const fs = require("fs");
    const path = require("path");

    const entries = fs.readdirSync(projectRoot, { withFileTypes: true });
    return entries
      .filter(
        (e: any) =>
          e.isDirectory() &&
          !e.name.startsWith(".") &&
          e.name !== "node_modules"
      )
      .map((e: any) => path.join(projectRoot, e.name))
      .filter((dir: string) => {
        // Check if it looks like a service (has package.json, Dockerfile, or src folder)
        return (
          fs.existsSync(path.join(dir, "package.json")) ||
          fs.existsSync(path.join(dir, "Dockerfile")) ||
          fs.existsSync(path.join(dir, "src")) ||
          fs.existsSync(path.join(dir, "docker-compose.yml"))
        );
      });
  }
}

import * as path from "path";
