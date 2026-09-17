/**
 * Golden files: the reference outputs in `test/golden/` were produced by the
 * desktop app's own `transcribemeet/formats.py` from `test/fixture.json`.
 *
 * If this test fails, the browser port and the Python original have drifted
 * apart — which matters, because a `.srt` produced here is supposed to be
 * indistinguishable from one produced there.
 *
 * Regenerate with:
 *   .venv/bin/python -c "import json,sys;sys.path.insert(0,'.'); \
 *     from transcribemeet.models import Transcript; from transcribemeet import formats; \
 *     t=Transcript.from_dict(json.load(open('fixture.json'))); \
 *     [open(f'ref.{f}','w').write(formats.RENDERERS[f](t)) for f in ('srt','vtt','txt','md')]"
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { RENDERERS, type Format } from '../src/core/formats'
import { transcriptFromJSON } from '../src/core/models'

const here = new URL('.', import.meta.url).pathname
const fixture = transcriptFromJSON(JSON.parse(readFileSync(join(here, 'fixture.json'), 'utf8')))

describe('parity with the Python renderers', () => {
  for (const fmt of ['srt', 'vtt', 'txt', 'md'] as Format[]) {
    it(`.${fmt} matches formats.py byte for byte`, () => {
      const expected = readFileSync(join(here, 'golden', `ref.${fmt}`), 'utf8')
      expect(RENDERERS[fmt](fixture)).toBe(expected)
    })
  }

  it('round-trips through .json without losing word timestamps', () => {
    const again = transcriptFromJSON(JSON.parse(RENDERERS.json(fixture)))
    expect(again.segments).toHaveLength(fixture.segments.length)
    expect(again.segments[0]!.words).toEqual(fixture.segments[0]!.words)
    expect(RENDERERS.srt(again)).toBe(RENDERERS.srt(fixture))
  })
})
