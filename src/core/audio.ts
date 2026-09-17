/**
 * Getting 16 kHz mono samples out of whatever the user dropped in.
 *
 * The desktop app shells out to FFmpeg. We deliberately do *not* ship
 * ffmpeg.wasm here: it is another ~30 MB download on top of the model, and
 * `decodeAudioData` already hands us the browser's own hardware-backed
 * decoders for every container a Zoom or Meet recording actually arrives in.
 * The price is that exotic containers (.mkv, most .avi) fail — and when they
 * do we say so plainly rather than half-working.
 */

export const SAMPLE_RATE = 16000

export interface DecodedAudio {
  samples: Float32Array
  duration: number
  sourceSampleRate: number
  channels: number
}

/**
 * Carries the filename, not a sentence. The wording belongs to whichever
 * language the UI is in, so it is looked up where the error is shown.
 */
export class UnsupportedMediaError extends Error {
  constructor(public readonly filename: string) {
    super(`Unsupported media: ${filename}`)
    this.name = 'UnsupportedMediaError'
  }
}

/**
 * Decode to mono 16 kHz. Two passes on purpose: browsers disagree about
 * whether `decodeAudioData` honours the context sample rate, so the result is
 * measured and re-rendered when it comes back at the file's own rate.
 */
export async function decodeToMono16k(file: File | Blob, filename: string): Promise<DecodedAudio> {
  const bytes = await file.arrayBuffer()

  let raw: AudioBuffer
  try {
    // A 1-frame context is enough to ask for the decode; the rate is the hint.
    const probe = new OfflineAudioContext(1, 1, SAMPLE_RATE)
    raw = await probe.decodeAudioData(bytes)
  } catch {
    throw new UnsupportedMediaError(filename)
  }

  const meta = {
    duration: raw.duration,
    sourceSampleRate: raw.sampleRate,
    channels: raw.numberOfChannels,
  }

  if (raw.sampleRate === SAMPLE_RATE && raw.numberOfChannels === 1) {
    return { samples: raw.getChannelData(0), ...meta }
  }

  const frames = Math.max(1, Math.ceil(raw.duration * SAMPLE_RATE))
  const ctx = new OfflineAudioContext(1, frames, SAMPLE_RATE)
  const source = ctx.createBufferSource()
  source.buffer = raw
  source.connect(ctx.destination)
  source.start()
  const rendered = await ctx.startRendering()

  return { samples: rendered.getChannelData(0), ...meta }
}

/** Root-mean-square level of a window, used to skip dead air. */
export function rms(samples: Float32Array, from = 0, to = samples.length): number {
  const end = Math.min(to, samples.length)
  if (end <= from) return 0
  let sum = 0
  for (let i = from; i < end; i++) {
    const v = samples[i]!
    sum += v * v
  }
  return Math.sqrt(sum / (end - from))
}

/**
 * Whisper invents speech when handed silence, and a meeting recording is full
 * of it. Anything quieter than this is skipped without ever reaching the
 * model — which is also the single biggest speed win available to us.
 */
export const SILENCE_RMS = 0.004

/** A `seconds`-long slice taken from the middle — what the speed test uses. */
export function middleSlice(samples: Float32Array, seconds: number): Float32Array {
  const want = Math.floor(seconds * SAMPLE_RATE)
  if (samples.length <= want) return samples
  const start = Math.floor((samples.length - want) / 2)
  return samples.subarray(start, start + want)
}
