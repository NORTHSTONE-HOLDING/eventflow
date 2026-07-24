import type { CateringItem } from '../types'
import { matchMenuItemByName, normalizeName } from './venueCatalog'

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
 * - truncates/stops immediately on release
 */
export class PushToTalkSession {
  private mediaRecorder: MediaRecorder | null = null
  private mediaStream: MediaStream | null = null
  private recognition: SpeechRec | null = null
  private chunks: BlobPart[] = []
  private transcriptParts: string[] = []
  private holding = false

  get isHolding() {
    return this.holding
  }

  async startHold(): Promise<void> {
    if (this.holding) return
    this.holding = true
    this.chunks = []
    this.transcriptParts = []

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      })
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : ''
      this.mediaRecorder = mime
        ? new MediaRecorder(this.mediaStream, { mimeType: mime })
        : new MediaRecorder(this.mediaStream)
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) this.chunks.push(e.data)
      }
      // Short timeslice so lift truncates promptly
      this.mediaRecorder.start(120)
    } catch {
      // Mic may be denied — still try speech recognition only
    }

    const Ctor = getSpeechRecognitionCtor()
    if (Ctor) {
      const rec = new Ctor()
      rec.lang = 'cs-CZ'
      rec.continuous = true
      rec.interimResults = true
      rec.maxAlternatives = 1
      rec.onresult = (ev) => {
        if (!this.holding) return
        let chunk = ''
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          chunk += ev.results[i][0]?.transcript || ''
        }
        const cleaned = chunk.trim()
        if (cleaned) this.transcriptParts.push(cleaned)
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
        this.recognition.stop()
      } catch {
        // ignore
      }
      this.recognition = null
    }

    const audioBlob = await new Promise<Blob | null>((resolve) => {
      const rec = this.mediaRecorder
      if (!rec || rec.state === 'inactive') {
        resolve(null)
        return
      }
      rec.onstop = () => {
        const blob =
          this.chunks.length > 0
            ? new Blob(this.chunks, { type: rec.mimeType || 'audio/webm' })
            : null
        resolve(blob)
      }
      try {
        // Truncate stream immediately on finger lift
        rec.stop()
      } catch {
        resolve(null)
      }
    })

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop())
      this.mediaStream = null
    }
    this.mediaRecorder = null

    const transcript = this.transcriptParts.join(' ').replace(/\s+/g, ' ').trim()
    this.transcriptParts = []
    this.chunks = []
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
): Promise<string> {
  const apiKey = (import.meta.env.VITE_OPENAI_API_KEY as string | undefined)?.trim()
  if (!apiKey || !transcript.trim()) return transcript

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
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
      }),
    })
    if (!res.ok) return transcript
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const content = data.choices?.[0]?.message?.content?.trim() || ''
    if (!content || /^ignorovat$/i.test(content)) return ''
    return content
  } catch {
    return transcript
  }
}

export async function processVoiceOrderTranscript(
  transcript: string,
  catalog: CateringItem[]
): Promise<{
  parse: VoiceParseResult
  matched: Array<{ item: CateringItem; qty: number; tableHint: string | null }>
}> {
  const filtered = await filterTranscriptWithAI(transcript)
  const parse = parseVoiceOrdersLocal(filtered || transcript)
  if (!parse.accepted) {
    return { parse, matched: [] }
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
    }
  }

  return {
    parse: { ...parse, source: filtered !== transcript ? 'openai' : parse.source },
    matched,
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
