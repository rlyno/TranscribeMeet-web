import { describe, expect, it } from 'vitest'

import type { Word } from '../src/core/models'
import { advanceBy, extractWords, MIN_ADVANCE_S, WINDOW_S } from '../src/core/windowing'

const chunk = (text: string, a: number, b: number | null) => ({ text, timestamp: [a, b] as [number, number | null] })

describe('extractWords', () => {
  it('shifts timestamps onto the recording timeline', () => {
    const out = extractWords({ chunks: [chunk(' satu', 1, 1.4), chunk(' dua', 1.4, 2)] }, 60, WINDOW_S)
    expect(out.map((w) => [w.start, w.end])).toEqual([
      [61, 61.4],
      [61.4, 62],
    ])
  })

  it('gives a null end a small duration instead of dropping the word', () => {
    const [w] = extractWords({ chunks: [chunk(' terakhir', 5, null)] }, 0, WINDOW_S)
    expect(w!.end).toBeCloseTo(5.2)
  })

  it('clamps a word that the padding pushed past the end of a short window', () => {
    // Final window is 7 s of audio padded out to 30 s; Whisper reports 12 s.
    const [w] = extractWords({ chunks: [chunk(' halo', 6.5, 12)] }, 90, 7)
    expect(w!.start).toBeLessThanOrEqual(97)
    expect(w!.end).toBe(97)
  })

  it('skips blank and malformed chunks', () => {
    const out = extractWords(
      { chunks: [chunk('   ', 1, 2), chunk(' ok', 2, 3), { text: ' x', timestamp: [null, 4] as never }] },
      0,
      WINDOW_S,
    )
    expect(out.map((w) => w.text)).toEqual([' ok'])
  })

  it('survives a result with no chunks at all', () => {
    expect(extractWords({ text: 'x' }, 0, WINDOW_S)).toEqual([])
    expect(extractWords(undefined, 0, WINDOW_S)).toEqual([])
  })

  it('never emits a negative-length word', () => {
    const [w] = extractWords({ chunks: [chunk(' aneh', 10, 3)] }, 0, WINDOW_S)
    expect(w!.end).toBeGreaterThanOrEqual(w!.start)
  })
})

describe('advanceBy', () => {
  const at = (_t: number, end: number): Word[] => [{ start: end - 0.3, end, text: ' x' }]

  it('lands on the end of the last word so the next window starts clean', () => {
    expect(advanceBy(at(0, 27.4), 0, WINDOW_S)).toBeCloseTo(27.4)
    expect(advanceBy(at(60, 84.2), 60, WINDOW_S)).toBeCloseTo(24.2)
  })

  it('takes the whole window when speech runs right to the edge', () => {
    expect(advanceBy(at(0, 29.8), 0, WINDOW_S)).toBe(WINDOW_S)
  })

  it('takes the whole window when nothing was decoded', () => {
    expect(advanceBy([], 0, WINDOW_S)).toBe(WINDOW_S)
  })

  it('refuses to crawl when a window decoded one early word', () => {
    expect(advanceBy(at(0, 0.6), 0, WINDOW_S)).toBe(WINDOW_S)
  })

  it('consumes exactly what is left in a short final window', () => {
    expect(advanceBy(at(300, 303), 300, 4.5)).toBe(4.5)
  })

  it('always moves forward, whatever the input', () => {
    const cases: [Word[], number, number][] = [
      [[], 0, WINDOW_S],
      [at(0, 0), 0, WINDOW_S],
      [at(100, 100), 100, WINDOW_S],
      [at(0, 29.99), 0, WINDOW_S],
      [at(0, 1), 0, 0.5],
    ]
    for (const [words, t, win] of cases) {
      expect(advanceBy(words, t, win)).toBeGreaterThanOrEqual(Math.min(MIN_ADVANCE_S, win))
    }
  })

  it('terminates on a full pass over a long recording', () => {
    // Worst case for stalling: every window decodes a single word near its start.
    let t = 0
    let passes = 0
    const total = 3 * 3600
    while (t < total && passes < 10_000) {
      const windowSeconds = Math.min(WINDOW_S, total - t)
      t += advanceBy(at(t, t + 0.4), t, windowSeconds)
      passes++
    }
    expect(t).toBeGreaterThanOrEqual(total)
    expect(passes).toBeLessThan(400)
  })
})
