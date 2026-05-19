import { FastMCP } from "fastmcp";
import { z } from "zod";
import { extractDocumentationContracts } from "./extractor/ContractExtractor.js";
import { RealityVerifier } from "./verifier/RealityVerifier.js";
import { classifyDrift } from "./classifier/DriftClassifier.js";
import type { SearchTarget, ExtractedContract, VerificationMatch } from "./types.js";

const server = new FastMCP({
  name: "context-ghost",
  version: "1.0.0",
});

server.addTool({
  name: "extract_documentation_contracts",
  description: "Parses markdown files and extracts API_ENDPOINT, ENV_VARIABLE, and FILE_DEPENDENCY contracts.",
  parameters: z.object({
    workspaceRoot: z.string().describe("Absolute path to the project workspace root."),
    docRelPaths: z.array(z.string()).min(1).describe("Relative paths to markdown documentation files."),
  }),
  execute: async (args) => {
    try {
      const output = await extractDocumentationContracts(args);
      return JSON.stringify(output, null, 2);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return JSON.stringify({ error: { code: "INTERNAL_ERROR", message } }, null, 2);
    }
  },
});

server.addTool({
  name: "verify_codebase_reality",
  description: "Performs recursive evaluations across the source code directory using extracted contract targets.",
  parameters: z.object({
    workspaceRoot: z.string().describe("Absolute path to the project workspace root."),
    searchTargets: z.array(z.object({
      id: z.string(),
      category: z.enum(["API_ENDPOINT", "ENV_VARIABLE", "FILE_DEPENDENCY"]),
      value: z.string(),
    })).min(1).describe("The list of targets generated during the contract extraction phase."),
    excludePatterns: z.array(z.string()).optional().describe("Explicit directory names to bypass during file inspection loops."),
  }),
  execute: async (args) => {
    try {
      const verifier = new RealityVerifier();
      const output = await verifier.verify({
        workspaceRoot: args.workspaceRoot,
        searchTargets: args.searchTargets as SearchTarget[],
        ...(args.excludePatterns !== undefined && { excludePatterns: args.excludePatterns }),
      });
      return JSON.stringify(output, null, 2);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return JSON.stringify({ error: { code: "INTERNAL_ERROR", message } }, null, 2);
    }
  },
});

const ContractSchema = z.object({
  id: z.string(),
  sourceFile: z.string(),
  sourceLine: z.number(),
  category: z.enum(["API_ENDPOINT", "ENV_VARIABLE", "FILE_DEPENDENCY"]),
  value: z.string(),
  rawContext: z.string(),
});

const OccurrenceSchema = z.object({
  file: z.string(),
  line: z.number(),
  matchedText: z.string(),
  matchType: z.enum(["EXACT", "NORMALIZED", "INTERPOLATED", "INACTIVE_COMMENT"]).optional(),
});

const VerificationMatchSchema = z.object({
  targetValue: z.string(),
  occurrences: z.array(OccurrenceSchema),
});

server.addTool({
  name: "flag_documentation_drift",
  description: "Executes algorithmic evaluations on extracted contracts and verification matches to identify drift.",
  parameters: z.object({
    contracts: z.array(ContractSchema).min(1),
    matches: z.array(VerificationMatchSchema).min(1),
  }),
  execute: async (args) => {
    try {
      const contracts = args.contracts as ExtractedContract[];
      const matches = args.matches as VerificationMatch[];
      const output = classifyDrift({ contracts, matches });
      return JSON.stringify(output, null, 2);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return JSON.stringify({ error: { code: "INTERNAL_ERROR", message } }, null, 2);
    }
  },
});

async function main() {
  await server.start({ transportType: "stdio" });
}

main().catch(console.error);
