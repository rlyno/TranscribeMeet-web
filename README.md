# TranscribeMeet Web

**Meeting transcripts with word-level timestamps, produced inside the browser.**
The Whisper model downloads to the visitor's device and runs there. The
recording is never uploaded — there is no backend to upload it to.

> *Bahasa Indonesia: versi web dari [TranscribeMeet](https://github.com/epamemo/TranscribeMeet)
> untuk orang yang tidak mau memasang apa pun. Antarmukanya dua bahasa —
> Indonesia dan Inggris, bisa diganti lewat tombol ID/EN di header.*

This is the companion to the [desktop version](https://github.com/epamemo/TranscribeMeet):
same output formats, same subtitle rules, same reader — but nothing to install.

---

## What it does

Drop in an MP4, MOV, M4A, MP3 or WAV. Out comes a transcript you can read
beside the recording, with clickable timestamps and five export formats:

| File | Contents |
|---|---|
| `.md` | readable transcript, grouped into paragraphs |
| `.srt` | subtitles, two balanced lines, max 6 seconds per cue |
| `.vtt` | web subtitles |
| `.txt` | plain text, one line per segment |
| `.json` | everything, including **per-word** timestamps |

A `.json` written by the desktop version can be dropped in here too, and it
opens straight into the reader.

## What it costs the visitor

The model download, once, then cached by the browser forever after:

| Model | WebGPU | CPU (WASM) | Good for |
|---|---|---|---|
| `base` | 197 MB | 73 MB | trying the workflow |
| `small` | 286 MB | 238 MB | the default, balanced |
| `large-v3-turbo` | 724 MB | 1,0 GB | best accuracy, especially Indonesian |

Measured on an M1 Pro over WebGPU, `base` runs at about **7,5x realtime** — a
one-hour meeting in roughly eight minutes. Without WebGPU it falls back to
WASM on the CPU and gets several times slower; the UI says so plainly, and the
**Benchmark** button measures this particular machine on a two-minute slice
rather than guessing.

## Running it

```bash
npm install
npm run dev
```

```bash
npm test          # 57 tests, no browser needed
npm run build     # typecheck, then build to dist/
```

## Deploying to Vercel

The whole thing is static. Import the repository in Vercel and take the
defaults — `vercel.json` already carries the build command, the output
directory, and the headers that matter:

```json
"Cross-Origin-Opener-Policy": "same-origin",
"Cross-Origin-Embedder-Policy": "credentialless"
```

Those two are not optional. They turn on `SharedArrayBuffer`, which
onnxruntime-web needs for multi-threaded WASM inference — the fallback path for
every visitor without WebGPU. `credentialless` rather than `require-corp` so
that model files still load from the Hugging Face CDN without it having to
send us CORP headers.

**Do not host the model weights yourself.** They are fetched from the Hugging
Face CDN, which is free and fast. Putting 724 MB of weights behind a Vercel
Hobby plan would exhaust its 100 GB monthly bandwidth in about 140 downloads.
What Vercel does serve is roughly **7 MB gzipped per visitor**, most of it the
onnxruntime WASM binary.

One licensing note: the Hobby plan is non-commercial. Monetising this means
Pro. Cloudflare Pages is the obvious alternative if bandwidth ever becomes the
constraint.

## How it works

```
file → decodeAudioData → 16 kHz mono → 30 s windows → Whisper → words
                                                                  ↓
                        md · srt · vtt · txt · json ← paragraphs ←┘
```

**Audio.** `decodeAudioData` on an `OfflineAudioContext`, then resampled to
16 kHz mono. There is deliberately no ffmpeg.wasm: it is another ~30 MB
download, and the browser's own decoders already cover every container a Zoom
or Meet recording arrives in. The price is that `.mkv` and most `.avi` fail,
and when they do the app says so and points at the desktop version.

**Transcription.** Transformers.js with the `onnx-community/whisper-*_timestamped`
exports. The `_timestamped` part is not a preference — word timestamps are read
out of the decoder's cross-attentions, and the ordinary exports do not emit
them.

**Windowing.** We do the long-form windowing ourselves rather than passing
`chunk_length_s` to the pipeline. The library's own chunking runs the whole
recording inside a single `await` with no hook in between, which would mean no
progress bar, no partial text and no way to stop a one-hour job. Windows
advance to the end of the last word decoded, the way faster-whisper walks a
long file: sentences survive the boundary, and no overlap de-duplication is
needed afterwards.

**Silence.** Windows below an RMS threshold never reach the model. Meeting
recordings are full of dead air, and this is the single largest speed win
available — it also avoids the hallucinated text Whisper produces when handed
silence. Whatever slips through is caught afterwards by a repetition collapser,
since the JS pipeline exposes neither `no_speech_threshold` nor
`compression_ratio_threshold`.

**Cancellation.** `InterruptableStoppingCriteria` stops the current window, and
the loop checks a flag between windows. Output files are only written at the
end, so a cancelled job never leaves half a transcript behind.

## Parity with the desktop version

`src/core/formats.ts` is a port of `transcribemeet/formats.py`, and
`test/golden.test.ts` proves it: the reference files in `test/golden/` were
produced by the Python original from `test/fixture.json`, and the test asserts
the TypeScript output matches **byte for byte**. If someone changes the cue
rules on either side, that test fails.

To regenerate the golden files after a deliberate change upstream:

```bash
.venv/bin/python -c "import json,sys;sys.path.insert(0,'.'); \
  from transcribemeet.models import Transcript; from transcribemeet import formats; \
  t=Transcript.from_dict(json.load(open('fixture.json'))); \
  [open(f'ref.{f}','w').write(formats.RENDERERS[f](t)) for f in ('srt','vtt','txt','md')]"
```

## What the desktop version still does better

Worth being straight about, since the point of this app is to be the easy door
rather than the complete one:

- **Speaker separation.** Not here yet. sherpa-onnx ships an official WASM
  build for speaker diarization using the same pyannote segmentation-3.0 and
  CAM++ models the desktop app uses, so the same labels are reachable — it is
  simply the next piece of work, not a limitation of the browser.
- **Custom terms.** The desktop app passes `--prompt` to bias Whisper towards
  acronyms and names. The JS pipeline has no equivalent for `initial_prompt`.
- **Any container at all**, through FFmpeg.
- **Apple GPU through MLX**, which no browser can match.
- **Long recordings.** WASM is 32-bit: expect trouble past roughly two hours or
  2 GB. The app reports out-of-memory honestly instead of dying quietly.

## Layout

```
src/
├── core/           no DOM, no library — the testable half
│   ├── models.ts       Word / Segment / Transcript, shared with the .json format
│   ├── formats.ts      srt / vtt / txt / md / json — the port of formats.py
│   ├── paragraphs.ts   words → paragraphs, merging, repetition collapse
│   ├── windowing.ts    30-second window arithmetic
│   ├── audio.ts        decode → 16 kHz mono, silence detection
│   ├── capability.ts   WebGPU / isolation / storage detection
│   └── catalog.ts      the model list and its real byte sizes
├── worker/         the ASR worker and its message protocol
├── ui/             DOM helpers, the reader, humanised numbers
├── i18n/           id.ts and en.ts; `Dict` keeps them in step
└── app.ts          queue, state, rendering
```

## Licence

[MIT](LICENSE). The models and libraries carry their own; see the table in the
desktop README.
