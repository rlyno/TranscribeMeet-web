import { describe, expect, it } from 'vitest'

import type { Segment, Word } from '../src/core/models'
import { assemble, collapseRepetitions, mergeAdjacent, segmentsFromWords } from '../src/core/paragraphs'

function words(spec: [string, number, number, string?][]): Word[] {
  return spec.map(([text, start, end, speaker]) => ({ start, end, text, speaker: speaker ?? null }))
}

describe('segmentsFromWords', () => {
  it('keeps one short utterance together', () => {
    const segs = segmentsFromWords(words([[' satu', 0, 0.4], [' dua', 0.4, 0.9]]))
    expect(segs).toHaveLength(1)
    expect(segs[0]!.text).toBe('satu dua')
    expect(segs[0]!.start).toBe(0)
    expect(segs[0]!.end).toBe(0.9)
  })

  it('breaks on a pause', () => {
    const segs = segmentsFromWords(words([[' satu', 0, 0.4], [' dua', 9, 9.4]]))
    expect(segs.map((s) => s.text)).toEqual(['satu', 'dua'])
  })

  it('breaks when the speaker changes even without a pause', () => {
    const segs = segmentsFromWords(
      words([
        [' satu', 0, 0.4, 'SPEAKER_00'],
        [' dua', 0.4, 0.9, 'SPEAKER_01'],
      ]),
    )
    expect(segs).toHaveLength(2)
    expect(segs[1]!.speaker).toBe('SPEAKER_01')
  })

  it('breaks up a monologue with no punctuation at all', () => {
    const spec: [string, number, number][] = []
    for (let i = 0; i < 400; i++) spec.push([` kata${i}`, i * 0.3, i * 0.3 + 0.3])
    const segs = segmentsFromWords(words(spec))
    expect(segs.length).toBeGreaterThan(1)
    for (const s of segs) expect(s.text.length).toBeLessThan(600)
  })

  it('drops whitespace-only words', () => {
    const segs = segmentsFromWords(words([[' ', 0, 0.1], [' ok', 0.1, 0.4]]))
    expect(segs).toHaveLength(1)
    expect(segs[0]!.words.map((w) => w.text)).toEqual([' ok'])
  })

  it('returns nothing for an empty input', () => {
    expect(segmentsFromWords([])).toEqual([])
  })
})

describe('mergeAdjacent', () => {
  const seg = (start: number, end: number, text: string, speaker: string | null = null): Segment => ({
    start,
    end,
    text,
    words: [{ start, end, text: ` ${text}`, speaker }],
    speaker,
  })

  it('joins neighbours from the same speaker', () => {
    const out = mergeAdjacent([seg(0, 1, 'satu', 'A'), seg(1.5, 2, 'dua', 'A')])
    expect(out).toHaveLength(1)
    expect(out[0]!.text).toBe('satu dua')
    expect(out[0]!.end).toBe(2)
    expect(out[0]!.words).toHaveLength(2)
  })

  it('keeps different speakers apart', () => {
    expect(mergeAdjacent([seg(0, 1, 'satu', 'A'), seg(1.2, 2, 'dua', 'B')])).toHaveLength(2)
  })

  it('does not join across a gap wider than the limit', () => {
    expect(mergeAdjacent([seg(0, 1, 'satu', 'A'), seg(9, 10, 'dua', 'A')])).toHaveLength(2)
  })

  it('stops merging once a block gets too long to read', () => {
    const long = 'x'.repeat(600)
    expect(mergeAdjacent([seg(0, 1, long, 'A'), seg(1.1, 2, long, 'A')])).toHaveLength(2)
  })

  it('drops empty segments', () => {
    expect(mergeAdjacent([seg(0, 1, '   ', 'A'), seg(1.1, 2, 'ada', 'A')])).toHaveLength(1)
  })

  it('leaves the input array untouched', () => {
    const input = [seg(0, 1, 'satu', 'A'), seg(1.2, 2, 'dua', 'A')]
    const before = JSON.stringify(input)
    mergeAdjacent(input)
    expect(JSON.stringify(input)).toBe(before)
  })
})

describe('collapseRepetitions', () => {
  it('cuts a single word looping over silence down to one copy', () => {
    const spec: [string, number, number][] = []
    for (let i = 0; i < 12; i++) spec.push([' terima', i, i + 0.5])
    const out = collapseRepetitions(words(spec))
    expect(out).toHaveLength(1)
    expect(out[0]!.end).toBeCloseTo(11.5)
  })

  it('cuts a repeated phrase, not just a repeated word', () => {
    const spec: [string, number, number][] = []
    for (let i = 0; i < 6; i++) {
      spec.push([' terima', i * 2, i * 2 + 0.5], [' kasih', i * 2 + 0.5, i * 2 + 1])
    }
    const out = collapseRepetitions(words(spec))
    expect(out.map((w) => w.text.trim())).toEqual(['terima', 'kasih'])
  })

  it('leaves normal repetition alone', () => {
    const out = collapseRepetitions(words([[' ya', 0, 0.3], [' ya', 0.3, 0.6], [' betul', 0.6, 1]]))
    expect(out).toHaveLength(3)
  })

  it('keeps real speech that merely contains a repeated word', () => {
    const input = words([
      [' kita', 0, 0.3],
      [' bahas', 0.3, 0.7],
      [' kita', 0.7, 1.0],
      [' putuskan', 1.0, 1.5],
      [' nanti', 1.5, 2.0],
    ])
    expect(collapseRepetitions(input)).toHaveLength(5)
  })

  it('preserves the timeline across the cut', () => {
    const spec: [string, number, number][] = [[' awal', 0, 0.5]]
    for (let i = 0; i < 10; i++) spec.push([' loop', 1 + i, 1.5 + i])
    spec.push([' akhir', 20, 20.5])
    const out = collapseRepetitions(words(spec))
    expect(out[0]!.text.trim()).toBe('awal')
    expect(out[out.length - 1]!.text.trim()).toBe('akhir')
    for (let i = 1; i < out.length; i++) {
      expect(out[i]!.start).toBeGreaterThanOrEqual(out[i - 1]!.start)
    }
  })

  it('is a no-op on short input', () => {
    const input = words([[' a', 0, 1], [' b', 1, 2]])
    expect(collapseRepetitions(input)).toEqual(input)
  })
})

describe('assemble', () => {
  it('produces a transcript ready for the renderers', () => {
    const t = assemble(words([[' Baik,', 0, 0.5], [' mulai.', 0.5, 1.2]]), {
      language: 'id',
      duration: 1.2,
      source: 'rapat.mp4',
      model: 'small',
      backend: 'transformers.js/webgpu',
    })
    expect(t.segments).toHaveLength(1)
    expect(t.segments[0]!.text).toBe('Baik, mulai.')
    expect(t.diarized).toBe(false)
    expect(t.speakers).toEqual([])
    expect(t.model).toBe('small')
  })

  it('lists speakers in order once they exist', () => {
    const t = assemble(
      words([
        [' satu', 0, 0.5, 'SPEAKER_01'],
        [' dua', 2, 2.5, 'SPEAKER_00'],
      ]),
      { language: 'id', duration: 2.5, source: 'x', model: 'small', backend: 'b' },
    )
    expect(t.speakers).toEqual(['SPEAKER_00', 'SPEAKER_01'])
    expect(t.diarized).toBe(true)
  })

  it('handles a recording where nothing was said', () => {
    const t = assemble([], { language: 'id', duration: 30, source: 'sunyi.mp4', model: 'small', backend: 'b' })
    expect(t.segments).toEqual([])
    expect(t.duration).toBe(30)
  })
})
