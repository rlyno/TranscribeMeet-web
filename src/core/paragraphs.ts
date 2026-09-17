/**
 * Turning a flat list of timestamped words into readable paragraphs.
 *
 * The desktop app gets ready-made segments out of faster-whisper/MLX and only
 * has to merge them. In the browser we decode window by window and get words
 * back, so the segmenting has to happen here: split on sentence endings and on
 * pauses, then merge neighbours from the same speaker exactly the way
 * `diarize.merge_adjacent` does.
 */

import type { Segment, Transcript, Word } from './models'

const SENTENCE_END = /[.?!。？！]["')\]]?$/

/** A pause longer than this ends a paragraph even mid-sentence. */
export const PARAGRAPH_GAP = 1.2
/** Hard ceiling so a monologue without punctuation still breaks up. */
export const PARAGRAPH_MAX_CHARS = 420

export function segmentsFromWords(
  words: Word[],
  opts: { gap?: number; maxChars?: number } = {},
): Segment[] {
  const gapLimit = opts.gap ?? PARAGRAPH_GAP
  const maxChars = opts.maxChars ?? PARAGRAPH_MAX_CHARS

  const segments: Segment[] = []
  let current: Word[] = []

  const flush = () => {
    if (current.length === 0) return
    const text = current.map((w) => w.text).join('').trim()
    if (text) {
      segments.push({
        start: current[0]!.start,
        end: current[current.length - 1]!.end,
        text,
        words: current,
        speaker: current[0]!.speaker ?? null,
      })
    }
    current = []
  }

  for (const w of words) {
    if (!w.text.trim()) continue
    if (current.length > 0) {
      const prev = current[current.length - 1]!
      const soFar = current.map((x) => x.text).join('').trim()
      const speakerChanged = (prev.speaker ?? null) !== (w.speaker ?? null)
      if (
        speakerChanged ||
        w.start - prev.end > gapLimit ||
        soFar.length > maxChars ||
        (SENTENCE_END.test(prev.text.trim()) && soFar.length > 120)
      ) {
        flush()
      }
    }
    current.push(w)
  }
  flush()
  return segments
}

/**
 * Join consecutive segments from the same speaker into readable blocks —
 * port of `diarize.merge_adjacent`. Mutates nothing; returns a new list.
 */
export function mergeAdjacent(
  segments: Segment[],
  maxGap = 2.0,
  maxChars = 900,
): Segment[] {
  const merged: Segment[] = []
  for (const seg of segments) {
    if (!seg.text.trim()) continue
    const prev = merged[merged.length - 1]
    if (
      prev &&
      (prev.speaker ?? null) === (seg.speaker ?? null) &&
      seg.start - prev.end <= maxGap &&
      prev.text.length + seg.text.length <= maxChars
    ) {
      merged[merged.length - 1] = {
        ...prev,
        text: `${prev.text.trim()} ${seg.text.trim()}`,
        end: seg.end,
        words: [...prev.words, ...seg.words],
      }
    } else {
      merged.push({ ...seg })
    }
  }
  return merged
}

/**
 * Whisper fills silence with invented text, and the giveaway is always the
 * same: one short phrase repeated back to back. The desktop app leans on
 * faster-whisper's `compression_ratio_threshold` and `no_speech_threshold`,
 * neither of which the JS pipeline exposes, so the loop is detected after the
 * fact instead.
 *
 * A run of the same normalised phrase repeated `limit` times or more is cut
 * back to a single copy.
 */
export function collapseRepetitions(words: Word[], limit = 4): Word[] {
  if (words.length < limit * 2) return words

  const norm = (w: Word) => w.text.trim().toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
  const out: Word[] = []

  let i = 0
  while (i < words.length) {
    let cut = 0
    // Shortest phrase first, so a word looping on its own collapses to one
    // word rather than to one copy of some longer window over the same loop.
    // A one-word match already requires the word to repeat back to back, so
    // "terima kasih terima kasih…" is never mistaken for a loop of "terima".
    for (let len = 1; len <= 8; len++) {
      if (i + len * limit > words.length) continue
      const phrase = words.slice(i, i + len).map(norm).join(' ')
      if (!phrase.replace(/\s/g, '')) continue
      let reps = 1
      while (
        i + (reps + 1) * len <= words.length &&
        words.slice(i + reps * len, i + (reps + 1) * len).map(norm).join(' ') === phrase
      ) {
        reps++
      }
      if (reps >= limit) {
        cut = reps * len
        // Keep one copy, stretched over the whole run so the timeline holds.
        const kept = words.slice(i, i + len)
        const last = words[i + cut - 1]!
        out.push(...kept.slice(0, -1), { ...kept[kept.length - 1]!, end: last.end })
        break
      }
    }
    if (cut === 0) {
      out.push(words[i]!)
      i++
    } else {
      i += cut
    }
  }
  return out
}

/** Build the finished transcript from words. The one place assembly happens. */
export function assemble(
  words: Word[],
  meta: {
    language: string
    duration: number
    source: string
    model: string
    backend: string
    diarized?: boolean
  },
): Transcript {
  const cleaned = collapseRepetitions(words)
  const segments = mergeAdjacent(segmentsFromWords(cleaned))
  const speakers = [...new Set(segments.map((s) => s.speaker).filter((s): s is string => !!s))].sort()
  return {
    segments,
    language: meta.language,
    duration: meta.duration,
    source: meta.source,
    model: meta.model,
    backend: meta.backend,
    diarized: meta.diarized ?? speakers.length > 0,
    speakers,
  }
}
