/**
 * Core data model, kept deliberately identical to the desktop app's
 * `transcribemeet/models.py` so that a `.json` written by either side can be
 * read by the other.
 *
 * One convention carried over from Whisper: `Word.text` keeps its own leading
 * space. Joining words is therefore a plain concatenation, never a join on
 * `" "` — that is what lets punctuation and CJK text survive intact.
 */

export interface Word {
  start: number
  end: number
  text: string
  probability?: number | null
  speaker?: string | null
}

export interface Segment {
  start: number
  end: number
  text: string
  words: Word[]
  speaker?: string | null
  no_speech_prob?: number | null
  avg_logprob?: number | null
}

export interface Transcript {
  segments: Segment[]
  language: string
  duration: number
  source: string
  model: string
  backend: string
  diarized: boolean
  speakers: string[]
}

export function segmentDuration(seg: Segment): number {
  return Math.max(0, seg.end - seg.start)
}

export function transcriptText(t: Transcript): string {
  return t.segments
    .map((s) => s.text.trim())
    .filter(Boolean)
    .join(' ')
}

export function wordCount(t: Transcript): number {
  return t.segments.reduce((n, s) => n + s.words.filter((w) => w.text.trim()).length, 0)
}

/** Every word in the transcript, in order — the reader needs one flat list. */
export function allWords(t: Transcript): Word[] {
  return t.segments.flatMap((s) => s.words)
}

/**
 * Reload a transcript previously written by either this app or the desktop
 * one. Defensive about missing keys because older files exist in the wild.
 */
export function transcriptFromJSON(data: unknown): Transcript {
  const d = data as Record<string, any>
  if (!d || !Array.isArray(d.segments)) {
    throw new Error('Berkas ini bukan transkrip TranscribeMeet (tidak ada "segments").')
  }
  const segments: Segment[] = d.segments.map((s: Record<string, any>) => ({
    start: Number(s.start) || 0,
    end: Number(s.end) || 0,
    text: String(s.text ?? ''),
    words: Array.isArray(s.words)
      ? s.words.map((w: Record<string, any>) => ({
          start: Number(w.start) || 0,
          end: Number(w.end) || 0,
          text: String(w.text ?? ''),
          probability: w.probability ?? null,
          speaker: w.speaker ?? null,
        }))
      : [],
    speaker: s.speaker ?? null,
    no_speech_prob: s.no_speech_prob ?? null,
    avg_logprob: s.avg_logprob ?? null,
  }))
  return {
    segments,
    language: String(d.language ?? 'unknown'),
    duration: Number(d.duration) || 0,
    source: String(d.source ?? ''),
    model: String(d.model ?? 'unknown'),
    backend: String(d.backend ?? 'unknown'),
    diarized: Boolean(d.diarized),
    speakers: Array.isArray(d.speakers) ? d.speakers.map(String) : [],
  }
}
