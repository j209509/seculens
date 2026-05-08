import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

function ensureEncryptionKey() {
  if (process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.length >= 16) return process.env.ENCRYPTION_KEY;
  const generated = crypto.randomBytes(32).toString("base64url");
  process.env.ENCRYPTION_KEY = generated;
  const envPath = path.resolve(process.cwd(), ".env.local");
  try {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf8");
      if (/^ENCRYPTION_KEY=\s*$/m.test(content)) {
        fs.writeFileSync(envPath, content.replace(/^ENCRYPTION_KEY=\s*$/m, `ENCRYPTION_KEY=${generated}`), "utf8");
      } else if (!/^ENCRYPTION_KEY=[^\s]/m.test(content)) {
        fs.appendFileSync(envPath, `\nENCRYPTION_KEY=${generated}\n`, "utf8");
      }
    }
  } catch { /* best-effort */ }
  return generated;
}

ensureEncryptionKey();

const envSchema = z.object({
  OPENAI_API_KEY: z.string().optional().default(""),
  OPENAI_MODEL: z.string().default("gpt-5.5"),
  AI_TRIAGE_MODEL: z.string().optional().default(""),
  AI_BULK_MODEL: z.string().optional().default("gpt-4.1-mini"),
  AI_DAILY_BUDGET_USD: z.coerce.number().optional().default(5),
  AI_MONTHLY_BUDGET_USD: z.coerce.number().optional().default(50),
  DATABASE_URL: z.string().default("file:./dev.db"),
  APP_BASE_URL: z.string().default("http://localhost:3007"),
  ENCRYPTION_KEY: z.string().min(8),
});

export const env = envSchema.parse(process.env);

export function highSpecModel() { return env.AI_TRIAGE_MODEL || env.OPENAI_MODEL; }
export function bulkModel() { return env.AI_BULK_MODEL || env.OPENAI_MODEL; }
