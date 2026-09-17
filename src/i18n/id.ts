/** Indonesian copy. The shape of this object is the contract; see `en.ts`. */
export const id = {
  code: 'id',
  name: 'Bahasa Indonesia',
  htmlLang: 'id',

  tagline: 'Transkrip meeting, dikerjakan di browser Anda',
  chipNoUpload: 'Berkas tidak diunggah',
  chipWebGPU: 'WebGPU aktif',
  chipWasm: 'CPU (WASM)',

  machineTitle: 'Mesin ini',
  queueTitle: 'Antrian',
  queueEmpty: 'Belum ada rekaman.',
  addRecording: '+ Tambah rekaman',
  checking: 'Memeriksa…',

  factBackend: 'Backend',
  factGPU: 'GPU',
  factCores: 'Core CPU',
  factRAM: 'RAM',
  factCache: 'Kuota cache',
  factThreads: 'Thread WASM',
  threadsOn: 'aktif',
  threadsOff: 'nonaktif',
  backendWasm: 'WASM (CPU)',

  noWebGPU:
    'Browser ini tidak menyediakan WebGPU, jadi transkripsi jalan di CPU — ' +
    'hitungannya jam, bukan menit. Chrome atau Edge terbaru di desktop ' +
    'biasanya punya WebGPU.',

  speedTest: 'Uji kecepatan',
  measuring: 'Mengukur…',
  benchNeedsFile:
    'Tambahkan satu rekaman dulu — uji kecepatan memakai potongan 2 menit dari rekaman Anda sendiri.',
  benchReading: 'Membaca audio…',
  benchColModel: 'Model',
  benchColSpeed: 'Kecepatan',
  benchColThis: 'Rekaman ini',
  benchEstimateNote: '* diperkirakan dari model yang diukur, bukan hasil pengukuran langsung.',

  dropTitle: 'Taruh rekaman meeting di sini',
  dropSub:
    'MP4, MOV, M4A, MP3, atau WAV. Berkasnya dibaca langsung oleh browser ini — ' +
    'tidak ada unggahan, tidak ada server yang menyentuhnya.',
  pickFile: 'Pilih berkas',
  dropJsonHint: 'Punya berkas .json dari versi desktop? Taruh di sini juga untuk dibaca.',

  pitch1Title: 'Yang diunduh adalah modelnya',
  pitch1Body:
    'Whisper berjalan di perangkat Anda. Sekali unduh, tersimpan di cache browser, ' +
    'dan pemakaian berikutnya tidak perlu internet.',
  pitch2Title: 'Timestamp per kata',
  pitch2Body: 'Klik waktu untuk melompat ke bagian itu di rekaman. Ekspor ke lima format.',
  pitch3Title: 'Butuh yang lebih kuat?',
  pitch3Body:
    'Versi desktop memakai GPU Apple lewat MLX, memisahkan pembicara, dan menerima ' +
    'format apa pun lewat FFmpeg.',

  fieldModel: 'Model',
  fieldLanguage: 'Bahasa transkrip',
  languageHint: 'Mengunci bahasa lebih akurat daripada deteksi otomatis.',
  downloadNoteA: 'Unduhan pertama untuk model ini: ',
  downloadNoteB: '. Setelah itu tersimpan di cache browser dan tidak diunduh lagi.',
  start: 'Mulai transkrip',
  startAll: (n: number) => `Mulai semua (${n})`,

  stateQueued: 'menunggu',
  stateDecoding: 'membaca audio',
  stateLoading: 'mengunduh model',
  stateRunning: 'menranskrip',
  stateDone: 'selesai',
  stateError: 'gagal',
  stateCancelled: 'dibatalkan',

  cancel: 'Batalkan',
  remove: 'Hapus',
  retry: 'Coba lagi',
  failed: 'Gagal',
  cancelledTitle: 'Dibatalkan',

  readingAudio: 'Membaca audio dari berkas…',
  preparingModel: 'Menyiapkan model…',
  downloadingA: 'Mengunduh model — ',
  downloadingOf: ' dari ',
  modelReady: 'Model siap. Mulai menranskrip…',
  stopping: 'Menghentikan…',
  cancelledBefore: 'Dibatalkan sebelum mulai.',
  cancelledClean: 'Dibatalkan. Tidak ada transkrip separuh jadi yang disimpan.',
  finishedIn: (d: string) => `Selesai dalam ${d}`,
  openedFromJson: 'Dibuka dari berkas .json',

  progress: 'Kemajuan',
  duration: 'Durasi',
  speed: 'Kecepatan',
  remaining: 'Sisa',
  partialTitle: 'Hasil sementara — belum dirapikan jadi paragraf:',

  search: 'Cari di transkrip…',
  searchNone: 'tidak ada',
  searchHits: (n: number) => `${n} segmen`,
  followPlayback: 'Ikuti pemutaran',
  jumpTo: 'Lompat ke bagian ini',
  words: 'Kata',
  model: 'Model',
  language: 'Bahasa',
  finishedInLabel: 'Selesai dalam',
  speakers: 'Pembicara',
  realtimeSuffix: 'realtime',
  noSpeech: 'Tidak ada ucapan yang terdeteksi.',

  errOOM:
    'Kehabisan memori. Coba model yang lebih kecil, tutup tab lain, atau potong ' +
    'rekamannya jadi beberapa bagian.',
  errNetwork: (raw: string) =>
    `Gagal mengunduh model: ${raw}. Periksa koneksi lalu coba lagi — bagian yang ` +
    'sudah terunduh tidak hilang.',
  errUnsupported: (name: string) =>
    `Browser ini tidak bisa membaca "${name}". Coba ekspor ulang ke MP4, M4A, MP3, ` +
    'atau WAV — atau pakai versi desktop TranscribeMeet, yang memakai FFmpeg dan ' +
    'menerima format apa pun.',
  errBadJson: (name: string, why: string) => `Tidak bisa membuka ${name}: ${why}`,
  errWorker: 'Worker berhenti tak terduga.',

  modelNotes: {
    base: 'Paling ringan. Untuk mencoba alur kerjanya, bukan untuk hasil akhir.',
    small: 'Titik seimbang. Ini yang dipakai kalau Anda tidak memilih apa pun.',
    'large-v3-turbo': 'Paling akurat, terutama untuk bahasa Indonesia. Unduhannya besar.',
  } as Record<string, string>,

  langNames: {
    '': 'Deteksi otomatis',
    id: 'Indonesia',
    en: 'Inggris',
    jv: 'Jawa',
    su: 'Sunda',
    ms: 'Melayu',
    zh: 'Mandarin',
    ar: 'Arab',
    ja: 'Jepang',
    ko: 'Korea',
  } as Record<string, string>,

  footerA:
    'Berkas Anda tidak pernah meninggalkan perangkat ini — yang diunduh justru ' +
    'modelnya, dari Hugging Face ke browser Anda.',
  footerB: 'Butuh rekaman panjang atau hasil paling akurat? Pakai ',
  footerLink: 'versi desktop',

  unitHour: 'jam',
  unitMinute: 'menit',
  unitSecond: 'detik',
}

export type Dict = typeof id
