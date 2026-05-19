/**
 * Unit tests for ContractExtractor.
 *
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "os";
import { join } from "path";
import { writeFile, mkdir, rm } from "fs/promises";
import { randomUUID } from "crypto";
import { extractDocumentationContracts } from "../../src/extractor/ContractExtractor.js";

// ---------------------------------------------------------------------------
// Test fixture helpers
// ---------------------------------------------------------------------------

let testDir: string;

beforeEach(async () => {
  testDir = join(tmpdir(), `cg-unit-${randomUUID()}`);
  await mkdir(testDir, { recursive: true });
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

async function writeDoc(filename: string, content: string): Promise<string> {
  const { dirname } = await import("path");
  const filePath = join(testDir, filename);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf-8");
  return filename;
}

// ---------------------------------------------------------------------------
// API_ENDPOINT extraction
// ---------------------------------------------------------------------------

describe("API_ENDPOINT extraction", () => {
  it("extracts a simple API path from a markdown line", async () => {
    const relPath = await writeDoc(
      "api.md",
      "The endpoint is /api/v1/users for listing users.\n"
    );

    const result = await extractDocumentationContracts({
      workspaceRoot: testDir,
      docRelPaths: [relPath],
    });

    const endpoints = result.extractedContracts.filter(
      (c) => c.category === "API_ENDPOINT"
    );
    expect(endpoints.length).toBeGreaterThanOrEqual(1);
    expect(endpoints.some((c) => c.value === "/api/v1/users")).toBe(true);
  });

  it("extracts a multi-segment API path with a path parameter", async () => {
    const relPath = await writeDoc(
      "api.md",
      "Use `/api/v2/users/:id/profile` to fetch a user profile.\n"
    );

    const result = await extractDocumentationContracts({
      workspaceRoot: testDir,
      docRelPaths: [relPath],
    });

    const endpoints = result.extractedContracts.filter(
      (c) => c.category === "API_ENDPOINT"
    );
    expect(endpoints.some((c) => c.value === "/api/v2/users/:id/profile")).toBe(
      true
    );
  });

  it("does not extract a bare single-segment path like /health", async () => {
    // A path with only one segment (no additional `/`-delimited token) should
    // not be extracted as an API_ENDPOINT per the spec.
    const relPath = await writeDoc("api.md", "Check /health for status.\n");

    const result = await extractDocumentationContracts({
      workspaceRoot: testDir,
      docRelPaths: [relPath],
    });

    const endpoints = result.extractedContracts.filter(
      (c) => c.category === "API_ENDPOINT"
    );
    expect(endpoints.some((c) => c.value === "/health")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ENV_VARIABLE extraction
// ---------------------------------------------------------------------------

describe("ENV_VARIABLE extraction", () => {
  it("extracts an all-caps identifier with underscores", async () => {
    const relPath = await writeDoc(
      "env.md",
      "Set DATABASE_MAX_POOL_SIZE to control connection pooling.\n"
    );

    const result = await extractDocumentationContracts({
      workspaceRoot: testDir,
      docRelPaths: [relPath],
    });

    const envVars = result.extractedContracts.filter(
      (c) => c.category === "ENV_VARIABLE"
    );
    expect(envVars.some((c) => c.value === "DATABASE_MAX_POOL_SIZE")).toBe(
      true
    );
  });

  it("extracts multiple env variables from the same line", async () => {
    const relPath = await writeDoc(
      "env.md",
      "Both DB_HOST and DB_PORT must be set.\n"
    );

    const result = await extractDocumentationContracts({
      workspaceRoot: testDir,
      docRelPaths: [relPath],
    });

    const envVars = result.extractedContracts.filter(
      (c) => c.category === "ENV_VARIABLE"
    );
    expect(envVars.some((c) => c.value === "DB_HOST")).toBe(true);
    expect(envVars.some((c) => c.value === "DB_PORT")).toBe(true);
  });

  it("does not extract a single uppercase word without underscores", async () => {
    const relPath = await writeDoc("env.md", "See the API documentation.\n");

    const result = await extractDocumentationContracts({
      workspaceRoot: testDir,
      docRelPaths: [relPath],
    });

    const envVars = result.extractedContracts.filter(
      (c) => c.category === "ENV_VARIABLE"
    );
    expect(envVars.some((c) => c.value === "API")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// FILE_DEPENDENCY extraction
// ---------------------------------------------------------------------------

describe("FILE_DEPENDENCY extraction", () => {
  it("extracts a relative TypeScript file path", async () => {
    const relPath = await writeDoc(
      "deps.md",
      "The config is loaded from src/config/database.ts at startup.\n"
    );

    const result = await extractDocumentationContracts({
      workspaceRoot: testDir,
      docRelPaths: [relPath],
    });

    const fileDeps = result.extractedContracts.filter(
      (c) => c.category === "FILE_DEPENDENCY"
    );
    expect(
      fileDeps.some((c) => c.value === "src/config/database.ts")
    ).toBe(true);
  });

  it("extracts a file path with a dot-only extension", async () => {
    const relPath = await writeDoc(
      "deps.md",
      "Configuration lives in config/settings.json.\n"
    );

    const result = await extractDocumentationContracts({
      workspaceRoot: testDir,
      docRelPaths: [relPath],
    });

    const fileDeps = result.extractedContracts.filter(
      (c) => c.category === "FILE_DEPENDENCY"
    );
    expect(
      fileDeps.some((c) => c.value === "config/settings.json")
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Empty file — no matching patterns
// ---------------------------------------------------------------------------

describe("empty file / no patterns", () => {
  it("returns an empty extractedContracts array for a file with no patterns", async () => {
    const relPath = await writeDoc(
      "empty.md",
      "This file has no contracts at all.\nJust plain prose.\n"
    );

    const result = await extractDocumentationContracts({
      workspaceRoot: testDir,
      docRelPaths: [relPath],
    });

    expect(result.extractedContracts).toHaveLength(0);
    // No error should be present for an accessible file with no patterns.
    expect(result.errors).toBeUndefined();
  });

  it("returns an empty extractedContracts array for a completely empty file", async () => {
    const relPath = await writeDoc("blank.md", "");

    const result = await extractDocumentationContracts({
      workspaceRoot: testDir,
      docRelPaths: [relPath],
    });

    expect(result.extractedContracts).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// FILE_NOT_FOUND error
// ---------------------------------------------------------------------------

describe("FILE_NOT_FOUND error", () => {
  it("returns a structured FILE_NOT_FOUND error for a non-existent path", async () => {
    const result = await extractDocumentationContracts({
      workspaceRoot: testDir,
      docRelPaths: ["does/not/exist.md"],
    });

    expect(result.errors).toBeDefined();
    expect(result.errors).toHaveLength(1);
    expect(result.errors![0]!.error.code).toBe("FILE_NOT_FOUND");
    expect(result.errors![0]!.error.path).toBe("does/not/exist.md");
  });

  it("continues processing remaining paths after a missing file", async () => {
    const validPath = await writeDoc(
      "valid.md",
      "Set DATABASE_URL for the connection string.\n"
    );

    const result = await extractDocumentationContracts({
      workspaceRoot: testDir,
      docRelPaths: ["missing.md", validPath],
    });

    // The missing file produces an error.
    expect(result.errors).toBeDefined();
    expect(result.errors!.some((e) => e.error.code === "FILE_NOT_FOUND")).toBe(
      true
    );

    // The valid file still produces contracts.
    expect(result.extractedContracts.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Sequential unique IDs across multiple files
// ---------------------------------------------------------------------------

describe("sequential unique IDs", () => {
  it("assigns sequential zero-padded IDs across multiple files", async () => {
    const file1 = await writeDoc(
      "a.md",
      "Set DB_HOST for the database host.\n"
    );
    const file2 = await writeDoc(
      "b.md",
      "Set DB_PORT for the database port.\n"
    );

    const result = await extractDocumentationContracts({
      workspaceRoot: testDir,
      docRelPaths: [file1, file2],
    });

    const ids = result.extractedContracts.map((c) => c.id);
    // All IDs must be unique.
    expect(new Set(ids).size).toBe(ids.length);
    // IDs must follow the contract_NNN format.
    for (const id of ids) {
      expect(id).toMatch(/^contract_\d+$/);
    }
    // IDs must be sequential starting from contract_001.
    expect(ids[0]).toBe("contract_001");
  });

  it("uses minimum 3-digit padding even for a single contract", async () => {
    const relPath = await writeDoc("single.md", "Set API_KEY for auth.\n");

    const result = await extractDocumentationContracts({
      workspaceRoot: testDir,
      docRelPaths: [relPath],
    });

    expect(result.extractedContracts).toHaveLength(1);
    expect(result.extractedContracts[0]!.id).toBe("contract_001");
  });
});

// ---------------------------------------------------------------------------
// Correct 1-indexed line numbers
// ---------------------------------------------------------------------------

describe("1-indexed line numbers", () => {
  it("records the correct 1-indexed line number for each contract", async () => {
    const content = [
      "This is line one with no contract.",
      "This is line two with no contract.",
      "Set DATABASE_URL on line three.",
      "This is line four with no contract.",
      "Set REDIS_URL on line five.",
    ].join("\n");

    const relPath = await writeDoc("lines.md", content);

    const result = await extractDocumentationContracts({
      workspaceRoot: testDir,
      docRelPaths: [relPath],
    });

    const dbUrl = result.extractedContracts.find(
      (c) => c.value === "DATABASE_URL"
    );
    const redisUrl = result.extractedContracts.find(
      (c) => c.value === "REDIS_URL"
    );

    expect(dbUrl).toBeDefined();
    expect(dbUrl!.sourceLine).toBe(3);

    expect(redisUrl).toBeDefined();
    expect(redisUrl!.sourceLine).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// rawContext equals full source line
// ---------------------------------------------------------------------------

describe("rawContext field", () => {
  it("populates rawContext with the full text of the source line", async () => {
    const contractLine =
      "The primary endpoint is /api/v1/orders for order management.";
    const content = `Preamble line.\n${contractLine}\nTrailing line.\n`;
    const relPath = await writeDoc("ctx.md", content);

    const result = await extractDocumentationContracts({
      workspaceRoot: testDir,
      docRelPaths: [relPath],
    });

    const endpoint = result.extractedContracts.find(
      (c) => c.category === "API_ENDPOINT"
    );
    expect(endpoint).toBeDefined();
    expect(endpoint!.rawContext).toBe(contractLine);
  });

  it("rawContext includes surrounding text, not just the matched value", async () => {
    const line = "Configure DB_PASSWORD in your environment before starting.";
    const relPath = await writeDoc("ctx2.md", line);

    const result = await extractDocumentationContracts({
      workspaceRoot: testDir,
      docRelPaths: [relPath],
    });

    const envVar = result.extractedContracts.find(
      (c) => c.value === "DB_PASSWORD"
    );
    expect(envVar).toBeDefined();
    // rawContext must be the full line, not just "DB_PASSWORD".
    expect(envVar!.rawContext).toBe(line);
    expect(envVar!.rawContext.length).toBeGreaterThan(
      envVar!.value.length
    );
  });
});

// ---------------------------------------------------------------------------
// sourceFile field
// ---------------------------------------------------------------------------

describe("sourceFile field", () => {
  it("populates sourceFile with the relative path from workspaceRoot", async () => {
    // The directory is automatically created by the updated writeDoc.
    const relPath = await writeDoc("docs/api.md", "Set API_TOKEN for auth.\n");

    const result = await extractDocumentationContracts({
      workspaceRoot: testDir,
      docRelPaths: ["docs/api.md"],
    });

    const contract = result.extractedContracts.find(
      (c) => c.value === "API_TOKEN"
    );
    expect(contract).toBeDefined();
    expect(contract!.sourceFile).toBe("docs/api.md");
  });
});
