import type { CateringItem } from '../types'
import { matchMenuItemByName, normalizeName } from './venueCatalog'
import {
  AI_KEY_MISSING_SHORT_CS,
  hasVenueOpenAiKey,
  openAiMessageContent,
  openaiChatCompletions,
} from './openaiClient'

export { AI_KEY_MISSING_SHORT_CS }

export const VOICE_NOISE_FILTER_PROMPT =
  'Ignoruj hluk na pozadí a hlasy ostatních lidí. Zpracuj pouze jasné gastro příkazy od hlavního mluvčího ve formátu: [Číslo stolu/místa] + [množství] + [název položky]. Pokud věta nedává smysl jako objednávka, ignoruj ji.'

export interface VoiceOrderCommand {
  tableHint: string | null
  qty: number
  itemName: string
  raw: string
}

export interface VoiceParseResult {
  accepted: boolean
  reason?: string
  commands: VoiceOrderCommand[]
  cleanedTranscript: string
  source: 'openai' | 'local'
}

type SpeechRec = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null
  onerror: ((ev: { error?: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

type SpeechRecognitionEventLike = {
  resultIndex: number
  results: ArrayLike<{
    isFinal: boolean
    0: { transcript: string }
  }>
}

function getSpeechRecognitionCtor(): (new () => SpeechRec) | null {
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRec
    webkitSpeechRecognition?: new () => SpeechRec
  }
  return w.SpeechRecognition || w.webkitSpeechRecognition || null
}

/**
 * Push-to-Talk voice session:
 * - starts MediaRecorder + SpeechRecognition only while held
 * - truncates/aborts stream immediately on finger release
 * - streams interim transcript into the confirmation text box
 */
export class PushToTalkSession {
  private mediaRecorder: MediaRecorder | null = null
  private mediaStream: MediaStream | null = null
  private recognition: SpeechRec | null = null
  private chunks: BlobPart[] = []
  private finalParts: string[] = []
  private interimText = ''
  private holding = false
  private onLiveTranscript: ((text: string) => void) | null = null

  get isHolding() {
    return this.holding
  }

  setLiveTranscriptHandler(handler: ((text: string) => void) | null) {
    this.onLiveTranscript = handler
  }

  private emitLive() {
    const text = [...this.finalParts, this.interimText]
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    this.onLiveTranscript?.(text)
  }

  async startHold(): Promise<void> {
    if (this.holding) return
    this.holding = true
    this.chunks = []
    this.finalParts = []
    this.interimText = ''
    this.emitLive()

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      })
      // If finger already released during mic permission prompt, abort immediately
      if (!this.holding) {
        this.mediaStream.getTracks().forEach((t) => t.stop())
        this.mediaStream = null
        return
      }
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : ''
      this.mediaRecorder = mime
        ? new MediaRecorder(this.mediaStream, { mimeType: mime })
        : new MediaRecorder(this.mediaStream)
      this.mediaRecorder.ondataavailable = (e) => {
        if (!this.holding) return
        if (e.data && e.data.size > 0) this.chunks.push(e.data)
      }
      // Short timeslice so lift truncates promptly
      this.mediaRecorder.start(120)
    } catch {
      // Mic may be denied — still try speech recognition only
    }

    if (!this.holding) return

    const Ctor = getSpeechRecognitionCtor()
    if (Ctor) {
      const rec = new Ctor()
      rec.lang = 'cs-CZ'
      rec.continuous = true
      rec.interimResults = true
      rec.maxAlternatives = 1
      rec.onresult = (ev) => {
        if (!this.holding) return
        let interim = ''
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const piece = ev.results[i][0]?.transcript || ''
          if (ev.results[i].isFinal) {
            const cleaned = piece.trim()
            if (cleaned) this.finalParts.push(cleaned)
            interim = ''
          } else {
            interim += piece
          }
        }
        this.interimText = interim.trim()
        this.emitLive()
      }
      rec.onerror = () => {
        // ignore transient noise errors while holding
      }
      rec.onend = () => {
        // If still holding, restart (browser may auto-stop)
        if (this.holding) {
          try {
            rec.start()
          } catch {
            // ignore
          }
        }
      }
      this.recognition = rec
      try {
        rec.start()
      } catch {
        // ignore
      }
    }
  }

  async stopHold(): Promise<{ transcript: string; audioBlob: Blob | null }> {
    this.holding = false

    if (this.recognition) {
      try {
        this.recognition.onend = null
        this.recognition.onresult = null
        // abort() cuts the stream harder than stop() on finger release
        this.recognition.abort()
      } catch {
        try {
          this.recognition.stop()
        } catch {
          // ignore
        }
      }
      this.recognition = null
    }

    const audioBlob = await new Promise<Blob | null>((resolve) => {
      const rec = this.mediaRecorder
      if (!rec || rec.state === 'inactive') {
        resolve(null)
        return
      }
      const finish = () => {
        const blob =
          this.chunks.length > 0
            ? new Blob(this.chunks, { type: rec.mimeType || 'audio/webm' })
            : null
        resolve(blob)
      }
      rec.onstop = finish
      try {
        // Truncate stream immediately on finger lift
        rec.stop()
      } catch {
        resolve(null)
      }
      // Safety timeout if onstop never fires
      window.setTimeout(() => resolve(null), 400)
    })

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => {
        try {
          t.stop()
        } catch {
          // ignore
        }
      })
      this.mediaStream = null
    }
    this.mediaRecorder = null

    const transcript = [...this.finalParts, this.interimText]
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    this.finalParts = []
    this.interimText = ''
    this.chunks = []
    this.emitLive()
    return { transcript, audioBlob }
  }

  cancel() {
    void this.stopHold()
  }
}

/** Local Czech gastro command parser with noise / gibberish rejection. */
export function parseVoiceOrdersLocal(transcript: string): VoiceParseResult {
  const raw = (transcript || '').trim()
  if (!raw || raw.length < 3) {
    return {
      accepted: false,
      reason: 'Prázdný nebo nečitelný vstup — ignorováno',
      commands: [],
      cleanedTranscript: '',
      source: 'local',
    }
  }

  // Reject obvious non-orders / background chatter heuristics
  const lower = raw.toLowerCase()
  const chatter = [
    'ahoj',
    'čau',
    'děkuji',
    'díky',
    'prosím počkej',
    'kde je',
    'toaleta',
    'hudba',
    'hlasit',
  ]
  if (chatter.some((c) => lower === c || lower.startsWith(c + ' '))) {
    return {
      accepted: false,
      reason: 'Nejedná se o gastro příkaz — ignorováno',
      commands: [],
      cleanedTranscript: raw,
      source: 'local',
    }
  }

  const commands: VoiceOrderCommand[] = []
  // Split on "a", ",", ";" for multi-item utterances
  const segments = raw
    .split(/\s+(?:a|plus|,|;)\s+/i)
    .map((s) => s.trim())
    .filter(Boolean)

  for (const segment of segments) {
    const tableMatch = segment.match(
      /(?:st[uů]l(?:u)?|m[ií]sto|bar)\s*(\d+|[a-záčďéěíňóřšťúůýž]+)/i
    )
    const qtyMatch = segment.match(
      /(\d+)\s*[x×]|\b(\d+)\s+(?=ks|porc|piv|vino|víno|gin|mojito|burger|hranol|cola|vod[ay]|salat|salát)/i
    ) || segment.match(/^(\d+)\s+/)

    let qty = 1
    if (qtyMatch) {
      qty = Math.max(1, parseInt(qtyMatch[1] || qtyMatch[2] || '1', 10) || 1)
    } else if (/dv[eě]|dva/i.test(segment)) qty = 2
    else if (/tři|tri/i.test(segment)) qty = 3
    else if (/čtyři|ctyri/i.test(segment)) qty = 4

    let itemName = segment
      .replace(/(?:st[uů]l(?:u)?|m[ií]sto|bar)\s*(\d+|[a-záčďéěíňóřšťúůýž]+)/i, '')
      .replace(/(\d+)\s*[x×]/gi, '')
      .replace(/^(?:dej|dejte|přidej|pridej|objednej|chci|prosím|prosim)\s+/i, '')
      .replace(/\b(?:ks|porce|piva?)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim()

    // Strip leading qty words
    itemName = itemName
      .replace(/^(?:\d+|jeden|jednu|jedno|dv[eě]|dva|tři|tri|čtyři|ctyri)\s+/i, '')
      .trim()

    if (!itemName || itemName.length < 2) continue

    commands.push({
      tableHint: tableMatch ? tableMatch[0] : null,
      qty,
      itemName,
      raw: segment,
    })
  }

  if (!commands.length) {
    return {
      accepted: false,
      reason: 'Věta nedává smysl jako objednávka — ignorováno',
      commands: [],
      cleanedTranscript: raw,
      source: 'local',
    }
  }

  return {
    accepted: true,
    commands,
    cleanedTranscript: raw,
    source: 'local',
  }
}

export async function filterTranscriptWithAI(
  transcript: string
): Promise<{ text: string; usedOpenAi: boolean; missingKey: boolean }> {
  if (!transcript.trim()) {
    return { text: transcript, usedOpenAi: false, missingKey: false }
  }
  if (!hasVenueOpenAiKey()) {
    return { text: transcript, usedOpenAi: false, missingKey: true }
  }

  const chat = await openaiChatCompletions({
    model: 'gpt-4o-mini',
    temperature: 0,
    messages: [
      { role: 'system', content: VOICE_NOISE_FILTER_PROMPT },
      {
        role: 'user',
        content:
          `Přepis z hlučného prostředí:\n"""${transcript}"""\n\n` +
          `Vrať POUZE vyčištěné gastro příkazy (jeden na řádek) ve formátu: ` +
          `[stůl X] [množství] [název]. Pokud nic není objednávka, vrať přesně: IGNOROVAT`,
      },
    ],
  })
  if (!chat.ok) {
    return {
      text: transcript,
      usedOpenAi: false,
      missingKey: chat.reason === 'missing_key',
    }
  }
  const content = openAiMessageContent(chat.data)
  if (!content || /^ignorovat$/i.test(content)) {
    return { text: '', usedOpenAi: true, missingKey: false }
  }
  return { text: content, usedOpenAi: true, missingKey: false }
}

export async function processVoiceOrderTranscript(
  transcript: string,
  catalog: CateringItem[]
): Promise<{
  parse: VoiceParseResult
  matched: Array<{ item: CateringItem; qty: number; tableHint: string | null }>
  missingKey?: boolean
}> {
  const filtered = await filterTranscriptWithAI(transcript)
  const parse = parseVoiceOrdersLocal(filtered.text || transcript)
  if (!parse.accepted) {
    return { parse, matched: [], missingKey: filtered.missingKey }
  }

  const matched: Array<{
    item: CateringItem
    qty: number
    tableHint: string | null
  }> = []

  for (const cmd of parse.commands) {
    const item = matchMenuItemByName(catalog, cmd.itemName)
    if (item) {
      matched.push({ item, qty: cmd.qty, tableHint: cmd.tableHint })
    }
  }

  if (!matched.length) {
    return {
      parse: {
        ...parse,
        accepted: false,
        reason: `Položka nenalezena v menu: ${parse.commands.map((c) => c.itemName).join(', ')}`,
      },
      matched: [],
      missingKey: filtered.missingKey,
    }
  }

  return {
    parse: {
      ...parse,
      source: filtered.usedOpenAi ? 'openai' : parse.source,
    },
    matched,
    missingKey: filtered.missingKey,
  }
}

export function resolveTableIdFromHint(
  tables: Array<{ id: string; label: string }>,
  hint: string | null,
  fallbackId: string | null
): string | null {
  if (!hint) return fallbackId
  const n = normalizeName(hint)
  const num = hint.match(/\d+/)?.[0]
  const found = tables.find((t) => {
    const label = normalizeName(t.label)
    if (num && label.includes(num)) return true
    return label.includes(n) || n.includes(label)
  })
  return found?.id || fallbackId
}
