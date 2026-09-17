/// <reference lib="webworker" />
/**
 * The transcription worker.
 *
 * Two decisions shape this file:
 *
 * 1. We do the long-form windowing ourselves instead of handing the pipeline a
 *    `chunk_length_s`. The library's own chunking runs the entire recording
 *    inside one `await` with no hook in between, which would mean no progress
 *    bar, no partial text and no way to stop a one-hour job. Windowing here
 *    costs ~40 lines and buys all three.
 *
 * 2. Windows advance to the end of the last word decoded, not by a fixed
 *    stride. That is how faster-whisper walks a long file: it keeps sentences
 *    whole across the boundary and removes the need to de-duplicate an
 *    overlap region afterwards.
 */

import {
  InterruptableStoppingCriteria,
  env,
  pipeline,
  type AutomaticSpeechRecognitionPipeline,
} from '@huggingface/transformers'

import { SAMPLE_RATE, SILENCE_RMS, rms } from '../core/audio'
import { findModel, whisperLanguage } from '../core/catalog'
import type { Word } from '../core/models'
import { assemble } from '../core/paragraphs'
import { advanceBy, extractWords, WINDOW_S } from '../core/windowing'
import type { ErrorCode, FromWorker, RunRequest, ToWorker } from './protocol'

// Everything is fetched from the Hub and cached by the browser. There are no
// model files on our own origin, so don't let the library look for any.
env.allowLocalModels = false
env.useBrowserCache = true

let current: { key: string; instance: AutomaticSpeechRecognitionPipeline } | null = null
let stopper: InterruptableStoppingCriteria | null = null
let cancelledJob: string | null = null

const post = (msg: FromWorker) => self.postMessage(msg)

self.addEventListener('message', (event: MessageEvent<ToWorker>) => {
  const msg = event.data
  if (msg.type === 'cancel') {
    cancelledJob = msg.jobId
    stopper?.interrupt()
    return
  }
  if (msg.type === 'warm') {
    void load(msg.modelId, msg.backend, 'warm').then(
      () => {},
      (err) => post({ type: 'error', jobId: 'warm', ...classify(err) }),
    )
    return
  }
  void run(msg)
})

async function load(modelId: string, backend: 'webgpu' | 'wasm', jobId: string) {
  const spec = findModel(modelId)
  const key = `${spec.repo}::${backend}`
  if (current?.key === key) return current.instance

  // A different model means the old session's GPU buffers are dead weight.
  if (current) {
    await current.instance.dispose?.()
    current = null
  }

  const started = performance.now()
  const instance = (await pipeline('automatic-speech-recognition', spec.repo, {
    device: backend,
    dtype: spec.dtype[backend],
    progress_callback: (p: unknown) => {
      const e = p as { status?: string; file?: string; loaded?: number; total?: number; progress?: number }
      if (e.status !== 'progress' || !e.file) return
      post({
        type: 'download',
        jobId,
        file: e.file,
        loaded: e.loaded ?? 0,
        total: e.total ?? 0,
        progress: e.progress ?? 0,
      })
    },
  })) as AutomaticSpeechRecognitionPipeline

  current = { key, instance }
  post({ type: 'loaded', jobId, seconds: (performance.now() - started) / 1000 })
  return instance
}

async function run(req: RunRequest) {
  const { jobId, samples, duration } = req
  try {
    const asr = await load(req.modelId, req.backend, jobId)
    if (cancelledJob === jobId) return post({ type: 'cancelled', jobId })

    stopper = new InterruptableStoppingCriteria()
    const language = whisperLanguage(req.language)
    const started = performance.now()
    const words: Word[] = []

    let t = 0
    const total = samples.length / SAMPLE_RATE

    while (t < total) {
      if (cancelledJob === jobId) {
        stopper = null
        return post({ type: 'cancelled', jobId })
      }

      const from = Math.floor(t * SAMPLE_RATE)
      const to = Math.min(samples.length, from + WINDOW_S * SAMPLE_RATE)
      const windowSeconds = (to - from) / SAMPLE_RATE
      // Under 200 ms left: there is no word in there worth a decode pass.
      if (windowSeconds < 0.2) break

      const window = samples.subarray(from, to)

      if (rms(window) < SILENCE_RMS) {
        t += windowSeconds
        post({ type: 'progress', jobId, done: t, total, elapsed: (performance.now() - started) / 1000 })
        continue
      }

      const out = await asr(window, {
        return_timestamps: 'word',
        chunk_length_s: 0,
        ...(language ? { language, task: 'transcribe' } : {}),
        stopping_criteria: stopper,
      })

      if (cancelledJob === jobId) {
        stopper = null
        return post({ type: 'cancelled', jobId })
      }

      const fresh = extractWords(out, t, windowSeconds)
      if (fresh.length > 0) {
        words.push(...fresh)
        post({ type: 'partial', jobId, words: fresh })
      }

      t += advanceBy(fresh, t, windowSeconds)
      post({
        type: 'progress',
        jobId,
        done: Math.min(t, total),
        total,
        elapsed: (performance.now() - started) / 1000,
      })
    }

    stopper = null
    const seconds = (performance.now() - started) / 1000

    if (req.bench) {
      return post({ type: 'bench', jobId, audioSeconds: total, seconds })
    }

    const transcript = assemble(words, {
      language: req.language || 'auto',
      duration,
      source: req.source,
      model: req.modelId,
      backend: req.backend === 'webgpu' ? 'transformers.js/webgpu' : 'transformers.js/wasm',
    })
    post({ type: 'done', jobId, transcript, seconds })
  } catch (err) {
    stopper = null
    if (cancelledJob === jobId) return post({ type: 'cancelled', jobId })
    post({ type: 'error', jobId, ...classify(err) })
  }
}

/**
 * Sort a failure into the three kinds the UI can say something useful about.
 * The raw text travels along as `detail` — it is the only clue left when the
 * cause is none of the three.
 */
function classify(err: unknown): { code: ErrorCode; detail: string } {
  const detail = err instanceof Error ? err.message : String(err)
  if (/out of memory|allocation failed|Aborted\(\)/i.test(detail)) return { code: 'oom', detail }
  if (/fetch|network|Failed to load|ERR_/i.test(detail)) return { code: 'network', detail }
  return { code: 'unknown', detail }
}
