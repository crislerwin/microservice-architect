import { ChatOpenAI } from "@langchain/openai";
import {
  type BaseMessage,
  HumanMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { ServiceAnalyzerTool } from "@/tools/ServiceAnalyzerTool.ts";
import { DependencyMapperTool } from "@/tools/DependencyMapperTool.ts";
import { ArchitectureDocumenterTool } from "@/tools/ArchitectureDocumenterTool.ts";

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

  async runFullAnalysis(projectRoot: string, outputPath: string) {
    console.log("🚀 Starting full microservice architecture analysis...\n");

    // Step 1: Analyze individual services
    const services: Record<string, any> = {};
    const serviceDirs = this.getServiceDirectories(projectRoot);

    for (const servicePath of serviceDirs) {
      const analysis = await this.analyzeService(servicePath);
      if (analysis) {
        services[path.basename(servicePath)] = analysis;
      }
    }

    // Step 2: Map dependencies
    const dependencies = await this.mapDependencies(projectRoot);

    // Step 3: Generate documentation
    const docs = await this.generateDocumentation(
      outputPath,
      services,
      dependencies || {}
    );

    return {
      services,
      dependencies,
      documentation: docs,
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
