# context-ghost

A Model Context Protocol (MCP) server that detects drift between markdown documentation and live codebase reality.

Documentation in large codebases becomes stale. Engineers update API routes, rename environment variables, and move files — but the markdown rarely keeps up. context-ghost treats your documentation as a testable contract and tells you exactly what no longer matches the code.

---

## How it works

Three tools form a sequential pipeline:

**`extract_documentation_contracts`**  
Parses markdown files and extracts structural assertions — API endpoint paths, environment variable names, and file dependencies.

**`verify_codebase_reality`**  
Recursively traverses the workspace and locates occurrences of each extracted contract in the source code. Uses a worker thread pool for concurrent file scanning on large repositories.

**`flag_documentation_drift`**  
Diffs contracts against codebase occurrences and classifies each one:

| Status | Meaning |
|---|---|
| `VALIDATED` | An active match was found in the source code |
| `DRIFTED` | No exact match, but a structurally similar occurrence was detected |
| `GHOST` | No match of any kind was found |

Each discrepancy includes a human-readable explanation and a concrete `suggestedFix` referencing the exact file and line number.

---

## Matching strategy

The verifier applies three strategies in order per line, stopping at the first match:

1. **Exact** — literal string match
2. **Normalized** — strips leading/trailing slashes and lowercases both sides
3. **Interpolated** (API endpoints only) — decomposes the contract into static path tokens and checks all tokens appear in the source line

Comment detection runs after any match. Lines prefixed with `//`, `#`, or `*` are annotated `INACTIVE_COMMENT` and do not count as active occurrences.

---

## Installation

Requires Node.js 20+.

```bash
git clone https://github.com/srikar7777/Context-ghost.git
cd Context-ghost
npm install
npm run build
```

---

## Client configuration

context-ghost runs over stdio and works with any MCP-compatible client.

### Kiro

Add to `.kiro/settings/mcp.json` in your workspace, or `~/.kiro/settings/mcp.json` for user-level access:

```json
{
  "mcpServers": {
    "context-ghost": {
      "command": "node",
      "args": ["/absolute/path/to/Context-ghost/dist/index.js"],
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "context-ghost": {
      "command": "node",
      "args": ["/absolute/path/to/Context-ghost/dist/index.js"]
    }
  }
}
```

### Claude Code CLI

```bash
claude mcp add context-ghost node /absolute/path/to/Context-ghost/dist/index.js
```

### Cursor / Windsurf / Aide

Point to `node dist/index.js` in your IDE's MCP server settings.

---

## Tool reference

### extract_documentation_contracts

```json
{
  "workspaceRoot": "/absolute/path/to/project",
  "docRelPaths": ["README.md", "docs/ARCH-RULES.md"]
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `workspaceRoot` | string | yes | Absolute path to the project root |
| `docRelPaths` | string[] | yes | Relative paths to markdown files to parse |

Returns `extractedContracts[]` — each with `id`, `sourceFile`, `sourceLine`, `category`, `value`, `rawContext`.

---

### verify_codebase_reality

```json
{
  "workspaceRoot": "/absolute/path/to/project",
  "searchTargets": [
    { "id": "contract_001", "category": "API_ENDPOINT", "value": "/api/v2/users/profile" },
    { "id": "contract_002", "category": "ENV_VARIABLE", "value": "DATABASE_MAX_POOL_SIZE" }
  ],
  "excludePatterns": ["coverage", "tmp"]
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `workspaceRoot` | string | yes | Absolute path to the project root |
| `searchTargets` | object[] | yes | Contracts from `extract_documentation_contracts` |
| `excludePatterns` | string[] | no | Additional directories to skip (default excludes: `node_modules`, `.git`, `dist`, `build`) |

Returns `verificationMatches[]` — each occurrence annotated with `matchType`: `EXACT`, `NORMALIZED`, `INTERPOLATED`, or `INACTIVE_COMMENT`.

---

### flag_documentation_drift

```json
{
  "contracts": [...],
  "matches": [...]
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `contracts` | object[] | yes | Output of `extract_documentation_contracts` |
| `matches` | object[] | yes | Output of `verify_codebase_reality` |

Returns `auditSummary` with counts and `discrepancies[]` — each with `status`, `explanation`, and `suggestedFix`.

---

## Development

```bash
npm test          # run all tests (42 tests: unit, property-based, integration)
npx tsc --noEmit  # type check
npm run build     # compile to dist/
```

---

## Constraints

- **Read-only** — the server never writes to the filesystem
- **No cloud dependencies** — runs entirely locally, no API keys required
- **stdio only** — communicates over standard input/output using JSON-RPC 2.0

---

## License

MIT
