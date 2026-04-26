// build-exe.mjs — Node SEA build pipeline for DCTuningBridge.exe
//
// Replaces the old pkg-based pipeline. Node SEA (Single Executable Apps,
// stable in Node 20+) lets us embed a JS bundle into a copy of node.exe.
// The big advantage: PE structure stays intact, so rcedit can embed the
// DCTuning icon + version metadata correctly. pkg's appended-payload
// approach fights with rcedit's PE modifications, which is why v0.1.0
// shipped with the default Node icon.
//
// Pipeline:
//   1. tsc                — compile src/*.ts → dist/*.js
//   2. esbuild            — bundle dist/index.js + deps → build/bundle.js
//                            (single CJS file, no externals)
//   3. sea-config.json    — declare which file gets embedded as the SEA blob
//   4. node --experimental-sea-config — produces build/sea-prep.blob
//   5. cp node.exe        — copy the running node binary to DCTuningBridge.exe
//   6. signtool remove    — strip the Microsoft signature from the copy
//                            (postject can't inject into signed binaries)
//   7. rcedit             — set DCTuning icon + version-string metadata.
//                            Done BEFORE postject so we don't disturb the
//                            blob fuse.
//   8. postject           — inject the SEA blob into the .exe
//   9. cp j2534helper.exe — bundle the 32-bit J2534 loader alongside
//  10. zip                — produce releases/DCTuningBridge-vX.Y.Z-win-x64.zip
//
// References:
//   - https://nodejs.org/api/single-executable-applications.html
//   - https://github.com/nodejs/postject

import { execSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, statSync, writeFileSync, rmSync, chmodSync, readFileSync, openSync, writeSync, closeSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import rcedit from 'rcedit'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = __dirname

const pkg = JSON.parse(execSync('node -p "JSON.stringify(require(\'./package.json\'))"', { cwd: root, encoding: 'utf8' }))
const VERSION = pkg.version

const BUILD_DIR    = resolve(root, 'build')
const RELEASES_DIR = resolve(root, 'releases')
const ICON_SRC     = resolve(root, 'resources', 'icon.ico')
const HELPER_SRC   = resolve(root, '..', 'resources', 'j2534helper.exe')
const BUNDLE_PATH  = resolve(BUILD_DIR, 'bundle.js')
const SEA_CONFIG   = resolve(BUILD_DIR, 'sea-config.json')
const SEA_BLOB     = resolve(BUILD_DIR, 'sea-prep.blob')
const EXE_PATH     = resolve(BUILD_DIR, 'DCTuningBridge.exe')
const ZIP_PATH     = resolve(RELEASES_DIR, `DCTuningBridge-v${VERSION}-win-x64.zip`)
const INSTALLER_NSI = resolve(root, 'installer', 'installer.nsi')
const NSIS_PATH    = 'C:\\Program Files (x86)\\NSIS\\makensis.exe'

// ─── PE Subsystem patcher ────────────────────────────────────────────────
//
// Switches a Windows PE binary from Console subsystem (3) to GUI subsystem
// (2), which hides the console window when the exe runs. Two bytes change
// at a known offset.
//
// PE structure:
//   DOS header → e_lfanew (offset 0x3C) → file offset of PE signature
//   PE signature: 4 bytes "PE\0\0"
//   COFF header: 20 bytes
//   Optional header: 68 bytes before Subsystem field (same for PE32 + PE32+)
//   ⇒ Subsystem byte is at file offset (e_lfanew + 4 + 20 + 68) = e_lfanew + 92
//
// Subsystem values:
//   2 = IMAGE_SUBSYSTEM_WINDOWS_GUI  ← no console window
//   3 = IMAGE_SUBSYSTEM_WINDOWS_CUI  ← console window (default for node.exe)

function setSubsystemToGUI(exePath) {
  const fd = openSync(exePath, 'r+')
  try {
    const dosHeader = Buffer.alloc(64)
    const { bytesRead } = (() => {
      const buf = readFileSync(exePath).slice(0, 64)
      dosHeader.set(buf)
      return { bytesRead: buf.length }
    })()
    if (bytesRead < 64) throw new Error('Not a valid PE file (header too short)')

    // e_lfanew at offset 0x3C — file offset of PE signature
    const peOffset = dosHeader.readUInt32LE(0x3C)

    // Verify PE signature
    const peSigBuf = Buffer.alloc(4)
    readFileSync(exePath).copy(peSigBuf, 0, peOffset, peOffset + 4)
    if (peSigBuf.toString('ascii', 0, 2) !== 'PE') throw new Error(`No PE signature at offset 0x${peOffset.toString(16)}`)

    // Subsystem is 2 bytes at peOffset + 92
    const subsystemOffset = peOffset + 92
    const newSubsystem = Buffer.from([0x02, 0x00])  // IMAGE_SUBSYSTEM_WINDOWS_GUI, little-endian
    writeSync(fd, newSubsystem, 0, 2, subsystemOffset)
  } finally {
    closeSync(fd)
  }
}

console.log('━'.repeat(60))
console.log(`  Building DCTuning Bridge v${VERSION} (Node SEA)`)
console.log('━'.repeat(60))

mkdirSync(BUILD_DIR, { recursive: true })

// ── 1. Compile TypeScript ─────────────────────────────────────────────────
console.log('\n• tsc — compiling TypeScript')
execSync('npx tsc', { cwd: root, stdio: 'inherit' })

// ── 2. Bundle with esbuild ────────────────────────────────────────────────
console.log('\n• esbuild — bundling JS + deps into single file')
execSync(
  [
    'npx esbuild dist/index.js',
    '--bundle',
    '--platform=node',
    '--target=node20',
    '--format=cjs',
    `--outfile=${BUNDLE_PATH}`,
    // ws has optional native helpers — keep them external so SEA bundles cleanly
    '--external:bufferutil',
    '--external:utf-8-validate',
    '--minify',
  ].join(' '),
  { cwd: root, stdio: 'inherit' }
)
const bundleSize = (statSync(BUNDLE_PATH).size / 1024).toFixed(1)
console.log(`  ✓ ${BUNDLE_PATH} (${bundleSize} KB)`)

// ── 3. SEA config ─────────────────────────────────────────────────────────
console.log('\n• sea-config.json — declaring SEA blob layout')
const seaConfig = {
  main: BUNDLE_PATH,
  output: SEA_BLOB,
  disableExperimentalSEAWarning: true,
  useSnapshot: false,           // Snapshot mode breaks ws — keep it off
  useCodeCache: true,           // Speeds up startup
}
writeFileSync(SEA_CONFIG, JSON.stringify(seaConfig, null, 2))

// ── 4. Generate SEA blob ──────────────────────────────────────────────────
console.log('\n• node --experimental-sea-config — generating blob')
execSync(`node --experimental-sea-config "${SEA_CONFIG}"`, { cwd: root, stdio: 'inherit' })
console.log(`  ✓ ${SEA_BLOB} (${(statSync(SEA_BLOB).size / 1024 / 1024).toFixed(1)} MB)`)

// ── 5. Copy node.exe → DCTuningBridge.exe ─────────────────────────────────
console.log('\n• cp node.exe → DCTuningBridge.exe')
const nodePath = process.execPath
copyFileSync(nodePath, EXE_PATH)
chmodSync(EXE_PATH, 0o755)
console.log(`  ✓ Source: ${nodePath}`)

// ── 6. Strip Microsoft signature so postject can inject ───────────────────
console.log('\n• signtool — stripping signature (Microsoft-signed node.exe)')
try {
  execSync(`signtool remove /s "${EXE_PATH}"`, { stdio: 'pipe' })
  console.log('  ✓ Signature removed')
} catch {
  // signtool not available or no signature — postject may still work
  console.log('  (signtool unavailable — continuing; postject may warn)')
}

// ── 7. rcedit — embed icon + version metadata ─────────────────────────────
// Must run BEFORE postject. With pkg this step broke the build because
// pkg's payload offsets shifted; with SEA the blob hasn't been injected
// yet, so we're modifying a clean PE.
console.log('\n• rcedit — embedding DCTuning icon + version info')
if (existsSync(ICON_SRC)) {
  await rcedit(EXE_PATH, {
    'version-string': {
      'CompanyName': 'DCTuning Ireland',
      'FileDescription': 'DCTuning Bridge — local J2534 hardware service',
      'ProductName': 'DCTuning Bridge',
      'LegalCopyright': `© ${new Date().getFullYear()} DCTuning Ireland`,
      'OriginalFilename': 'DCTuningBridge.exe',
      'InternalName': 'DCTuningBridge',
    },
    'file-version': VERSION + '.0',
    'product-version': VERSION + '.0',
    'icon': ICON_SRC,
  })
  console.log(`  ✓ Icon: ${ICON_SRC}`)
} else {
  console.warn(`  ✗ Icon not found at ${ICON_SRC}`)
}

// ── 8. postject — inject SEA blob into the exe ────────────────────────────
console.log('\n• postject — injecting SEA blob')
execSync(
  [
    `npx postject "${EXE_PATH}"`,
    'NODE_SEA_BLOB',
    `"${SEA_BLOB}"`,
    '--sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
  ].join(' '),
  { cwd: root, stdio: 'inherit' }
)
console.log(`  ✓ Blob injected`)

// ── 8b. PE Subsystem → GUI (no console window) ────────────────────────────
console.log('\n• PE patch — switching Subsystem to WINDOWS_GUI')
try {
  setSubsystemToGUI(EXE_PATH)
  console.log(`  ✓ Console window will be hidden when exe runs`)
} catch (e) {
  console.warn(`  ✗ PE patch failed: ${e.message} — exe will still show console window`)
}

// ── 9. Bundle j2534helper.exe alongside ──────────────────────────────────
console.log('\n• Bundling j2534helper.exe')
if (existsSync(HELPER_SRC)) {
  copyFileSync(HELPER_SRC, resolve(BUILD_DIR, 'j2534helper.exe'))
  const sz = statSync(HELPER_SRC).size
  console.log(`  ✓ ${HELPER_SRC} (${(sz / 1024).toFixed(1)} KB)`)
} else {
  console.warn(`  ✗ Helper not found at ${HELPER_SRC}`)
}

// ── 10. Zip for distribution ──────────────────────────────────────────────
console.log('\n• zip — creating release archive')
mkdirSync(RELEASES_DIR, { recursive: true })
if (existsSync(ZIP_PATH)) rmSync(ZIP_PATH)
execSync(
  `powershell -NoProfile -Command "Compress-Archive -Path '${EXE_PATH}','${resolve(BUILD_DIR, 'j2534helper.exe')}' -DestinationPath '${ZIP_PATH}' -Force"`,
  { cwd: root, stdio: 'inherit' }
)

// ── 11. NSIS installer (optional — only if NSIS is on PATH) ──────────────
let installerPath = null
console.log('\n• makensis — building NSIS installer')
if (existsSync(NSIS_PATH) && existsSync(INSTALLER_NSI)) {
  try {
    execSync(
      `"${NSIS_PATH}" /V2 "${INSTALLER_NSI}"`,
      { cwd: root, stdio: 'inherit' }
    )
    // installer.nsi writes to ../releases/DCTuningBridge_Setup_v0.2.0.exe
    const candidates = [
      resolve(RELEASES_DIR, `DCTuningBridge_Setup_v${VERSION}.exe`),
      resolve(RELEASES_DIR, 'DCTuningBridge_Setup_v0.2.0.exe'),
    ]
    installerPath = candidates.find(p => existsSync(p)) ?? null
    if (installerPath) {
      console.log(`  ✓ ${installerPath} (${(statSync(installerPath).size / 1024 / 1024).toFixed(1)} MB)`)
    }
  } catch (e) {
    console.warn(`  ✗ NSIS build failed: ${e.message}`)
  }
} else {
  console.log(`  (NSIS not installed at ${NSIS_PATH} — skipping installer)`)
}

const exeSize = (statSync(EXE_PATH).size / 1024 / 1024).toFixed(1)
const zipSize = (statSync(ZIP_PATH).size / 1024 / 1024).toFixed(1)

console.log('\n' + '━'.repeat(60))
console.log(`  ✓ Build complete`)
console.log(`    DCTuningBridge.exe                       ${exeSize} MB`)
console.log(`    DCTuningBridge-v${VERSION}-win-x64.zip   ${zipSize} MB`)
if (installerPath) {
  console.log(`    DCTuningBridge_Setup_v${VERSION}.exe       ${(statSync(installerPath).size / 1024 / 1024).toFixed(1)} MB`)
}
console.log('━'.repeat(60))
