// In-memory sub-step bus for live "what's being checked right now" reporting.
// Single-process Node server (Fly.io) so a Map is safe.

const subSteps = new Map<string, { sub: string; updatedAt: number }>();

export function setSubStep(scanId: string, sub: string): void {
  subSteps.set(scanId, { sub, updatedAt: Date.now() });
}

export function getSubStep(scanId: string): string | null {
  const v = subSteps.get(scanId);
  if (!v) return null;
  // Stale after 30s
  if (Date.now() - v.updatedAt > 30000) return null;
  return v.sub;
}

export function clearSubStep(scanId: string): void {
  subSteps.delete(scanId);
}
