#!/usr/bin/env tsx
/**
 * LLM Code Analyzer Demo
 * 
 * Demonstrates how to use the LLMCodeAnalyzerTool to analyze
 * a codebase and get intelligent architectural insights.
 */

import { LLMCodeAnalyzerTool } from "../src/tools/LLMCodeAnalyzerTool.js";

async function main() {
  console.log("🚀 LLM Code Analyzer Demo\n");
  console.log("=" .repeat(50));
  
  // Check for required environment variables
  if (!process.env.LLM_API_KEY && !process.env.LLM_BASE_URL?.includes("localhost")) {
    console.error("❌ Error: LLM_API_KEY environment variable is required");
    console.log("\nSet up your environment:");
    console.log("  export LLM_API_KEY=your-api-key");
    console.log("  export LLM_BASE_URL=http://localhost:11434/v1  # For Ollama");
    console.log("  export LLM_MODEL=kimi-k2.5:cloud");
    process.exit(1);
  }

  // Get project path from arguments or use current directory
  const projectPath = process.argv[2] || ".";
  
  console.log(`\n📁 Analyzing project: ${projectPath}\n`);
  
  try {
    // Run the analysis
    const result = await LLMCodeAnalyzerTool.invoke({
      projectPath,
      maxFileLines: 100,
    });
    
    const parsed = JSON.parse(result);
    
    if (parsed.error) {
      console.error(`❌ Error: ${parsed.error}`);
      if (parsed.rawResponse) {
        console.log("\nRaw LLM response:");
        console.log(parsed.rawResponse);
      }
      process.exit(1);
    }
    
    // Display results
    console.log("✅ Analysis Complete!\n");
    console.log("=".repeat(50));
    
    const analysis = parsed.analysis;
    
    // Basic Info
    console.log("\n📋 Basic Information");
    console.log("-".repeat(30));
    console.log(`Language:     ${analysis.primaryLanguage}`);
    console.log(`Runtime:      ${analysis.runtime}`);
    console.log(`Framework:    ${analysis.webFramework}`);
    console.log(`Architecture: ${analysis.architecturePattern}`);
    
    // Databases
    if (analysis.databases?.length > 0) {
      console.log("\n🗄️  Databases");
      console.log("-".repeat(30));
      for (const db of analysis.databases) {
        console.log(`  • ${db.name} (${db.type})`);
        console.log(`    ${db.purpose}`);
      }
    }
    
    // External Services
    if (analysis.externalServices?.length > 0) {
      console.log("\n🔗 External Services");
      console.log("-".repeat(30));
      for (const svc of analysis.externalServices) {
        console.log(`  • ${svc.name} (${svc.integrationType})`);
        console.log(`    ${svc.purpose}`);
      }
    }
    
    // Message Queues
    if (analysis.messageQueues?.length > 0) {
      console.log("\n📨 Message Queues");
      console.log("-".repeat(30));
      for (const queue of analysis.messageQueues) {
        console.log(`  • ${queue.name}`);
        console.log(`    ${queue.purpose}`);
      }
    }
    
    // Main Endpoints
    if (analysis.mainEndpoints?.length > 0) {
      console.log("\n🌐 Main Endpoints");
      console.log("-".repeat(30));
      for (const endpoint of analysis.mainEndpoints.slice(0, 10)) {
        console.log(`  ${endpoint.method.padEnd(6)} ${endpoint.path}`);
        console.log(`    ${endpoint.description}`);
      }
      if (analysis.mainEndpoints.length > 10) {
        console.log(`  ... and ${analysis.mainEndpoints.length - 10} more`);
      }
    }
    
    // Test Frameworks
    if (analysis.testFrameworks?.length > 0) {
      console.log("\n🧪 Test Frameworks");
      console.log("-".repeat(30));
      console.log(`  ${analysis.testFrameworks.join(", ")}`);
    }
    
    // Notable Decisions
    if (analysis.notableDecisions?.length > 0) {
      console.log("\n💡 Notable Architectural Decisions");
      console.log("-".repeat(30));
      for (const decision of analysis.notableDecisions) {
        console.log(`  • ${decision.decision}`);
        console.log(`    Rationale: ${decision.rationale}`);
      }
    }
    
    // Summary
    console.log("\n📝 Summary");
    console.log("-".repeat(30));
    console.log(analysis.summary);
    
    // Files Analyzed
    console.log("\n📁 Files Analyzed");
    console.log("-".repeat(30));
    for (const file of parsed.filesAnalyzed) {
      console.log(`  ✓ ${file}`);
    }
    
    console.log("\n" + "=".repeat(50));
    console.log("\n✨ Full JSON output available in 'result' variable");
    
  } catch (error: any) {
    console.error(`\n❌ Fatal error: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { main };
