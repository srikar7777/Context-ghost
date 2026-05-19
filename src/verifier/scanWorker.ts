import { parentPort } from "node:worker_threads";
import { readFile } from "node:fs/promises";
import { relative } from "node:path";
import type { WorkerInput, WorkerOutput, Occurrence, MatchType } from "../types.js";

// Helper to determine if a line is a comment
function isComment(line: string): boolean {
  const trimmed = line.trimStart();
  return trimmed.startsWith("//") || trimmed.startsWith("#") || trimmed.startsWith("*");
}

function getNormalized(value: string): string {
  return value.replace(/^\/+|\/+$/g, "").toLowerCase();
}

function getStaticTokens(value: string): string[] {
  return value
    .split("/")
    .filter((token) => token.length > 0 && !token.startsWith(":") && !token.startsWith("{") && !token.endsWith("}"));
}

parentPort?.on("message", async (input: WorkerInput) => {
  const { files, targets, workspaceRoot } = input;
  const matches: Record<string, Occurrence[]> = {};

  // Initialize arrays for all targets
  for (const target of targets) {
    if (!Object.prototype.hasOwnProperty.call(matches, target.value)) {
      matches[target.value] = [];
    }
  }

  for (const file of files) {
    let content: string;
    try {
      content = await readFile(file, "utf-8");
    } catch {
      // File is unreadable (permissions, binary, or deleted during traversal). Skip it.
      continue;
    }

    const lines = content.split(/\r?\n/);
    const relFile = relative(workspaceRoot, file);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line === undefined) continue;

      const lineNumber = i + 1;
      const lowerLine = line.toLowerCase();

      for (const target of targets) {
        let matchType: MatchType | undefined;

        // 1. Exact match
        if (line.includes(target.value)) {
          matchType = "EXACT";
        }
        // 2. Normalized match
        else {
          const normTarget = getNormalized(target.value);
          // If the normalized target is non-empty and appears in the lowercased line
          // (which effectively handles case-insensitivity and ignores leading/trailing slashes on the target)
          if (normTarget && lowerLine.includes(normTarget)) {
            matchType = "NORMALIZED";
          }
          // 3. Interpolated match (API_ENDPOINT only)
          else if (target.category === "API_ENDPOINT") {
            const staticTokens = getStaticTokens(target.value);
            if (staticTokens.length > 0 && staticTokens.every((token) => line.includes(token))) {
              matchType = "INTERPOLATED";
            }
          }
        }

        if (matchType) {
          // Check for inactive comment
          if (isComment(line)) {
            matchType = "INACTIVE_COMMENT";
          }

          matches[target.value]!.push({
            file: relFile,
            line: lineNumber,
            matchedText: line,
            matchType,
          });
        }
      }
    }
  }

  const output: WorkerOutput = { matches };
  parentPort?.postMessage(output);
});
