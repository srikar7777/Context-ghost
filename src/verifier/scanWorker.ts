import { parentPort } from "node:worker_threads";
import type { WorkerInput, WorkerOutput } from "../types.js";
import { scanFile } from "./scanFile.js";

parentPort?.on("message", async (input: WorkerInput) => {
  const { files, targets, workspaceRoot } = input;
  const matches: Record<string, import("../types.js").Occurrence[]> = {};

  for (const target of targets) {
    if (!Object.prototype.hasOwnProperty.call(matches, target.value)) {
      matches[target.value] = [];
    }
  }

  for (const file of files) {
    const fileMatches = await scanFile(file, targets, workspaceRoot);
    for (const [targetValue, occurrences] of Object.entries(fileMatches)) {
      if (matches[targetValue]) {
        matches[targetValue]!.push(...occurrences);
      }
    }
  }

  const output: WorkerOutput = { matches };
  parentPort?.postMessage(output);
});
