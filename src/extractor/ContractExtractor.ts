/**
 * ContractExtractor: reads markdown files line by line and extracts structural
 * contracts matching API_ENDPOINT, ENV_VARIABLE, and FILE_DEPENDENCY patterns.
 */

import { readFile } from "fs/promises";
import { join, relative } from "path";
import type {
  ExtractorInput,
  ExtractorOutput,
  ExtractedContract,
  ContractCategory,
} from "../types.js";

// ---------------------------------------------------------------------------
// Regex patterns
// ---------------------------------------------------------------------------

/**
 * Matches a URL-style path that starts with `/` and contains at least one
 * additional `/`-delimited segment (e.g. `/api/v2/users/profile`).
 * The path ends at whitespace, a quote, a backtick, a closing paren/bracket,
 * or end-of-string.
 */
const API_ENDPOINT_RE =
  /(?<![.\w])\/[A-Za-z0-9_\-{}:]+(?:\/[A-Za-z0-9_\-{}:.]+)+(?=[)\]"'`\s,]|$)/g;

/**
 * Matches an all-caps identifier composed of uppercase letters, digits, and
 * underscores, with at least one underscore (to avoid matching single-word
 * acronyms like "API" or "URL" that are not environment variable names).
 */
const ENV_VARIABLE_RE = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g;

/**
 * Matches a relative file path that contains either a dot-extension
 * (e.g. `database.ts`) or a path separator (e.g. `src/config`).
 * Excludes paths that start with `/` (those are API_ENDPOINT candidates).
 * The path must begin with a word character or `.` and contain either
 * a `/` separator or a `.` followed by a word character.
 */
const FILE_DEPENDENCY_RE =
  /(?<![/\w])(?:\.\.|\.)?[A-Za-z0-9_\-]+(?:\/[A-Za-z0-9_\-./]+)*\.[A-Za-z0-9]+(?=[)\]"'`\s,.]|$)/g;

// ---------------------------------------------------------------------------
// Structured error type returned for inaccessible files
// ---------------------------------------------------------------------------

interface FileNotFoundError {
  error: {
    code: "FILE_NOT_FOUND";
    path: string;
    message: string;
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Extracts all contract matches from a single line of text.
 * Returns an array of (category, value) pairs in the order they appear.
 * A value matched by API_ENDPOINT is not re-matched by FILE_DEPENDENCY.
 */
function extractMatchesFromLine(
  line: string
): Array<{ category: ContractCategory; value: string }> {
  const results: Array<{ category: ContractCategory; value: string }> = [];

  // Track character ranges already claimed by API_ENDPOINT so FILE_DEPENDENCY
  // does not double-count path-like strings that start with `/`.
  const claimedRanges: Array<[number, number]> = [];

  // Reset lastIndex before each exec loop (regexes are stateful with /g flag).
  API_ENDPOINT_RE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = API_ENDPOINT_RE.exec(line)) !== null) {
    results.push({ category: "API_ENDPOINT", value: match[0] });
    claimedRanges.push([match.index, match.index + match[0].length]);
  }

  ENV_VARIABLE_RE.lastIndex = 0;
  while ((match = ENV_VARIABLE_RE.exec(line)) !== null) {
    results.push({ category: "ENV_VARIABLE", value: match[0] });
  }

  FILE_DEPENDENCY_RE.lastIndex = 0;
  while ((match = FILE_DEPENDENCY_RE.exec(line)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    // Skip if this range overlaps with an already-claimed API_ENDPOINT range.
    const overlaps = claimedRanges.some((r) => start < r[1] && end > r[0]);
    if (!overlaps) {
      results.push({ category: "FILE_DEPENDENCY", value: match[0] });
    }
  }

  return results;
}

/**
 * Zero-pads `n` to at least `width` digits.
 */
function zeroPad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Reads each markdown file listed in `input.docRelPaths`, applies the three
 * contract-extraction patterns line by line, and returns all discovered
 * contracts with sequential zero-padded IDs.
 *
 * Files that cannot be read produce a structured FILE_NOT_FOUND error in the
 * response; processing continues for any remaining paths.
 */
export async function extractDocumentationContracts(
  input: ExtractorInput
): Promise<ExtractorOutput & { errors?: FileNotFoundError[] }> {
  const { workspaceRoot, docRelPaths } = input;

  // First pass: collect all raw matches so we know the total count before
  // assigning IDs (padding width depends on total count).
  type RawMatch = {
    relPath: string;
    lineNumber: number; // 1-indexed
    category: ContractCategory;
    value: string;
    rawContext: string;
  };

  const rawMatches: RawMatch[] = [];
  const errors: FileNotFoundError[] = [];

  for (const relPath of docRelPaths) {
    const absPath = join(workspaceRoot, relPath);
    let content: string;

    try {
      content = await readFile(absPath, "utf-8");
    } catch {
      errors.push({
        error: {
          code: "FILE_NOT_FOUND",
          path: relPath,
          message:
            "The specified documentation file does not exist at the resolved path.",
        },
      });
      continue;
    }

    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? "";
      const lineMatches = extractMatchesFromLine(line);
      for (const { category, value } of lineMatches) {
        rawMatches.push({
          relPath,
          lineNumber: i + 1, // convert to 1-indexed
          category,
          value,
          rawContext: line,
        });
      }
    }
  }

  // Determine zero-padding width from total contract count (minimum 3 digits).
  const totalCount = rawMatches.length;
  const padWidth = Math.max(3, String(totalCount).length);

  // Build the final contracts array with sequential IDs.
  const extractedContracts: ExtractedContract[] = rawMatches.map(
    (raw, index) => ({
      id: `contract_${zeroPad(index + 1, padWidth)}`,
      sourceFile: relative(workspaceRoot, join(workspaceRoot, raw.relPath)),
      sourceLine: raw.lineNumber,
      category: raw.category,
      value: raw.value,
      rawContext: raw.rawContext,
    })
  );

  const output: ExtractorOutput & { errors?: FileNotFoundError[] } = {
    extractedContracts,
  };

  if (errors.length > 0) {
    output.errors = errors;
  }

  return output;
}
