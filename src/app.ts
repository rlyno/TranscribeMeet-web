/**
 * The app controller: one worker, one queue, one recording at a time.
 *
 * Jobs run strictly one after another because there is a single GPU behind
 * them — the same reason the desktop app serialises its queue.
 *
 * Every user-visible string comes from `t()`, read fresh inside render, so
 * switching language is a re-render and nothing else.
 */

import { decodeToMono16k, middleSlice, UnsupportedMediaError } from './core/audio'
import { ACCEPT_ATTRIBUTE, detect, type Capability } from './core/capability'
import { DEFAULT_MODEL, findModel, formatBytes, LANGUAGES, MODELS } from './core/catalog'
import { clock } from './core/formats'
import type { Transcript, Word } from './core/models'
import { transcriptFromJSON } from './core/models'
import { LANGS, lang, langLabel, onLangChange, setLang, t } from './i18n'
import { el, mount, need } from './ui/dom'
import { decimal, formatDuration } from './ui/humanize'
import { renderReader } from './ui/reader'
import type { ErrorCode, FromWorker, ToWorker } from './worker/protocol'

type JobState = 'queued' | 'decoding' | 'loading' | 'running' | 'done' | 'error' | 'cancelled'

interface Job {
  id: string
  file: File | null
  name: string
  stem: string
  state: JobState
  /** A key into the dictionary, or free text the worker handed us. */
  message: string
  progress: number
  modelId: string
  language: string
  /**
   * Nothing is fetched until the user has seen the download size and said go.
   * Dropping a file must never, on its own, start pulling hundreds of MB.
   */
  confirmed: boolean
  duration: number
  elapsed: number
  partial: Word[]
  transcript: Transcript | null
  mediaUrl: string | null
  isVideo: boolean
  downloads: Map<string, { loaded: number; total: number }>
}

interface BenchResult {
  modelId: string
  speed: number
  measured: boolean
}

export class App {
  private worker: Worker
  private jobs: Job[] = []
  private activeId: string | null = null
  private selectedId: string | null = null
  private cap: Capability | null = null
  private bench: BenchResult[] = []
  private benchNote = ''
  private benchBusy = false
  private settings = { modelId: DEFAULT_MODEL, language: 'id' }

  private elJobs = need('jobs')
  private elDetail = need('detail')
  private elMachine = need('machine')
  private elChips = need('headerChips')
  private elCount = need('jobCount')
  private elAdd = need('addWrap')

  constructor() {
    this.worker = new Worker(new URL('./worker/asr.worker.ts', import.meta.url), { type: 'module' })
    this.worker.addEventListener('message', (e: MessageEvent<FromWorker>) => this.onWorkerMessage(e.data))
    this.worker.addEventListener('error', () => {
      const job = this.active
      if (job) this.fail(job, 'errWorker')
    })

    onLangChange(() => this.render())
    document.documentElement.lang = t().htmlLang
    this.installDragAndDrop()
    this.installAddButton()
    this.render()
    void this.probe()
  }

  // ---------------------------------------------------------------- machine

  private async probe() {
    this.cap = await detect()
    this.render()
  }

  private send(msg: ToWorker, transfer: Transferable[] = []) {
    this.worker.postMessage(msg, transfer)
  }

  // ------------------------------------------------------------------ jobs

  private get active(): Job | null {
    return this.jobs.find((j) => j.id === this.activeId) ?? null
  }

  private get selected(): Job | null {
    return this.jobs.find((j) => j.id === this.selectedId) ?? null
  }

  add(files: FileList | File[]) {
    const list = [...files]
    for (const f of list.filter((f) => f.name.toLowerCase().endsWith('.json'))) {
      void this.openTranscript(f)
    }

    for (const file of list.filter((f) => !f.name.toLowerCase().endsWith('.json'))) {
      const id = crypto.randomUUID()
      this.jobs.push({
        id,
        file,
        name: file.name,
        stem: file.name.replace(/\.[^.]+$/, ''),
        state: 'queued',
        message: '',
        progress: 0,
        modelId: this.settings.modelId,
        language: this.settings.language,
        confirmed: false,
        duration: 0,
        elapsed: 0,
        partial: [],
        transcript: null,
        mediaUrl: null,
        isVideo: file.type.startsWith('video/') || /\.(mp4|m4v|mov|webm)$/i.test(file.name),
        downloads: new Map(),
      })
      this.selectedId = id
    }
    this.render()
    void this.pump()
  }

  /** Read a `.json` written earlier — by this app or by the desktop one. */
  private async openTranscript(file: File) {
    try {
      const transcript = transcriptFromJSON(JSON.parse(await file.text()))
      const id = crypto.randomUUID()
      this.jobs.push({
        id,
        file: null,
        name: file.name,
        stem: file.name.replace(/\.json$/i, ''),
        state: 'done',
        message: 'openedFromJson',
        progress: 1,
        modelId: transcript.model,
        language: transcript.language,
        confirmed: true,
        duration: transcript.duration,
        elapsed: 0,
        partial: [],
        transcript,
        mediaUrl: null,
        isVideo: false,
        downloads: new Map(),
      })
      this.selectedId = id
      this.render()
    } catch (err) {
      alert(t().errBadJson(file.name, err instanceof Error ? err.message : String(err)))
    }
  }

  private async pump() {
    if (this.activeId) return
    const next = this.jobs.find((j) => j.state === 'queued' && j.confirmed)
    if (!next) return

    this.activeId = next.id
    if (!this.selected || this.selected.state === 'done') this.selectedId = next.id

    next.state = 'decoding'
    next.message = 'readingAudio'
    this.render()

    let decoded
    try {
      decoded = await decodeToMono16k(next.file!, next.name)
    } catch (err) {
      if (err instanceof UnsupportedMediaError) {
        return this.fail(next, t().errUnsupported(err.filename))
      }
      return this.fail(next, err instanceof Error ? err.message : String(err))
    }

    next.duration = decoded.duration
    next.mediaUrl = URL.createObjectURL(next.file!)
    next.state = 'loading'
    next.message = 'preparingModel'
    this.render()

    // Transfers ownership: the samples live in the worker from here on.
    const samples = new Float32Array(decoded.samples)
    this.send(
      {
        type: 'run',
        jobId: next.id,
        samples,
        duration: decoded.duration,
        language: next.language,
        modelId: next.modelId,
        backend: this.cap?.backend ?? 'wasm',
        source: next.name,
      },
      [samples.buffer],
    )
  }

  cancel(job: Job) {
    if (job.state === 'queued') {
      job.state = 'cancelled'
      job.message = 'cancelledBefore'
    } else {
      job.message = 'stopping'
      this.send({ type: 'cancel', jobId: job.id })
    }
    this.render()
  }

  remove(job: Job) {
    if (job.mediaUrl) URL.revokeObjectURL(job.mediaUrl)
    this.jobs = this.jobs.filter((j) => j.id !== job.id)
    if (this.selectedId === job.id) this.selectedId = this.jobs[this.jobs.length - 1]?.id ?? null
    this.render()
  }

  private fail(job: Job, message: string) {
    job.state = 'error'
    job.message = message
    job.progress = 0
    if (this.activeId === job.id) this.activeId = null
    this.render()
    void this.pump()
  }

  /** A stored message is either a dictionary key or already-final text. */
  private say(message: string): string {
    if (!message) return ''
    const value = (t() as Record<string, unknown>)[message]
    return typeof value === 'string' ? value : message
  }

  private errorText(code: ErrorCode, detail: string): string {
    const d = t()
    if (code === 'oom') return d.errOOM
    if (code === 'network') return d.errNetwork(detail)
    return detail
  }

  // ------------------------------------------------------------- worker bus

  private onWorkerMessage(msg: FromWorker) {
    if (msg.jobId === 'bench' || msg.jobId === 'warm') return this.onBenchMessage(msg)

    const job = this.jobs.find((j) => j.id === msg.jobId)
    if (!job) return
    const d = t()

    switch (msg.type) {
      case 'download': {
        job.state = 'loading'
        job.downloads.set(msg.file, { loaded: msg.loaded, total: msg.total })
        let loaded = 0
        let total = 0
        for (const entry of job.downloads.values()) {
          loaded += entry.loaded
          total += entry.total
        }
        job.progress = total > 0 ? loaded / total : 0
        job.message = `${d.downloadingA}${formatBytes(loaded)}${d.downloadingOf}${formatBytes(total)}`
        break
      }
      case 'loaded':
        job.state = 'running'
        job.progress = 0
        job.downloads.clear()
        job.message = 'modelReady'
        break
      case 'progress':
        job.state = 'running'
        job.progress = msg.total > 0 ? Math.min(1, msg.done / msg.total) : 0
        job.elapsed = msg.elapsed
        job.message = `${clock(msg.done)}${d.downloadingOf}${clock(msg.total)}`
        break
      case 'partial':
        job.partial.push(...msg.words)
        break
      case 'done':
        job.state = 'done'
        job.progress = 1
        job.transcript = msg.transcript
        job.elapsed = msg.seconds
        job.message = d.finishedIn(formatDuration(msg.seconds))
        job.partial = []
        this.activeId = null
        void this.pump()
        break
      case 'cancelled':
        job.state = 'cancelled'
        job.message = 'cancelledClean'
        job.partial = []
        this.activeId = null
        void this.pump()
        break
      case 'error':
        return this.fail(job, this.errorText(msg.code, msg.detail))
      case 'bench':
        break
    }
    this.render()
  }

  // ------------------------------------------------------------ speed test

  private onBenchMessage(msg: FromWorker) {
    const d = t()
    if (msg.type === 'download') {
      this.benchNote = `${d.downloadingA}${formatBytes(msg.loaded)}${d.downloadingOf}${formatBytes(msg.total)}`
    } else if (msg.type === 'progress') {
      this.benchNote = `${d.measuring} ${clock(msg.done)}${d.downloadingOf}${clock(msg.total)}`
    } else if (msg.type === 'bench') {
      const speed = msg.audioSeconds / Math.max(msg.seconds, 0.001)
      const modelId = this.settings.modelId
      this.bench = this.bench.filter((b) => b.modelId !== modelId)
      this.bench.push({ modelId, speed, measured: true })
      this.benchBusy = false
      this.benchNote = ''
    } else if (msg.type === 'error') {
      this.benchBusy = false
      this.benchNote = this.errorText(msg.code, msg.detail)
    }
    this.render()
  }

  private async runBench() {
    const source = this.jobs.find((j) => j.file) ?? null
    if (!source?.file) {
      this.benchNote = t().benchNeedsFile
      return this.render()
    }
    this.benchBusy = true
    this.benchNote = t().benchReading
    this.render()

    try {
      const decoded = await decodeToMono16k(source.file, source.name)
      const slice = new Float32Array(middleSlice(decoded.samples, 120))
      this.send(
        {
          type: 'run',
          jobId: 'bench',
          samples: slice,
          duration: slice.length / 16000,
          language: this.settings.language,
          modelId: this.settings.modelId,
          backend: this.cap?.backend ?? 'wasm',
          source: source.name,
          bench: true,
        },
        [slice.buffer],
      )
    } catch (err) {
      this.benchBusy = false
      this.benchNote =
        err instanceof UnsupportedMediaError
          ? t().errUnsupported(err.filename)
          : err instanceof Error
            ? err.message
            : String(err)
      this.render()
    }
  }

  /** Measured rows stay measured; the rest are scaled from the nearest one. */
  private benchTable(): BenchResult[] {
    const measured = this.bench.filter((b) => b.measured)
    if (measured.length === 0) return []
    return MODELS.map((m) => {
      const hit = measured.find((b) => b.modelId === m.id)
      if (hit) return hit
      const ref = measured[0]!
      return { modelId: m.id, speed: (ref.speed * findModel(ref.modelId).cost) / m.cost, measured: false }
    })
  }

  // ----------------------------------------------------------------- render

  private render() {
    this.renderStatic()
    this.renderChips()
    this.renderMachine()
    this.renderQueue()
    this.renderDetail()
  }

  /** The chrome that lives in index.html rather than in a render function. */
  private renderStatic() {
    const d = t()
    const set = (id: string, text: string) => {
      const node = document.getElementById(id)
      if (node) node.textContent = text
    }
    set('tagline', d.tagline)
    set('machineTitle', d.machineTitle)
    set('queueTitleText', d.queueTitle)
    set('footerA', d.footerA)
    set('footerB', d.footerB)
    set('footerLink', d.footerLink)
    document.title = `TranscribeMeet — ${d.tagline}`

    mount(
      this.elAdd,
      el('button', { class: 'quiet', onclick: () => this.addInput.click() }, [d.addRecording]),
      this.addInput,
    )
  }

  private renderChips() {
    const d = t()
    const chips: HTMLElement[] = [
      el(
        'div',
        { class: 'langpick', role: 'group', 'aria-label': 'Language' },
        LANGS.map((code) =>
          el(
            'button',
            {
              class: code === lang() ? 'on' : '',
              title: langLabel(code),
              onclick: () => setLang(code),
            },
            [code.toUpperCase()],
          ),
        ),
      ),
      el('span', { class: 'chip good' }, [d.chipNoUpload]),
    ]
    if (this.cap) {
      chips.push(
        el('span', { class: this.cap.webgpu ? 'chip good' : 'chip soft' }, [
          this.cap.webgpu ? d.chipWebGPU : d.chipWasm,
        ]),
      )
    }
    mount(this.elChips, ...chips)
  }

  private renderMachine() {
    const d = t()
    if (!this.cap) return mount(this.elMachine, el('p', { class: 'muted' }, [d.checking]))
    const c = this.cap

    const nodes: (HTMLElement | null)[] = [
      el('ul', { class: 'facts' }, [
        fact(d.factBackend, c.webgpu ? 'WebGPU' : d.backendWasm),
        c.adapter ? fact(d.factGPU, c.adapter) : null,
        fact(d.factCores, String(c.threads)),
        c.memoryGB ? fact(d.factRAM, `≥ ${c.memoryGB} GB`) : null,
        c.storageQuotaGB ? fact(d.factCache, `${decimal(c.storageQuotaGB)} GB`) : null,
        fact(d.factThreads, c.crossOriginIsolated ? d.threadsOn : d.threadsOff),
      ]),
    ]

    if (!c.webgpu) nodes.push(el('p', { class: 'notice' }, [d.noWebGPU]))

    const table = this.benchTable()
    if (table.length > 0) {
      nodes.push(renderBenchTable(table, this.jobs.find((j) => j.duration > 0)?.duration ?? 3600))
    }
    if (this.benchNote) nodes.push(el('p', { class: 'muted' }, [this.benchNote]))

    nodes.push(
      el(
        'button',
        {
          class: 'quiet',
          disabled: this.benchBusy || this.activeId !== null,
          onclick: () => void this.runBench(),
        },
        [this.benchBusy ? d.measuring : d.speedTest],
      ),
    )

    mount(this.elMachine, el('div', {}, nodes))
  }

  private renderQueue() {
    const d = t()
    const stateLabel: Record<JobState, string> = {
      queued: d.stateQueued,
      decoding: d.stateDecoding,
      loading: d.stateLoading,
      running: d.stateRunning,
      done: d.stateDone,
      error: d.stateError,
      cancelled: d.stateCancelled,
    }

    const pending = this.jobs.filter((j) => j.state !== 'done').length
    this.elCount.textContent = String(pending)
    this.elCount.classList.toggle('hidden', pending === 0)

    if (this.jobs.length === 0) {
      return mount(this.elJobs, el('p', { class: 'empty' }, [d.queueEmpty]))
    }

    mount(
      this.elJobs,
      ...this.jobs.map((job) => {
        const busy = job.state === 'decoding' || job.state === 'loading' || job.state === 'running'
        return el('div', { class: `job${job.id === this.selectedId ? ' active' : ''}` }, [
          el('div', { class: 'row' }, [
            el('button', {
              class: 'name',
              title: job.name,
              onclick: () => {
                this.selectedId = job.id
                this.render()
              },
            }, [job.name]),
            el('span', { class: 'state' }, [stateLabel[job.state]]),
          ]),
          job.message ? el('div', { class: 'msg' }, [this.say(job.message)]) : null,
          busy || job.state === 'done'
            ? el('div', { class: `track${job.state === 'done' ? ' done' : ''}` }, [
                el('i', { style: `width:${Math.round(job.progress * 100)}%` }),
              ])
            : null,
          el('div', { class: 'actions' }, [
            busy
              ? el('button', { class: 'quiet', onclick: () => this.cancel(job) }, [d.cancel])
              : el('button', { class: 'quiet', onclick: () => this.remove(job) }, [d.remove]),
          ]),
        ])
      }),
    )
  }

  private renderDetail() {
    const job = this.selected
    if (!job) return mount(this.elDetail, this.renderWelcome())

    if (job.state === 'done' && job.transcript) {
      return mount(
        this.elDetail,
        renderReader({
          transcript: job.transcript,
          mediaUrl: job.mediaUrl ?? undefined,
          mediaIsVideo: job.isVideo,
          stem: job.stem,
          elapsedSeconds: job.elapsed || undefined,
        }),
      )
    }

    if (job.state === 'queued') return mount(this.elDetail, this.renderForm(job))

    if (job.state === 'error' || job.state === 'cancelled') {
      const d = t()
      return mount(
        this.elDetail,
        el('div', { class: 'running' }, [
          el('h2', {}, [job.state === 'error' ? d.failed : d.cancelledTitle]),
          el('p', { class: job.state === 'error' ? 'notice err' : 'muted' }, [this.say(job.message)]),
          el('button', {
            class: 'quiet',
            onclick: () => {
              job.state = 'queued'
              job.confirmed = true
              job.message = ''
              job.progress = 0
              this.render()
              void this.pump()
            },
          }, [d.retry]),
        ]),
      )
    }

    return mount(this.elDetail, this.renderRunning(job))
  }

  private renderRunning(job: Job): HTMLElement {
    const d = t()
    const speed = job.elapsed > 0 ? (job.progress * job.duration) / job.elapsed : 0
    const left = speed > 0 ? ((1 - job.progress) * job.duration) / speed : 0

    return el('div', { class: 'running' }, [
      el('h2', {}, [job.name]),
      el('p', { class: 'muted' }, [this.say(job.message)]),
      el('div', { class: 'track' }, [el('i', { style: `width:${Math.round(job.progress * 100)}%` })]),
      el('div', { class: 'stat' }, [
        el('span', {}, [`${d.progress}: `, el('b', {}, [`${Math.round(job.progress * 100)}%`])]),
        job.duration ? el('span', {}, [`${d.duration}: `, el('b', {}, [clock(job.duration)])]) : null,
        speed > 0 ? el('span', {}, [`${d.speed}: `, el('b', {}, [`${decimal(speed)}x`])]) : null,
        left > 1 ? el('span', {}, [`${d.remaining}: `, el('b', {}, [formatDuration(left)])]) : null,
      ]),
      el('button', { class: 'quiet', onclick: () => this.cancel(job) }, [d.cancel]),
      job.partial.length > 0
        ? el('div', { class: 'live' }, [
            el('p', { class: 'muted' }, [d.partialTitle]),
            el('p', {}, [job.partial.slice(-160).map((w) => w.text).join('').trim()]),
          ])
        : null,
    ])
  }

  private renderForm(job: Job): HTMLElement {
    const d = t()
    const spec = findModel(job.modelId)
    const backend = this.cap?.backend ?? 'wasm'
    const waiting = this.jobs.filter((j) => j.state === 'queued').length

    const modelSelect = el(
      'select',
      {
        onchange: (e: Event) => {
          job.modelId = (e.target as HTMLSelectElement).value
          this.settings.modelId = job.modelId
          this.render()
        },
      },
      MODELS.map((m) =>
        el('option', { value: m.id, selected: m.id === job.modelId }, [
          `${m.label} — ${formatBytes(m.bytes[backend])}`,
        ]),
      ),
    )

    const langSelect = el(
      'select',
      {
        onchange: (e: Event) => {
          job.language = (e.target as HTMLSelectElement).value
          this.settings.language = job.language
        },
      },
      LANGUAGES.map((l) =>
        el('option', { value: l.code, selected: l.code === job.language }, [d.langNames[l.code] ?? l.code]),
      ),
    )

    return el('div', { class: 'running' }, [
      el('h2', {}, [job.name]),
      el('p', { class: 'muted' }, [d.modelNotes[spec.id] ?? '']),
      el('div', { class: 'form' }, [
        el('div', { class: 'grid' }, [
          el('label', {}, [d.fieldModel, modelSelect]),
          el('label', {}, [d.fieldLanguage, langSelect, el('span', { class: 'hint' }, [d.languageHint])]),
        ]),
        el('p', { class: 'dl-note' }, [
          d.downloadNoteA,
          el('b', {}, [formatBytes(spec.bytes[backend])]),
          d.downloadNoteB,
        ]),
        el('div', { class: 'row-buttons' }, [
          el('button', {
            onclick: () => {
              job.confirmed = true
              this.render()
              void this.pump()
            },
          }, [d.start]),
          waiting > 1
            ? el('button', {
                class: 'ghost',
                onclick: () => {
                  for (const j of this.jobs) {
                    if (j.state !== 'queued') continue
                    j.confirmed = true
                    j.modelId = job.modelId
                    j.language = job.language
                  }
                  this.render()
                  void this.pump()
                },
              }, [d.startAll(waiting)])
            : null,
        ]),
      ]),
    ])
  }

  private renderWelcome(): HTMLElement {
    const d = t()
    return el('div', {}, [
      el('div', { class: 'drop', id: 'drop' }, [
        el('p', { class: 'big' }, ['🎙️']),
        el('h2', {}, [d.dropTitle]),
        el('p', { class: 'sub' }, [d.dropSub]),
        el('button', { onclick: () => this.addInput.click() }, [d.pickFile]),
        el('p', { class: 'or' }, [d.dropJsonHint]),
      ]),
      el('div', { class: 'pitch' }, [
        el('div', {}, [el('strong', {}, [d.pitch1Title]), el('p', {}, [d.pitch1Body])]),
        el('div', {}, [el('strong', {}, [d.pitch2Title]), el('p', {}, [d.pitch2Body])]),
        el('div', {}, [el('strong', {}, [d.pitch3Title]), el('p', {}, [d.pitch3Body])]),
      ]),
    ])
  }

  /**
   * One file input for the whole app. The drop zone only exists on the
   * welcome screen, so once a transcript is open the sidebar button is the
   * remaining way in.
   */
  private addInput = el('input', {
    type: 'file',
    multiple: true,
    accept: `${ACCEPT_ATTRIBUTE},.json`,
    class: 'hidden',
    onchange: (e: Event) => {
      const target = e.target as HTMLInputElement
      if (target.files) this.add(target.files)
      target.value = ''
    },
  })

  private installAddButton() {
    document.body.append(this.addInput)
  }

  private installDragAndDrop() {
    const stop = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
    }
    document.addEventListener('dragover', (e) => {
      stop(e)
      document.getElementById('drop')?.classList.add('over')
    })
    document.addEventListener('dragleave', (e) => {
      stop(e)
      document.getElementById('drop')?.classList.remove('over')
    })
    document.addEventListener('drop', (e) => {
      stop(e)
      document.getElementById('drop')?.classList.remove('over')
      if (e.dataTransfer?.files?.length) this.add(e.dataTransfer.files)
    })
  }
}

function fact(k: string, v: string): HTMLElement {
  return el('li', {}, [el('span', { class: 'k' }, [k]), el('span', { class: 'v' }, [v])])
}

function renderBenchTable(rows: BenchResult[], recordingSeconds: number): HTMLElement {
  const d = t()
  const best = [...rows].sort((a, b) => b.speed - a.speed)
  const pick = rows.find((r) => r.speed >= 1) ?? best[0]!

  return el('div', { class: 'bench' }, [
    el('table', {}, [
      el('thead', {}, [
        el('tr', {}, [
          el('th', {}, [d.benchColModel]),
          el('th', {}, [d.benchColSpeed]),
          el('th', {}, [d.benchColThis]),
        ]),
      ]),
      el(
        'tbody',
        {},
        rows.map((r) =>
          el('tr', { class: r.modelId === pick.modelId ? 'pick' : '' }, [
            el('td', {}, [findModel(r.modelId).label, r.measured ? '' : ' *']),
            el('td', { class: 'num' }, [`${decimal(r.speed)}x`]),
            el('td', { class: 'num' }, [formatDuration(recordingSeconds / Math.max(r.speed, 0.01))]),
          ]),
        ),
      ),
    ]),
    rows.some((r) => !r.measured) ? el('p', { class: 'muted' }, [d.benchEstimateNote]) : null,
  ])
}
