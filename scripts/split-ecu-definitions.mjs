#!/usr/bin/env node
/**
 * Split ecuDefinitions.ts into per-family TypeScript files
 * v4.0 — Correctly handles multiple export arrays
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

const SRC_FILE = new URL('../src/renderer/src/lib/ecuDefinitions.ts', import.meta.url).pathname
const OUT_DIR = new URL('../src/renderer/src/lib/ecu-definitions', import.meta.url).pathname

// Read source
const lines = readFileSync(SRC_FILE, 'utf-8').split('\n')
console.log(`File has ${lines.length} lines`)

// Find the ECU_DEFINITIONS array start
let arrayStartLine = -1
for (let i = 0; i < lines.length; i++) {
  if (lines[i].trim().startsWith('export const ECU_DEFINITIONS: EcuDef[] = [')) {
    arrayStartLine = i
    break
  }
}

if (arrayStartLine === -1) {
  console.error('Could not find ECU_DEFINITIONS array')
  process.exit(1)
}
console.log(`Array starts at line ${arrayStartLine + 1}`)

// Find the next `export const` after the array start — that's the next export
let arrayEndLine = -1
for (let i = arrayStartLine + 1; i < lines.length; i++) {
  if (lines[i].trim().startsWith('export const ')) {
    // The previous non-empty line before the next export is the array end
    for (let j = i - 1; j > arrayStartLine; j--) {
      const trimmed = lines[j].trim()
      if (trimmed !== '' && !trimmed.startsWith('//')) {
        if (trimmed === ']') {
          arrayEndLine = j
        } else {
          // Array end might be on the same line as the last object
          arrayEndLine = j
        }
        break
      }
    }
    break
  }
}

if (arrayEndLine === -1) {
  // Fallback: search backwards from end for ]
  for (let i = lines.length - 1; i > arrayStartLine; i--) {
    if (lines[i].trim() === ']') {
      arrayEndLine = i
      break
    }
  }
}

if (arrayEndLine === -1) {
  console.error('Could not find array end')
  process.exit(1)
}
console.log(`Array ends at line ${arrayEndLine + 1}`)

// Extract individual ECU definitions
// Each ECU is a top-level object in the array: starts with `  {` at indent 2
const ecuRanges = []
let currentStart = -1
let currentBraceDepth = 0
let inString = false
let stringChar = ''
let escape = false

for (let i = arrayStartLine + 1; i < arrayEndLine; i++) {
  const line = lines[i]
  const trimmed = line.trimStart()

  // Skip empty lines and full-line comments
  if (trimmed === '' || trimmed.startsWith('//')) continue

  // Check if this line starts a new top-level object in the array
  if (line.match(/^  \{/) && currentBraceDepth === 0) {
    currentStart = i
    currentBraceDepth = 1
    continue
  }

  if (currentStart === -1) continue

  // Count braces on this line, respecting strings
  for (let j = 0; j < line.length; j++) {
    const ch = line[j]
    if (escape) { escape = false; continue }
    if (ch === '\\') { escape = true; continue }
    if (!inString && (ch === '"' || ch === "'" || ch === '`')) {
      inString = true; stringChar = ch; continue
    }
    if (inString && ch === stringChar) { inString = false; continue }
    if (inString) continue

    if (ch === '{') currentBraceDepth++
    else if (ch === '}') {
      currentBraceDepth--
      if (currentBraceDepth === 0) {
        ecuRanges.push({ start: currentStart, end: i })
        currentStart = -1
        break
      }
    }
  }
}

console.log(`Found ${ecuRanges.length} ECU definitions`)

// Parse metadata from each ECU
function parseMetadata(ecuLines) {
  const text = ecuLines.join('\n')
  const idMatch = text.match(/id:\s*['"]([^'"]+)['"]/)
  const nameMatch = text.match(/name:\s*['"]([^'"]+)['"]/)
  const manufacturerMatch = text.match(/manufacturer:\s*['"]([^'"]+)['"]/)
  const familyMatch = text.match(/family:\s*['"]([^'"]+)['"]/)

  return {
    id: idMatch ? idMatch[1] : 'unknown',
    name: nameMatch ? nameMatch[1] : 'Unknown',
    manufacturer: manufacturerMatch ? manufacturerMatch[1] : 'Unknown',
    family: familyMatch ? familyMatch[1] : 'Unknown',
  }
}

// Group by manufacturer + family
const groups = {}
for (const range of ecuRanges) {
  const ecuLines = lines.slice(range.start, range.end + 1)
  const meta = parseMetadata(ecuLines)
  const groupKey = `${meta.manufacturer}_${meta.family}`

  if (!groups[groupKey]) {
    groups[groupKey] = {
      manufacturer: meta.manufacturer,
      family: meta.family,
      ecus: [],
    }
  }

  groups[groupKey].ecus.push(ecuLines.join('\n'))
}

// Create output directory
mkdirSync(OUT_DIR, { recursive: true })

// Write each group as a TypeScript file
const manifest = []
for (const [key, group] of Object.entries(groups)) {
  const filename = `${key.replace(/[^a-zA-Z0-9_]/g, '_')}.ts`
  const filepath = join(OUT_DIR, filename)
  const exportName = `${group.manufacturer}_${group.family.replace(/[^a-zA-Z0-9_]/g, '_')}_DEFINITIONS`

  const tsContent = `/**
 * ECU Definitions: ${group.manufacturer} ${group.family}
 * Auto-generated from ecuDefinitions.ts
 * DO NOT EDIT DIRECTLY — edit the source and regenerate
 */

import type { EcuDef } from '../ecuDefinitions'

export const ${exportName}: EcuDef[] = [
${group.ecus.join(',\n')}
]
`

  writeFileSync(filepath, tsContent)
  console.log(`✅ Wrote ${group.ecus.length} ECUs to ${filename}`)

  manifest.push({
    file: filename,
    manufacturer: group.manufacturer,
    family: group.family,
    count: group.ecus.length,
    exportName,
  })
}

// Write manifest
const manifestPath = join(OUT_DIR, 'manifest.ts')
writeFileSync(manifestPath, `/**
 * ECU Definitions Manifest
 * Auto-generated — lists all available ECU definition families
 */

export interface EcuFamilyInfo {
  file: string
  manufacturer: string
  family: string
  count: number
  exportName: string
}

export const ECU_FAMILIES: EcuFamilyInfo[] = ${JSON.stringify(manifest, null, 2)}

export const TOTAL_ECUS = ${manifest.reduce((s, m) => s + m.count, 0)}
`)
console.log(`✅ Wrote manifest.ts with ${manifest.length} families (${manifest.reduce((s, m) => s + m.count, 0)} total ECUs)`)

// Write dynamic loader
const loaderPath = join(OUT_DIR, 'index.ts')
writeFileSync(loaderPath, `/**
 * ECU Definitions Dynamic Loader
 * v1.0.0 — Lazy-loads ECU families on demand
 */

import type { EcuDef } from '../ecuDefinitions'
import { ECU_FAMILIES, TOTAL_ECUS } from './manifest'
export { ECU_FAMILIES, TOTAL_ECUS }

// Cache for loaded families
const familyCache = new Map<string, EcuDef[]>()

/**
 * Load a specific ECU family by key (e.g. "Bosch_EDC17")
 */
export async function loadEcuFamily(familyKey: string): Promise<EcuDef[] | null> {
  if (familyCache.has(familyKey)) {
    return familyCache.get(familyKey)!
  }

  const familyInfo = ECU_FAMILIES.find(f =>
    f.file === familyKey + '.ts' ||
    f.exportName === familyKey
  )
  if (!familyInfo) return null

  try {
    const module = await import(\`./\${familyInfo.file.replace(/\\.ts$/, '')}\`)
    const defs = module[familyInfo.exportName] as EcuDef[]
    familyCache.set(familyKey, defs)
    return defs
  } catch (e) {
    console.error(\`Failed to load ECU family \${familyKey}:\`, e)
    return null
  }
}

/**
 * Find ECU definition by identifier string
 */
export async function findEcuByIdent(partialIdent: string): Promise<EcuDef | null> {
  for (const familyInfo of ECU_FAMILIES) {
    const defs = await loadEcuFamily(familyInfo.exportName)
    if (!defs) continue

    for (const ecu of defs) {
      for (const ident of ecu.identStrings) {
        if (ident.includes(partialIdent)) {
          return ecu
        }
      }
    }
  }
  return null
}

/**
 * Get all ECU definitions (loads all families — use sparingly)
 */
export async function loadAllEcus(): Promise<EcuDef[]> {
  const all: EcuDef[] = []
  for (const familyInfo of ECU_FAMILIES) {
    const defs = await loadEcuFamily(familyInfo.exportName)
    if (defs) all.push(...defs)
  }
  return all
}

export function clearFamilyCache(): void {
  familyCache.clear()
}
`)
console.log(`✅ Wrote dynamic loader index.ts`)

console.log('\n🎉 Done! ECU definitions split successfully.')
console.log(`Output: ${OUT_DIR}`)
