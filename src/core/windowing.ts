/**
 * Walking a long recording 30 seconds at a time.
 *
 * Pure functions, kept out of the worker so they can be tested directly —
 * the boundary arithmetic here is the part most likely to go quietly wrong on
 * a three-hour meeting.
 */

import type { Word } from './models'

/** Whisper's receptive field. Anything longer is padded, anything shorter too. */
export const WINDOW_S = 30
/** Never advance less than this, or a bad window could stall the run. */
export const MIN_ADVANCE_S = 1.0

export interface AsrChunk {
  text: string
  timestamp: [number, number | null]
}

/**
 * Pull word chunks out of a pipeline result and move them onto the
 * recording's timeline.
 *
 * Two clamps matter. The feature extractor pads a short final window out to
 * 30 s, so a trailing word can come back with a timestamp that sits inside
 * the padding; and the last word of any window is routinely handed a `null`
 * end. Both would otherwise put words past the end of the recording.
 */
export function extractWords(out: unknown, offset: number, windowSeconds: number): Word[] {
  const chunks = (out as { chunks?: AsrChunk[] } | null | undefined)?.chunks ?? []
  const words: Word[] = []
  for (const c of chunks) {
    if (!c.text || !c.text.trim()) continue
    const [rawStart, rawEnd] = c.timestamp ?? [null, null]
    if (typeof rawStart !== 'number' || !isFinite(rawStart)) continue
    const start = Math.min(Math.max(rawStart, 0), windowSeconds)
    const usable = typeof rawEnd === 'number' && isFinite(rawEnd) && rawEnd > rawStart
    const end = Math.min(usable ? rawEnd : rawStart + 0.2, windowSeconds)
    words.push({ start: offset + start, end: offset + Math.max(end, start), text: c.text })
  }
  return words
}

/**
 * How far to move the window.
 *
 * Landing on the end of the last decoded word keeps the next window from
 * opening mid-sentence, which is what lets us skip overlap de-duplication
 * altogether. The guards cover the two ways that can go wrong: a window that
 * decoded almost nothing (advance a full window instead of crawling) and one
 * whose speech runs right to the edge (no useful boundary, so take the whole
 * window and accept the one clipped word).
 */
export function advanceBy(words: Word[], t: number, windowSeconds: number): number {
  if (windowSeconds < WINDOW_S) return windowSeconds
  const last = words[words.length - 1]
  if (!last) return WINDOW_S
  const reach = last.end - t
  if (reach > MIN_ADVANCE_S && reach < WINDOW_S - 0.5) return reach
  return WINDOW_S
}
