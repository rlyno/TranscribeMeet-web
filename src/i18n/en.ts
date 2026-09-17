import type { Dict } from './id'

/** English copy. Must stay structurally identical to `id.ts` — `Dict` enforces it. */
export const en: Dict = {
  code: 'en',
  name: 'English',
  htmlLang: 'en',

  tagline: 'Meeting transcripts, done inside your browser',
  chipNoUpload: 'Nothing uploaded',
  chipWebGPU: 'WebGPU on',
  chipWasm: 'CPU (WASM)',

  machineTitle: 'This machine',
  queueTitle: 'Queue',
  queueEmpty: 'Nothing queued yet.',
  addRecording: '+ Add recording',
  checking: 'Checking…',

  factBackend: 'Backend',
  factGPU: 'GPU',
  factCores: 'CPU cores',
  factRAM: 'RAM',
  factCache: 'Cache quota',
  factThreads: 'WASM threads',
  threadsOn: 'on',
  threadsOff: 'off',
  backendWasm: 'WASM (CPU)',

  noWebGPU:
    'This browser has no WebGPU, so transcription runs on the CPU — think hours, ' +
    'not minutes. A recent desktop Chrome or Edge usually has WebGPU.',

  speedTest: 'Benchmark',
  measuring: 'Measuring…',
  benchNeedsFile:
    'Add a recording first — the benchmark uses a two-minute slice of your own file.',
  benchReading: 'Reading audio…',
  benchColModel: 'Model',
  benchColSpeed: 'Speed',
  benchColThis: 'This recording',
  benchEstimateNote: '* estimated from the measured model, not measured directly.',

  dropTitle: 'Drop a meeting recording here',
  dropSub:
    'MP4, MOV, M4A, MP3 or WAV. The file is read directly by this browser — ' +
    'nothing is uploaded, no server ever touches it.',
  pickFile: 'Choose a file',
  dropJsonHint: 'Got a .json from the desktop version? Drop that here too and read it.',

  pitch1Title: 'The model is what downloads',
  pitch1Body:
    'Whisper runs on your device. Downloaded once, cached by the browser, and ' +
    'offline from then on.',
  pitch2Title: 'Word-level timestamps',
  pitch2Body: 'Click a timestamp to jump there in the recording. Export to five formats.',
  pitch3Title: 'Need something heavier?',
  pitch3Body:
    'The desktop version uses the Apple GPU through MLX, separates speakers, and ' +
    'takes any format at all through FFmpeg.',

  fieldModel: 'Model',
  fieldLanguage: 'Spoken language',
  languageHint: 'Locking the language beats auto-detection.',
  downloadNoteA: 'First download for this model: ',
  downloadNoteB: '. After that it lives in the browser cache and is never fetched again.',
  start: 'Start transcribing',
  startAll: (n: number) => `Start all (${n})`,

  stateQueued: 'waiting',
  stateDecoding: 'reading audio',
  stateLoading: 'downloading model',
  stateRunning: 'transcribing',
  stateDone: 'done',
  stateError: 'failed',
  stateCancelled: 'cancelled',

  cancel: 'Cancel',
  remove: 'Remove',
  retry: 'Try again',
  failed: 'Failed',
  cancelledTitle: 'Cancelled',

  readingAudio: 'Reading audio from the file…',
  preparingModel: 'Preparing the model…',
  downloadingA: 'Downloading model — ',
  downloadingOf: ' of ',
  modelReady: 'Model ready. Starting transcription…',
  stopping: 'Stopping…',
  cancelledBefore: 'Cancelled before it started.',
  cancelledClean: 'Cancelled. No half-finished transcript was kept.',
  finishedIn: (d: string) => `Finished in ${d}`,
  openedFromJson: 'Opened from a .json file',

  progress: 'Progress',
  duration: 'Duration',
  speed: 'Speed',
  remaining: 'Remaining',
  partialTitle: 'Rough output so far — not yet grouped into paragraphs:',

  search: 'Search the transcript…',
  searchNone: 'no matches',
  searchHits: (n: number) => `${n} segments`,
  followPlayback: 'Follow playback',
  jumpTo: 'Jump to this point',
  words: 'Words',
  model: 'Model',
  language: 'Language',
  finishedInLabel: 'Finished in',
  speakers: 'Speakers',
  realtimeSuffix: 'realtime',
  noSpeech: 'No speech was detected.',

  errOOM:
    'Out of memory. Try a smaller model, close other tabs, or split the recording ' +
    'into parts.',
  errNetwork: (raw: string) =>
    `Could not download the model: ${raw}. Check your connection and try again — ` +
    'whatever already downloaded is kept.',
  errUnsupported: (name: string) =>
    `This browser cannot read "${name}". Re-export it as MP4, M4A, MP3 or WAV — ` +
    'or use the desktop version of TranscribeMeet, which goes through FFmpeg and ' +
    'takes anything.',
  errBadJson: (name: string, why: string) => `Could not open ${name}: ${why}`,
  errWorker: 'The worker stopped unexpectedly.',

  modelNotes: {
    base: 'The lightest one. For trying the workflow, not for a final transcript.',
    small: 'The balanced pick. This is what you get if you choose nothing.',
    'large-v3-turbo': 'The most accurate, especially for Indonesian. Big download.',
  },

  langNames: {
    '': 'Detect automatically',
    id: 'Indonesian',
    en: 'English',
    jv: 'Javanese',
    su: 'Sundanese',
    ms: 'Malay',
    zh: 'Chinese',
    ar: 'Arabic',
    ja: 'Japanese',
    ko: 'Korean',
  },

  footerA:
    'Your files never leave this device — what gets downloaded is the model, from ' +
    'Hugging Face to your browser.',
  footerB: 'Long recording, or want the best accuracy? Use the ',
  footerLink: 'desktop version',

  unitHour: 'h',
  unitMinute: 'min',
  unitSecond: 's',
}
