import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import bcrypt from "bcryptjs";

const root = new URL("../", import.meta.url);
const envPath = new URL(".env.local", root);
const workerEnvPath = new URL(".env.worker.local", root);
const secretsDir = new URL(".secrets/", root);
const loginPath = new URL("app-login.txt", secretsDir);
const rotate = process.argv.includes("--rotate");

function parse(content) {
  const values = new Map();
  for (const line of content.split(/\r?\n/)) {
    const index = line.indexOf("=");
    if (index > 0 && !line.trimStart().startsWith("#")) values.set(line.slice(0, index).trim(), line.slice(index + 1).trim());
  }
  return values;
}

function upsert(content, values) {
  const pending = new Map(Object.entries(values));
  const lines = content.split(/\r?\n/).map((line) => {
    const index = line.indexOf("=");
    if (index < 1) return line;
    const key = line.slice(0, index).trim();
    if (!pending.has(key)) return line;
    const value = pending.get(key);
    pending.delete(key);
    return `${key}=${value}`;
  });
  while (lines.at(-1) === "") lines.pop();
  for (const [key, value] of pending) lines.push(`${key}=${value}`);
  return `${lines.join("\n")}\n`;
}

const current = await readFile(envPath, "utf8");
const existing = parse(current);
if (!rotate && existing.get("APP_PASSWORD_HASH") && existing.get("SESSION_SECRET") && existing.get("WORKER_TOKEN")) {
  console.log("Auth secrets already configured; no values were rotated.");
  process.exit(0);
}

const password = randomBytes(18).toString("base64url");
const passwordHash = await bcrypt.hash(password, 12);
const sessionSecret = randomBytes(48).toString("base64url");
const workerToken = randomBytes(48).toString("base64url");
await mkdir(secretsDir, { recursive: true });
await writeFile(envPath, upsert(current, {
  APP_PASSWORD_HASH: passwordHash,
  SESSION_SECRET: sessionSecret,
  WORKER_TOKEN: workerToken
}), "utf8");

const workerCurrent = await readFile(workerEnvPath, "utf8").catch(() => "AI_NEWS_APP_URL=https://ai-news-curation-eta.vercel.app\n");
await writeFile(workerEnvPath, upsert(workerCurrent, { WORKER_TOKEN: workerToken }), "utf8");
await writeFile(loginPath, `AI News login\nURL: https://ai-news-curation-eta.vercel.app/login\nPassword: ${password}\n`, "utf8");
await chmod(loginPath, 0o600).catch(() => undefined);
console.log("Auth secrets configured. Login details were written to .secrets/app-login.txt.");
