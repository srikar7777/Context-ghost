/**
 * Shared type definitions for the Context Ghost MCP server.
 *
 * These types flow through the three-component pipeline:
 *   ContractExtractor → RealityVerifier → DriftClassifier
 */

// ---------------------------------------------------------------------------
// Primitive type aliases
// ---------------------------------------------------------------------------

/** The three categories of structural contract that can be extracted from markdown. */
export type ContractCategory = "API_ENDPOINT" | "ENV_VARIABLE" | "FILE_DEPENDENCY";

/**
 * How a contract value was matched against a source line.
 *
 * - EXACT: literal string match
 * - NORMALIZED: match after stripping slashes and lowercasing both sides
 * - INTERPOLATED: all static path tokens of an API_ENDPOINT appear in the line
 * - INACTIVE_COMMENT: match found, but the line is prefixed by a comment token
 */
export type MatchType = "EXACT" | "NORMALIZED" | "INTERPOLATED" | "INACTIVE_COMMENT";

/** The classification assigned to each contract after diffing against codebase occurrences. */
export type ClassificationStatus = "VALIDATED" | "DRIFTED" | "GHOST";

// ---------------------------------------------------------------------------
// ContractExtractor interfaces
// ---------------------------------------------------------------------------

/** Input accepted by the ContractExtractor. */
export interface ExtractorInput {
  /** Absolute path to the project workspace root. */
  workspaceRoot: string;
  /** Relative paths (from workspaceRoot) to the markdown files to parse. */
  docRelPaths: string[];
}

/** A single structural assertion extracted from a markdown file. */
export interface ExtractedContract {
  /** Sequential zero-padded identifier scoped to one invocation, e.g. "contract_001". */
  id: string;
  /** Relative path from workspaceRoot to the markdown file that contains this contract. */
  sourceFile: string;
  /** 1-indexed line number within sourceFile where the contract was found. */
  sourceLine: number;
  /** The category of the extracted contract. */
  category: ContractCategory;
  /** The extracted contract value (e.g. "/api/v1/users", "DATABASE_URL", "src/config.ts"). */
  value: string;
  /** Full raw text of the source line from which the contract was extracted. */
  rawContext: string;
}

/** Output returned by the ContractExtractor. */
export interface ExtractorOutput {
  extractedContracts: ExtractedContract[];
}

// ---------------------------------------------------------------------------
// RealityVerifier interfaces
// ---------------------------------------------------------------------------

/** A single contract value to search for in the codebase. */
export interface SearchTarget {
  /** Contract ID from the extractor output, used to correlate results. */
  id: string;
  /** Category of the contract, used to select the appropriate matching strategy. */
  category: ContractCategory;
  /** The value to search for. */
  value: string;
}

/** A located instance of a contract value within a source file. */
export interface Occurrence {
  /** Relative path from workspaceRoot to the file containing the match. */
  file: string;
  /** 1-indexed line number within the file. */
  line: number;
  /** Full text of the matched line. */
  matchedText: string;
  /** How the match was found. Absent when the match type is not yet determined. */
  matchType?: MatchType;
}

/** All occurrences found for a single search target. */
export interface VerificationMatch {
  /** The contract value that was searched for. */
  targetValue: string;
  /** All located occurrences of the target value across the scanned workspace. */
  occurrences: Occurrence[];
}

/** Output returned by the RealityVerifier. */
export interface VerifierOutput {
  verificationMatches: VerificationMatch[];
  /** Files that could not be scanned due to worker thread failures. */
  warnings?: string[];
}

// ---------------------------------------------------------------------------
// Worker thread interfaces (scanWorker ↔ RealityVerifier)
// ---------------------------------------------------------------------------

/** Message sent from the main thread to a scan worker. */
export interface WorkerInput {
  /** Absolute paths of the files this worker is responsible for scanning. */
  files: string[];
  /** The set of contract values to search for within each file. */
  targets: SearchTarget[];
  /** Absolute path to the workspace root, used to compute relative file paths. */
  workspaceRoot: string;
}

/** Message sent from a scan worker back to the main thread. */
export interface WorkerOutput {
  /** Occurrences keyed by target value. */
  matches: Record<string, Occurrence[]>;
}

// ---------------------------------------------------------------------------
// DriftClassifier interfaces
// ---------------------------------------------------------------------------

/** Input accepted by the DriftClassifier. */
export interface ClassifierInput {
  /** All contracts extracted by the ContractExtractor. */
  contracts: ExtractedContract[];
  /** All verification matches produced by the RealityVerifier. */
  matches: VerificationMatch[];
}

/**
 * A single classified contract entry in the audit report.
 *
 * Every input contract produces exactly one Discrepancy.
 */
export interface Discrepancy {
  /** Category of the contract. */
  category: ContractCategory;
  /** The contract value as it appears in the documentation. */
  expectedValue: string;
  /** Location of the contract in the documentation file. */
  docLocation: {
    file: string;
    line: number;
  };
  /** Classification result for this contract. */
  status: ClassificationStatus;
  /**
   * Human-readable explanation of the classification.
   * Contains no emojis, subjective commentary, or decorative typography.
   */
  explanation: string;
  /**
   * Concrete remediation instruction.
   * Null for VALIDATED contracts; non-null for DRIFTED and GHOST contracts.
   */
  suggestedFix: string | null;
}

/** Aggregate counts across all classified contracts. */
export interface AuditSummary {
  /** Total number of contracts evaluated; equals contracts.length from ClassifierInput. */
  totalContractsEvaluated: number;
  /** Number of contracts classified as VALIDATED. */
  validatedCount: number;
  /** Number of contracts classified as DRIFTED. */
  driftedCount: number;
  /** Number of contracts classified as GHOST. */
  ghostCount: number;
}

/** Output returned by the DriftClassifier. */
export interface ClassifierOutput {
  auditSummary: AuditSummary;
  /** One entry per input contract, in the same order as ClassifierInput.contracts. */
  discrepancies: Discrepancy[];
}
