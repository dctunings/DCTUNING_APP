// build-exe.mjs — build pipeline for DCTuningBridge.exe
//
// Steps:
//   1. tsc                      — compile src/*.ts → dist/*.js
//   2. pkg                      — bundle Node + dist into a single .exe
//   3. rcedit                   — set Windows resources (icon, version,
//                                 product name, copyright) so the exe shows
//                                 the DCTuning logo + proper metadata in
//                                 Explorer + Task Manager + Properties dialog
//   4. cp j2534helper.exe       — bundle the 32-bit J2534 loader alongside
//   5. zip                      — produce releases/DCTuningBridge-vX.Y.Z-win-x64.zip

import { execSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import rcedit from 'rcedit'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = __dirname

// Read version from package.json
const pkg = JSON.parse(execSync('node -p "JSON.stringify(require(\'./package.json\'))"', { cwd: root, encoding: 'utf8' }))
const VERSION = pkg.version

const BUILD_DIR = resolve(root, 'build')
const RELEASES_DIR = resolve(root, 'releases')
const ICON_SRC = resolve(root, 'resources', 'icon.ico')
const HELPER_SRC = resolve(root, '..', 'resources', 'j2534helper.exe')
const EXE_PATH = resolve(BUILD_DIR, 'DCTuningBridge.exe')
const ZIP_PATH = resolve(RELEASES_DIR, `DCTuningBridge-v${VERSION}-win-x64.zip`)

console.log('━'.repeat(60))
console.log(`  Building DCTuning Bridge v${VERSION}`)
console.log('━'.repeat(60))

// ── 1. Compile TypeScript ─────────────────────────────────────────────────
console.log('\n• tsc — compiling TypeScript')
execSync('npx tsc', { cwd: root, stdio: 'inherit' })

// ── 2. Run pkg to produce the exe ─────────────────────────────────────────
console.log('\n• pkg — bundling Node + bridge into .exe')
mkdirSync(BUILD_DIR, { recursive: true })
execSync(
  `npx pkg dist/index.js --targets node18-win-x64 --output "${EXE_PATH}"`,
  { cwd: root, stdio: 'inherit' }
)

// ── 3. Icon + version info — DISABLED in v0.1.0 ──────────────────────────
//
// pkg and rcedit are incompatible: rcedit's PE modifications invalidate
// pkg's payload integrity check, causing "Pkg: Error reading from file"
// at startup. Tried ICON_SRC = ${ICON_SRC} — produced a broken exe.
//
// Tracked as v0.2.0 work: switch from pkg to Node SEA (Single Executable
// Applications, Node 20+ built-in feature) which supports postject icon
// embedding cleanly. Until then v0.1.0 ships with the default Node icon.
//
// Reference unused vars so the linter doesn't strip imports we'll re-enable:
void rcedit; void ICON_SRC

// ── 4. Bundle j2534helper.exe alongside ──────────────────────────────────
console.log('\n• Bundling j2534helper.exe')
if (!existsSync(HELPER_SRC)) {
  console.warn(`  ✗ Helper not found at ${HELPER_SRC} — bridge will fail on j2534-open until manually added`)
} else {
  copyFileSync(HELPER_SRC, resolve(BUILD_DIR, 'j2534helper.exe'))
  const sz = statSync(HELPER_SRC).size
  console.log(`  ✓ ${HELPER_SRC} (${(sz / 1024).toFixed(1)} KB)`)
}

// ── 5. Zip for distribution ───────────────────────────────────────────────
console.log('\n• zip — creating release archive')
mkdirSync(RELEASES_DIR, { recursive: true })
// Use PowerShell Compress-Archive for portability — no external zip tool needed
execSync(
  `powershell -NoProfile -Command "Compress-Archive -Path '${EXE_PATH}','${resolve(BUILD_DIR, 'j2534helper.exe')}' -DestinationPath '${ZIP_PATH}' -Force"`,
  { cwd: root, stdio: 'inherit' }
)

const exeSize = (statSync(EXE_PATH).size / 1024 / 1024).toFixed(1)
const zipSize = (statSync(ZIP_PATH).size / 1024 / 1024).toFixed(1)

console.log('\n━'.repeat(60))
console.log(`  ✓ Build complete`)
console.log(`    DCTuningBridge.exe                       ${exeSize} MB`)
console.log(`    DCTuningBridge-v${VERSION}-win-x64.zip   ${zipSize} MB`)
console.log('━'.repeat(60))
