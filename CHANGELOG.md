# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

## [1.0.0] - 2025-01-01

### Added
- `extract_documentation_contracts` tool — parses markdown files and extracts `API_ENDPOINT`, `ENV_VARIABLE`, and `FILE_DEPENDENCY` contracts with 1-indexed source locations
- `verify_codebase_reality` tool — recursively scans the workspace for contract occurrences using a worker thread pool; supports exact, normalized, and interpolated matching with comment detection
- `flag_documentation_drift` tool — classifies each contract as `VALIDATED`, `DRIFTED`, or `GHOST` with human-readable explanations and suggested fixes
- FastMCP server entry point over stdio using JSON-RPC 2.0
- GitHub Actions CI workflow running on Node.js 20.x and 22.x
- MIT license
- Contributing guide
- Worker fallback for environments where TypeScript worker files cannot be loaded directly
- Prototype pollution protection in scan result maps
