/**
 * Unit tests for RealityVerifier and scanWorker.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.7, 3.8, 4.1, 4.2, 5.1, 5.2, 5.3, 6.1, 6.2
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "os";
import { join } from "path";
import { writeFile, mkdir, rm } from "fs/promises";
import { randomUUID } from "crypto";
import { RealityVerifier } from "../../src/verifier/RealityVerifier.js";
import type { SearchTarget } from "../../src/types.js";

// ---------------------------------------------------------------------------
// Test fixture helpers
// ---------------------------------------------------------------------------

let testDir: string;
let verifier: RealityVerifier;

beforeEach(async () => {
  testDir = join(tmpdir(), `cg-unit-verifier-${randomUUID()}`);
  await mkdir(testDir, { recursive: true });
  verifier = new RealityVerifier();
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

async function writeSource(filename: string, content: string): Promise<string> {
  const { dirname } = await import("path");
  const filePath = join(testDir, filename);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf-8");
  return filename;
}

// ---------------------------------------------------------------------------
// RealityVerifier Unit Tests
// ---------------------------------------------------------------------------

describe("RealityVerifier", () => {
  it("Returns exact match occurrence with correct file and line", async () => {
    await writeSource("src/config.ts", "const PORT = process.env.PORT || 3000;\nconsole.log(PORT);");
    const targets: SearchTarget[] = [{ id: "c1", category: "ENV_VARIABLE", value: "process.env.PORT" }];
    
    const result = await verifier.verify({ workspaceRoot: testDir, searchTargets: targets });
    if ("error" in result) throw new Error("Expected VerifierOutput");
    
    expect(result.verificationMatches).toHaveLength(1);
    const match = result.verificationMatches[0]!;
    expect(match.occurrences).toHaveLength(1);
    expect(match.occurrences[0]!.matchType).toBe("EXACT");
    expect(match.occurrences[0]!.file).toBe("src/config.ts");
    expect(match.occurrences[0]!.line).toBe(1);
  });

  it("Returns normalized match when exact match fails due to slash/case differences", async () => {
    await writeSource("src/api.ts", 'app.get("/API/v1/USERS/", (req, res) => {});');
    const targets: SearchTarget[] = [{ id: "c1", category: "API_ENDPOINT", value: "/api/v1/users" }];
    
    const result = await verifier.verify({ workspaceRoot: testDir, searchTargets: targets });
    if ("error" in result) throw new Error("Expected VerifierOutput");
    
    expect(result.verificationMatches[0]!.occurrences).toHaveLength(1);
    expect(result.verificationMatches[0]!.occurrences[0]!.matchType).toBe("NORMALIZED");
  });

  it("Returns interpolated match for a dynamic route with all static tokens present", async () => {
    await writeSource("src/routes.ts", 'router.post("/api/v2/users/:userId/profile", handler);');
    const targets: SearchTarget[] = [{ id: "c1", category: "API_ENDPOINT", value: "/api/v2/users/{id}/profile" }];
    
    const result = await verifier.verify({ workspaceRoot: testDir, searchTargets: targets });
    if ("error" in result) throw new Error("Expected VerifierOutput");
    
    expect(result.verificationMatches[0]!.occurrences).toHaveLength(1);
    expect(result.verificationMatches[0]!.occurrences[0]!.matchType).toBe("INTERPOLATED");
  });

  it("Annotates commented lines as INACTIVE_COMMENT", async () => {
    await writeSource("src/old.ts", '  // const db = process.env.DATABASE_URL;\n  * router.get("/api/test");\n# DB_HOST=localhost');
    const targets: SearchTarget[] = [
      { id: "c1", category: "ENV_VARIABLE", value: "DATABASE_URL" },
      { id: "c2", category: "API_ENDPOINT", value: "/api/test" },
      { id: "c3", category: "ENV_VARIABLE", value: "DB_HOST" }
    ];
    
    const result = await verifier.verify({ workspaceRoot: testDir, searchTargets: targets });
    if ("error" in result) throw new Error("Expected VerifierOutput");
    
    const dbUrlMatch = result.verificationMatches.find((m) => m.targetValue === "DATABASE_URL");
    const apiTestMatch = result.verificationMatches.find((m) => m.targetValue === "/api/test");
    const dbHostMatch = result.verificationMatches.find((m) => m.targetValue === "DB_HOST");

    expect(dbUrlMatch!.occurrences[0]!.matchType).toBe("INACTIVE_COMMENT");
    expect(apiTestMatch!.occurrences[0]!.matchType).toBe("INACTIVE_COMMENT");
    expect(dbHostMatch!.occurrences[0]!.matchType).toBe("INACTIVE_COMMENT");
  });

  it("Skips default excluded directories (node_modules, .git, dist, build)", async () => {
    await writeSource("node_modules/pkg/index.js", "const SECRET = 'foo';");
    await writeSource(".git/config", "SECRET");
    await writeSource("dist/app.js", "SECRET");
    await writeSource("build/main.js", "SECRET");
    await writeSource("src/app.js", "const SECRET = 'bar';");

    const targets: SearchTarget[] = [{ id: "c1", category: "ENV_VARIABLE", value: "SECRET" }];
    
    const result = await verifier.verify({ workspaceRoot: testDir, searchTargets: targets });
    if ("error" in result) throw new Error("Expected VerifierOutput");
    
    expect(result.verificationMatches[0]!.occurrences).toHaveLength(1);
    expect(result.verificationMatches[0]!.occurrences[0]!.file).toBe("src/app.js");
  });

  it("Respects additional excludePatterns entries", async () => {
    await writeSource("coverage/report.json", '"TARGET"');
    await writeSource("src/main.ts", 'console.log("TARGET")');

    const targets: SearchTarget[] = [{ id: "c1", category: "ENV_VARIABLE", value: "TARGET" }];
    
    const result = await verifier.verify({ workspaceRoot: testDir, searchTargets: targets, excludePatterns: ["coverage"] });
    if ("error" in result) throw new Error("Expected VerifierOutput");
    
    expect(result.verificationMatches[0]!.occurrences).toHaveLength(1);
    expect(result.verificationMatches[0]!.occurrences[0]!.file).toBe("src/main.ts");
  });

  it("Returns empty occurrences array when no match is found", async () => {
    await writeSource("src/main.ts", 'console.log("hello")');

    const targets: SearchTarget[] = [{ id: "c1", category: "ENV_VARIABLE", value: "MISSING_VAR" }];
    
    const result = await verifier.verify({ workspaceRoot: testDir, searchTargets: targets });
    if ("error" in result) throw new Error("Expected VerifierOutput");
    
    expect(result.verificationMatches[0]!.occurrences).toHaveLength(0);
  });

  it("Returns structured error for an invalid workspaceRoot", async () => {
    const targets: SearchTarget[] = [{ id: "c1", category: "ENV_VARIABLE", value: "FOO" }];
    const result = await verifier.verify({ workspaceRoot: join(testDir, "does-not-exist"), searchTargets: targets });
    
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error.code).toBe("INVALID_WORKSPACE");
    }
  });
});
