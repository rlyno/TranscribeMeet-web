import { defineConfig } from 'vite'

// The COOP/COEP pair below is what unlocks SharedArrayBuffer, which
// onnxruntime-web needs for multi-threaded WASM inference (the fallback path
// when a machine has no WebGPU). `credentialless` rather than `require-corp`
// so that model files can still be fetched from the Hugging Face CDN without
// it having to send us CORP headers. The same two headers are set for
// production in vercel.json — keep the two in sync.
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
}

export default defineConfig({
  server: { headers: isolation },
  preview: { headers: isolation },
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    // Model weights dwarf anything we ship, so a chunk over 500 kB is not
    // the thing worth warning about here.
    chunkSizeWarningLimit: 2000,
  },
  optimizeDeps: {
    // Pre-bundling rewrites the library's own worker/wasm URL resolution.
    exclude: ['@huggingface/transformers'],
  },
})
