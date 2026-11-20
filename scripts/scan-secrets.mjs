#!/usr/bin/env node
/**
 * สแกนหา API key / secret ที่หลุดเข้า git repository
 *
 * ใช้ก่อน commit/push: `npm run security:scan`
 * - ตรวจเฉพาะไฟล์ที่ git ติดตามอยู่ (tracked) + staged
 * - ไม่พิมพ์ค่าจริงลงจอ (mask ให้) — กันคีย์หลุดซ้ำอีกรอบ
 * - เจอ secret → exit 1 เพื่อให้ CI/คำสั่ง check หยุดก่อน push
 *
 * หลีกเลี่ยง: อย่าใส่ key ลงไฟล์ในโปรเจกต์ ใช้การกรอกในหน้าเว็บเท่านั้น
 */

import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const RULES = [
  { name: "gemini", service: "Google AI Studio (Gemini)", re: /AQ\.[A-Za-z0-9_.-]{20,}/g, secret: true },
  { name: "google-api", service: "Google Cloud / Maps / Firebase", re: /AIza[0-9A-Za-z_-]{30,}/g, secret: true },
  { name: "mapbox-secret", service: "Mapbox secret token", re: /sk\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/g, secret: true },
  { name: "perplexity", service: "Perplexity", re: /pplx-[A-Za-z0-9]{20,}/g, secret: true },
  { name: "openai", service: "OpenAI", re: /sk-(?!ant-)[A-Za-z0-9_-]{32,}/g, secret: true },
  { name: "anthropic", service: "Anthropic", re: /sk-ant-[A-Za-z0-9_-]{20,}/g, secret: true },
  { name: "supabase-jwt", service: "Supabase JWT (anon/service)", re: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, secret: true },
  { name: "telegram-bot", service: "Telegram bot", re: /\b\d{8,10}:[A-Za-z0-9_-]{30,}/g, secret: true },
  { name: "github", service: "GitHub token", re: /gh[pousr]_[A-Za-z0-9]{20,}/g, secret: true },
  { name: "aws", service: "AWS access key", re: /AKIA[0-9A-Z]{16}/g, secret: true },
  { name: "stripe", service: "Stripe secret key", re: /sk_(?:live|test)_[A-Za-z0-9]{20,}/g, secret: true },
  // token สาธารณะตามการออกแบบ — เตือนแต่ไม่ทำให้ fail
  { name: "mapbox-public", service: "Mapbox public token", re: /pk\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/g, secret: false },
  { name: "supabase-publishable", service: "Supabase publishable key", re: /sb_publishable_[A-Za-z0-9_-]+/g, secret: false },
];

const SKIP_EXT = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf|eot|pdf|zip|gz|mp4|mp3|wasm|map)$/i;
const SKIP_PATH = /^(node_modules\/|\.next\/|\.git\/|\.harness\/|coverage\/|out\/)/;
const MAX_BYTES = 2_000_000;

function listFiles(argv) {
  const explicit = argv.filter((a) => !a.startsWith("--"));
  if (explicit.length) return explicit;
  if (argv.includes("--staged")) {
    const out = execFileSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACM"], {
      encoding: "utf8",
    });
    return out.split("\n").filter(Boolean);
  }
  const out = execFileSync("git", ["ls-files", "-z"], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  return out.split("\0").filter(Boolean);
}

function mask(v) {
  if (v.length <= 12) return `${v.slice(0, 2)}…(${v.length})`;
  return `${v.slice(0, 4)}…${v.slice(-4)} (${v.length})`;
}

const files = listFiles(process.argv.slice(2));
const findings = [];
let scanned = 0;

for (const file of files) {
  if (SKIP_PATH.test(file) || SKIP_EXT.test(file)) continue;
  let info;
  try {
    info = statSync(file);
  } catch {
    continue;
  }
  if (!info.isFile() || info.size > MAX_BYTES) continue;
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  scanned += 1;
  for (const rule of RULES) {
    const hits = text.match(rule.re);
    if (!hits) continue;
    for (const value of [...new Set(hits)]) {
      findings.push({ file, name: rule.name, service: rule.service, secret: rule.secret, value });
    }
  }
}

const secrets = findings.filter((f) => f.secret);
const warnings = findings.filter((f) => !f.secret);

console.log(`\nสแกน ${scanned} ไฟล์ (tracked) — พบ ${secrets.length} secret, ${warnings.length} token สาธารณะ`);

for (const f of secrets) {
  console.error(`  ✗ ${f.file}  ${f.name}  ${mask(f.value)}  (${f.service})`);
}
for (const f of warnings) {
  console.log(`  ! ${f.file}  ${f.name}  ${mask(f.value)}  (${f.service} — ตรวจว่าจำกัดโดเมนแล้ว)`);
}

if (secrets.length) {
  console.error("\n❌ พบ key/secret ในไฟล์ที่ git ติดตาม — ลบออกและ rotate key ก่อน push");
  process.exit(1);
}
console.log("✅ ไม่พบ secret ในไฟล์ที่ git ติดตาม\n");
