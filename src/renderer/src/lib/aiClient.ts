// Unified AI client — abstracts over desktop IPC vs web direct fetch.
//
// Desktop: routes through window.api.ai.* → Electron main (safeStorage-encrypted key).
// Web:     BYOK (Bring Your Own Key). User pastes their Claude API key, stored in
//          localStorage (origin-scoped). Direct fetch to api.anthropic.com with the
//          `anthropic-dangerous-direct-browser-access: true` header.
//
// Why BYOK on web (v3.14.1):
//   • Browsers can't be trusted with a single DCTuning-owned key — anyone with
//     DevTools open can read it out of network requests.
//   • BYOK: the key belongs to the user, their Anthropic account gets billed,
//     the risk is theirs. Clear surface for them to manage in Anthropic console.
//   • No backend proxy needed — web build stays fully static-asset.
//
// The AIChatSidebar + aiTools tool-use loop are completely unchanged by this —
// they both just call `aiClient.ask()` and get back the same shape regardless.

import { isWebMode } from '../components/WebOnlyBanner'

const LS_KEY = 'dctuning.ai.claudeKey'
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'
const DEFAULT_MODEL = 'claude-sonnet-4-5'
const DEFAULT_MAX_TOKENS = 1024

// ── Types (mirror src/main/aiService.ts so the shape stays identical) ────
export type AIRole = 'user' | 'assistant'

export type AIContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string | AIContentBlock[]; is_error?: boolean }

export interface AIMessage {
  role: AIRole
  content: string | AIContentBlock[]
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
  tools?: AITool[]
}

export interface AskResult {
  ok: boolean
  content?: string
  contentBlocks?: AIContentBlock[]
  error?: string
  stopReason?: string
  usage?: { input: number; output: number }
}

// ── Runtime mode helper ──────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getDesktopApi = () => (window as any).api

export function isAIAvailable(): boolean {
  if (isWebMode()) return true   // BYOK path always available in browsers
  return !!getDesktopApi()?.ai?.ask
}

// ── Key management ───────────────────────────────────────────────────────
export async function hasKey(): Promise<boolean> {
  if (!isWebMode()) {
    const api = getDesktopApi()
    return api?.ai?.hasKey ? await api.ai.hasKey() : false
  }
  try {
    return !!localStorage.getItem(LS_KEY)
  } catch {
    return false
  }
}

export async function setKey(key: string): Promise<{ ok: boolean; error?: string }> {
  const trimmed = (key ?? '').trim()
  if (!trimmed.startsWith('sk-ant-')) {
    return { ok: false, error: 'Invalid Claude API key format (must start with sk-ant-).' }
  }
  if (!isWebMode()) {
    const api = getDesktopApi()
    if (!api?.ai?.setKey) return { ok: false, error: 'AI bridge unavailable.' }
    return await api.ai.setKey(trimmed)
  }
  // Web BYOK: localStorage
  try {
    localStorage.setItem(LS_KEY, trimmed)
    return { ok: true }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to save key to browser storage.'
    return { ok: false, error: msg }
  }
}

export async function clearKey(): Promise<{ ok: boolean }> {
  if (!isWebMode()) {
    const api = getDesktopApi()
    if (api?.ai?.clearKey) await api.ai.clearKey()
    return { ok: true }
  }
  try { localStorage.removeItem(LS_KEY) } catch {}
  return { ok: true }
}

// ── Ask ──────────────────────────────────────────────────────────────────
export async function ask(params: AskParams): Promise<AskResult> {
  if (!isWebMode()) {
    const api = getDesktopApi()
    if (!api?.ai?.ask) return { ok: false, error: 'AI bridge unavailable.' }
    return await api.ai.ask(params)
  }
  return askFromBrowser(params)
}

async function askFromBrowser(params: AskParams): Promise<AskResult> {
  const key = readBrowserKey()
  if (!key) {
    return { ok: false, error: 'No API key configured. Set your Claude API key in the AI settings.' }
  }

  const model = params.model ?? DEFAULT_MODEL
  const maxTokens = clamp(params.maxTokens ?? DEFAULT_MAX_TOKENS, 128, 8192)

  const safeMessages = params.messages.filter(m => m.role === 'user' || m.role === 'assistant')
  if (safeMessages.length === 0) {
    return { ok: false, error: 'At least one user message is required.' }
  }

  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': ANTHROPIC_VERSION,
        // Required for direct browser calls with a user-supplied key.
        // See: https://docs.anthropic.com/en/api/client-sdks#browser-support
        'anthropic-dangerous-direct-browser-access': 'true',
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

// ── Helpers ──────────────────────────────────────────────────────────────
function readBrowserKey(): string | null {
  try { return localStorage.getItem(LS_KEY) } catch { return null }
}
function clamp(v: number, lo: number, hi: number): number {
  if (!isFinite(v)) return lo
  return Math.min(Math.max(v, lo), hi)
}
