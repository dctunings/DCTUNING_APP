// AI service (Electron main process).
//
// Thin wrapper around Claude's Messages API. Runs in main — never renderer —
// so the API key is protected by Electron's safeStorage (OS keychain on every
// platform). The renderer never sees the key; it only invokes IPC verbs.
//
// Why fetch-based and not the Anthropic SDK:
//   • Zero new npm deps — just built-in Node 18+ fetch
//   • Full control over request shape (tools, streaming later)
//   • Same code path works identically in electron-vite dev + prod builds
//
// Safety:
//   • The AI layer is read-only from the product's perspective. No tool here
//     writes binary files, modifies tunes, or executes destructive actions.
//     That stays inside stageEngine / remapEngine / binaryParser.
//   • System prompt (set by caller) establishes the copilot role and boundaries.

import { app, safeStorage } from 'electron'
import { join } from 'path'
import fs from 'fs'

const KEY_FILE = () => join(app.getPath('userData'), 'ai-key.dat')

export type AIRole = 'user' | 'assistant'

// Content blocks match the Anthropic Messages API shape. We keep the typing
// loose (unknown-ish) because renderer-side tool execution owns the interpretation.
export type AIContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string | AIContentBlock[]; is_error?: boolean }

export interface AIMessage {
  role: AIRole
  content: string | AIContentBlock[]   // string for simple user msgs; blocks for tool dance
}

export interface AITool {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

export interface AskParams {
  messages: AIMessage[]
  system?: string
  model?: string
  maxTokens?: number
  tools?: AITool[]                     // optional tool definitions for tool-use loop
}

export interface AskResult {
  ok: boolean
  content?: string                     // convenience — concatenated text blocks
  contentBlocks?: AIContentBlock[]     // full response blocks (for tool-use handling)
  error?: string
  stopReason?: string                  // 'end_turn' | 'tool_use' | 'max_tokens' | etc.
  usage?: { input: number; output: number }
}

// ── Key management ────────────────────────────────────────────────────────
export function hasApiKey(): boolean {
  try {
    return fs.existsSync(KEY_FILE()) && safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

export function setApiKey(key: string): { ok: boolean; error?: string } {
  if (!key || typeof key !== 'string') {
    return { ok: false, error: 'Key missing.' }
  }
  const trimmed = key.trim()
  if (!trimmed.startsWith('sk-ant-')) {
    return { ok: false, error: 'Invalid Claude API key format (must start with sk-ant-).' }
  }
  try {
    if (!safeStorage.isEncryptionAvailable()) {
      return { ok: false, error: 'OS keychain encryption is unavailable on this system. Cannot safely store the key.' }
    }
    const encrypted = safeStorage.encryptString(trimmed)
    fs.writeFileSync(KEY_FILE(), encrypted)
    return { ok: true }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to save API key.'
    return { ok: false, error: msg }
  }
}

export function clearApiKey(): { ok: boolean } {
  try {
    if (fs.existsSync(KEY_FILE())) fs.unlinkSync(KEY_FILE())
  } catch {}
  return { ok: true }
}

function getApiKey(): string | null {
  try {
    if (!fs.existsSync(KEY_FILE())) return null
    const buf = fs.readFileSync(KEY_FILE())
    return safeStorage.decryptString(buf)
  } catch {
    return null
  }
}

// ── Claude Messages API call ──────────────────────────────────────────────
const DEFAULT_MODEL = 'claude-sonnet-4-5'   // good balance of quality + cost for tuning Q&A
const DEFAULT_MAX_TOKENS = 1024

export async function ask(params: AskParams): Promise<AskResult> {
  const key = getApiKey()
  if (!key) {
    return { ok: false, error: 'No API key configured. Open Copilot settings to add one.' }
  }

  const model = params.model ?? DEFAULT_MODEL
  const maxTokens = Math.min(Math.max(params.maxTokens ?? DEFAULT_MAX_TOKENS, 128), 8192)

  // Defensive: filter messages to the expected role set (Anthropic rejects 'system' in messages)
  const safeMessages = params.messages.filter(m => m.role === 'user' || m.role === 'assistant')
  if (safeMessages.length === 0) {
    return { ok: false, error: 'At least one user message is required.' }
  }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: params.system,
        messages: safeMessages,
        ...(params.tools && params.tools.length > 0 ? { tools: params.tools } : {}),
      }),
    })

    if (!res.ok) {
      let detail = ''
      try { detail = await res.text() } catch {}
      return { ok: false, error: `Claude API ${res.status}: ${detail.slice(0, 400)}` }
    }

    const data = (await res.json()) as {
      content?: AIContentBlock[]
      stop_reason?: string
      usage?: { input_tokens?: number; output_tokens?: number }
    }

    const blocks: AIContentBlock[] = Array.isArray(data.content) ? data.content : []
    const text = blocks
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map(b => b.text)
      .join('\n')

    return {
      ok: true,
      content: text,
      contentBlocks: blocks,
      stopReason: data.stop_reason,
      usage: data.usage
        ? { input: data.usage.input_tokens ?? 0, output: data.usage.output_tokens ?? 0 }
        : undefined,
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Request failed.'
    return { ok: false, error: msg }
  }
}
