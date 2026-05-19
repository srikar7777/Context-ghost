/**
 * Unit tests for DriftClassifier.
 *
 * Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 8.1, 8.2, 8.3, 8.4, 8.5
 */

import { describe, it, expect } from "vitest";
import { classifyDrift } from "../../src/classifier/DriftClassifier.js";
import type { ExtractedContract, VerificationMatch, Occurrence } from "../../src/types.js";

const dummyContract: ExtractedContract = {
  id: "contract_001",
  sourceFile: "docs/api.md",
  sourceLine: 10,
  category: "API_ENDPOINT",
  value: "/api/v1/users",
  rawContext: "Endpoint: /api/v1/users",
};

describe("DriftClassifier", () => {
  it("Classifies contract as VALIDATED when an active occurrence exists", () => {
    const match: VerificationMatch = {
      targetValue: "/api/v1/users",
      occurrences: [
        { file: "src/app.ts", line: 5, matchedText: "app.get('/api/v1/users')", matchType: "EXACT" }
      ]
    };
    
    const output = classifyDrift({ contracts: [dummyContract], matches: [match] });
    
    expect(output.discrepancies[0]!.status).toBe("VALIDATED");
    expect(output.discrepancies[0]!.suggestedFix).toBeNull();
    expect(output.auditSummary.validatedCount).toBe(1);
    expect(output.auditSummary.totalContractsEvaluated).toBe(1);
  });

  it("Classifies contract as DRIFTED when only an INTERPOLATED occurrence exists", () => {
    const match: VerificationMatch = {
      targetValue: "/api/v1/users",
      occurrences: [
        { file: "src/app.ts", line: 5, matchedText: "app.get(`/api/v1/${resource}`)", matchType: "INTERPOLATED" }
      ]
    };
    
    const output = classifyDrift({ contracts: [dummyContract], matches: [match] });
    
    expect(output.discrepancies[0]!.status).toBe("DRIFTED");
    expect(output.discrepancies[0]!.suggestedFix).toContain("docs/api.md");
    expect(output.discrepancies[0]!.explanation).toContain("src/app.ts");
    expect(output.auditSummary.driftedCount).toBe(1);
  });

  it("Classifies contract as GHOST when no occurrences exist", () => {
    const match: VerificationMatch = {
      targetValue: "/api/v1/users",
      occurrences: []
    };
    
    const output = classifyDrift({ contracts: [dummyContract], matches: [match] });
    
    expect(output.discrepancies[0]!.status).toBe("GHOST");
    expect(output.discrepancies[0]!.suggestedFix).toContain("missing implementation");
    expect(output.auditSummary.ghostCount).toBe(1);
  });

  it("Classifies contract as GHOST when all occurrences are INACTIVE_COMMENT", () => {
    const match: VerificationMatch = {
      targetValue: "/api/v1/users",
      occurrences: [
        { file: "src/app.ts", line: 5, matchedText: "// app.get('/api/v1/users')", matchType: "INACTIVE_COMMENT" }
      ]
    };
    
    const output = classifyDrift({ contracts: [dummyContract], matches: [match] });
    
    expect(output.discrepancies[0]!.status).toBe("GHOST");
    expect(output.auditSummary.ghostCount).toBe(1);
  });

  it("auditSummary counts sum to totalContractsEvaluated and each appears exactly once", () => {
    const c1: ExtractedContract = { ...dummyContract, id: "c1", value: "v1" };
    const c2: ExtractedContract = { ...dummyContract, id: "c2", value: "v2" };
    const c3: ExtractedContract = { ...dummyContract, id: "c3", value: "v3" };

    const matches: VerificationMatch[] = [
      { targetValue: "v1", occurrences: [{ file: "f", line: 1, matchedText: "", matchType: "EXACT" }] },
      { targetValue: "v2", occurrences: [{ file: "f", line: 1, matchedText: "", matchType: "INTERPOLATED" }] },
      { targetValue: "v3", occurrences: [] },
    ];

    const output = classifyDrift({ contracts: [c1, c2, c3], matches });
    
    expect(output.auditSummary.totalContractsEvaluated).toBe(3);
    expect(output.auditSummary.validatedCount).toBe(1);
    expect(output.auditSummary.driftedCount).toBe(1);
    expect(output.auditSummary.ghostCount).toBe(1);

    expect(output.discrepancies).toHaveLength(3);
    expect(output.discrepancies.map(d => d.expectedValue)).toEqual(["v1", "v2", "v3"]);
  });
});
