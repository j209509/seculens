const SYNTHETIC_TLDS = new Set(["xx","x","yy","zz","placeholder","interest","interests","pdf","doc","docx","txt","xml","json","html","htm","png","jpg","jpeg","gif","svg","css","js","log","csv","zip","tar","gz","test","example","invalid","local","localhost","internal","intranet","lan","home","corp","private"]);

export function isLikelyValidApex(domain: string): boolean {
  if (typeof domain !== "string") return false;
  const d = domain.trim().toLowerCase().replace(/\.+$/, "");
  if (d.length < 4 || d.length > 253) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(d)) return d.split(".").map(Number).every((n) => Number.isFinite(n) && n >= 0 && n <= 255);
  if (!/^[a-z0-9.-]+$/.test(d)) return false;
  if (d.startsWith(".") || d.startsWith("-") || d.endsWith("-")) return false;
  const parts = d.split(".");
  if (parts.length < 2) return false;
  for (const p of parts) { if (p.length === 0 || p.startsWith("-") || p.endsWith("-")) return false; }
  const tld = parts[parts.length - 1];
  if (!/^[a-z]{2,24}$/.test(tld) && !/^xn--[a-z0-9-]+$/.test(tld)) return false;
  if (SYNTHETIC_TLDS.has(tld)) return false;
  return true;
}
