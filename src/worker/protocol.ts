/** Messages exchanged with the ASR worker. Shared by both sides. */

import type { Backend } from '../core/catalog'
import type { Transcript, Word } from '../core/models'

export interface RunRequest {
  type: 'run'
  jobId: string
  samples: Float32Array
  duration: number
  language: string
  modelId: string
  backend: Backend
  source: string
  /** Speed test mode: transcribe only, skip assembly, report timing. */
  bench?: boolean
}

/** The worker names the failure; the UI supplies the wording, in its language. */
export type ErrorCode = 'oom' | 'network' | 'unknown'

export type ToWorker =
  | RunRequest
  | { type: 'warm'; modelId: string; backend: Backend }
  | { type: 'cancel'; jobId: string }

export type FromWorker =
  | { type: 'download'; jobId: string; file: string; loaded: number; total: number; progress: number }
  | { type: 'loaded'; jobId: string; seconds: number }
  | { type: 'progress'; jobId: string; done: number; total: number; elapsed: number }
  | { type: 'partial'; jobId: string; words: Word[] }
  | { type: 'done'; jobId: string; transcript: Transcript; seconds: number }
  | { type: 'bench'; jobId: string; audioSeconds: number; seconds: number }
  | { type: 'cancelled'; jobId: string }
  | { type: 'error'; jobId: string; code: ErrorCode; detail: string }
