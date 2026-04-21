import { tool } from "@langchain/core/tools";
import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import { ChatOpenAI } from "@langchain/openai";

/**
 * CodebaseAnalysisResult - Structured output from the LLM analysis
 */
const CodebaseAnalysisSchema = z.object({
  primaryLanguage: z.string().describe("Primary programming language"),
  runtime: z.string().describe("Runtime environment (Node.js, Python, Go, etc.)"),
  webFramework: z.string().describe("Web framework being used (Express, Fastify, NestJS, etc.)"),
  architecturePattern: z.string().describe("Architecture pattern (MVC, Clean Arch, Hexagonal, Layered, etc.)"),
  databases: z.array(z.object({
    name: z.string(),
    type: z.string().describe("SQL, NoSQL, Cache, etc."),
    purpose: z.string().describe("How it's used in the project"),
  })),
  externalServices: z.array(z.object({
    name: z.string(),
    purpose: z.string(),
    integrationType: z.string().describe("REST API, gRPC, GraphQL, SDK, etc."),
  })),
  messageQueues: z.array(z.object({
    name: z.string(),
    purpose: z.string(),
  })),
  mainEndpoints: z.array(z.object({
    method: z.string(),
    path: z.string(),
    description: z.string(),
  })),
  testFrameworks: z.array(z.string()),
  notableDecisions: z.array(z.object({
    decision: z.string(),
    rationale: z.string(),
  })),
  summary: z.string().describe("Brief summary of the codebase architecture"),
});

export type CodebaseAnalysis = z.infer<typeof CodebaseAnalysisSchema>;

/**
 * LLMCodeAnalyzerTool - Uses LLM to analyze codebase structure and architecture
 * 
 * Reads key files from the repository and uses an LLM to provide intelligent analysis
 * of the architecture, patterns, and design decisions.
 */
export const LLMCodeAnalyzerTool = tool(
  async (input: { projectPath: string; maxFileLines?: number }) => {
    const { projectPath, maxFileLines = 100 } = input;
    const resolvedPath = path.resolve(projectPath);

    try {
      // Check if directory exists
      const stats = await fs.stat(resolvedPath);
      if (!stats.isDirectory()) {
        return JSON.stringify({
          error: `Path is not a directory: ${resolvedPath}`,
        });
      }
    } catch (error) {
      return JSON.stringify({
        error: `Path does not exist: ${resolvedPath}`,
      });
    }

    // Gather project context
    const context = await gatherProjectContext(resolvedPath, maxFileLines);

    // Initialize LLM
    const model = new ChatOpenAI({
      model: process.env.LLM_MODEL || "gpt-4o",
      temperature: 0.1,
      apiKey: process.env.LLM_API_KEY,
      configuration: {
        baseURL: process.env.LLM_BASE_URL,
      },
    });

    // Build prompt with project context
    const prompt = buildAnalysisPrompt(context);

    try {
      // Get LLM analysis
      const response = await model.invoke(prompt);
      const content = response.content.toString();

      // Extract JSON from response
      const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) || 
                       content.match(/(\{[\s\S]*\})/);
      
      if (!jsonMatch) {
        return JSON.stringify({
          error: "Failed to parse LLM response as JSON",
          rawResponse: content,
        });
      }

      const analysis = JSON.parse(jsonMatch[1] || jsonMatch[0]);
      
      // Validate with schema
      const validated = CodebaseAnalysisSchema.parse(analysis);
      
      return JSON.stringify({
        success: true,
        projectPath: resolvedPath,
        analysis: validated,
        filesAnalyzed: context.filesAnalyzed,
      }, null, 2);
    } catch (error: any) {
      return JSON.stringify({
        error: `LLM analysis failed: ${error.message}`,
        projectPath: resolvedPath,
      });
    }
  },
  {
    name: "analyze_codebase_with_llm",
    description: "Uses LLM to analyze a codebase's architecture, patterns, tech stack, and design decisions. Reads package.json, source code samples, Dockerfile, and directory structure.",
    schema: z.object({
      projectPath: z.string().describe("Path to the project root directory to analyze"),
      maxFileLines: z.number().optional().describe("Maximum lines to read from each source file (default: 100)"),
    }),
  }
);

/**
 * ProjectContext - Information gathered from the project files
 */
interface ProjectContext {
  packageJson: any | null;
  directoryStructure: string[];
  sourceSamples: { path: string; content: string }[];
  dockerfile: string | null;
  dockerCompose: string | null;
  tsConfig: any | null;
  readme: string | null;
  envExample: string | null;
  filesAnalyzed: string[];
}

/**
 * Gather context from project files
 */
async function gatherProjectContext(
  projectPath: string, 
  maxFileLines: number
): Promise<ProjectContext> {
  const context: ProjectContext = {
    packageJson: null,
    directoryStructure: [],
    sourceSamples: [],
    dockerfile: null,
    dockerCompose: null,
    tsConfig: null,
    readme: null,
    envExample: null,
    filesAnalyzed: [],
  };

  // Read package.json
  const packageJsonPath = path.join(projectPath, "package.json");
  try {
    const content = await fs.readFile(packageJsonPath, "utf-8");
    context.packageJson = JSON.parse(content);
    context.filesAnalyzed.push("package.json");
  } catch {
    // package.json not found or invalid
  }

  // Read tsconfig.json
  const tsConfigPath = path.join(projectPath, "tsconfig.json");
  try {
    const content = await fs.readFile(tsConfigPath, "utf-8");
    context.tsConfig = JSON.parse(content);
    context.filesAnalyzed.push("tsconfig.json");
  } catch {
    // tsconfig.json not found
  }

  // Read Dockerfile
  const dockerfilePath = path.join(projectPath, "Dockerfile");
  try {
    context.dockerfile = await fs.readFile(dockerfilePath, "utf-8");
    context.filesAnalyzed.push("Dockerfile");
  } catch {
    // Dockerfile not found
  }

  // Read docker-compose
  const dockerComposePath = path.join(projectPath, "docker-compose.yml");
  const dockerComposeYamlPath = path.join(projectPath, "docker-compose.yaml");
  try {
    context.dockerCompose = await fs.readFile(dockerComposePath, "utf-8");
    context.filesAnalyzed.push("docker-compose.yml");
  } catch {
    try {
      context.dockerCompose = await fs.readFile(dockerComposeYamlPath, "utf-8");
      context.filesAnalyzed.push("docker-compose.yaml");
    } catch {
      // docker-compose not found
    }
  }

  // Read README
  const readmePath = path.join(projectPath, "README.md");
  try {
    const content = await fs.readFile(readmePath, "utf-8");
    context.readme = content.slice(0, 2000); // First 2000 chars
    context.filesAnalyzed.push("README.md");
  } catch {
    // README not found
  }

  // Read .env.example
  const envExamplePath = path.join(projectPath, ".env.example");
  try {
    context.envExample = await fs.readFile(envExamplePath, "utf-8");
    context.filesAnalyzed.push(".env.example");
  } catch {
    // .env.example not found
  }

  // Get directory structure
  context.directoryStructure = await getDirectoryStructure(projectPath);

  // Get source code samples
  context.sourceSamples = await getSourceSamples(projectPath, maxFileLines);
  context.filesAnalyzed.push(...context.sourceSamples.map(s => s.path));

  return context;
}

/**
 * Get directory structure (non-node_modules, first 2 levels)
 */
async function getDirectoryStructure(projectPath: string): Promise<string[]> {
  const structure: string[] = [];
  
  async function scanDir(dir: string, level: number, prefix: string) {
    if (level > 2) return;
    
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.name === "node_modules" || entry.name === ".git" || entry.name.startsWith(".")) {
          continue;
        }
        
        const entryPath = path.join(prefix, entry.name);
        structure.push(entryPath);
        
        if (entry.isDirectory() && level < 2) {
          await scanDir(path.join(dir, entry.name), level + 1, entryPath);
        }
      }
    } catch {
      // Directory not accessible
    }
  }
  
  await scanDir(projectPath, 0, "");
  return structure.slice(0, 100); // Limit to 100 entries
}

/**
 * Get source code samples from key files
 */
async function getSourceSamples(
  projectPath: string, 
  maxLines: number
): Promise<{ path: string; content: string }[]> {
  const samples: { path: string; content: string }[] = [];
  const extensions = [".ts", ".js", ".tsx", ".jsx", ".go", ".py", ".java", ".rs", ".php"];
  
  // Priority directories
  const priorityDirs = ["src", "lib", "api", "cmd", "internal", "pkg"];
  const scannedFiles = new Set<string>();
  
  async function scanForSamples(dir: string, maxFiles: number) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true, recursive: false });
      
      for (const entry of entries) {
        if (samples.length >= maxFiles) break;
        if (scannedFiles.has(entry.name)) continue;
        
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
          await scanForSamples(fullPath, maxFiles);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if (extensions.includes(ext)) {
            try {
              const content = await fs.readFile(fullPath, "utf-8");
              const lines = content.split("\n").slice(0, maxLines).join("\n");
              const relativePath = path.relative(projectPath, fullPath);
              samples.push({ path: relativePath, content: lines });
              scannedFiles.add(entry.name);
            } catch {
              // File not readable
            }
          }
        }
      }
    } catch {
      // Directory not accessible
    }
  }
  
  // First scan priority directories
  for (const priorityDir of priorityDirs) {
    const fullPath = path.join(projectPath, priorityDir);
    try {
      const stat = await fs.stat(fullPath);
      if (stat.isDirectory()) {
        await scanForSamples(fullPath, 5);
      }
    } catch {
      // Directory doesn't exist
    }
  }
  
  // Then scan root if needed
  if (samples.length < 5) {
    await scanForSamples(projectPath, 5);
  }
  
  return samples.slice(0, 8); // Max 8 samples
}

/**
 * Build the analysis prompt for the LLM
 */
function buildAnalysisPrompt(context: ProjectContext): string {
  const parts: string[] = [];
  
  parts.push(`You are an expert software architect. Analyze the following codebase and provide a detailed architectural analysis.`);
  parts.push(`\n## Instructions\n`);
  parts.push(`Respond with ONLY a JSON object (no markdown code blocks around it) matching this exact structure:`);
  parts.push(JSON.stringify({
    primaryLanguage: "string",
    runtime: "string",
    webFramework: "string",
    architecturePattern: "string",
    databases: [{ name: "string", type: "string", purpose: "string" }],
    externalServices: [{ name: "string", purpose: "string", integrationType: "string" }],
    messageQueues: [{ name: "string", purpose: "string" }],
    mainEndpoints: [{ method: "string", path: "string", description: "string" }],
    testFrameworks: ["string"],
    notableDecisions: [{ decision: "string", rationale: "string" }],
    summary: "string",
  }, null, 2));
  
  parts.push(`\n## Project Context\n`);
  
  if (context.packageJson) {
    parts.push(`\n### package.json\n`);
    parts.push(`Name: ${context.packageJson.name || "N/A"}`);
    parts.push(`Dependencies: ${JSON.stringify(context.packageJson.dependencies || {}, null, 2).slice(0, 2000)}`);
    parts.push(`DevDependencies: ${JSON.stringify(Object.keys(context.packageJson.devDependencies || {})).slice(0, 500)}`);
    if (context.packageJson.scripts) {
      parts.push(`Scripts: ${JSON.stringify(context.packageJson.scripts, null, 2)}`);
    }
  }
  
  if (context.tsConfig) {
    parts.push(`\n### tsconfig.json\n`);
    parts.push(JSON.stringify(context.tsConfig, null, 2).slice(0, 1000));
  }
  
  if (context.directoryStructure.length > 0) {
    parts.push(`\n### Directory Structure\n`);
    parts.push("```");
    parts.push(context.directoryStructure.join("\n"));
    parts.push("```");
  }
  
  if (context.dockerfile) {
    parts.push(`\n### Dockerfile\n`);
    parts.push("```dockerfile");
    parts.push(context.dockerfile.slice(0, 1500));
    parts.push("```");
  }
  
  if (context.dockerCompose) {
    parts.push(`\n### docker-compose.yml\n`);
    parts.push("```yaml");
    parts.push(context.dockerCompose.slice(0, 1500));
    parts.push("```");
  }
  
  if (context.envExample) {
    parts.push(`\n### .env.example\n`);
    parts.push("```");
    parts.push(context.envExample.slice(0, 1000));
    parts.push("```");
  }
  
  if (context.sourceSamples.length > 0) {
    parts.push(`\n### Source Code Samples\n`);
    for (const sample of context.sourceSamples.slice(0, 5)) {
      parts.push(`\n#### ${sample.path}\n`);
      parts.push("```typescript");
      parts.push(sample.content.slice(0, 1500));
      parts.push("```");
    }
  }
  
  parts.push(`\n\nAnalyze this codebase and provide the JSON response with your architectural assessment.`);
  
  return parts.join("\n");
}

export default LLMCodeAnalyzerTool;
