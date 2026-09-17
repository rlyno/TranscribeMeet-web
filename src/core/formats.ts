/**
 * Render a Transcript into the output files — a direct port of the desktop
 * app's `transcribemeet/formats.py`, kept line-for-line comparable on purpose
 * so that fixes can be carried across in either direction.
 *
 * Subtitle formats (SRT/VTT) and reading formats (MD/TXT) want opposite
 * things: subtitles need short cues that fit on screen, a transcript wants
 * long readable paragraphs. Word-level timestamps let us serve both from one
 * transcript — cues are rebuilt from the words rather than from the
 * paragraph segments.
 */

import type { Transcript, Word } from './models'

// Subtitle sizing: roughly two 42-character lines, max ~6 seconds on screen.
export const CUE_MAX_CHARS = 84
export const CUE_MAX_DURATION = 6.0
export const CUE_MAX_GAP = 0.8
export const LINE_WIDTH = 42

const SENTENCE_END = ['.', '?', '!', '。', '？', '！']

export interface Cue {
  start: number
  end: number
  text: string
  speaker?: string | null
}

/** Format seconds as HH:MM:SS,mmm (SRT) or HH:MM:SS.mmm (VTT). */
export function hms(seconds: number, sep = ','): string {
  const total = Math.round(Math.max(0, seconds) * 1000)
  const h = Math.floor(total / 3_600_000)
  const m = Math.floor((total % 3_600_000) / 60_000)
  const s = Math.floor((total % 60_000) / 1000)
  const ms = total % 1000
  return `${pad(h)}:${pad(m)}:${pad(s)}${sep}${String(ms).padStart(3, '0')}`
}

/** Short HH:MM:SS stamp used in readable transcripts and in the UI. */
export function clock(seconds: number): string {
  const total = Math.floor(Math.max(0, seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** Break a cue into at most two balanced lines. */
export function wrap(text: string, width = LINE_WIDTH): string {
  const clean = text.split(/\s+/).filter(Boolean).join(' ')
  if (clean.length <= width) return clean
  const words = clean.split(' ')
  let best = Math.floor(words.length / 2)
  let bestDelta: number | null = null
  for (let i = 1; i < words.length; i++) {
    const left = words.slice(0, i).join(' ').length
    const right = words.slice(i).join(' ').length
    const delta = Math.abs(left - right)
    if (bestDelta === null || delta < bestDelta) {
      best = i
      bestDelta = delta
    }
  }
  return `${words.slice(0, best).join(' ')}\n${words.slice(best).join(' ')}`
}

function endsSentence(text: string): boolean {
  const t = text.trim()
  return SENTENCE_END.some((p) => t.endsWith(p))
}

function cueFrom(words: Word[], speaker: string | null | undefined): Cue {
  const text = words.map((w) => w.text).join('').trim()
  const first = words[0]!
  const last = words[words.length - 1]!
  const start = first.start
  const end = last.end <= start ? start + 0.4 : last.end
  return { start, end, text, speaker }
}

/** Split paragraph segments back into screen-sized subtitle cues. */
export function buildCues(
  t: Transcript,
  opts: { maxChars?: number; maxDuration?: number; maxGap?: number } = {},
): Cue[] {
  const maxChars = opts.maxChars ?? CUE_MAX_CHARS
  const maxDuration = opts.maxDuration ?? CUE_MAX_DURATION
  const maxGap = opts.maxGap ?? CUE_MAX_GAP

  const cues: Cue[] = []
  for (const seg of t.segments) {
    const words = seg.words.filter((w) => w.text.trim())
    if (words.length === 0) {
      const text = seg.text.trim()
      if (text) {
        cues.push({
          start: seg.start,
          end: Math.max(seg.end, seg.start + 0.4),
          text,
          speaker: seg.speaker,
        })
      }
      continue
    }

    let current: Word[] = []
    for (const w of words) {
      if (current.length > 0) {
        const soFar = current.map((x) => x.text).join('').trim().length
        const gap = w.start - current[current.length - 1]!.end
        const sentence = endsSentence(current[current.length - 1]!.text)
        if (
          soFar + w.text.length > maxChars ||
          w.end - current[0]!.start > maxDuration ||
          gap > maxGap ||
          (sentence && soFar > Math.floor(maxChars / 2))
        ) {
          cues.push(cueFrom(current, seg.speaker))
          current = []
        }
      }
      current.push(w)
    }
    if (current.length > 0) cues.push(cueFrom(current, seg.speaker))
  }
  return cues
}

export function toSRT(t: Transcript): string {
  const lines: string[] = []
  buildCues(t).forEach((cue, i) => {
    let text = wrap(cue.text)
    if (t.diarized && cue.speaker) text = `[${cue.speaker}]\n${text}`
    lines.push(String(i + 1), `${hms(cue.start)} --> ${hms(cue.end)}`, text, '')
  })
  return lines.join('\n')
}

export function toVTT(t: Transcript): string {
  const lines: string[] = ['WEBVTT', '']
  for (const cue of buildCues(t)) {
    let text = wrap(cue.text)
    if (t.diarized && cue.speaker) text = `<v ${cue.speaker}>${text}`
    lines.push(`${hms(cue.start, '.')} --> ${hms(cue.end, '.')}`, text, '')
  }
  return lines.join('\n')
}

export function toTXT(t: Transcript): string {
  const lines: string[] = []
  for (const seg of t.segments) {
    const text = seg.text.trim()
    if (!text) continue
    const who = t.diarized && seg.speaker ? ` ${seg.speaker}:` : ''
    lines.push(`[${clock(seg.start)}]${who} ${text}`)
  }
  return lines.join('\n') + '\n'
}

export function toMarkdown(t: Transcript, title?: string): string {
  const stem = title ?? t.source.replace(/\.[^.]+$/, '')
  const head = [
    `# Transcript — ${stem}`,
    '',
    `- **Source:** \`${t.source}\``,
    `- **Duration:** ${clock(t.duration)}`,
    `- **Language:** ${t.language}`,
    `- **Model:** ${t.model} (${t.backend})`,
  ]
  if (t.diarized) {
    head.push(`- **Speakers:** ${t.speakers.length} (${t.speakers.join(', ')})`)
  }
  head.push('', '---', '')

  const body: string[] = []
  let current: string | null | undefined = null
  for (const seg of t.segments) {
    const text = seg.text.trim()
    if (!text) continue
    if (t.diarized && seg.speaker !== current) {
      current = seg.speaker
      body.push('', `### ${current || 'SPEAKER'}`, '')
    }
    body.push(`**[${clock(seg.start)}]** ${text}`, '')
  }
  return [...head, ...body].join('\n').trim() + '\n'
}

export function toJSON(t: Transcript): string {
  return JSON.stringify(t, null, 2)
}

export type Format = 'md' | 'srt' | 'vtt' | 'txt' | 'json'

export const RENDERERS: Record<Format, (t: Transcript) => string> = {
  md: (t) => toMarkdown(t),
  srt: toSRT,
  vtt: toVTT,
  txt: toTXT,
  json: toJSON,
}

export const MIME: Record<Format, string> = {
  md: 'text/markdown;charset=utf-8',
  srt: 'application/x-subrip;charset=utf-8',
  vtt: 'text/vtt;charset=utf-8',
  txt: 'text/plain;charset=utf-8',
  json: 'application/json;charset=utf-8',
}
