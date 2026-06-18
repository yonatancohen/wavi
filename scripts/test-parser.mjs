#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// scripts/test-parser.mjs
// Test the WhatsApp .txt export parser against a real file.
// Usage: node scripts/test-parser.mjs path/to/export.txt
// ─────────────────────────────────────────────────────────────
import { readFileSync } from 'fs'
import { resolve } from 'path'

const filePath = process.argv[2]
if (!filePath) {
  console.error('Usage: node scripts/test-parser.mjs <path-to-export.txt>')
  process.exit(1)
}

// Inline the parser logic (avoid needing to build first)
const IOS_PATTERN     = /^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),\s*(\d{1,2}:\d{2}(?::\d{2})?)\]\s+(.+?):\s(.+)$/
const ANDROID_PATTERN = /^(\d{1,2}\/\d{1,2}\/\d{2,4}),\s*(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)\s+-\s+(.+?):\s(.+)$/

const SYSTEM = [
  /Messages and calls are end-to-end encrypted/i,
  /created group/i, /left$/i, /removed$/i, /joined using/i,
  /changed the subject/i, /security code changed/i,
  /יצר\/ה קבוצה/, /הוסיף\/ה אותך/, /עזב\/ה/,
]
const MEDIA = [/<Media omitted>/i, /<image omitted>/i, /תמונה הושמטה/i]

function parseLine(line) {
  const clean = line.replace(/[\u200e\u200f\u202a-\u202e]/g, '').trim()
  const match = clean.match(IOS_PATTERN) ?? clean.match(ANDROID_PATTERN)
  if (!match) return null
  const [, , , senderName, body] = match
  return {
    sender: senderName.trim(),
    body: body.trim(),
    isSystem: SYSTEM.some(p => p.test(body)),
    isMedia: MEDIA.some(p => p.test(body)),
  }
}

const raw    = readFileSync(resolve(filePath), 'utf-8')
const lines  = raw.split('\n')

let parsed = 0, skipped = 0, system = 0, media = 0
const senders = new Map()

let current = null
const messages = []

for (const line of lines) {
  const stripped = line.replace(/[\u200e\u200f\u202a-\u202e]/g, '').trim()
  const isNew = IOS_PATTERN.test(stripped) || ANDROID_PATTERN.test(stripped)

  if (isNew) {
    if (current) {
      const msg = parseLine(current)
      if (msg) {
        messages.push(msg)
        if (msg.isSystem) system++
        else if (msg.isMedia) media++
        else {
          parsed++
          senders.set(msg.sender, (senders.get(msg.sender) ?? 0) + 1)
        }
      } else skipped++
    }
    current = stripped
  } else if (current) {
    current += '\n' + stripped
  }
}

// ── Report ────────────────────────────────────────────────────
console.log('\n╔══════════════════════════════════════╗')
console.log('║    Wavi — Parser Test Report         ║')
console.log('╚══════════════════════════════════════╝\n')

const format = process.argv[2]?.toLowerCase().endsWith('.txt') ? 'detected' : 'unknown'

// Detect format
const firstLines = raw.split('\n').slice(0, 3).join('\n')
const detectedFormat = IOS_PATTERN.test(firstLines.replace(/[\u200e\u200f]/g, ''))
  ? 'iOS' : ANDROID_PATTERN.test(firstLines.replace(/[\u200e\u200f]/g, ''))
  ? 'Android' : 'Unknown'

console.log(`File:    ${filePath}`)
console.log(`Format:  ${detectedFormat}`)
console.log(`Lines:   ${lines.length.toLocaleString()}`)
console.log('')
console.log(`✓ Parsed messages:   ${parsed.toLocaleString()}`)
console.log(`⊘ System messages:   ${system.toLocaleString()}`)
console.log(`⊘ Media omitted:     ${media.toLocaleString()}`)
console.log(`✗ Unparsed lines:    ${skipped.toLocaleString()}`)
console.log('')

if (senders.size > 0) {
  console.log('Senders:')
  const sorted = [...senders.entries()].sort((a, b) => b[1] - a[1])
  for (const [name, count] of sorted) {
    const bar = '█'.repeat(Math.min(Math.round(count / parsed * 40), 40))
    console.log(`  ${name.padEnd(20)} ${String(count).padStart(5)} ${bar}`)
  }
}

// Sample first 3 parsed messages
console.log('\nSample (first 3 real messages):')
const real = messages.filter(m => !m.isSystem && !m.isMedia).slice(0, 3)
for (const m of real) {
  console.log(`  [${m.sender}]: ${m.body.slice(0, 80)}${m.body.length > 80 ? '…' : ''}`)
}

const score = parsed > 0 ? Math.round(parsed / (parsed + skipped) * 100) : 0
console.log(`\nParse success rate: ${score}%`)
if (score < 80) {
  console.log('\n⚠  Low parse rate. Check the file format and report an issue.')
} else {
  console.log('\n✓  Ready to ingest!')
}
console.log('')
