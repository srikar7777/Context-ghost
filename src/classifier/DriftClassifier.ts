import type {
  ClassifierInput,
  ClassifierOutput,
  Discrepancy,
  AuditSummary,
  Occurrence,
} from "../types.js";

export function classifyDrift(input: ClassifierInput): ClassifierOutput {
  const { contracts, matches } = input;

  let validatedCount = 0;
  let driftedCount = 0;
  let ghostCount = 0;

  const discrepancies: Discrepancy[] = contracts.map((contract) => {
    // Find matching occurrences
    const matchGroup = matches.find((m) => m.targetValue === contract.value);
    const occurrences = matchGroup ? matchGroup.occurrences : [];

    // Separate occurrences by type
    let activeOccurrence: Occurrence | undefined;
    let interpolatedOccurrence: Occurrence | undefined;

    for (const occ of occurrences) {
      if (occ.matchType !== "INACTIVE_COMMENT") {
        activeOccurrence = occ;
        // In this implementation, if we find any exact or normalized match, we use it.
        // We can break early if we find an exact/normalized, but interpolated is a fallback for DRIFTED.
        if (occ.matchType === "EXACT" || occ.matchType === "NORMALIZED") {
          break; // This is the best we can get
        } else if (occ.matchType === "INTERPOLATED") {
          interpolatedOccurrence = occ;
        }
      }
    }

    let status: "VALIDATED" | "DRIFTED" | "GHOST";
    let explanation: string;
    let suggestedFix: string | null;

    if (activeOccurrence && (activeOccurrence.matchType === "EXACT" || activeOccurrence.matchType === "NORMALIZED")) {
      status = "VALIDATED";
      explanation = `Exact or normalized match located inside ${activeOccurrence.file} at line ${activeOccurrence.line}.`;
      suggestedFix = null;
      validatedCount++;
    } else if (interpolatedOccurrence) {
      status = "DRIFTED";
      explanation = `The exact path configuration ${contract.value} was not found in any source files. However, a structural variation was detected in ${interpolatedOccurrence.file} at line ${interpolatedOccurrence.line}.`;
      suggestedFix = `Update line ${contract.sourceLine} of ${contract.sourceFile} to reflect the implementation found at ${interpolatedOccurrence.file} line ${interpolatedOccurrence.line}: ${interpolatedOccurrence.matchedText.trim()}`;
      driftedCount++;
    } else {
      status = "GHOST";
      explanation = `No active occurrences of ${contract.value} were found in the scanned files.`;
      suggestedFix = `Add the missing implementation to the codebase, or remove the stale entry at line ${contract.sourceLine} of ${contract.sourceFile}.`;
      ghostCount++;
    }

    return {
      category: contract.category,
      expectedValue: contract.value,
      docLocation: {
        file: contract.sourceFile,
        line: contract.sourceLine,
      },
      status,
      explanation,
      suggestedFix,
    };
  });

  const auditSummary: AuditSummary = {
    totalContractsEvaluated: contracts.length,
    validatedCount,
    driftedCount,
    ghostCount,
  };

  return {
    auditSummary,
    discrepancies,
  };
}
