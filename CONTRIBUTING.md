# Contributing to context-ghost

Contributions are welcome. This document covers how to set up the project locally, run tests, and submit changes.

---

## Prerequisites

- Node.js 20 or higher
- npm

---

## Setup

```bash
git clone https://github.com/srikar7777/Context-ghost.git
cd Context-ghost
npm install
```

---

## Running tests

```bash
npm test
```

The test suite includes unit tests, property-based tests (via fast-check), and an end-to-end integration test. All 42 tests must pass before submitting a PR.

---

## Type checking

```bash
npx tsc --noEmit
```

---

## Building

```bash
npm run build
```

Output goes to `dist/`. The compiled entry point is `dist/index.js`.

---

## Submitting changes

1. Fork the repository
2. Create a branch from `main` with a descriptive name (e.g. `fix/normalizer-edge-case`, `feat/file-dependency-detection`)
3. Make your changes
4. Ensure all tests pass and there are no TypeScript errors
5. Open a pull request against `main` with a clear description of what changed and why

---

## Code standards

- No emojis, internal slang, or decorative typography in source code or output payloads
- Inline comments must describe engineering intent — not restate what the code already expresses
- All tool response payloads must be valid JSON conforming to the registered schemas
- The server must remain strictly read-only — no tool may write to the filesystem

---

## Project structure

```
src/
  extractor/    ContractExtractor — parses markdown files
  verifier/     RealityVerifier + scanWorker — scans source code
  classifier/   DriftClassifier — produces the audit report
  index.ts      FastMCP server entry point
  types.ts      Shared interfaces
  constants.ts  Shared constants

test/
  extractor/    Unit and property tests for ContractExtractor
  verifier/     Unit and property tests for RealityVerifier
  classifier/   Unit and property tests for DriftClassifier
  fixtures/     Static workspace used by integration tests
  integration.test.ts  End-to-end pipeline test
```
