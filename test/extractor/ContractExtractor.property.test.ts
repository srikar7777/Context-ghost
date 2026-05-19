/**
 * Property-based tests for ContractExtractor.
 *
 * Validates: Requirements 2.3, 2.4, 2.5, 2.6
 *
 * Uses fast-check to generate arbitrary inputs and assert universal properties
 * that must hold across all valid executions.
 */

import { describe, it } from "vitest";
import * as fc from "fast-check";
import { tmpdir } from "os";
import { join } from "path";
import { writeFile, mkdir, rm } from "fs/promises";
import { randomUUID } from "crypto";
import { extractDocumentationContracts } from "../../src/extractor/ContractExtractor.js";

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/**
 * Generates a single line of text that is guaranteed to contain exactly one
 * contract match. We use ENV_VARIABLE patterns because they are the simplest
 * to generate without ambiguity: an all-caps identifier with at least one
 * underscore, surrounded by whitespace so no other pattern fires on the same
 * token.
 *
 * Format: `<prefix> SOME_VAR_NAME <suffix>`
 * The prefix and suffix are lowercase words so they do not accidentally match
 * any of the three patterns.
 */
const contractLineArb = fc
  .tuple(
    // prefix: lowercase word, no digits, no underscores, no slashes, no dots
    fc.stringMatching(/^[a-z]{3,10}$/),
    // env var body: at least two uppercase segments separated by underscores
    fc.array(fc.stringMatching(/^[A-Z][A-Z0-9]{1,6}$/), {
      minLength: 2,
      maxLength: 4,
    }),
    // suffix: lowercase word
    fc.stringMatching(/^[a-z]{3,10}$/)
  )
  .map(([prefix, segments, suffix]) => {
    const varName = segments.join("_");
    return `${prefix} ${varName} ${suffix}`;
  });

/**
 * Generates a line of plain prose that contains no contract patterns.
 * Uses only lowercase letters and spaces — no slashes, no dots, no all-caps.
 */
const nonContractLineArb = fc
  .stringMatching(/^[a-z ]{5,40}$/)
  .filter((s) => s.trim().length > 0);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Writes `content` to a temporary file and returns its absolute path.
 * The caller is responsible for cleaning up the directory.
 */
async function writeTempFile(dir: string, content: string): Promise<string> {
  const filename = `${randomUUID()}.md`;
  const filePath = join(dir, filename);
  await writeFile(filePath, content, "utf-8");
  return filePath;
}

// ---------------------------------------------------------------------------
// Property 1: Contract extraction completeness
// ---------------------------------------------------------------------------

/**
 * Feature: context-ghost, Property 1: Contract extraction completeness
 *
 * For any markdown file containing N lines that each match exactly one
 * ENV_VARIABLE contract pattern, the extractor SHALL return exactly N
 * contracts, each with a `sourceLine` matching the 1-indexed position of
 * the contract line and a `rawContext` equal to the full text of that line.
 *
 * Validates: Requirements 2.3, 2.4, 2.5, 2.6
 */
describe("Property 1: Contract extraction completeness", () => {
  it(
    "returns exactly N contracts with correct sourceLine and rawContext",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          // N contract lines interleaved with non-contract filler lines.
          fc.array(contractLineArb, { minLength: 1, maxLength: 20 }),
          fc.array(nonContractLineArb, { minLength: 0, maxLength: 10 }),
          async (contractLines, fillerLines) => {
            const dir = join(tmpdir(), `cg-prop1-${randomUUID()}`);
            await mkdir(dir, { recursive: true });

            try {
              // Build a file where contract lines are placed at known positions.
              // Filler lines are inserted before the first contract line only,
              // so the expected sourceLine values are deterministic.
              const fileLines: string[] = [
                ...fillerLines,
                ...contractLines,
              ];
              const content = fileLines.join("\n");
              const filePath = await writeTempFile(dir, content);
              const relPath = filePath.replace(dir + "/", "");

              const result = await extractDocumentationContracts({
                workspaceRoot: dir,
                docRelPaths: [relPath],
              });

              // The extractor must return exactly N contracts (one per contract line).
              if (result.extractedContracts.length !== contractLines.length) {
                return false;
              }

              // Each contract must have rawContext equal to the full source line.
              for (const contract of result.extractedContracts) {
                const lineIndex = contract.sourceLine - 1; // convert to 0-indexed
                if (lineIndex < 0 || lineIndex >= fileLines.length) {
                  return false;
                }
                if (contract.rawContext !== fileLines[lineIndex]) {
                  return false;
                }
              }

              // sourceLine values must all be within the valid range.
              for (const contract of result.extractedContracts) {
                if (
                  contract.sourceLine < 1 ||
                  contract.sourceLine > fileLines.length
                ) {
                  return false;
                }
              }

              return true;
            } finally {
              await rm(dir, { recursive: true, force: true });
            }
          }
        ),
        { numRuns: 100 }
      );
    },
    // Allow up to 30 s for 100 async iterations.
    30_000
  );
});

// ---------------------------------------------------------------------------
// Property 2: Contract ID uniqueness within an invocation
// ---------------------------------------------------------------------------

/**
 * Feature: context-ghost, Property 2: Contract ID uniqueness within an invocation
 *
 * For any invocation of extractDocumentationContracts that returns K contracts,
 * all K `id` values SHALL be distinct strings.
 *
 * Validates: Requirements 2.4
 */
describe("Property 2: Contract ID uniqueness within an invocation", () => {
  it(
    "all returned id values are distinct within a single invocation",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate 1–3 files, each with 1–10 contract lines.
          fc.array(
            fc.array(contractLineArb, { minLength: 1, maxLength: 10 }),
            { minLength: 1, maxLength: 3 }
          ),
          async (filesContent) => {
            const dir = join(tmpdir(), `cg-prop2-${randomUUID()}`);
            await mkdir(dir, { recursive: true });

            try {
              const relPaths: string[] = [];
              for (const lines of filesContent) {
                const content = lines.join("\n");
                const filePath = await writeTempFile(dir, content);
                relPaths.push(filePath.replace(dir + "/", ""));
              }

              const result = await extractDocumentationContracts({
                workspaceRoot: dir,
                docRelPaths: relPaths,
              });

              const ids = result.extractedContracts.map((c) => c.id);
              const uniqueIds = new Set(ids);

              // All IDs must be distinct.
              return uniqueIds.size === ids.length;
            } finally {
              await rm(dir, { recursive: true, force: true });
            }
          }
        ),
        { numRuns: 100 }
      );
    },
    30_000
  );
});
