#!/usr/bin/env bun
import * as p from "@clack/prompts";
import * as path from "path";
import { setTimeout } from "timers/promises";
import { MicroserviceArchitectAgent } from "./agents/MicroserviceArchitectAgent";

// Spinner animation
const sleep = (ms: number) => setTimeout(ms);

async function main() {
  console.clear();

  p.intro(`
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║   🏗️  Microservice Architect Agent                      ║
║   Analyze and document your microservice architecture    ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
  `);

  // Check for API Key
  if (!process.env.LLM_API_KEY) {
    p.note("⚠️  LLM_API_KEY not set. Please set it before running.", "Warning");
    const shouldContinue = await p.confirm({
      message: "Continue anyway? (Analysis will fail)",
      initialValue: false,
    });

    if (!shouldContinue || p.isCancel(shouldContinue)) {
      p.outro("Goodbye! 👋");
      process.exit(0);
    }
  }

  // Get workspace path
  const workspacePath = await p.text({
    message: "Enter the path to your microservices workspace:",
    placeholder: "./my-microservices",
    validate: (value) => {
      if (!value) return "Please enter a path";
      return undefined;
    },
  });

  if (p.isCancel(workspacePath)) {
    p.outro("Goodbye! 👋");
    process.exit(0);
  }

  const absoluteWorkspacePath = path.resolve(workspacePath as string);

  // Get output path
  const outputPath = await p.text({
    message: "Where should the documentation be saved?",
    placeholder: "./docs/architecture",
    initialValue: "./docs/architecture",
    validate: (value) => {
      if (!value) return "Please enter an output path";
      return undefined;
    },
  });

  if (p.isCancel(outputPath)) {
    p.outro("Goodbye! 👋");
    process.exit(0);
  }

  const absoluteOutputPath = path.resolve(outputPath as string);

  // Analysis type selection
  const analysisType = await p.select({
    message: "What type of analysis do you want to perform?",
    options: [
      {
        value: "full",
        label: "🔍 Full Analysis",
        hint: "Complete workspace + dependencies + docs",
      },
      { value: "workspace", label: "📁 Workspace Scan", hint: "Just discover services" },
      { value: "dependencies", label: "🔗 Dependencies", hint: "Map service connections" },
      { value: "documentation", label: "📝 Documentation", hint: "Generate markdown docs" },
    ],
  });

  if (p.isCancel(analysisType)) {
    p.outro("Goodbye! 👋");
    process.exit(0);
  }

  // Confirm
  const confirmed = await p.confirm({
    message: `Analyze ${absoluteWorkspacePath} and save docs to ${absoluteOutputPath}?`,
  });

  if (!confirmed || p.isCancel(confirmed)) {
    p.outro("Cancelled. Goodbye! 👋");
    process.exit(0);
  }

  // Start analysis
  const s = p.spinner();

  try {
    const agent = new MicroserviceArchitectAgent();

    if (analysisType === "workspace") {
      s.start("🔍 Scanning workspace for services...");
      await sleep(500);

      const workspace = await agent.analyzeWorkspace(absoluteWorkspacePath);
      s.stop("✅ Workspace scan complete!");

      if (workspace) {
        p.note(
          `
📊 Workspace Summary:
• Found ${workspace.totalServices} services
• Languages: ${Object.keys(workspace.summary.languages).join(", ")}
• Databases: ${workspace.summary.databases.join(", ") || "None detected"}
• Message Queues: ${workspace.summary.messageQueues.join(", ") || "None detected"}
        `,
          "Results",
        );

        // Show services table
        const serviceTable = workspace.services
          .map((s: any) => `  ${s.name.padEnd(20)} | ${s.language}`)
          .join("\n");
        p.note(serviceTable, "Services Found");
      }
    } else if (analysisType === "full") {
      s.start("🚀 Starting full architecture analysis...");
      await sleep(500);

      s.message("📁 Analyzing workspace...");
      const workspace = await agent.analyzeWorkspace(absoluteWorkspacePath);

      if (!workspace || workspace.totalServices === 0) {
        s.stop("⚠️ No services found in workspace");
        p.outro("Analysis complete. No services detected.");
        process.exit(0);
      }

      s.message(`🔍 Found ${workspace.totalServices} services. Analyzing in detail...`);

      // Show progress
      let analyzed = 0;
      const total = workspace.totalServices;

      for (const service of workspace.services) {
        analyzed++;
        s.message(`🔍 Analyzing ${service.name} (${analyzed}/${total})...`);
        await agent.analyzeService(service.path);
        await sleep(200); // Simulate processing
      }

      s.message("🔗 Mapping dependencies between services...");
      const dependencies = await agent.mapDependencies(absoluteWorkspacePath);
      await sleep(500);

      s.message("📝 Generating documentation...");
      const docs = await agent.generateDocumentation(absoluteOutputPath, {}, dependencies || {});
      await sleep(500);

      s.stop("✅ Analysis complete!");

      // Results
      p.note(
        `
📊 Analysis Results:
• Services analyzed: ${workspace.totalServices}
• Languages: ${Object.keys(workspace.summary.languages).join(", ")}
• HTTP connections: ${dependencies?.summary?.httpConnections || 0}
• Documentation files: ${docs?.generatedFiles?.length || 0}
      `,
        "Summary",
      );

      if (docs?.generatedFiles) {
        const filesList = docs.generatedFiles.map((f: string) => `  📄 ${f}`).join("\n");
        p.note(filesList, "Generated Documentation");
      }

      p.outro(`Documentation saved to: ${absoluteOutputPath}`);
    } else if (analysisType === "dependencies") {
      s.start("🔗 Mapping service dependencies...");
      await sleep(500);

      const dependencies = await agent.mapDependencies(absoluteWorkspacePath);
      s.stop("✅ Dependency mapping complete!");

      if (dependencies) {
        p.note(
          `
🔗 Dependency Summary:
• Total services: ${dependencies.summary.totalServices}
• HTTP connections: ${dependencies.summary.httpConnections}
• Services with database: ${dependencies.summary.servicesWithDatabase}
• Services with messaging: ${dependencies.summary.servicesWithMessaging}
        `,
          "Dependencies",
        );

        if (dependencies.dependencyGraph?.edges?.length > 0) {
          const connections = dependencies.dependencyGraph.edges
            .map((e: any) => `  ${e.from} → ${e.to} (${e.type})`)
            .join("\n");
          p.note(connections, "Service Connections");
        }
      }
    } else if (analysisType === "documentation") {
      s.start("📝 Generating documentation...");
      await sleep(500);

      const docs = await agent.generateDocumentation(absoluteOutputPath, {}, {});
      s.stop("✅ Documentation generated!");

      if (docs?.generatedFiles) {
        const filesList = docs.generatedFiles.map((f: string) => `  📄 ${f}`).join("\n");
        p.note(filesList, "Generated Files");
      }
    }

    p.outro(`
╔══════════════════════════════════════════════════════════╗
║                    Analysis Complete! 🎉                  ║
╚══════════════════════════════════════════════════════════╝
    `);
  } catch (error) {
    s.stop("❌ Analysis failed");
    p.note(String(error), "Error");
    process.exit(1);
  }
}

main();
