import { parseList } from "./json";

export type ScopeDecision = { allowed: true; reason: string } | { allowed: false; reason: string; kind: string };

function hostMatches(host: string, pattern: string) {
  const normalized = pattern.trim().toLowerCase().replace(/^\*\./, "");
  const target = host.toLowerCase();
  return target === normalized || target.endsWith(`.${normalized}`);
}

export function isUrlInScope(program: { allowedDomains: string; excludedDomains?: string; outOfScopePaths?: string }, url: string): ScopeDecision {
  let parsed: URL;
  try { parsed = new URL(url); } catch { return { allowed: false, kind: "INVALID_URL", reason: "URLとして解釈できません" }; }
  if (!["http:", "https:"].includes(parsed.protocol)) return { allowed: false, kind: "INVALID_URL", reason: "HTTP/HTTPS以外は対象外" };
  const allowed = parseList(program.allowedDomains);
  const excluded = parseList(program.excludedDomains ?? "[]");
  const paths = parseList(program.outOfScopePaths ?? "[]");
  if (!allowed.some((d) => hostMatches(parsed.hostname, d))) return { allowed: false, kind: "OUT_OF_SCOPE_DOMAIN", reason: `${parsed.hostname} は許可ドメインに含まれません` };
  if (excluded.some((d) => hostMatches(parsed.hostname, d))) return { allowed: false, kind: "EXCLUDED_DOMAIN", reason: `${parsed.hostname} は除外ドメインです` };
  const hitPath = paths.find((p) => parsed.pathname.startsWith(p));
  if (hitPath) return { allowed: false, kind: "OUT_OF_SCOPE_PATH", reason: `${parsed.pathname} は対象外パス` };
  return { allowed: true, reason: "許可ドメイン内です" };
}
