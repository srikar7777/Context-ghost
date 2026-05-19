/**
 * Shared constants for the Context Ghost MCP server.
 */

/**
 * Directory names excluded from codebase traversal by default.
 * These directories are skipped regardless of whether the caller supplies
 * additional excludePatterns.
 */
export const DEFAULT_EXCLUDE_PATTERNS: string[] = [
  "node_modules",
  ".git",
  "dist",
  "build",
];
