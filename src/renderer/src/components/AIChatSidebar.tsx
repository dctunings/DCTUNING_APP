// AI Chat Sidebar — the copilot panel for tuning questions.
//
// Scope (v3.14, Phase B.1 — UI scaffold only, no backend yet):
//   • Right-docked panel, toggles open/closed from a header button
//   • Message list (user + assistant bubbles) with auto-scroll to bottom
//   • Input box with Send button + Enter-to-send
//   • Context chips above the input — surface active file / tune / ECU so the
//     user knows what the AI will be asked about
//
// Critical design constraint (from Phase A planning): this panel is READ-ONLY
// and SUGGESTION-ONLY. It does not and must not write to the binary, modify
// the tune, or execute destructive actions. That's the Apply Stage button's
// deterministic tiered engine's job — the AI narrates, explains, and advises.
//
// B.2 will replace the mock send handler with a real IPC call to Claude in
// the Electron main process.

import { useEffect, useRef, useState } from 'react'
import type { EcuDef } from '../lib/ecuDefinitions'
import type { Stage } from '../lib/remapEngine'
import type { StageTier } from '../lib/stageEngine'
import { AI_TOOLS, executeTool } from '../lib/aiTools'
import { loadManifest, type RecipeManifestEntry } from '../lib/recipeEngine'
import * as aiClient from '../lib/aiClient'
import { isWebMode } from './WebOnlyBanner'

// ── Tool-use loop config ──────────────────────────────────────────────────
const MAX_TOOL_ITERATIONS = 4   // safety bound: LLM can chain up to 4 tool calls

// Phase B.5 — log attachment limits
const MAX_LOG_BYTES = 180_000   // ~180KB of text ≈ ~45K tokens, leaves room for reply
const LOG_MIME_TYPES = ['text/plain', 'text/csv', 'application/csv', '']   // '' covers .log files

// Use the shared types from aiClient so shapes stay identical across the
// desktop-IPC path and the web direct-fetch path.
type ContentBlock = aiClient.AIContentBlock
type WireMessage = { role: 'user' | 'assistant'; content: string | ContentBlock[] }

export interface ChatContext {
  fileName?: string                  // currently-loaded ORI file name
  ecuDef?: EcuDef | null             // detected or user-selected EcuDef
  stage?: Stage | null               // last-applied stage (if any)
  tier?: StageTier | null            // the tier the engine resolved to
  mapsModified?: number              // count from the last remap result
  // v3.14 Phase B.3 — richer "last tune" context for Explain This Tune
  remapSummary?: {
    boostChangePct?: number
    fuelChangePct?: number
    torqueChangePct?: number
    mapNames?: string[]              // top-N map names modified with their change%
    perMap?: { name: string; category: string; avgChangePct: number; unit?: string }[]
    validationWarnings?: string[]    // from stageEngine ShapeValidation
    sourceDescription?: string       // e.g. "Applied proven tune from 8DE3" / "Learned multipliers..."
  }
}

// System prompt — establishes copilot role + boundaries. Repeated every call.
function buildSystemPrompt(context: ChatContext): string {
  const contextLines: string[] = []
  if (context.fileName) contextLines.push(`Currently loaded file: ${context.fileName}`)
  if (context.ecuDef) contextLines.push(`Detected ECU: ${context.ecuDef.id} (family: ${context.ecuDef.family})`)
  if (context.stage != null) contextLines.push(`Last applied stage: Stage ${context.stage}`)
  if (context.tier) contextLines.push(`Stage engine tier used: ${context.tier}`)
  if (context.mapsModified != null) contextLines.push(`Maps modified in last tune: ${context.mapsModified}`)

  // Rich tune data (if available) — lets the assistant reason about specific maps
  if (context.remapSummary) {
    const rs = context.remapSummary
    if (rs.sourceDescription) contextLines.push(`Source: ${rs.sourceDescription}`)
    const pctParts: string[] = []
    if (rs.boostChangePct != null && rs.boostChangePct !== 0) pctParts.push(`boost ${rs.boostChangePct > 0 ? '+' : ''}${rs.boostChangePct.toFixed(1)}%`)
    if (rs.fuelChangePct != null && rs.fuelChangePct !== 0) pctParts.push(`fuel ${rs.fuelChangePct > 0 ? '+' : ''}${rs.fuelChangePct.toFixed(1)}%`)
    if (rs.torqueChangePct != null && rs.torqueChangePct !== 0) pctParts.push(`torque ${rs.torqueChangePct > 0 ? '+' : ''}${rs.torqueChangePct.toFixed(1)}%`)
    if (pctParts.length > 0) contextLines.push(`Aggregate change: ${pctParts.join(', ')}`)
    if (rs.perMap && rs.perMap.length > 0) {
      const top = rs.perMap.slice(0, 20)
        .map(m => `  • ${m.name} (${m.category}) ${m.avgChangePct > 0 ? '+' : ''}${m.avgChangePct.toFixed(1)}%${m.unit ? ' ' + m.unit : ''}`)
        .join('\n')
      contextLines.push(`Maps modified (top ${top.split('\n').length}):\n${top}`)
    }
    if (rs.validationWarnings && rs.validationWarnings.length > 0) {
      contextLines.push(`Shape-validator warnings:\n${rs.validationWarnings.map(w => '  ⚠ ' + w).join('\n')}`)
    }
  }

  const contextBlock = contextLines.length > 0 ? `\n\n## Current session context\n${contextLines.join('\n')}` : ''

  return `You are the DCTuning Copilot — an expert tuning assistant built into the DCTuning desktop app.

## Your role
- Explain tunes, maps, and engine behaviour to professional tuners and their customers
- Advise on manual map edits (Zone Editor) and interpret diagnostic logs
- Answer catalog questions grounded in the app's ECU database

## Hard boundaries
- You MUST NOT write to binaries, modify tune files, or execute destructive actions. Tuning is done by the deterministic Stage Engine's Apply Stage button, not by you.
- If asked to tune a file or write bytes, refuse and redirect to the Apply Stage button.
- When uncertain, say so. It is safer to say "I don't know for this variant" than to guess. Bad tunes destroy engines.

## Style
- Concise. Technical but readable. Don't pad answers.
- Use units explicitly (Nm, °BTDC, hPa, mg/stk, kg/h).
- When referencing specific map behaviour, flag it as typical vs proven-for-this-variant.${contextBlock}`
}

// Canned prompts for one-click quick actions
const QUICK_PROMPTS = {
  explainTune:
    'Explain what the last tune actually did. Walk through the notable map changes in the session context (category, direction, magnitude) and what each one means for engine behaviour. Flag anything unusual.',
  explainWarnings:
    'The shape validator flagged warnings for this tune (see session context). For each warning, tell me whether it is expected for this stage and variant, or something that needs manual review before the file is used.',
  safetyCheck:
    'Given the current tune summary, list any safety concerns worth reviewing before flashing this file (EGT risk, knock risk, gearbox torque limits, emissions) — specific to the ECU family and stage.',
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: number
  pending?: boolean                  // assistant bubble shows typing indicator
}

export type QuickAction = 'explain' | 'warnings' | 'safety'
// Phase B.6 — zone editor and other feature surfaces push custom prompts via
// { prompt } instead of a fixed action name.
export type PendingAIAction = QuickAction | { prompt: string }

export interface Props {
  open: boolean
  onClose: () => void
  context: ChatContext
  // Phase B.3: when the RemapBuilder asks the chat to run a canned prompt, this
  // prop carries the action and onActionConsumed clears it once the chat has
  // dispatched the send. Single-use trigger.
  pendingAction?: PendingAIAction | null
  onActionConsumed?: () => void
}

export default function AIChatSidebar({ open, onClose, context, pendingAction, onActionConsumed }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [hasKey, setHasKey] = useState<boolean | null>(null)   // null = unchecked
  const [showKeySetup, setShowKeySetup] = useState(false)
  const [keyInput, setKeyInput] = useState('')
  const [keyError, setKeyError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  // Phase B.4 — cache the recipe manifest once for the list_recipe_variants tool.
  // loadManifest handles desktop (IPC) and web (fetch) transparently.
  const recipeManifestRef = useRef<RecipeManifestEntry[] | null>(null)
  useEffect(() => {
    if (recipeManifestRef.current) return
    loadManifest().then(m => { recipeManifestRef.current = m }).catch(() => {})
  }, [])

  // Phase B.5 — attached log file (text). Included as context in the next user
  // message and cleared after send. Capped at MAX_LOG_BYTES to keep token use sane.
  const [attachment, setAttachment] = useState<{ name: string; text: string } | null>(null)
  const [attachError, setAttachError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Check API key status when panel opens. aiClient handles desktop (IPC) vs
  // web (localStorage BYOK) transparently.
  useEffect(() => {
    if (!open) return
    aiClient.hasKey().then(setHasKey).catch(() => setHasKey(false))
  }, [open])

  // Auto-scroll to latest message when it changes
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  // Seed a greeting the first time the panel opens
  useEffect(() => {
    if (!open || messages.length > 0) return
    setMessages([{
      id: 'welcome',
      role: 'assistant',
      content:
        "I'm your tuning copilot. Ask me anything about the currently-loaded file, " +
        "the tune that was just applied, or the ECU catalog. I don't write or modify " +
        "binaries — that's what the Apply Stage button is for. I only explain and advise.",
      createdAt: Date.now(),
    }])
  }, [open, messages.length])

  // Phase B.3 / B.6 — consume a pendingAction from RemapBuilder or Zone Editor.
  // Wait until the key status has been checked (hasKey !== null) and the panel
  // is open so we don't fire before hasKey gates kick in or before the greeting.
  useEffect(() => {
    if (!open || !pendingAction || hasKey === null || sending) return
    let prompt: string
    if (typeof pendingAction === 'string') {
      prompt = pendingAction === 'explain' ? QUICK_PROMPTS.explainTune
        : pendingAction === 'warnings' ? QUICK_PROMPTS.explainWarnings
        : QUICK_PROMPTS.safetyCheck
    } else {
      prompt = pendingAction.prompt
    }
    onActionConsumed?.()
    handleSend(prompt)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pendingAction, hasKey])

  const handleSaveKey = async () => {
    setKeyError(null)
    const res = await aiClient.setKey(keyInput)
    if (res?.ok) {
      setHasKey(true)
      setShowKeySetup(false)
      setKeyInput('')
    } else {
      setKeyError(res?.error ?? 'Failed to save key.')
    }
  }

  const handleClearKey = async () => {
    await aiClient.clearKey()
    setHasKey(false)
  }

  // Phase B.5 — log attachment
  const handleAttachClick = () => fileInputRef.current?.click()
  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setAttachError(null)
    const f = e.target.files?.[0]
    if (!f) return
    e.target.value = ''  // allow re-selecting the same file later
    if (f.size > MAX_LOG_BYTES * 2) {
      setAttachError(`File too large (${Math.round(f.size / 1024)} KB). Truncate to ~${Math.round(MAX_LOG_BYTES / 1024)} KB or paste an excerpt instead.`)
      return
    }
    // MIME check is advisory — browsers don't set it for .log / many CSVs
    const extOK = /\.(log|txt|csv|tsv|json)$/i.test(f.name)
    if (!extOK && !LOG_MIME_TYPES.includes(f.type)) {
      setAttachError('Unsupported file type. Attach a .log / .csv / .txt / .tsv file.')
      return
    }
    try {
      const text = await f.text()
      const trimmed = text.length > MAX_LOG_BYTES
        ? text.slice(0, MAX_LOG_BYTES) + `\n\n[… truncated after ${MAX_LOG_BYTES} bytes]`
        : text
      setAttachment({ name: f.name, text: trimmed })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to read file.'
      setAttachError(msg)
    }
  }
  const clearAttachment = () => { setAttachment(null); setAttachError(null) }

  const handleSend = async (explicitText?: string) => {
    const text = (explicitText ?? input).trim()
    if (!text || sending) return

    // Block send if no key — surface the setup prompt instead
    if (hasKey === false) {
      setShowKeySetup(true)
      return
    }

    // Phase B.5 — if the user has attached a log, inline it into this turn's
    // content with a clear wrapper, then clear the attachment state.
    const attachmentBlock = attachment
      ? `\n\n## Attached log: ${attachment.name}\n\`\`\`\n${attachment.text}\n\`\`\``
      : ''
    // What the user sees in their bubble: just the text + a small attachment note
    const displayContent = attachment
      ? `${text}\n\n📎 Attached: ${attachment.name}`
      : text
    // What the LLM actually receives: the full log inlined
    const wireContent = text + attachmentBlock

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: displayContent,
      createdAt: Date.now(),
    }
    setMessages(prev => [...prev, userMsg])
    if (!explicitText) setInput('')
    if (attachment) setAttachment(null)   // one-shot — clear after sending
    setSending(true)

    const pendingId = `a-${Date.now()}`
    setMessages(prev => [...prev, {
      id: pendingId, role: 'assistant', content: '', createdAt: Date.now(), pending: true,
    }])

    try {
      // Build the initial wire history (excluding the welcome bubble + the pending placeholder)
      // For the newest user message, swap in the wireContent (which has the
      // attached log inlined) instead of the display version.
      const initialHistory: WireMessage[] = [...messages, userMsg]
        .filter(m => m.id !== 'welcome' && !m.pending)
        .map(m => ({
          role: m.role === 'assistant' ? 'assistant' as const : 'user' as const,
          content: m.id === userMsg.id ? wireContent : m.content,
        }))

      // ── Tool-use loop ─────────────────────────────────────────────────
      // Repeatedly: send → check for tool_use blocks → execute → resend.
      // Bounded by MAX_TOOL_ITERATIONS so the LLM can't loop forever.
      // aiClient routes to Electron IPC (desktop) or direct fetch (web BYOK).
      let wireHistory: WireMessage[] = initialHistory
      let finalText = ''
      let finalError: string | null = null

      for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
        const res = await aiClient.ask({
          messages: wireHistory as aiClient.AIMessage[],
          system: buildSystemPrompt(context),
          maxTokens: 1024,
          tools: AI_TOOLS as unknown as aiClient.AITool[],
        })

        if (!res?.ok) {
          finalError = res?.error ?? 'Request failed.'
          break
        }

        const blocks: ContentBlock[] = res.contentBlocks ?? []
        const textBlocks = blocks.filter((b): b is { type: 'text'; text: string } => b.type === 'text')
        const toolUses = blocks.filter((b): b is { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> } => b.type === 'tool_use')

        // Accumulate any text the model gave us
        if (textBlocks.length > 0) finalText = textBlocks.map(b => b.text).join('\n')

        // If the model did NOT request tools, we're done
        if (toolUses.length === 0 || res.stopReason !== 'tool_use') break

        // Execute each tool_use locally and collect tool_result blocks
        const toolResults: ContentBlock[] = []
        for (const tu of toolUses) {
          const exec = await executeTool(tu.name, tu.input, recipeManifestRef.current)
          toolResults.push({
            type: 'tool_result',
            tool_use_id: tu.id,
            content: JSON.stringify(exec.ok ? exec.result : { error: exec.error }),
            is_error: !exec.ok,
          })
        }

        // Extend wire history: assistant's tool_use blocks + user's tool_result blocks
        wireHistory = [
          ...wireHistory,
          { role: 'assistant', content: blocks },
          { role: 'user', content: toolResults },
        ]
      }

      setMessages(prev => prev.map(m => m.id === pendingId ? {
        ...m,
        pending: false,
        content: finalError
          ? `⚠ ${finalError}`
          : (finalText || '(empty response)'),
      } : m))
    } finally {
      setSending(false)
    }
  }

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (!open) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 0, right: 0, bottom: 0,
        width: 380,
        background: 'var(--bg-secondary, #0b1020)',
        borderLeft: '1px solid var(--border, rgba(255,255,255,0.08))',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 1000,
        boxShadow: '-8px 0 24px rgba(0,0,0,0.35)',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 14px',
          borderBottom: '1px solid var(--border, rgba(255,255,255,0.08))',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 26, height: 26, borderRadius: 6,
            background: 'linear-gradient(135deg, #00aec8, #7c3aed)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 900, color: '#000',
          }}>AI</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text, #fff)' }}>Tuning Copilot</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted, #94a3b8)', letterSpacing: 0.3 }}>
              Explain · Advise · QA · Sales support
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => setShowKeySetup(true)}
            aria-label="AI settings"
            title={hasKey ? 'API key configured' : 'Set API key'}
            style={{
              background: 'transparent', border: '1px solid var(--border, rgba(255,255,255,0.12))',
              color: hasKey ? '#22c55e' : '#eab308', borderRadius: 6, padding: '4px 10px',
              cursor: 'pointer', fontSize: 13,
            }}
          >{hasKey ? '●' : '○'}</button>
          <button
            onClick={onClose}
            aria-label="Close AI chat"
            style={{
              background: 'transparent', border: '1px solid var(--border, rgba(255,255,255,0.12))',
              color: 'var(--text-muted, #94a3b8)', borderRadius: 6, padding: '4px 10px',
              cursor: 'pointer', fontSize: 13,
            }}
          >✕</button>
        </div>
      </div>

      {/* Key setup overlay */}
      {showKeySetup && (
        <KeySetupPanel
          hasKey={!!hasKey}
          keyInput={keyInput}
          setKeyInput={setKeyInput}
          keyError={keyError}
          onSave={handleSaveKey}
          onClear={handleClearKey}
          onCancel={() => { setShowKeySetup(false); setKeyError(null); setKeyInput('') }}
        />
      )}

      {/* Context chips */}
      <ContextChips context={context} />

      {/* v3.14 Phase B.3 — Quick-actions bar. Shown when there's a tune to talk about. */}
      {(context.remapSummary || context.tier) && hasKey !== false && !showKeySetup && (
        <div style={{
          padding: '8px 14px',
          borderBottom: '1px solid var(--border, rgba(255,255,255,0.05))',
          display: 'flex', flexWrap: 'wrap', gap: 6,
        }}>
          <QuickActionButton
            label="Explain this tune"
            disabled={sending}
            onClick={() => handleSend(QUICK_PROMPTS.explainTune)}
          />
          {context.remapSummary?.validationWarnings && context.remapSummary.validationWarnings.length > 0 && (
            <QuickActionButton
              label="Explain warnings"
              disabled={sending}
              onClick={() => handleSend(QUICK_PROMPTS.explainWarnings)}
            />
          )}
          <QuickActionButton
            label="Safety check"
            disabled={sending}
            onClick={() => handleSend(QUICK_PROMPTS.safetyCheck)}
          />
        </div>
      )}

      {/* Messages */}
      <div
        ref={scrollRef}
        style={{
          flex: 1, overflowY: 'auto', padding: '12px 14px',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}
      >
        {messages.map(m => <MessageBubble key={m.id} message={m} />)}
      </div>

      {/* Input + attachment (Phase B.5) */}
      <div style={{ borderTop: '1px solid var(--border, rgba(255,255,255,0.08))' }}>
        {(attachment || attachError) && (
          <div style={{
            padding: '6px 10px',
            background: attachError ? 'rgba(239,68,68,0.08)' : 'rgba(0,174,200,0.08)',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
            fontSize: 11, color: attachError ? '#fca5a5' : '#7dd3fc',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            {attachError ? (
              <span>⚠ {attachError}</span>
            ) : (
              <span>📎 {attachment!.name} <span style={{ opacity: 0.6 }}>({Math.round(attachment!.text.length / 1024)} KB)</span></span>
            )}
            <button
              onClick={attachError ? () => setAttachError(null) : clearAttachment}
              style={{
                background: 'transparent', border: 'none', color: 'inherit',
                cursor: 'pointer', fontSize: 11, padding: '0 4px',
              }}
            >✕</button>
          </div>
        )}
        <div style={{ padding: 10, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".log,.txt,.csv,.tsv,.json,text/plain,text/csv"
            style={{ display: 'none' }}
            onChange={handleFileSelected}
          />
          <button
            onClick={handleAttachClick}
            disabled={sending}
            title="Attach a log file (.log / .csv / .txt)"
            style={{
              padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border, rgba(255,255,255,0.12))',
              background: 'transparent', color: 'var(--text-muted, #94a3b8)',
              cursor: sending ? 'not-allowed' : 'pointer', fontSize: 14, lineHeight: 1,
            }}
          >📎</button>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKey}
            placeholder={attachment ? 'Ask about the attached log…' : 'Ask about the loaded file, tune, or catalog…'}
            rows={2}
            style={{
              flex: 1, resize: 'none', padding: 10, borderRadius: 6,
              background: 'rgba(0,0,0,0.25)',
              border: '1px solid var(--border, rgba(255,255,255,0.1))',
              color: 'var(--text, #fff)', fontSize: 12, lineHeight: 1.4,
              fontFamily: 'inherit',
            }}
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || sending}
            style={{
              padding: '8px 14px', borderRadius: 6, border: 'none',
              background: input.trim() && !sending ? '#22c55e' : 'rgba(34,197,94,0.25)',
              color: input.trim() && !sending ? '#000' : 'rgba(255,255,255,0.35)',
              cursor: input.trim() && !sending ? 'pointer' : 'not-allowed',
              fontWeight: 700, fontSize: 12,
            }}
          >{sending ? '…' : 'Send'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Context chips ──────────────────────────────────────────────────────────
function ContextChips({ context }: { context: ChatContext }) {
  const chips: { label: string; value: string }[] = []
  if (context.fileName) chips.push({ label: 'File', value: context.fileName })
  if (context.ecuDef) chips.push({ label: 'ECU', value: `${context.ecuDef.id} (${context.ecuDef.family})` })
  if (context.stage != null) chips.push({ label: 'Stage', value: String(context.stage) })
  if (context.tier) chips.push({ label: 'Tier', value: context.tier })
  if (context.mapsModified != null) chips.push({ label: 'Maps', value: String(context.mapsModified) })
  if (chips.length === 0) return null

  return (
    <div style={{
      padding: '8px 14px', borderBottom: '1px solid var(--border, rgba(255,255,255,0.05))',
      display: 'flex', flexWrap: 'wrap', gap: 6,
      background: 'rgba(255,255,255,0.02)',
    }}>
      {chips.map(c => (
        <span
          key={c.label}
          style={{
            fontSize: 10, padding: '3px 8px', borderRadius: 4,
            background: 'rgba(0,174,200,0.12)',
            border: '1px solid rgba(0,174,200,0.25)',
            color: '#7dd3fc', letterSpacing: 0.2,
          }}
        >
          <span style={{ opacity: 0.65, marginRight: 4 }}>{c.label}:</span>
          <span style={{ fontWeight: 600 }}>{c.value}</span>
        </span>
      ))}
    </div>
  )
}

// ── Key setup overlay ──────────────────────────────────────────────────────
function KeySetupPanel(props: {
  hasKey: boolean
  keyInput: string
  setKeyInput: (s: string) => void
  keyError: string | null
  onSave: () => void
  onClear: () => void
  onCancel: () => void
}) {
  const web = isWebMode()
  return (
    <div style={{
      padding: 14,
      background: 'rgba(124,58,237,0.06)',
      borderBottom: '1px solid rgba(124,58,237,0.25)',
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: '#c4b5fd' }}>
        Claude API Key {web && <span style={{ fontSize: 10, fontWeight: 600, color: '#fde68a', marginLeft: 6 }}>BYOK — Web</span>}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted, #94a3b8)', marginBottom: 10, lineHeight: 1.5 }}>
        {web ? (
          <>
            Web version uses <strong>Bring Your Own Key</strong>. Your key is stored
            in this browser's localStorage and sent directly to Anthropic — DCTuning
            never sees it. <strong style={{ color: '#fde68a' }}>You will be billed on your Anthropic account</strong> for all usage.
            {' '}Get a key at <span style={{ color: '#7dd3fc' }}>console.anthropic.com</span>.
            Desktop app encrypts the key in the OS keychain instead.
          </>
        ) : (
          <>
            The key is encrypted with your OS keychain via Electron safeStorage and
            never leaves this machine. Get one at{' '}
            <span style={{ color: '#7dd3fc' }}>console.anthropic.com</span>.
          </>
        )}
      </div>
      <input
        type="password"
        value={props.keyInput}
        onChange={e => props.setKeyInput(e.target.value)}
        placeholder="sk-ant-..."
        style={{
          width: '100%', padding: 8, borderRadius: 6,
          background: 'rgba(0,0,0,0.3)',
          border: '1px solid var(--border, rgba(255,255,255,0.1))',
          color: 'var(--text, #fff)', fontSize: 12, fontFamily: 'monospace',
          boxSizing: 'border-box',
        }}
      />
      {props.keyError && (
        <div style={{ fontSize: 11, color: '#fca5a5', marginTop: 6 }}>{props.keyError}</div>
      )}
      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        <button
          onClick={props.onSave}
          disabled={!props.keyInput.trim()}
          style={{
            flex: 1, padding: '6px 10px', borderRadius: 6, border: 'none',
            background: props.keyInput.trim() ? '#22c55e' : 'rgba(34,197,94,0.25)',
            color: props.keyInput.trim() ? '#000' : 'rgba(255,255,255,0.35)',
            cursor: props.keyInput.trim() ? 'pointer' : 'not-allowed',
            fontWeight: 700, fontSize: 11,
          }}
        >Save key</button>
        {props.hasKey && (
          <button
            onClick={props.onClear}
            style={{
              padding: '6px 10px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.4)',
              background: 'transparent', color: '#fca5a5',
              cursor: 'pointer', fontSize: 11,
            }}
          >Clear</button>
        )}
        <button
          onClick={props.onCancel}
          style={{
            padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border, rgba(255,255,255,0.12))',
            background: 'transparent', color: 'var(--text-muted, #94a3b8)',
            cursor: 'pointer', fontSize: 11,
          }}
        >Cancel</button>
      </div>
    </div>
  )
}

// ── Quick action button ────────────────────────────────────────────────────
function QuickActionButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        fontSize: 10, padding: '4px 8px', borderRadius: 4,
        background: 'rgba(124,58,237,0.12)',
        border: '1px solid rgba(124,58,237,0.35)',
        color: disabled ? 'rgba(196,181,253,0.4)' : '#c4b5fd',
        cursor: disabled ? 'not-allowed' : 'pointer',
        letterSpacing: 0.2, fontWeight: 600,
      }}
    >
      {label}
    </button>
  )
}

// ── Message bubble ─────────────────────────────────────────────────────────
function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  return (
    <div
      style={{
        alignSelf: isUser ? 'flex-end' : 'flex-start',
        maxWidth: '85%',
        background: isUser ? 'rgba(34,197,94,0.16)' : 'rgba(255,255,255,0.04)',
        border: isUser
          ? '1px solid rgba(34,197,94,0.3)'
          : '1px solid var(--border, rgba(255,255,255,0.08))',
        borderRadius: 8,
        padding: '8px 10px',
        fontSize: 12,
        lineHeight: 1.5,
        color: 'var(--text, #fff)',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    >
      {message.pending ? (
        <span style={{ opacity: 0.6 }}>…</span>
      ) : message.content}
    </div>
  )
}
