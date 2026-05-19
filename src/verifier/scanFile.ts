import { readFile } from "node:fs/promises";
import { relative } from "node:path";
import type { SearchTarget, Occurrence, MatchType } from "../types.js";

function isComment(line: string): boolean {
  const trimmed = line.trimStart();
  return (
    trimmed.startsWith("//") ||
    trimmed.startsWith("#") ||
    trimmed.startsWith("*")
  );
}

function getNormalized(value: string): string {
  return value.replace(/^\/+|\/+$/g, "").toLowerCase();
}

function getStaticTokens(value: string): string[] {
  return value
    .split("/")
    .filter(
      (token) =>
        token.length > 0 &&
        !token.startsWith(":") &&
        !token.startsWith("{") &&
        !token.endsWith("}")
    );
}

/**
 * Scans a single file for all search target occurrences.
 * Returns a map of target value to occurrences found in that file.
 */
export async function scanFile(
  file: string,
  targets: SearchTarget[],
  workspaceRoot: string
): Promise<Record<string, Occurrence[]>> {
  const result: Record<string, Occurrence[]> = {};

  for (const target of targets) {
    result[target.value] = [];
  }

  let content: string;
  try {
    content = await readFile(file, "utf-8");
  } catch {
    // File is unreadable (permissions, binary, or deleted during traversal). Skip it.
    return result;
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

      if (line.includes(target.value)) {
        matchType = "EXACT";
      } else {
        const normTarget = getNormalized(target.value);
        if (normTarget && lowerLine.includes(normTarget)) {
          matchType = "NORMALIZED";
        } else if (target.category === "API_ENDPOINT") {
          const staticTokens = getStaticTokens(target.value);
          if (
            staticTokens.length > 0 &&
            staticTokens.every((token) => line.includes(token))
          ) {
            matchType = "INTERPOLATED";
          }
        }
      }

      if (matchType) {
        if (isComment(line)) {
          matchType = "INACTIVE_COMMENT";
        }

        result[target.value]!.push({
          file: relFile,
          line: lineNumber,
          matchedText: line,
          matchType,
        });
      }
    }
  }

  return result;
}
