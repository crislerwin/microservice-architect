import { tool } from "@langchain/core/tools";
import * as fs from "fs/promises";
import * as path from "path";
import { z } from "zod";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("tool:code-quality");

// Issue severity levels
export type Severity = "critical" | "warning" | "info";

// Issue categories
export type IssueCategory =
  | "DRY_VIOLATION"
  | "HIGH_COMPLEXITY"
  | "CIRCULAR_DEPENDENCY"
  | "GOD_CLASS"
  | "LONG_FUNCTION"
  | "DEEP_NESTING"
  | "MAGIC_NUMBER"
  | "POOR_NAMING"
  | "UNUSED_IMPORT"
  | "SOLID_VIOLATION"
  | "MISSING_TEST";

// Single issue found
export interface CodeIssue {
  file: string;
  line: number;
  column?: number;
  severity: Severity;
  category: IssueCategory;
  message: string;
  suggestion?: string;
  codeSnippet?: string;
}

// Duplicate code block
export interface DuplicateBlock {
  hash: string;
  similarity: number;
  occurrences: Array<{ file: string; lines: [number, number] }>;
  code: string;
}

// Complexity hotspot
export interface ComplexityHotspot {
  file: string;
  function: string;
  complexity: number;
  line: number;
}

// Complete analysis report
export interface CodeQualityReport {
  serviceName: string;
  analyzedAt: string;
  summary: {
    totalFiles: number;
    totalFunctions: number;
    averageComplexity: number;
    issueCounts: {
      critical: number;
      warning: number;
      info: number;
    };
  };
  issues: CodeIssue[];
  duplicates: DuplicateBlock[];
  complexityHotspots: ComplexityHotspot[];
  dependencies: {
    circular: string[][];
    unused: Array<{ file: string; imports: string[] }>;
  };
}

// Configuration options
export interface AnalyzerConfig {
  complexityThreshold: number;
  minDuplicateLines: number;
  maxFileLines: number;
  maxFunctionLines: number;
  includeTests: boolean;
  excludePatterns: string[];
}

// Default configuration
const DEFAULT_CONFIG: AnalyzerConfig = {
  complexityThreshold: 15,
  minDuplicateLines: 5,
  maxFileLines: 500,
  maxFunctionLines: 50,
  includeTests: false,
  excludePatterns: ["node_modules", "dist", "build", ".git", "*.spec.ts", "*.test.ts"],
};

/**
 * Calculate cyclomatic complexity from code
 * Simple estimation based on control flow keywords
 */
function calculateComplexity(code: string): number {
  const controlFlow = /\b(if|else|while|for|do|switch|case|catch|\?\:|\|\||\&\&)\b/g;
  const matches = code.match(controlFlow);
  return 1 + (matches ? matches.length : 0);
}

/**
 * Generate a simple hash for duplicate detection
 */
function generateHash(code: string): string {
  // Normalize: remove whitespace, comments, and normalize quotes
  const normalized = code
    .replace(/\s+/g, " ")
    .replace(/\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/['"`]/g, "'")
    .trim();

  // Simple hash function
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return hash.toString(16);
}

/**
 * Calculate similarity between two code blocks (0-1)
 */
function calculateSimilarity(code1: string, code2: string): number {
  const normalized1 = code1.replace(/\s+/g, " ").trim();
  const normalized2 = code2.replace(/\s+/g, " ").trim();

  if (normalized1 === normalized2) return 1.0;

  // Levenshtein distance for approximate matching
  const len1 = normalized1.length;
  const len2 = normalized2.length;
  const matrix: number[][] = [];

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = normalized1[i - 1] === normalized2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  const distance = matrix[len1][len2];
  const maxLen = Math.max(len1, len2);
  return 1 - distance / maxLen;
}

/**
 * Parse file for imports/dependencies
 */
function parseImports(content: string): string[] {
  const imports: string[] = [];

  // ES6 imports
  const es6ImportRegex = /import\s+(?:(?:\{[^}]*\}|[^'"]*)\s+from\s+)?['"]([^'"]+)['"];?/g;
  let match;
  while ((match = es6ImportRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }

  // CommonJS requires
  const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = requireRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }

  return [...new Set(imports)];
}

/**
 * Check if import is used in file
 */
function isImportUsed(importName: string, content: string): boolean {
  // Extract the actual import name (remove paths)
  const name = importName.replace(/.*\//, "").replace(/['"`;]/g, "");

  // Check if name appears in code (not in import statements)
  const codeWithoutImports = content.replace(
    /import\s+(?:(?:\{[^}]*\}|[^'"]*)\s+from\s+)?['"][^'"]+['"];?/g,
    ""
  );

  const regex = new RegExp(`\\b${name}\\b`, "g");
  return regex.test(codeWithoutImports);
}

/**
 * Analyze a single file for issues
 */
async function analyzeFile(
  filePath: string,
  content: string,
  config: AnalyzerConfig
): Promise<{ issues: CodeIssue[]; functions: Array<{ name: string; line: number; complexity: number; lines: number }>; codeBlocks: Array<{ hash: string; lines: [number, number]; code: string }> }> {
  const issues: CodeIssue[] = [];
  const functions: Array<{ name: string; line: number; complexity: number; lines: number }> = [];
  const codeBlocks: Array<{ hash: string; lines: [number, number]; code: string }> = [];

  const lines = content.split("\n");
  const totalLines = lines.length;

  // Check file size
  if (totalLines > config.maxFileLines) {
    issues.push({
      file: filePath,
      line: 1,
      severity: "warning",
      category: "GOD_CLASS",
      message: `File has ${totalLines} lines (threshold: ${config.maxFileLines})`,
      suggestion: "Consider splitting into multiple files or extracting modules",
    });
  }

  // Parse functions/methods (basic regex for TypeScript/JavaScript)
  const functionRegex = /(?:function|const|let|var)?\s*(\w+)\s*(?:\([^)]*\)\s*\{|:\s*function\s*\(|\s*=\s*(?:async\s*)?\([^)]*\)\s*=>)/g;
  const classMethodRegex = /(\w+)\s*\([^)]*\)\s*\{/g;

  let match;
  while ((match = functionRegex.exec(content)) !== null) {
    const functionName = match[1];
    const lineNumber = content.substring(0, match.index).split("\n").length;

    // Extract function body
    const startIdx = match.index;
    let braceCount = 0;
    let endIdx = startIdx;
    let inFunction = false;

    for (let i = startIdx; i < content.length; i++) {
      if (content[i] === "{") {
        braceCount++;
        inFunction = true;
      } else if (content[i] === "}") {
        braceCount--;
        if (inFunction && braceCount === 0) {
          endIdx = i + 1;
          break;
        }
      }
    }

    const functionCode = content.substring(startIdx, endIdx);
    const functionLines = functionCode.split("\n").length;
    const complexity = calculateComplexity(functionCode);

    functions.push({
      name: functionName,
      line: lineNumber,
      complexity,
      lines: functionLines,
    });

    // Check function length
    if (functionLines > config.maxFunctionLines) {
      issues.push({
        file: filePath,
        line: lineNumber,
        severity: "warning",
        category: "LONG_FUNCTION",
        message: `Function "${functionName}" has ${functionLines} lines (threshold: ${config.maxFunctionLines})`,
        suggestion: "Extract smaller functions or split logic",
      });
    }

    // Check complexity
    if (complexity > config.complexityThreshold) {
      issues.push({
        file: filePath,
        line: lineNumber,
        severity: "critical",
        category: "HIGH_COMPLEXITY",
        message: `Function "${functionName}" has cyclomatic complexity of ${complexity} (threshold: ${config.complexityThreshold})`,
        suggestion: "Refactor into smaller functions or use early returns",
        codeSnippet: functionCode.substring(0, 100) + "...",
      });
    }

    // Check deep nesting
    const indentationLevels = functionCode
      .split("\n")
      .map((line) => {
        const match = line.match(/^(\s*)/);
        return match ? Math.floor(match[1].length / 2) : 0;
      })
      .filter((level) => level > 0);

    const maxNesting = Math.max(0, ...indentationLevels);
    if (maxNesting > 4) {
      issues.push({
        file: filePath,
        line: lineNumber,
        severity: "warning",
        category: "DEEP_NESTING",
        message: `Function "${functionName}" has ${maxNesting} levels of nesting`,
        suggestion: "Extract nested logic into separate functions",
      });
    }
  }

  // Extract code blocks for duplicate detection
  const blockSize = config.minDuplicateLines;
  for (let i = 0; i <= lines.length - blockSize; i++) {
    const block = lines.slice(i, i + blockSize).join("\n");
    const hash = generateHash(block);
    codeBlocks.push({
      hash,
      lines: [i + 1, i + blockSize],
      code: block,
    });
  }

  // Check for magic numbers
  const magicNumberRegex = /[^\w](\d{2,})(?!\w*\s*[=:])/g;
  let magicMatch;
  while ((magicMatch = magicNumberRegex.exec(content)) !== null) {
    const num = magicMatch[1];
    if (num !== "0" && num !== "1") {
      const lineNum = content.substring(0, magicMatch.index).split("\n").length;
      issues.push({
        file: filePath,
        line: lineNum,
        severity: "info",
        category: "MAGIC_NUMBER",
        message: `Magic number "${num}" found`,
        suggestion: "Consider extracting to a named constant",
      });
    }
  }

  // Check naming conventions
  const camelCaseRegex = /^[a-z][a-zA-Z0-9]*$/;
  const pascalCaseRegex = /^[A-Z][a-zA-Z0-9]*$/;

  functions.forEach((fn) => {
    if (!camelCaseRegex.test(fn.name) && fn.name !== fn.name.toUpperCase()) {
      issues.push({
        file: filePath,
        line: fn.line,
        severity: "info",
        category: "POOR_NAMING",
        message: `Function "${fn.name}" doesn't follow camelCase convention`,
        suggestion: "Use camelCase for function names",
      });
    }
  });

  return { issues, functions, codeBlocks };
}

/**
 * Main Code Quality Analyzer Tool
 */
export const CodeQualityAnalyzerTool = tool(
  async ({
    servicePath,
    serviceName,
    config: userConfig,
  }: {
    servicePath: string;
    serviceName: string;
    config?: Partial<AnalyzerConfig>;
  }): Promise<string> => {
    logger.info(`Starting code quality analysis for ${serviceName} at ${servicePath}`);

    const config = { ...DEFAULT_CONFIG, ...userConfig };
    const startTime = Date.now();

    try {
      // Get all TypeScript/JavaScript files
      const files: string[] = [];

      async function scanDirectory(dir: string): Promise<void> {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relativePath = path.relative(servicePath, fullPath);

          // Skip excluded patterns
          if (config.excludePatterns.some((pattern) => relativePath.includes(pattern))) {
            continue;
          }

          if (entry.isDirectory()) {
            await scanDirectory(fullPath);
          } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".js") || entry.name.endsWith(".tsx")) {
            files.push(fullPath);
          }
        }
      }

      await scanDirectory(servicePath);

      logger.info(`Found ${files.length} files to analyze`);

      const allIssues: CodeIssue[] = [];
      const allFunctions: Array<{ file: string; name: string; line: number; complexity: number }> = [];
      const allCodeBlocks: Array<{ file: string; hash: string; lines: [number, number]; code: string }> = [];
      const allImports: Array<{ file: string; imports: string[]; content: string }> = [];
      const fileDependencyGraph: Map<string, Set<string>> = new Map();

      // Analyze each file
      for (const file of files) {
        try {
          const content = await fs.readFile(file, "utf-8");
          const relativePath = path.relative(servicePath, file);

          // Parse imports
          const imports = parseImports(content);
          allImports.push({ file: relativePath, imports, content });
          fileDependencyGraph.set(relativePath, new Set(imports));

          // Analyze file
          const result = await analyzeFile(relativePath, content, config);

          allIssues.push(...result.issues);
          allFunctions.push(
            ...result.functions.map((f) => ({ file: relativePath, ...f }))
          );
          allCodeBlocks.push(
            ...result.codeBlocks.map((b) => ({ file: relativePath, ...b }))
          );
        } catch (error) {
          logger.warn(`Failed to analyze ${file}:`, error);
        }
      }

      // Find duplicates
      const duplicates: DuplicateBlock[] = [];
      const hashGroups = new Map<string, Array<{ file: string; lines: [number, number] }>>();

      for (const block of allCodeBlocks) {
        if (!hashGroups.has(block.hash)) {
          hashGroups.set(block.hash, []);
        }
        hashGroups.get(block.hash)!.push({ file: block.file, lines: block.lines });
      }

      for (const [hash, occurrences] of hashGroups.entries()) {
        if (occurrences.length > 1) {
          // Find the actual code from first occurrence
          const firstBlock = allCodeBlocks.find(
            (b) => b.hash === hash && b.file === occurrences[0].file
          );

          duplicates.push({
            hash,
            similarity: 1.0,
            occurrences,
            code: firstBlock?.code || "",
          });

          // Add DRY violation issue
          allIssues.push({
            file: occurrences[0].file,
            line: occurrences[0].lines[0],
            severity: "warning",
            category: "DRY_VIOLATION",
            message: `Duplicate code found in ${occurrences.length} locations`,
            suggestion: "Extract into a shared function or constant",
            codeSnippet: firstBlock?.code.substring(0, 100) + "...",
          });
        }
      }

      // Check for unused imports
      const unusedImports: Array<{ file: string; imports: string[] }> = [];
      for (const { file, imports, content } of allImports) {
        const unused = imports.filter((imp) => !isImportUsed(imp, content));
        if (unused.length > 0) {
          unusedImports.push({ file, imports: unused });
          allIssues.push({
            file,
            line: 1,
            severity: "info",
            category: "UNUSED_IMPORT",
            message: `Unused imports: ${unused.join(", ")}`,
            suggestion: "Remove unused imports",
          });
        }
      }

      // Detect circular dependencies (simplified)
      const circularDeps: string[][] = [];
      const visited = new Set<string>();
      const recursionStack = new Set<string>();

      function detectCycle(file: string, path: string[] = []): void {
        if (recursionStack.has(file)) {
          const cycleStart = path.indexOf(file);
          const cycle = path.slice(cycleStart).concat([file]);
          circularDeps.push(cycle);
          return;
        }

        if (visited.has(file)) return;

        visited.add(file);
        recursionStack.add(file);
        path.push(file);

        const deps = fileDependencyGraph.get(file);
        if (deps) {
          for (const dep of deps) {
            // Resolve relative imports
            const resolvedDep = dep.startsWith(".") ? dep : dep;
            if (resolvedDep.endsWith(".ts") || resolvedDep.endsWith(".js")) {
              detectCycle(resolvedDep, [...path]);
            }
          }
        }

        recursionStack.delete(file);
      }

      for (const file of fileDependencyGraph.keys()) {
        visited.clear();
        recursionStack.clear();
        detectCycle(file);
      }

      // Unique circular dependencies
      const uniqueCircular = circularDeps.filter(
        (cycle, index, self) =>
          index ===
          self.findIndex((c) => JSON.stringify(c.sort()) === JSON.stringify(cycle.sort()))
      );

      for (const cycle of uniqueCircular) {
        allIssues.push({
          file: cycle[0],
          line: 1,
          severity: "critical",
          category: "CIRCULAR_DEPENDENCY",
          message: `Circular dependency detected: ${cycle.join(" → ")}`,
          suggestion: "Refactor to break the cycle (dependency injection, interfaces, etc.)",
        });
      }

      // Calculate summary
      const totalComplexity = allFunctions.reduce((sum, f) => sum + f.complexity, 0);
      const avgComplexity = allFunctions.length > 0 ? totalComplexity / allFunctions.length : 0;

      const issueCounts = allIssues.reduce(
        (acc, issue) => {
          acc[issue.severity]++;
          return acc;
        },
        { critical: 0, warning: 0, info: 0 }
      );

      // Top complexity hotspots
      const complexityHotspots = allFunctions
        .filter((f) => f.complexity > config.complexityThreshold)
        .sort((a, b) => b.complexity - a.complexity)
        .slice(0, 10)
        .map((f) => ({
          file: f.file,
          function: f.name,
          complexity: f.complexity,
          line: f.line,
        }));

      const report: CodeQualityReport = {
        serviceName,
        analyzedAt: new Date().toISOString(),
        summary: {
          totalFiles: files.length,
          totalFunctions: allFunctions.length,
          averageComplexity: Math.round(avgComplexity * 10) / 10,
          issueCounts,
        },
        issues: allIssues,
        duplicates,
        complexityHotspots,
        dependencies: {
          circular: uniqueCircular,
          unused: unusedImports,
        },
      };

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      logger.info(`Analysis complete in ${duration}s. Found ${allIssues.length} issues`);

      return JSON.stringify(report, null, 2);
    } catch (error) {
      logger.error("Code quality analysis failed:", error);
      throw error;
    }
  },
  {
    name: "analyze_code_quality",
    description:
      "Analyze source code for software engineering principle violations including DRY, complexity, dependencies, and code smells",
    schema: z.object({
      servicePath: z.string().describe("Path to the service directory to analyze"),
      serviceName: z.string().describe("Name of the service"),
      config: z
        .object({
          complexityThreshold: z.number().optional().describe("Cyclomatic complexity threshold"),
          minDuplicateLines: z.number().optional().describe("Minimum lines for duplicate detection"),
          maxFileLines: z.number().optional().describe("Maximum lines per file"),
          maxFunctionLines: z.number().optional().describe("Maximum lines per function"),
          includeTests: z.boolean().optional().describe("Include test files"),
          excludePatterns: z.array(z.string()).optional().describe("Patterns to exclude"),
        })
        .optional()
        .describe("Configuration options"),
    }),
  }
);

export default CodeQualityAnalyzerTool;
