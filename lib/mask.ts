const headerSecretNames = /^(cookie|authorization|set-cookie|x-api-key|api-key|x-auth-token)$/i;
const email = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const card = /\b(?:\d[ -]*?){13,19}\b/g;
const tokenKeys = /(access[_-]?token|refresh[_-]?token|session[_-]?id|api[_-]?key|secret|password|authorization|cookie)/i;
const addressHints = /(住所|address|street|city|postal|zipcode|zip_code)/i;

export function maskText(input: unknown): string {
  const text = typeof input === "string" ? input : JSON.stringify(input ?? "");
  return text.replace(email, "[masked-email]").replace(card, "[masked-card]");
}

export function maskHeaders(headers: Record<string, string | string[] | undefined>) {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const joined = Array.isArray(value) ? value.join("; ") : value ?? "";
    out[key] = headerSecretNames.test(key) ? "[masked-secret]" : maskText(joined);
  }
  return out;
}

export function maskJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(maskJson);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (tokenKeys.test(key)) out[key] = "[masked-secret]";
      else if (addressHints.test(key)) out[key] = "[masked-address]";
      else out[key] = maskJson(item);
    }
    return out;
  }
  if (typeof value === "string") return maskText(value);
  return value;
}

export function maskBody(contentType: string, body: string) {
  if (!body) return "";
  if (contentType.includes("json")) {
    try { return JSON.stringify(maskJson(JSON.parse(body)), null, 2); } catch { return maskText(body); }
  }
  return maskText(body);
}
