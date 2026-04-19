#!/usr/bin/env node
import {
  intro,
  outro,
  text,
  select,
  confirm,
  spinner,
  isCancel,
  cancel,
} from "@clack/prompts";
import * as path from "path";
import { MicroserviceArchitectAgent } from "./agents/MicroserviceArchitectAgent";
import * as fs from "fs";

async function main() {
  intro("🏗️  Microservice Architect Agent");

  // Menu principal
  const action = await select({
    message: "What would you like to do?",
    options: [
      { value: "full", label: "🔍 Run full analysis" },
      { value: "service", label: "📦 Analyze single service" },
      { value: "dependencies", label: "🔗 Map dependencies" },
      { value: "docs", label: "📝 Generate documentation" },
    ],
  });

  if (isCancel(action)) {
    cancel("Operation cancelled");
    process.exit(0);
  }

  // Input do caminho do projeto
  const projectPath = await text({
    message: "Enter the project root path",
    placeholder: "./my-microservices",
    validate(value) {
      if (!value) return "Path is required";
      if (!fs.existsSync(value)) return "Path does not exist";
      return undefined;
    },
  });

  if (isCancel(projectPath)) {
    cancel("Operation cancelled");
    process.exit(0);
  }

  // Input do caminho de saída (para algumas ações)
  let outputPath: string | symbol = "";
  if (action === "full" || action === "docs") {
    outputPath = await text({
      message: "Enter the output directory for documentation",
      placeholder: "./docs",
      defaultValue: "./docs",
    });

    if (isCancel(outputPath)) {
      cancel("Operation cancelled");
      process.exit(0);
    }
  }

  // Confirmação
  const shouldContinue = await confirm({
    message: `Ready to ${action}?`,
  });

  if (isCancel(shouldContinue) || !shouldContinue) {
    cancel("Operation cancelled");
    process.exit(0);
  }

  // Inicializa o agente
  const agent = new MicroserviceArchitectAgent();
  const s = spinner();

  try {
    switch (action) {
      case "full": {
        s.start("Running full analysis...");
        const result = await agent.runFullAnalysis(
          path.resolve(projectPath as string),
          path.resolve(outputPath as string)
        );
        s.stop("✅ Analysis complete!");

        console.log("\n📊 Results:");
        console.log(`Services analyzed: ${Object.keys(result.services).length}`);
        console.log(`Dependencies mapped: ${Object.keys(result.dependencies || {}).length}`);
        console.log(`Documentation: ${result.documentation ? "Generated" : "Not generated"}`);
        break;
      }

      case "service": {
        s.start("Analyzing service...");
        const result = await agent.analyzeService(path.resolve(projectPath as string));
        s.stop("✅ Service analyzed!");

        if (result) {
          console.log("\n📦 Service Details:");
          console.log(JSON.stringify(result, null, 2));
        }
        break;
      }

      case "dependencies": {
        s.start("Mapping dependencies...");
        const result = await agent.mapDependencies(path.resolve(projectPath as string));
        s.stop("✅ Dependencies mapped!");

        if (result) {
          console.log("\n🔗 Dependencies:");
          console.log(JSON.stringify(result, null, 2));
        }
        break;
      }

      case "docs": {
        // Para docs precisamos de dados existentes
        s.start("Loading existing analysis data...");
        const services: Record<string, any> = {};
        const serviceDirs = fs
          .readdirSync(projectPath as string, { withFileTypes: true })
          .filter((e) => e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules")
          .map((e) => path.join(projectPath as string, e.name))
          .filter((dir) => {
            return (
              fs.existsSync(path.join(dir, "package.json")) ||
              fs.existsSync(path.join(dir, "Dockerfile")) ||
              fs.existsSync(path.join(dir, "src")) ||
              fs.existsSync(path.join(dir, "docker-compose.yml"))
            );
          });

        for (const servicePath of serviceDirs.slice(0, 3)) {
          // Limita a 3 serviços para docs
          const analysis = await agent.analyzeService(servicePath);
          if (analysis) {
            services[path.basename(servicePath)] = analysis;
          }
        }

        const dependencies = await agent.mapDependencies(path.resolve(projectPath as string));
        s.stop("✅ Data loaded!");

        s.start("Generating documentation...");
        const result = await agent.generateDocumentation(
          path.resolve(outputPath as string),
          services,
          dependencies || {}
        );
        s.stop("✅ Documentation generated!");

        console.log("\n📝 Documentation:");
        console.log(JSON.stringify(result, null, 2));
        break;
      }
    }

    outro("🎉 All done! Check the output for results.");
  } catch (error) {
    s.stop("❌ Error occurred");
    console.error(error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
