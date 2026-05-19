/**
 * Property-based tests for RealityVerifier and scanWorker.
 *
 * Validates: Requirements 4.1, 4.2, 5.1, 5.2, 5.3
 */

import { describe, it } from "vitest";
import * as fc from "fast-check";
import { tmpdir } from "os";
import { join } from "path";
import { writeFile, mkdir, rm } from "fs/promises";
import { randomUUID } from "crypto";
import { RealityVerifier } from "../../src/verifier/RealityVerifier.js";
import type { SearchTarget } from "../../src/types.js";

async function writeTempFile(dir: string, filename: string, content: string): Promise<string> {
  const filePath = join(dir, filename);
  await writeFile(filePath, content, "utf-8");
  return filePath;
}

function getNormalized(value: string): string {
  return value.replace(/^\/+|\/+$/g, "").toLowerCase();
}

function getStaticTokens(value: string): string[] {
  return value
    .split("/")
    .filter((token) => token.length > 0 && !token.startsWith(":") && !token.startsWith("{") && !token.endsWith("}"));
}

describe("Property 3: Normalization does not produce false negatives", () => {
  it("Returns an occurrence with matchType NORMALIZED or EXACT when normalized value appears in normalized line", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a contract value that has a meaningful normalized form:
        // at least two alphanumeric segments separated by a slash.
        fc.tuple(
          fc.stringMatching(/^[a-z]{2,8}$/),
          fc.stringMatching(/^[a-z]{2,8}$/),
        ).map(([a, b]) => `/${a}/${b}`),
        async (contractValue) => {
          const dir = join(tmpdir(), `cg-prop3-${randomUUID()}`);
          await mkdir(dir, { recursive: true });
          const verifier = new RealityVerifier();

          try {
            // Build a source line that contains the normalized form (uppercase + trailing slash).
            // getNormalized strips slashes and lowercases, so UPPERCASE version will normalize to same value.
            const normalized = getNormalized(contractValue);
            const line = `app.get("/${normalized.toUpperCase()}/", handler);`;
            await writeTempFile(dir, "src.ts", line);

            const targets: SearchTarget[] = [{ id: "c1", category: "API_ENDPOINT", value: contractValue }];
            const result = await verifier.verify({ workspaceRoot: dir, searchTargets: targets });

            if ("error" in result) return false;

            const match = result.verificationMatches[0]!;
            if (match.occurrences.length === 0) return false;

            const occurrence = match.occurrences[0]!;
            return occurrence.matchType === "NORMALIZED" || occurrence.matchType === "EXACT";
          } finally {
            await rm(dir, { recursive: true, force: true });
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 30_000);
});

describe("Property 4: Interpolated match token coverage", () => {
  it("Returns INTERPOLATED occurrence when all static tokens appear in the line", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.stringMatching(/^[a-z]{3,8}$/), { minLength: 2, maxLength: 5 }),
        fc.array(fc.stringMatching(/^[a-z]{3,8}$/), { minLength: 1, maxLength: 3 }),
        async (staticParts, paramParts) => {
          const dir = join(tmpdir(), `cg-prop4-${randomUUID()}`);
          await mkdir(dir, { recursive: true });
          const verifier = new RealityVerifier();

          try {
            // Construct API endpoint value with params, e.g. /users/:id/profile
            const allParts = [];
            for (let i = 0; i < Math.max(staticParts.length, paramParts.length); i++) {
              if (staticParts[i]) allParts.push(staticParts[i]);
              if (paramParts[i]) allParts.push(`:${paramParts[i]}`);
            }
            const contractValue = "/" + allParts.join("/");

            // Construct source line containing only the static tokens in some order or mixed with other stuff
            const line = `app.get("/" + ${staticParts.map(p => `"${p}"`).join(" + '/' + variable + '/' + ")} + "/end", handler);`;
            
            await writeTempFile(dir, "src.ts", line);

            const targets: SearchTarget[] = [{ id: "c1", category: "API_ENDPOINT", value: contractValue }];
            const result = await verifier.verify({ workspaceRoot: dir, searchTargets: targets });

            if ("error" in result) return false;
            
            const match = result.verificationMatches[0]!;
            if (match.occurrences.length === 0) return false;

            const occurrence = match.occurrences[0]!;
            // Must be at least INTERPOLATED
            return occurrence.matchType === "INTERPOLATED" || occurrence.matchType === "NORMALIZED" || occurrence.matchType === "EXACT";
          } finally {
            await rm(dir, { recursive: true, force: true });
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 30_000);
});
