#!/usr/bin/env node

/**
 * สคริปต์สำหรับทดสอบการเชื่อมต่อ Supabase Database & Auth
 * ใช้งาน: node scripts/test-supabase.mjs หรือ npm run test:supabase
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// สีสำหรับ Console Output
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

console.log(`${colors.bold}${colors.cyan}================================================================${colors.reset}`);
console.log(`${colors.bold}${colors.cyan}         DropWay - เครื่องมือทดสอบการเชื่อมต่อ Supabase         ${colors.reset}`);
console.log(`${colors.bold}${colors.cyan}================================================================${colors.reset}\n`);

// 1. อ่านไฟล์ .env.local หรือ .env
function loadEnv() {
  const envFiles = ['.env.local', '.env'];
  const envVars = { ...process.env };

  for (const file of envFiles) {
    const fullPath = path.join(rootDir, file);
    if (fs.existsSync(fullPath)) {
      console.log(`${colors.dim}พบไฟล์ Environment: ${file}${colors.reset}`);
      const content = fs.readFileSync(fullPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          // ตัดเครื่องหมายคำพูดรอบข้อความถ้ามี
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (!envVars[key]) {
            envVars[key] = val;
          }
        }
      }
      break;
    }
  }

  return envVars;
}

const env = loadEnv();
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabaseAnonKey = (
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
)?.trim();

// 2. ตรวจสอบว่ามีค่า Env หรือไม่
console.log(`\n${colors.bold}[ขั้นตอนที่ 1] ตรวจสอบค่า Environment Variables${colors.reset}`);

let hasMissingConfig = false;

if (!supabaseUrl || supabaseUrl === 'https://your-project-id.supabase.co') {
  console.log(`  ${colors.red}✗ NEXT_PUBLIC_SUPABASE_URL:${colors.reset} ยังไม่ได้ระบุ หรือยังเป็นค่าตั้งต้น`);
  hasMissingConfig = true;
} else {
  console.log(`  ${colors.green}✓ NEXT_PUBLIC_SUPABASE_URL:${colors.reset} ${supabaseUrl}`);
}

if (!supabaseAnonKey || supabaseAnonKey.includes('your-anon-key-here')) {
  console.log(`  ${colors.red}✗ NEXT_PUBLIC_SUPABASE_ANON_KEY / PUBLISHABLE_KEY:${colors.reset} ยังไม่ได้ระบุ หรือยังเป็นค่าตั้งต้น`);
  hasMissingConfig = true;
} else {
  const maskedKey = supabaseAnonKey.slice(0, 15) + '...' + supabaseAnonKey.slice(-10);
  console.log(`  ${colors.green}✓ NEXT_PUBLIC_SUPABASE_ANON_KEY / PUBLISHABLE_KEY:${colors.reset} ${maskedKey}`);
}

if (hasMissingConfig) {
  console.log(`\n${colors.bold}${colors.yellow}⚠️  สาเหตุที่เชื่อมต่อ Supabase ไม่ได้:${colors.reset}`);
  console.log(`โปรเจกต์ยังไม่มีข้อมูลการเชื่อมต่อ Supabase ในไฟล์ ${colors.bold}.env.local${colors.reset}`);
  console.log(`\n${colors.bold}วิธีแก้ไข:${colors.reset}`);
  console.log(`1. เปิด Supabase Dashboard: ${colors.cyan}https://supabase.com/dashboard${colors.reset}`);
  console.log(`2. เลือกโปรเจกต์ของคุณ -> ไปที่ ${colors.bold}Project Settings${colors.reset} (รูปฟันเฟือง) -> ${colors.bold}API${colors.reset}`);
  console.log(`3. คัดลอกค่า:`);
  console.log(`   - ${colors.bold}Project URL${colors.reset} (เช่น https://xxxx.supabase.co)`);
  console.log(`   - ${colors.bold}Project API Keys (anon public)${colors.reset}`);
  console.log(`4. นำไปวางในไฟล์ ${colors.bold}.env.local${colors.reset}:`);
  console.log(`   ${colors.dim}NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co${colors.reset}`);
  console.log(`   ${colors.dim}NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...${colors.reset}`);
  console.log(`5. บันทึกไฟล์แล้วรันคำสั่งนี้ใหม่อีกครั้ง: ${colors.bold}npm run test:supabase${colors.reset}\n`);
  process.exit(1);
}

// 3. ตรวจสอบรูปแบบ URL
console.log(`\n${colors.bold}[ขั้นตอนที่ 2] ตรวจสอบรูปแบบและเชื่อมต่อไปยังเซิร์ฟเวอร์ Supabase${colors.reset}`);
try {
  const parsed = new URL(supabaseUrl);
  if (!parsed.protocol.startsWith('http')) {
    throw new Error('Protocol ต้องเป็น http หรือ https');
  }
} catch (e) {
  console.log(`  ${colors.red}✗ รูปแบบ URL ไม่ถูกต้อง:${colors.reset} ${e.message}`);
  process.exit(1);
}

// 4. ทดสอบ HTTP Ping
try {
  const healthUrl = `${supabaseUrl}/auth/v1/health`;
  const res = await fetch(healthUrl, {
    headers: {
      apikey: supabaseAnonKey,
    },
    signal: AbortSignal.timeout(10000),
  });

  if (res.ok) {
    console.log(`  ${colors.green}✓ เชื่อมต่อไปยัง Supabase สำเร็จ (HTTP ${res.status})${colors.reset}`);
  } else {
    console.log(`  ${colors.yellow}! เชื่อมต่อไปยัง Endpoint ได้แต่ตอบกลับ HTTP ${res.status} (อาจเป็นเรื่องสิทธิ์)${colors.reset}`);
  }
} catch (err) {
  console.log(`  ${colors.red}✗ ไม่สามารถเชื่อมต่อไปยัง URL ได้:${colors.reset} ${err.message}`);
  console.log(`  ${colors.dim}กรุณาตรวจสอบว่า URL ถูกต้องและมีอินเทอร์เน็ตที่เชื่อมต่อได้${colors.reset}`);
  process.exit(1);
}

// 5. ทดสอบ Client SDK และ Database Tables
console.log(`\n${colors.bold}[ขั้นตอนที่ 3] ตรวจสอบโครงสร้างฐานข้อมูล (Database Schema)${colors.reset}`);

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkTable(name, selectCols = '*') {
  try {
    const { data, error, status } = await supabase.from(name).select(selectCols).limit(1);

    if (error) {
      if (error.code === '42P01') {
        return { ok: false, missing: true, message: `ไม่พบตาราง/วิว "${name}" ในฐานข้อมูล` };
      }
      if (error.code === '42501') {
        return { ok: true, rls: true, message: `พบตาราง "${name}" (RLS ทำงาน: ผู้ใช้ทั่วไปอ่านไม่ได้ ต้องผ่าน Auth)` };
      }
      return { ok: false, error: true, message: `เกิดข้อผิดพลาด (${error.code}): ${error.message}` };
    }

    return { ok: true, message: `เชื่อมต่อตาราง/วิว "${name}" ได้สำเร็จ` };
  } catch (err) {
    return { ok: false, error: true, message: err.message };
  }
}

const checkHouses = await checkTable('houses', 'id');
const checkUserNav = await checkTable('user_navigation_houses', 'id');
const checkNavView = await checkTable('navigation_view', 'nav_id');

let hasMissingTables = false;

// แสดงผล houses
if (checkHouses.ok) {
  console.log(`  ${colors.green}✓ ตาราง "houses":${colors.reset} ${checkHouses.message}`);
} else {
  console.log(`  ${colors.red}✗ ตาราง "houses":${colors.reset} ${checkHouses.message}`);
  if (checkHouses.missing) hasMissingTables = true;
}

// แสดงผล user_navigation_houses
if (checkUserNav.ok) {
  console.log(`  ${colors.green}✓ ตาราง "user_navigation_houses":${colors.reset} ${checkUserNav.message}`);
} else {
  console.log(`  ${colors.red}✗ ตาราง "user_navigation_houses":${colors.reset} ${checkUserNav.message}`);
  if (checkUserNav.missing) hasMissingTables = true;
}

// แสดงผล navigation_view
if (checkNavView.ok) {
  console.log(`  ${colors.green}✓ วิว "navigation_view":${colors.reset} ${checkNavView.message}`);
} else {
  console.log(`  ${colors.red}✗ วิว "navigation_view":${colors.reset} ${checkNavView.message}`);
  if (checkNavView.missing) hasMissingTables = true;
}

// สรุปผล
console.log(`\n${colors.bold}${colors.cyan}================================================================${colors.reset}`);
console.log(`${colors.bold}${colors.cyan}                         สรุปผลการทดสอบ                         ${colors.reset}`);
console.log(`${colors.bold}${colors.cyan}================================================================${colors.reset}`);

if (hasMissingTables) {
  console.log(`\n${colors.yellow}⚠️  เชื่อมต่อกับ Supabase ได้สำเร็จ แต่ยังไม่มีตารางที่โปรเจกต์ต้องใช้งาน${colors.reset}`);
  console.log(`\n${colors.bold}วิธีสร้างตารางอัตโนมัติ:${colors.reset}`);
  console.log(`1. เข้าไปที่ Supabase Dashboard -> เมนู ${colors.bold}SQL Editor${colors.reset}`);
  console.log(`2. นำคำสั่งจากไฟล์ ${colors.bold}supabase-schema.sql${colors.reset} ที่เตรียมไว้ในโปรเจกต์นี้ไปวาง`);
  console.log(`3. กดปุ่ม ${colors.bold}Run${colors.reset} เพื่อสร้างตารางและวิวทั้งหมด`);
  console.log(`4. รันทดสอบอีกครั้งด้วยคำสั่ง: ${colors.bold}npm run test:supabase${colors.reset}\n`);
} else {
  console.log(`\n${colors.bold}${colors.green}🎉 ยอดเยี่ยม! การเชื่อมต่อ Supabase สมบูรณ์แบบ พร้อมใช้งานในโปรเจกต์แล้ว${colors.reset}\n`);
}
