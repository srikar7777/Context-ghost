import { Worker } from "node:worker_threads";
import { readdir, stat } from "node:fs/promises";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import * as os from "node:os";
import { DEFAULT_EXCLUDE_PATTERNS } from "../constants.js";
import { scanFile } from "./scanFile.js";
import type {
  SearchTarget,
  VerificationMatch,
  VerifierOutput,
  WorkerInput,
  WorkerOutput,
  Occurrence,
} from "../types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// In compiled production mode the file extension is .js; under Vitest it is .ts.
const workerFile = extname(__filename) === ".ts" ? "scanWorker.ts" : "scanWorker.js";
const WORKER_PATH = join(__dirname, workerFile);

export interface InvalidWorkspaceError {
  error: {
    code: "INVALID_WORKSPACE";
    path: string;
    message: string;
  };
}

export interface VerifierInput {
  workspaceRoot: string;
  searchTargets: SearchTarget[];
  excludePatterns?: string[];
}

export class RealityVerifier {
  public async verify(
    input: VerifierInput
  ): Promise<VerifierOutput | InvalidWorkspaceError> {
    const { workspaceRoot, searchTargets, excludePatterns = [] } = input;

    // Validate workspaceRoot is an accessible directory.
    try {
      const stats = await stat(workspaceRoot);
      if (!stats.isDirectory()) {
        throw new Error("Not a directory");
      }
    } catch {
      return {
        error: {
          code: "INVALID_WORKSPACE",
          path: workspaceRoot,
          message:
            "The specified workspace root does not resolve to an accessible directory.",
        },
      };
    }

    // Recursively collect all source files, skipping excluded directories.
    const excludes = new Set([...DEFAULT_EXCLUDE_PATTERNS, ...excludePatterns]);
    const allFiles: string[] = [];

    async function traverse(currentDir: string): Promise<void> {
      let entries;
      try {
        entries = await readdir(currentDir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (excludes.has(entry.name)) continue;
        const fullPath = join(currentDir, entry.name);
        if (entry.isDirectory()) {
          await traverse(fullPath);
        } else if (entry.isFile()) {
          allFiles.push(fullPath);
        }
      }
    }

    await traverse(workspaceRoot);

    if (allFiles.length === 0 || searchTargets.length === 0) {
      return {
        verificationMatches: searchTargets.map((t) => ({
          targetValue: t.value,
          occurrences: [],
        })),
      };
    }

    const mergedMatches: Record<string, Occurrence[]> = Object.create(null) as Record<string, Occurrence[]>;
    for (const target of searchTargets) {
      mergedMatches[target.value] = [];
    }

    const warnings: string[] = [];

    // Attempt worker-based concurrent scanning. If workers fail to load
    // (e.g. TypeScript source files in a CI environment without a TS loader),
    // fall back to scanning files directly in the main thread.
    const workerLoadable = await this.probeWorker();

    if (workerLoadable) {
      const maxWorkers = Math.min(os.cpus().length, 8);
      const numWorkers = Math.min(maxWorkers, allFiles.length);
      const chunkSize = Math.ceil(allFiles.length / numWorkers);
      const chunks: string[][] = [];
      for (let i = 0; i < allFiles.length; i += chunkSize) {
        chunks.push(allFiles.slice(i, i + chunkSize));
      }

      await Promise.all(
        chunks.map(
          (chunk) =>
            new Promise<void>((resolve) => {
              const worker = new Worker(WORKER_PATH, {
                execArgv: process.execArgv,
              });
              const workerInput: WorkerInput = {
                files: chunk,
                targets: searchTargets,
                workspaceRoot,
              };
              let resolved = false;

              worker.on("message", (output: WorkerOutput) => {
                for (const [targetValue, occurrences] of Object.entries(
                  output.matches
                )) {
                  if (mergedMatches[targetValue]) {
                    mergedMatches[targetValue].push(...occurrences);
                  }
                }
                if (!resolved) {
                  resolved = true;
                  resolve();
                  worker.terminate();
                }
              });

              worker.on("error", () => {
                warnings.push(...chunk);
                if (!resolved) {
                  resolved = true;
                  resolve();
                  worker.terminate();
                }
              });

              worker.on("exit", (code) => {
                if (code !== 0) warnings.push(...chunk);
                if (!resolved) {
                  resolved = true;
                  resolve();
                  worker.terminate();
                }
              });

              worker.postMessage(workerInput);
            })
        )
      );
    } else {
      // Direct scan fallback used when worker threads cannot load the source file.
      for (const file of allFiles) {
        const fileMatches = await scanFile(file, searchTargets, workspaceRoot);
        for (const [targetValue, occurrences] of Object.entries(fileMatches)) {
          if (mergedMatches[targetValue]) {
            mergedMatches[targetValue].push(...occurrences);
          }
        }
      }
    }

    const verificationMatches: VerificationMatch[] = searchTargets.map(
      (target) => {
        const occurrences = (mergedMatches[target.value] ?? []).sort((a, b) =>
          a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file)
        );
        return { targetValue: target.value, occurrences };
      }
    );

    const output: VerifierOutput = { verificationMatches };
    if (warnings.length > 0) {
      output.warnings = Array.from(new Set(warnings));
    }
    return output;
  }

  /**
   * Spawns a minimal worker to verify the worker file is loadable in the
   * current runtime environment. Returns true if the worker starts without
   * error, false otherwise.
   */
  private probeWorker(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const worker = new Worker(WORKER_PATH, { execArgv: process.execArgv });
        const timer = setTimeout(() => {
          worker.terminate();
          resolve(true);
        }, 500);
        worker.on("error", () => {
          clearTimeout(timer);
          resolve(false);
        });
        worker.on("exit", (code) => {
          clearTimeout(timer);
          resolve(code === 0 || code === null);
        });
      } catch {
        resolve(false);
      }
    });
  }
}
