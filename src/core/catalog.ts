/**
 * Which Whisper builds we offer, and what they actually cost to download.
 *
 * Every repo here is an `_timestamped` export. That is not a preference: word
 * timestamps are read out of the decoder's cross-attentions, and the ordinary
 * `onnx-community/whisper-*` exports do not emit them. Pointing at one of
 * those fails at the first decode with "Model outputs must contain cross
 * attentions to extract timestamps".
 *
 * The byte counts are the real file sizes on those repos, added up per
 * (encoder + merged decoder) pair for the dtype combination we request — not
 * estimates. They are shown in the UI before anything is fetched, because in
 * a browser the download *is* the first cost the user pays.
 *
 * dtype choices:
 *   - WebGPU: q4 weights throughout, except `base`, where an fp32 encoder is
 *     only 82 MB and buys back the quality a tiny model can least afford.
 *   - WASM (no WebGPU): q8, because q4 kernels are slow on plain WASM.
 * No fp16 anywhere, so we never have to feature-detect `shader-f16`.
 */

import type { DataType } from '@huggingface/transformers'

export type Backend = 'webgpu' | 'wasm'

export interface ModelSpec {
  id: string
  label: string
  repo: string
  /**
   * Relative decode cost, with `base` as 1. Used only to turn one measured
   * speed test into estimates for the models that were not measured — always
   * labelled as an estimate in the UI, never presented as a reading.
   */
  cost: number
  bytes: Record<Backend, number>
  dtype: Record<Backend, Record<string, DataType>>
}

const MB = 1024 * 1024

export const MODELS: ModelSpec[] = [
  {
    id: 'base',
    label: 'base',
    repo: 'onnx-community/whisper-base_timestamped',
    cost: 1,
    bytes: { webgpu: 82451730 + 123738327, wasm: 23159167 + 53712708 },
    dtype: {
      webgpu: { encoder_model: 'fp32', decoder_model_merged: 'q4' },
      wasm: { encoder_model: 'q8', decoder_model_merged: 'q8' },
    },
  },
  {
    id: 'small',
    label: 'small',
    repo: 'onnx-community/whisper-small_timestamped',
    cost: 3,
    bytes: { webgpu: 66178491 + 233421212, wasm: 92240498 + 156795750 },
    dtype: {
      webgpu: { encoder_model: 'q4', decoder_model_merged: 'q4' },
      wasm: { encoder_model: 'q8', decoder_model_merged: 'q8' },
    },
  },
  {
    id: 'large-v3-turbo',
    label: 'large-v3-turbo',
    repo: 'onnx-community/whisper-large-v3-turbo_timestamped',
    cost: 7,
    bytes: { webgpu: 425003939 + 334207912, wasm: 644883359 + 439997434 },
    dtype: {
      webgpu: { encoder_model: 'q4', decoder_model_merged: 'q4' },
      wasm: { encoder_model: 'q8', decoder_model_merged: 'q8' },
    },
  },
]

export const DEFAULT_MODEL = 'small'

export function findModel(id: string): ModelSpec {
  return MODELS.find((m) => m.id === id) ?? MODELS.find((m) => m.id === DEFAULT_MODEL)!
}

export function formatBytes(n: number): string {
  if (n >= 1024 * MB) return `${(n / (1024 * MB)).toFixed(1).replace('.', ',')} GB`
  return `${Math.round(n / MB)} MB`
}

/**
 * Whisper wants the language spelled out, not the ISO code. Only the handful
 * people actually pick here; everything else falls back to auto-detect.
 */
export const LANGUAGES: { code: string; whisper: string }[] = [
  { code: '', whisper: '' },
  { code: 'id', whisper: 'indonesian' },
  { code: 'en', whisper: 'english' },
  { code: 'jv', whisper: 'javanese' },
  { code: 'su', whisper: 'sundanese' },
  { code: 'ms', whisper: 'malay' },
  { code: 'zh', whisper: 'chinese' },
  { code: 'ar', whisper: 'arabic' },
  { code: 'ja', whisper: 'japanese' },
  { code: 'ko', whisper: 'korean' },
]

export function whisperLanguage(code: string): string | undefined {
  const hit = LANGUAGES.find((l) => l.code === code)
  return hit && hit.whisper ? hit.whisper : undefined
}
