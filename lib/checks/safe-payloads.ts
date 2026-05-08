import crypto from "node:crypto";

const FORBIDDEN_SQLI = /\b(drop|delete|insert|update|alter|truncate|create|grant|revoke|union\s+select|sleep|benchmark|pg_sleep|waitfor|load_file|outfile|exec\s|xp_cmdshell|--\s+select|;\s*shutdown)\b/i;
const FORBIDDEN_XSS = /(document\.cookie|localStorage|sessionStorage|navigator\.sendBeacon|new\s+Image\(\)|fetch\s*\(\s*['"]https?:\/\/(?!127\.0\.0\.1|localhost)|XMLHttpRequest|window\.location\s*=|setRequestHeader\s*\(\s*['"]Authorization)/i;

export function generateSafeXssMarker() {
  const id = crypto.randomBytes(4).toString("hex");
  return {
    id,
    htmlMarker: `<sx-bb-${id}></sx-bb-${id}>`,
    attributeMarker: `bb-${id}`,
    consoleMarker: `bb-xss-${id}`,
    safeProbe: `"><svg data-bb-xss="${id}"></svg>`,
    consoleProbe: `"><svg onload=console.log('bb-xss-${id}')>`
  };
}

export function isPayloadSafeForXss(payload: string) {
  return !FORBIDDEN_XSS.test(payload);
}

export function generateSafeSqliProbes() {
  return {
    quoteError: "'",
    booleanTrue: " AND 1=1",
    booleanFalse: " AND 1=2",
    numericNoOp: "+0",
    parenthesisError: "')"
  };
}

export function isPayloadSafeForSqli(payload: string) {
  if (FORBIDDEN_SQLI.test(payload)) return false;
  if (payload.length > 60) return false;
  return true;
}

export type SqliDiffSignal = {
  trueStatus: number;
  falseStatus: number;
  trueSize: number;
  falseSize: number;
  trueErrorPattern: boolean;
  falseErrorPattern: boolean;
  errorPatternFound?: string;
  candidate: boolean;
  signal: string;
};

const DB_ERROR_PATTERNS = [
  /SQLSTATE\[/,
  /mysql_fetch/,
  /You have an error in your SQL syntax/,
  /Unclosed quotation mark/,
  /unterminated quoted string/,
  /pg::syntaxerror/i,
  /psycopg2/,
  /MongooseError/,
  /Cannot read prop.*?undefined.*?at .+sql/i,
  /Microsoft OLE DB Provider for SQL Server/,
  /sqlite_error/i,
  /sqlerror/i,
  /quoted_identifier/i
];

export function analyzeSqliDiff(args: { trueStatus: number; falseStatus: number; trueBody: string; falseBody: string; errorBody?: string }): SqliDiffSignal {
  const trueErr = DB_ERROR_PATTERNS.some((re) => re.test(args.trueBody));
  const falseErr = DB_ERROR_PATTERNS.some((re) => re.test(args.falseBody));
  const errorBodyHit = args.errorBody ? DB_ERROR_PATTERNS.find((re) => re.test(args.errorBody!)) : undefined;
  const sizeDiff = Math.abs(args.trueBody.length - args.falseBody.length);
  const statusDiff = args.trueStatus !== args.falseStatus;
  let signal = "";
  let candidate = false;
  if (errorBodyHit) {
    signal = `単一引用符でDB由来エラー文字列が露出 (${errorBodyHit.source})`;
    candidate = true;
  } else if (statusDiff && args.trueStatus >= 200 && args.trueStatus < 300 && args.falseStatus >= 400) {
    signal = `boolean差分: 1=1 で ${args.trueStatus}, 1=2 で ${args.falseStatus} (ステータス差)`;
    candidate = true;
  } else if (sizeDiff > 200 && args.trueStatus < 400 && args.falseStatus < 400) {
    signal = `boolean差分: 1=1 で ${args.trueBody.length}B, 1=2 で ${args.falseBody.length}B (サイズ差 ${sizeDiff}B)`;
    candidate = true;
  } else {
    signal = `差分弱: status ${args.trueStatus}/${args.falseStatus}, size ${args.trueBody.length}/${args.falseBody.length}`;
  }
  return {
    trueStatus: args.trueStatus,
    falseStatus: args.falseStatus,
    trueSize: args.trueBody.length,
    falseSize: args.falseBody.length,
    trueErrorPattern: trueErr,
    falseErrorPattern: falseErr,
    errorPatternFound: errorBodyHit?.source,
    candidate,
    signal
  };
}

export function analyzeXssReflection(args: { responseBody: string; probe: string; markerId: string; encodedAlsoFound: boolean }): { reflected: boolean; type: "literal" | "encoded" | "none"; safeContext: boolean } {
  const literalFound = args.responseBody.includes(args.probe);
  const encodedFound = args.encodedAlsoFound;
  if (literalFound && !encodedFound) return { reflected: true, type: "literal", safeContext: false };
  if (literalFound && encodedFound) return { reflected: true, type: "encoded", safeContext: true };
  return { reflected: false, type: "none", safeContext: true };
}
