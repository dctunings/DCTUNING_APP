// Extract every .zip in ~/Desktop/DLS/ into D:/dctuning-scan/dls_extract/
// so the existing recipe extractor (which already roots D:/dctuning-scan)
// picks up the contained pair files.
//
// DLS-folder ZIPs contain DAMOS-style pair structures:
//   <Vehicle_Description>/<HW_PART>/original_<SW>.dat
//   <Vehicle_Description>/<HW_PART>/Stage_1_<SW>.dat
//   <Vehicle_Description>/<HW_PART>/Stage_2_<SW>.dat
//
// The vehicle description folder gives a clean sourceFolder hint, the HW
// folder gives the part number (the recipe extractor's parent-folder
// fallback will pick it up after we wire that), and the filename gives
// stage + SW.
//
// Damo's spec: "all in RAR" — actually they're ZIPs (verified via `file`).
// We use Node's built-in unzip via a lightweight stream-based approach.
// To keep dependencies zero, we shell out to `tar -xf` which understands
// ZIP on modern Windows + Git Bash.

import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const SRC = 'C:/Users/damoc/Desktop/DLS'
const DEST = 'D:/dctuning-scan/dls_extract'

if (!fs.existsSync(SRC)) {
  console.error(`✗ DLS folder not found: ${SRC}`)
  process.exit(1)
}
fs.mkdirSync(DEST, { recursive: true })

const zips = fs.readdirSync(SRC).filter(n => n.toLowerCase().endsWith('.zip'))
console.log(`Found ${zips.length} ZIPs in ${SRC}`)
console.log(`Extracting to ${DEST}\n`)

let ok = 0, fail = 0
for (let i = 0; i < zips.length; i++) {
  const zip = zips[i]
  const fullSrc = path.join(SRC, zip).replace(/\\/g, '/')
  // Each ZIP gets its own subdirectory (some ZIPs don't put a top-level dir
  // inside, so this prevents them from spilling files all over the dest).
  const stem = zip.replace(/\.zip$/i, '').replace(/[^A-Za-z0-9_.\- ]+/g, '_')
  const subDest = path.join(DEST, stem)
  fs.mkdirSync(subDest, { recursive: true })

  try {
    // Use Git Bash's unzip — Windows tar doesn't read ZIP cleanly here.
    // -o = overwrite without prompting. -q = quiet (we batch-print progress).
    execSync(`unzip -oq "${fullSrc}" -d "${subDest.replace(/\\/g, '/')}"`, { stdio: 'pipe', shell: 'C:/Program Files/Git/bin/bash.exe' })
    ok++
  } catch (e) {
    // Fallback to PowerShell Expand-Archive when bash/unzip aren't on PATH
    try {
      execSync(`powershell -NoProfile -Command "Expand-Archive -LiteralPath '${fullSrc}' -DestinationPath '${subDest.replace(/\//g, '\\')}' -Force"`, { stdio: 'pipe' })
      ok++
    } catch (e2) {
      fail++
      console.log(`  ✗ ${zip}: ${e2.message.split('\n')[0]}`)
    }
  }
  if ((i + 1) % 25 === 0 || i === zips.length - 1) {
    process.stdout.write(`\r  ${i + 1}/${zips.length}  (ok ${ok}, fail ${fail})`)
  }
}
console.log()
console.log(`\nDone. Extracted ${ok}/${zips.length} ZIPs.`)
console.log(`Output: ${DEST}`)
