/**
 * Property-based tests for DriftClassifier.
 *
 * Validates properties 5 through 10.
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { classifyDrift } from "../../src/classifier/DriftClassifier.js";
import type { ExtractedContract, VerificationMatch, Occurrence, MatchType } from "../../src/types.js";

const contractArb = fc.record({
  id: fc.string({ minLength: 1 }),
  sourceFile: fc.string({ minLength: 1 }),
  sourceLine: fc.integer({ min: 1, max: 1000 }),
  category: fc.constantFrom("API_ENDPOINT", "ENV_VARIABLE", "FILE_DEPENDENCY") as fc.Arbitrary<"API_ENDPOINT" | "ENV_VARIABLE" | "FILE_DEPENDENCY">,
  value: fc.string({ minLength: 1 }),
  rawContext: fc.string(),
});

const matchTypeArb = fc.constantFrom("EXACT", "NORMALIZED", "INTERPOLATED", "INACTIVE_COMMENT") as fc.Arbitrary<MatchType>;

const occurrenceArb = fc.record({
  file: fc.string({ minLength: 1 }),
  line: fc.integer({ min: 1, max: 1000 }),
  matchedText: fc.string(),
  matchType: matchTypeArb,
});

describe("Property 5: Comment occurrences do not produce VALIDATED status", () => {
  it("Assigns GHOST when all occurrences are INACTIVE_COMMENT", () => {
    fc.assert(
      fc.property(
        contractArb,
        fc.array(occurrenceArb.map(o => ({ ...o, matchType: "INACTIVE_COMMENT" as const })), { minLength: 1, maxLength: 5 }),
        (contract, occurrences) => {
          const match: VerificationMatch = { targetValue: contract.value, occurrences };
          const output = classifyDrift({ contracts: [contract], matches: [match] });
          return output.discrepancies[0]!.status === "GHOST";
        }
      )
    );
  });
});

describe("Property 6: Audit summary counts are consistent with discrepancies", () => {
  it("Sum of statuses equals totalContractsEvaluated and discrepancies.length", () => {
    fc.assert(
      fc.property(
        fc.array(contractArb, { maxLength: 20 }),
        fc.array(fc.record({
          targetValue: fc.string(),
          occurrences: fc.array(occurrenceArb, { maxLength: 5 })
        }), { maxLength: 20 }),
        (contracts, matches) => {
          const output = classifyDrift({ contracts, matches });
          const sum = output.auditSummary.validatedCount + output.auditSummary.driftedCount + output.auditSummary.ghostCount;
          return sum === contracts.length && output.discrepancies.length === contracts.length;
        }
      )
    );
  });
});

describe("Property 7: Classification is exhaustive and mutually exclusive", () => {
  it("Assigns exactly one status following precedence rules", () => {
    fc.assert(
      fc.property(
        contractArb,
        fc.array(occurrenceArb, { maxLength: 10 }),
        (contract, occurrences) => {
          const match: VerificationMatch = { targetValue: contract.value, occurrences };
          const output = classifyDrift({ contracts: [contract], matches: [match] });
          const status = output.discrepancies[0]!.status;
          
          const hasActiveExactOrNorm = occurrences.some(o => o.matchType === "EXACT" || o.matchType === "NORMALIZED");
          const hasActiveInterpolated = occurrences.some(o => o.matchType === "INTERPOLATED");

          if (hasActiveExactOrNorm) {
            return status === "VALIDATED";
          } else if (hasActiveInterpolated) {
            return status === "DRIFTED";
          } else {
            return status === "GHOST";
          }
        }
      )
    );
  });
});

describe("Property 8: DRIFTED explanation references source location", () => {
  it("Explanation and fix contain required references for DRIFTED", () => {
    fc.assert(
      fc.property(
        contractArb,
        occurrenceArb.map(o => ({ ...o, matchType: "INTERPOLATED" as const })),
        (contract, interpolatedOcc) => {
          const match: VerificationMatch = { targetValue: contract.value, occurrences: [interpolatedOcc] };
          const output = classifyDrift({ contracts: [contract], matches: [match] });
          const disc = output.discrepancies[0]!;
          
          if (disc.status !== "DRIFTED") return false;

          const expHasSource = disc.explanation.includes(interpolatedOcc.file) && disc.explanation.includes(interpolatedOcc.line.toString());
          const fixHasDoc = disc.suggestedFix !== null && disc.suggestedFix.includes(contract.sourceFile) && disc.suggestedFix.includes(contract.sourceLine.toString());

          return expHasSource && fixHasDoc;
        }
      )
    );
  });
});

describe("Property 9: GHOST explanation and fix are non-null and contain no decorative content", () => {
  it("GHOST fields are clean", () => {
    fc.assert(
      fc.property(
        contractArb,
        (contract) => {
          const match: VerificationMatch = { targetValue: contract.value, occurrences: [] };
          const output = classifyDrift({ contracts: [contract], matches: [match] });
          const disc = output.discrepancies[0]!;
          
          if (disc.status !== "GHOST") return false;
          if (disc.suggestedFix === null) return false;

          // very simple heuristic to check for emojis / decorative characters
          // JS strings contain no emojis if they don't have surrogate pairs or high code points usually
          // but we can just check against a basic regex.
          const hasEmoji = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u.test(disc.explanation) || /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u.test(disc.suggestedFix);
          return !hasEmoji;
        }
      )
    );
  });
});

describe("Property 10: VALIDATED contracts have null suggestedFix", () => {
  it("suggestedFix is null for VALIDATED", () => {
    fc.assert(
      fc.property(
        contractArb,
        occurrenceArb.map(o => ({ ...o, matchType: "EXACT" as const })),
        (contract, exactOcc) => {
          const match: VerificationMatch = { targetValue: contract.value, occurrences: [exactOcc] };
          const output = classifyDrift({ contracts: [contract], matches: [match] });
          return output.discrepancies[0]!.status === "VALIDATED" && output.discrepancies[0]!.suggestedFix === null;
        }
      )
    );
  });
});
