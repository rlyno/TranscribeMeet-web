/**
 * What this particular browser can actually do.
 *
 * Nothing here is cosmetic: the answer decides which dtype we download and
 * whether the user is looking at minutes or hours of waiting. The desktop app
 * has the same problem and solves it with `pick_backend()`; this is the
 * browser's version of that function.
 */

export interface Capability {
  backend: 'webgpu' | 'wasm'
  webgpu: boolean
  adapter: string | null
  crossOriginIsolated: boolean
  threads: number
  memoryGB: number | null
  storageQuotaGB: number | null
}

export async function detect(): Promise<Capability> {
  const nav = navigator as Navigator & {
    gpu?: { requestAdapter(): Promise<GPUAdapterLike | null> }
    deviceMemory?: number
  }

  let webgpu = false
  let adapter: string | null = null
  try {
    if (nav.gpu) {
      const a = await nav.gpu.requestAdapter()
      if (a) {
        webgpu = true
        adapter = describeAdapter(a)
      }
    }
  } catch {
    webgpu = false
  }

  let storageQuotaGB: number | null = null
  try {
    const est = await navigator.storage?.estimate?.()
    if (est?.quota) storageQuotaGB = est.quota / 1024 ** 3
  } catch {
    storageQuotaGB = null
  }

  const threads = navigator.hardwareConcurrency || 4
  const memoryGB = typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null

  return {
    backend: webgpu ? 'webgpu' : 'wasm',
    webgpu,
    adapter,
    crossOriginIsolated: globalThis.crossOriginIsolated === true,
    threads,
    memoryGB,
    storageQuotaGB,
  }
}

interface GPUAdapterLike {
  info?: { vendor?: string; architecture?: string; description?: string }
  requestAdapterInfo?: () => Promise<{ vendor?: string; architecture?: string; description?: string }>
}

function describeAdapter(a: GPUAdapterLike): string | null {
  const info = a.info
  if (!info) return null
  const parts = [info.vendor, info.architecture, info.description].filter(Boolean)
  return parts.length ? parts.join(' ') : null
}

/**
 * The containers `decodeAudioData` handles across Chrome, Safari and Firefox.
 * `.mkv` and most `.avi` are deliberately absent: a recording the browser
 * cannot decode is a dead end, and the picker should say so up front.
 */
export const ACCEPTED_EXTENSIONS = [
  '.mp4', '.m4a', '.m4v', '.mov', '.mp3', '.wav', '.webm', '.ogg', '.oga', '.opus', '.flac', '.aac',
]

export const ACCEPT_ATTRIBUTE = 'audio/*,video/*,' + ACCEPTED_EXTENSIONS.join(',')
