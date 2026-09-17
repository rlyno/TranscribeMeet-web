import { describe, expect, it } from 'vitest'

import { buildCues, clock, hms, toMarkdown, toSRT, toTXT, toVTT, wrap } from '../src/core/formats'
import type { Transcript, Word } from '../src/core/models'

function words(spec: [string, number, number][]): Word[] {
  return spec.map(([text, start, end]) => ({ start, end, text }))
}

function transcript(partial: Partial<Transcript> = {}): Transcript {
  const w = words([
    [' Baik,', 0.0, 0.5],
    [' kita', 0.5, 0.8],
    [' mulai', 0.8, 1.2],
    [' dari', 1.2, 1.5],
    [' status', 1.5, 2.0],
    [' proyek.', 2.0, 2.6],
  ])
  return {
    segments: [{ start: 0, end: 2.6, text: 'Baik, kita mulai dari status proyek.', words: w, speaker: null }],
    language: 'id',
    duration: 2.6,
    source: 'rapat.mp4',
    model: 'small',
    backend: 'transformers.js/webgpu',
    diarized: false,
    speakers: [],
    ...partial,
  }
}

describe('hms / clock', () => {
  it('formats SRT and VTT stamps', () => {
    expect(hms(0)).toBe('00:00:00,000')
    expect(hms(3661.5)).toBe('01:01:01,500')
    expect(hms(3661.5, '.')).toBe('01:01:01.500')
  })

  it('never goes negative', () => {
    expect(hms(-5)).toBe('00:00:00,000')
    expect(clock(-5)).toBe('00:00:00')
  })

  it('rounds milliseconds the way Python does', () => {
    expect(hms(1.0005)).toBe('00:00:01,001')
    expect(clock(119.9)).toBe('00:01:59')
  })
})

describe('wrap', () => {
  it('leaves short cues on one line', () => {
    expect(wrap('pendek saja')).toBe('pendek saja')
  })

  it('splits long cues into two balanced lines', () => {
    const text = 'satu dua tiga empat lima enam tujuh delapan sembilan sepuluh sebelas'
    const out = wrap(text)
    const [a, b] = out.split('\n')
    expect(out.split('\n')).toHaveLength(2)
    expect(Math.abs(a!.length - b!.length)).toBeLessThan(12)
    expect(`${a} ${b}`).toBe(text)
  })

  it('collapses whitespace', () => {
    expect(wrap('  dua   spasi  ')).toBe('dua spasi')
  })
})

describe('buildCues', () => {
  it('keeps a short segment as a single cue', () => {
    const cues = buildCues(transcript())
    expect(cues).toHaveLength(1)
    expect(cues[0]!.text).toBe('Baik, kita mulai dari status proyek.')
  })

  it('splits on a pause longer than the gap limit', () => {
    const w = words([
      [' satu', 0, 0.4],
      [' dua', 0.4, 0.8],
      [' tiga', 5.0, 5.4],
    ])
    const t = transcript({
      segments: [{ start: 0, end: 5.4, text: 'satu dua tiga', words: w, speaker: null }],
    })
    const cues = buildCues(t)
    expect(cues).toHaveLength(2)
    expect(cues[0]!.text).toBe('satu dua')
    expect(cues[1]!.text).toBe('tiga')
  })

  it('splits when a cue would outrun the duration limit', () => {
    const w: [string, number, number][] = []
    for (let i = 0; i < 20; i++) w.push([` kata${i}`, i * 0.5, i * 0.5 + 0.5])
    const t = transcript({
      segments: [{ start: 0, end: 10, text: 'x', words: words(w), speaker: null }],
    })
    for (const cue of buildCues(t)) {
      expect(cue.end - cue.start).toBeLessThanOrEqual(6.0001)
    }
  })

  it('caps cue length at 84 characters', () => {
    const w: [string, number, number][] = []
    for (let i = 0; i < 40; i++) w.push([` panjang${i}`, i * 0.1, i * 0.1 + 0.1])
    const t = transcript({
      segments: [{ start: 0, end: 4, text: 'x', words: words(w), speaker: null }],
    })
    for (const cue of buildCues(t)) {
      expect(cue.text.length).toBeLessThanOrEqual(84 + 10)
    }
  })

  it('gives a zero-length cue a floor so players do not drop it', () => {
    const t = transcript({
      segments: [{ start: 3, end: 3, text: 'ya', words: words([[' ya', 3, 3]]), speaker: null }],
    })
    const cue = buildCues(t)[0]!
    expect(cue.end).toBeGreaterThan(cue.start)
  })

  it('falls back to segment text when a segment carries no words', () => {
    const t = transcript({
      segments: [{ start: 1, end: 2, text: 'tanpa kata', words: [], speaker: null }],
    })
    expect(buildCues(t)[0]!.text).toBe('tanpa kata')
  })
})

describe('renderers', () => {
  it('numbers SRT cues from 1 and separates with a blank line', () => {
    const srt = toSRT(transcript())
    expect(srt.startsWith('1\n00:00:00,000 --> 00:00:02,600\n')).toBe(true)
    expect(srt.endsWith('\n')).toBe(true)
  })

  it('writes the WEBVTT header and dotted stamps', () => {
    const vtt = toVTT(transcript())
    expect(vtt.startsWith('WEBVTT\n\n')).toBe(true)
    expect(vtt).toContain('00:00:00.000 --> 00:00:02.600')
  })

  it('tags speakers only when diarized', () => {
    const plain = transcript({
      segments: [{ start: 0, end: 1, text: 'hai', words: words([[' hai', 0, 1]]), speaker: 'SPEAKER_01' }],
    })
    expect(toVTT(plain)).not.toContain('<v SPEAKER_01>')
    expect(toSRT(plain)).not.toContain('[SPEAKER_01]')

    const diarized = { ...plain, diarized: true, speakers: ['SPEAKER_01'] }
    expect(toVTT(diarized)).toContain('<v SPEAKER_01>hai')
    expect(toSRT(diarized)).toContain('[SPEAKER_01]')
  })

  it('writes one TXT line per segment with a clock stamp', () => {
    expect(toTXT(transcript())).toBe('[00:00:00] Baik, kita mulai dari status proyek.\n')
  })

  it('puts a speaker heading in Markdown when the speaker changes', () => {
    const t = transcript({
      diarized: true,
      speakers: ['SPEAKER_00', 'SPEAKER_01'],
      segments: [
        { start: 0, end: 1, text: 'satu', words: words([[' satu', 0, 1]]), speaker: 'SPEAKER_00' },
        { start: 1, end: 2, text: 'dua', words: words([[' dua', 1, 2]]), speaker: 'SPEAKER_00' },
        { start: 2, end: 3, text: 'tiga', words: words([[' tiga', 2, 3]]), speaker: 'SPEAKER_01' },
      ],
    })
    const md = toMarkdown(t)
    expect(md.match(/### SPEAKER_00/g)).toHaveLength(1)
    expect(md).toContain('### SPEAKER_01')
    expect(md).toContain('**[00:00:01]** dua')
  })

  it('skips the speaker line in the Markdown header when not diarized', () => {
    expect(toMarkdown(transcript())).not.toContain('**Speakers:**')
  })
})
