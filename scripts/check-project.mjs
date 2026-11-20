#!/usr/bin/env node

/**
 * Project Health & Integrity Check
 * สคริปต์ตรวจสอบความสมบูรณ์ของโปรเจกต์ (TypeScript, ESLint, และ Neon PostgreSQL Connection)
 */

import { execSync } from 'node:child_process';

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

console.log(`${colors.bold}${colors.cyan}================================================================${colors.reset}`);
console.log(`${colors.bold}${colors.cyan}         DropWay - ตรวจสอบความสมบูรณ์ของระบบ (Health Check)     ${colors.reset}`);
console.log(`${colors.bold}${colors.cyan}================================================================${colors.reset}\n`);

let hasError = false;

// 0. ตรวจหา secret ที่หลุดเข้า repo (ต้องผ่านก่อน push ทุกครั้ง)
console.log(`${colors.bold}0. ตรวจหา API key/secret ในไฟล์ที่ git ติดตาม...${colors.reset}`);
try {
  execSync('node scripts/scan-secrets.mjs', { stdio: 'inherit' });
} catch (e) {
  console.log(`   ${colors.red}✗ พบ secret ในโปรเจกต์ — ลบและ rotate key ก่อน push${colors.reset}\n`);
  hasError = true;
}

// 1. ตรวจสอบ TypeScript Types
console.log(`${colors.bold}1. ตรวจสอบ TypeScript Types...${colors.reset}`);
try {
  execSync('node node_modules/typescript/bin/tsc --noEmit', { stdio: 'inherit' });
  console.log(`   ${colors.green}✓ TypeScript: ไม่มีข้อผิดพลาด (Zero Errors)${colors.reset}\n`);
} catch (e) {
  console.log(`   ${colors.red}✗ TypeScript: พบข้อผิดพลาดด้าน Type${colors.reset}\n`);
  hasError = true;
}

// 2. ตรวจสอบ ESLint Code Quality
console.log(`${colors.bold}2. ตรวจสอบ ESLint Code Quality...${colors.reset}`);
try {
  execSync('npm run lint', { stdio: 'inherit' });
  console.log(`   ${colors.green}✓ ESLint: ผ่านการตรวจสอบรูปแบบโค้ด${colors.reset}\n`);
} catch (e) {
  console.log(`   ${colors.red}✗ ESLint: พบข้อผิดพลาดหรือคำเตือนในโค้ด${colors.reset}\n`);
  hasError = true;
}

// 3. ตรวจสอบสถานะการเชื่อมต่อ Database (Neon PostgreSQL)
console.log(`${colors.bold}3. ตรวจสอบสถานะการเชื่อมต่อ Database (Neon PostgreSQL)...${colors.reset}`);
try {
  execSync('node scripts/test-neon.mjs', { stdio: 'inherit' });
} catch (e) {
  // ข้อความเตือนแสดงอยู่ในตัวสคริปต์แล้ว
}

console.log(`\n${colors.bold}${colors.cyan}================================================================${colors.reset}`);
if (hasError) {
  console.log(`${colors.red}❌ สรุป: พบข้อผิดพลาดในโค้ด กรุณาตรวจสอบตามรายละเอียดด้านบน${colors.reset}`);
  process.exit(1);
} else {
  console.log(`${colors.green}✅ สรุป: โค้ดของโปรเจกต์สมบูรณ์แบบ พร้อมสำหรับการพัฒนาและใช้งาน!${colors.reset}`);
}
console.log(`${colors.bold}${colors.cyan}================================================================${colors.reset}\n`);
