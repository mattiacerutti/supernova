import {getOrCreateWorkerPoolSingleton, terminateWorkerPoolSingleton} from "@pierre/diffs/worker";
import type {WorkerPoolManager} from "@pierre/diffs/worker";
import DiffWorker from "@pierre/diffs/worker/worker.js?worker";
import {CODE_HIGHLIGHT_ENGINE, CODE_HIGHLIGHT_THEMES} from "@/lib/diffs/highlighter";

let ready: Promise<WorkerPoolManager | undefined> | undefined;

function initializeWorkerPool(mode: "dark" | "light"): Promise<WorkerPoolManager> {
  let fail: (error: Error) => void;
  const failed = new Promise<never>((_, reject) => {
    fail = reject;
  });
  const pool = getOrCreateWorkerPoolSingleton({
    poolOptions: {
      poolSize: 2,
      totalASTLRUCacheSize: 32,
      workerFactory: () => {
        const worker = new DiffWorker();
        // Pierre logs worker load errors without rejecting its initialization promise.
        worker.addEventListener("error", (event) => {
          fail(new Error(event.message));
          terminateWorkerPoolSingleton();
          ready = Promise.resolve(undefined);
        });
        return worker;
      },
    },
    highlighterOptions: {
      theme: CODE_HIGHLIGHT_THEMES[mode],
      lineDiffType: "none",
      preferredHighlighter: CODE_HIGHLIGHT_ENGINE,
    },
  });
  return Promise.race([pool.initialize(), failed]).then(() => pool);
}

export function getDiffWorkerPool(mode: "dark" | "light"): Promise<WorkerPoolManager | undefined> {
  ready ??= initializeWorkerPool(mode);
  // A theme switch can remount several viewers while the previous theme is still loading.
  ready = ready
    .then(async (pool) => {
      if (!pool?.isInitialized()) return undefined;
      await pool.setRenderOptions({...pool.getDiffRenderOptions(), theme: CODE_HIGHLIGHT_THEMES[mode]});
      return pool.isInitialized() ? pool : undefined;
    })
    .catch(() => {
      terminateWorkerPoolSingleton();
      return undefined;
    });
  return ready;
}

if (import.meta.hot) import.meta.hot.dispose(terminateWorkerPoolSingleton);
