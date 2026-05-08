import { AsyncLocalStorage } from "node:async_hooks";
import { setSubStep } from "./scan-progress-bus";

export const scanContext = new AsyncLocalStorage<{ scanId: string }>();

/** Reports current sub-step. No-op if no scan context. */
export function reportSubStep(label: string): void {
  const ctx = scanContext.getStore();
  if (!ctx) return;
  setSubStep(ctx.scanId, label);
}
