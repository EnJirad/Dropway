#!/usr/bin/env node

/**
 * สคริปต์สำหรับทดสอบการเชื่อมต่อ Neon PostgreSQL Database
 * ใช้งาน: node scripts/test-neon.mjs หรือ npm run test:neon
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

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
console.log(`${colors.bold}${colors.cyan}         DropWay - เครื่องมือทดสอบการเชื่อมต่อ Neon Database    ${colors.reset}`);
console.log(`${colors.bold}${colors.cyan}================================================================${colors.reset}\n`);

// 1. อ่าน Environment Variables
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
const dbUrl = (env.DATABASE_URL || env.POSTGRES_URL || env.NEON_DATABASE_URL)?.trim();

console.log(`\n${colors.bold}[ขั้นตอนที่ 1] ตรวจสอบค่า DATABASE_URL สำหรับ Neon${colors.reset}`);

if (!dbUrl || dbUrl.includes('your-neon-database-url')) {
  console.log(`  ${colors.red}✗ DATABASE_URL:${colors.reset} ยังไม่ได้ระบุใน .env.local`);
  console.log(`\n${colors.bold}${colors.yellow}⚠️  วิธีหา DATABASE_URL จาก Neon:${colors.reset}`);
  console.log(`1. เข้าสู่ระบบ Neon: ${colors.cyan}https://console.neon.tech${colors.reset}`);
  console.log(`2. เลือกโปรเจกต์ของคุณ -> ไปที่หน้า ${colors.bold}Dashboard${colors.reset}`);
  console.log(`3. ในส่วน ${colors.bold}Connection Details${colors.reset} ให้เลือกเป็น ${colors.bold}Pooled connection${colors.reset} หรือ ${colors.bold}Direct connection${colors.reset}`);
  console.log(`4. คัดลอก Connection string แล้วนำมาใส่ในไฟล์ ${colors.bold}.env.local${colors.reset}:`);
  console.log(`   ${colors.dim}DATABASE_URL=postgresql://neondb_owner:password@ep-xyz.ap-southeast-1.aws.neon.tech/neondb?sslmode=require${colors.reset}`);
  console.log(`5. รันคำสั่งนี้ใหม่อีกครั้ง: ${colors.bold}npm run test:neon${colors.reset}\n`);
  process.exit(1);
}

const maskedUrl = dbUrl.replace(/:[^:@]+@/, ':****@');
console.log(`  ${colors.green}✓ DATABASE_URL:${colors.reset} ${maskedUrl}`);

// 2. ทดสอบเชื่อมต่อ Database
console.log(`\n${colors.bold}[ขั้นตอนที่ 2] ทดสอบเชื่อมต่อไปยังเซิร์ฟเวอร์ Neon PostgreSQL${colors.reset}`);

try {
  const sql = neon(dbUrl);
  const result = await sql`SELECT 1 as connected, current_database() as db, version() as version`;

  console.log(`  ${colors.green}✓ เชื่อมต่อกับ Neon สำเร็จ!${colors.reset}`);
  console.log(`    ฐานข้อมูล: ${result[0]?.db}`);
  console.log(`    เวอร์ชัน: ${result[0]?.version?.split(' ')?.[0] || 'PostgreSQL'}`);

  // 3. ตรวจสอบตาราง houses
  console.log(`\n${colors.bold}[ขั้นตอนที่ 3] ตรวจสอบโครงสร้างตาราง${colors.reset}`);

  try {
    const [{ count }] = await sql`SELECT count(*)::int as count FROM public.houses`;
    console.log(`  ${colors.green}✓ ตาราง "houses":${colors.reset} พบข้อมูลทั้งหมด ${count} หลัง`);
  } catch (tableErr) {
    if (tableErr.message?.includes('does not exist')) {
      console.log(`  ${colors.yellow}! ยังไม่พบตาราง "houses" ใน Neon${colors.reset}`);
      console.log(`    ${colors.dim}ไม่ต้องกังวล! เมื่อคุณอัปโหลดไฟล์ CSV บนหน้าเว็บ DropWay ระบบจะสร้างตารางและวิวให้อัตโนมัติทันที${colors.reset}`);
      console.log(`    ${colors.dim}หรือสามารถนำโค้ดใน neon/schema.sql ไปรันบน Neon SQL Editor ได้เช่นกัน${colors.reset}`);
    } else {
      console.log(`  ${colors.red}✗ ตาราง "houses":${colors.reset} ${tableErr.message}`);
    }
  }

  console.log(`\n${colors.bold}${colors.green}🎉 ยอดเยี่ยม! การเชื่อมต่อ Neon Database พร้อมใช้งานสำหรับ DropWay แล้ว${colors.reset}\n`);
} catch (connErr) {
  console.log(`  ${colors.red}✗ เชื่อมต่อล้มเหลว:${colors.reset} ${connErr.message}`);
  process.exit(1);
}
