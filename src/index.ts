import { MicroserviceArchitectAgent } from "@/agents/MicroserviceArchitectAgent.ts";
import * as path from "path";

console.log("🚀 Starting Microservice Architect Agent...");

// Check for API Key
if (!process.env.LLM_API_KEY) {
  console.error("Error: LLM_API_KEY is not set in the environment.");
  console.error(
    "Please set it (e.g. 'export LLM_API_KEY=sk-...') and try again."
  );
  process.exit(1);
}

// Get project path from command line or use default
const projectPath = process.argv[2] || ".";
const outputPath = process.argv[3] || "./docs/architecture";

const absoluteProjectPath = path.resolve(projectPath);
const absoluteOutputPath = path.resolve(outputPath);

console.log(`📁 Project path: ${absoluteProjectPath}`);
console.log(`📄 Output path: ${absoluteOutputPath}`);

// Run the agent
const agent = new MicroserviceArchitectAgent();

agent
  .runFullAnalysis(absoluteProjectPath, absoluteOutputPath)
  .then((result) => {
    console.log("\n✅ Analysis complete!");
    console.log(
      `📊 Found ${Object.keys(result.services).length} services`
    );
    if (result.documentation?.generatedFiles) {
      console.log(
        `📚 Generated ${result.documentation.generatedFiles.length} documentation files:`
      );
      result.documentation.generatedFiles.forEach((file: string) => {
        console.log(`   - ${file}`);
      });
    }
    console.log(`\n📂 Documentation saved to: ${absoluteOutputPath}`);
  })
  .catch((error) => {
    console.error("\n❌ Error during analysis:", error);
    process.exit(1);
  });
