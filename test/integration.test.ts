/**
 * End-to-end integration tests for Context Ghost.
 *
 * Validates the full pipeline:
 * extract_documentation_contracts -> verify_codebase_reality -> flag_documentation_drift
 */

import { describe, it, expect } from "vitest";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { extractDocumentationContracts } from "../src/extractor/ContractExtractor.js";
import { RealityVerifier } from "../src/verifier/RealityVerifier.js";
import { classifyDrift } from "../src/classifier/DriftClassifier.js";
import type { SearchTarget } from "../src/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const fixtureWorkspace = join(__dirname, "fixtures");

describe("Context Ghost E2E Pipeline", () => {
  it("executes the full extract -> verify -> classify flow", async () => {
    // 1. Extract Contracts
    const extractOutput = await extractDocumentationContracts({
      workspaceRoot: fixtureWorkspace,
      docRelPaths: ["docs/rules.md"]
    });

    expect(extractOutput.errors).toBeUndefined();
    const contracts = extractOutput.extractedContracts;
    expect(contracts.length).toBeGreaterThan(0);

    // 2. Verify Reality
    const searchTargets: SearchTarget[] = contracts.map(c => ({
      id: c.id,
      category: c.category,
      value: c.value
    }));

    const verifier = new RealityVerifier();
    const verifyOutput = await verifier.verify({
      workspaceRoot: fixtureWorkspace,
      searchTargets,
      excludePatterns: ["docs"]
    });

    if ("error" in verifyOutput) {
      throw new Error(`Verifier error: ${verifyOutput.error.message}`);
    }

    const matches = verifyOutput.verificationMatches;
    expect(matches.length).toBe(contracts.length);

    // 3. Classify Drift
    const classifyOutput = classifyDrift({ contracts, matches });
    
    const summary = classifyOutput.auditSummary;
    expect(summary.totalContractsEvaluated).toBe(contracts.length);
    expect(summary.validatedCount + summary.driftedCount + summary.ghostCount).toBe(contracts.length);

    // Assert exact matches are VALIDATED
    const authLogin = classifyOutput.discrepancies.find(d => d.expectedValue === "/api/v1/auth/login");
    expect(authLogin).toBeDefined();
    expect(authLogin!.status).toBe("VALIDATED");

    const dbUrl = classifyOutput.discrepancies.find(d => d.expectedValue === "DATABASE_URL");
    expect(dbUrl).toBeDefined();
    expect(dbUrl!.status).toBe("VALIDATED");

    const configTs = classifyOutput.discrepancies.find(d => d.expectedValue === "src/config/index.ts");
    expect(configTs).toBeDefined();
    expect(configTs!.status).toBe("VALIDATED");

    // Assert interpolated matches are DRIFTED
    const userProfile = classifyOutput.discrepancies.find(d => d.expectedValue === "/api/v1/users/:userId/profile");
    expect(userProfile).toBeDefined();
    expect(userProfile!.status).toBe("DRIFTED");

    // Assert inactive comments and missing files are GHOST
    const redisUrl = classifyOutput.discrepancies.find(d => d.expectedValue === "REDIS_CACHE_URL");
    expect(redisUrl).toBeDefined();
    expect(redisUrl!.status).toBe("GHOST");

    const ghostEndpoint = classifyOutput.discrepancies.find(d => d.expectedValue === "/api/v2/ghost/endpoint");
    expect(ghostEndpoint).toBeDefined();
    expect(ghostEndpoint!.status).toBe("GHOST");
  });
});
