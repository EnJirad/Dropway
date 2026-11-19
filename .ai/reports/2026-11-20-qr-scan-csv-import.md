# 2026-11-20 — QR / barcode scanning and CSV upload

## Objective
- Add an upload button next to "โหลด CSV" in the house library that imports
  only rows whose `id` (UUID) does not already exist, skipping duplicates.
- Add QR / barcode scanning so a scan finds the house by UUID (or by a
  name / phone / address fallback) and can add it to the navigation queue or
  start Google Maps navigation immediately.

## Changes
- `src/app/houses/page.tsx`
  - Hidden CSV file input and "อัพโหลด CSV" button.
  - CSV header aliases (English and Thai), UUID validation, missing/invalid id
    gets a new UUID.
  - Existing ids are checked in batches of 100 before inserting new rows in
    batches of 500; a failed batch falls back to row-by-row inserts.
  - Import result toast reports inserted and skipped counts.
  - "สแกน QR" link and `/houses?search=` support.
  - CSV export now includes `quantity`.
- `src/app/scan/page.tsx` (new)
  - Camera scanner using `html5-qrcode` (QR and common barcodes).
  - Lookup by UUID, URL query (`id`, `house_id`, `uuid`, `q`, ...), UUID in
    text, JSON payload, or name / phone / address text.
  - Result card with call link, address, note, "นำทางทันที",
    "เพิ่มในรายการนำทาง", and "เปิดในคลังบ้าน".
  - Manual code input fallback when the camera is unavailable.
- `src/components/Navbar.tsx`
  - Added the `/scan` tab to the mobile bottom bar, drawer, and desktop nav.

## Verification actually run
- `./node_modules/.bin/tsc --noEmit` → exit 0.
- `./node_modules/.bin/eslint src --ext .ts,.tsx` → exit 0.
- `node node_modules/next/dist/bin/next build` → exit 0 after:
  - building with local-only workarounds for this Android toolchain:
    `experimental.webpackBuildWorker = false`, `workerThreads = true`, and a
    local patch to load the SWC WASM binding (no native android-arm64 SWC
    binary exists for Next 14.2.15),
  - supplying placeholder `NEXT_PUBLIC_SUPABASE_URL` /
    `NEXT_PUBLIC_SUPABASE_ANON_KEY` because the repo has no env file.
  - The temporary next.config workarounds were reverted after the build.
- Build output included `/scan` (5.39 kB) and `/houses` (20.8 kB) and reported
  "Compiled successfully".

## Not verified
- Live camera scanning on a physical device (no Supabase credentials in this
  workspace, so the authenticated page could not be exercised end to end).
- Duplicate skipping against the real `houses` table (logic is covered by type
  checking and build only, not an integration test).

## Notes
- The deployed site `https://tooteep.pages.dev/tg` was already logged in in the
  in-app browser and showed the Dashboard (account 59P, 14-day trial).
