import { Worker } from "node:worker_threads";
import { readdir, stat } from "node:fs/promises";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import * as os from "node:os";
import { DEFAULT_EXCLUDE_PATTERNS } from "../constants.js";
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

// When running under Vitest, the current file is a .ts source file and the
// worker must also be loaded as .ts (Vitest injects the necessary loader flags
// via process.execArgv). In compiled production mode, both files are .js.
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
  public async verify(input: VerifierInput): Promise<VerifierOutput | InvalidWorkspaceError> {
    const { workspaceRoot, searchTargets, excludePatterns = [] } = input;

    // 1. Validate workspaceRoot
    try {
      const stats = await stat(workspaceRoot);
      if (!stats.isDirectory()) {
        throw new Error("Not a directory");
      }
    } catch (err) {
      return {
        error: {
          code: "INVALID_WORKSPACE",
          path: workspaceRoot,
          message: "The specified workspace root does not resolve to an accessible directory.",
        },
      };
    }

    // 2. Recursively traverse
    const excludes = new Set([...DEFAULT_EXCLUDE_PATTERNS, ...excludePatterns]);
    const allFiles: string[] = [];

    async function traverse(currentDir: string) {
      let entries;
      try {
        entries = await readdir(currentDir, { withFileTypes: true });
      } catch (err) {
        return; // skip unreadable directories
      }

      for (const entry of entries) {
        if (excludes.has(entry.name)) {
          continue;
        }
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
      const emptyMatches: VerificationMatch[] = searchTargets.map((t) => ({
        targetValue: t.value,
        occurrences: [],
      }));
      return { verificationMatches: emptyMatches };
    }

    // 3. Partition file list
    const maxWorkers = Math.min(os.cpus().length, 8);
    const numWorkers = Math.min(maxWorkers, allFiles.length);
    const chunkSize = Math.ceil(allFiles.length / numWorkers);

    const chunks: string[][] = [];
    for (let i = 0; i < allFiles.length; i += chunkSize) {
      chunks.push(allFiles.slice(i, i + chunkSize));
    }

    // 4. Dispatch to workers
    const warnings: string[] = [];
    const mergedMatches: Record<string, Occurrence[]> = {};
    for (const target of searchTargets) {
      mergedMatches[target.value] = [];
    }

    const workerPromises = chunks.map((chunk) => {
      return new Promise<void>((resolve) => {
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
          for (const [targetValue, occurrences] of Object.entries(output.matches)) {
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

        worker.on("error", (err) => {
          console.error(`Worker error:`, err);
          warnings.push(...chunk);
          if (!resolved) {
            resolved = true;
            resolve();
            worker.terminate();
          }
        });

        worker.on("exit", (code) => {
          if (code !== 0 && !resolved) {
            console.error(`Worker stopped with exit code ${code}`);
            warnings.push(...chunk);
          }
          if (!resolved) {
            resolved = true;
            resolve();
            worker.terminate();
          }
        });

        worker.postMessage(workerInput);
      });
    });

    await Promise.all(workerPromises);

    // 5. Merge results
    const verificationMatches: VerificationMatch[] = searchTargets.map((target) => {
      const occurrences = mergedMatches[target.value] || [];
      occurrences.sort((a, b) => {
        if (a.file === b.file) {
          return a.line - b.line;
        }
        return a.file.localeCompare(b.file);
      });

      return {
        targetValue: target.value,
        occurrences,
      };
    });

    const output: VerifierOutput = { verificationMatches };
    if (warnings.length > 0) {
      output.warnings = Array.from(new Set(warnings));
    }

    return output;
  }
}
