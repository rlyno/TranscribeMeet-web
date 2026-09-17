/**
 * The transcript reader: paragraphs beside the recording, timestamps that
 * seek, the spoken segment highlighted as the media plays, and search that
 * both highlights and filters. Same behaviour as the desktop app's reader.
 */

import { clock, MIME, RENDERERS, type Format } from '../core/formats'
import type { Transcript } from '../core/models'
import { transcriptText, wordCount } from '../core/models'
import { t } from '../i18n'
import { download, el, escapeHTML } from './dom'
import { decimal } from './humanize'

const FORMATS: Format[] = ['md', 'srt', 'vtt', 'txt', 'json']

export interface ReaderOptions {
  transcript: Transcript
  /** Object URL of the original recording, when we still have it. */
  mediaUrl?: string
  mediaIsVideo?: boolean
  stem: string
  elapsedSeconds?: number
}

export function renderReader(opts: ReaderOptions): HTMLElement {
  const { transcript } = opts
  const d = t()
  const wrap = el('div')

  let media: HTMLMediaElement | null = null
  if (opts.mediaUrl) {
    media = opts.mediaIsVideo
      ? el('video', { src: opts.mediaUrl, controls: true, preload: 'metadata' })
      : el('audio', { src: opts.mediaUrl, controls: true, preload: 'metadata' })
    wrap.append(el('div', { class: 'player-wrap' }, [media]))
  }

  const search = el('input', { type: 'search', placeholder: d.search, autocomplete: 'off' })
  const count = el('span', { class: 'count' })
  const follow = el('input', { type: 'checkbox', checked: true })

  const exports = el(
    'div',
    { class: 'exports' },
    FORMATS.map((fmt) =>
      el('button', {
        class: 'quiet',
        onclick: () => download(`${opts.stem}.${fmt}`, RENDERERS[fmt](transcript), MIME[fmt]),
      }, [`.${fmt}`]),
    ),
  )

  wrap.append(
    el('div', { class: 'toolbar' }, [
      search,
      count,
      media ? el('label', { class: 'follow' }, [follow, d.followPlayback]) : null,
      el('div', { class: 'spacer' }),
      exports,
    ]),
  )

  const speakerNote =
    transcript.diarized && transcript.speakers.length > 0
      ? el('span', {}, [`${d.speakers}: `, el('b', {}, [String(transcript.speakers.length)])])
      : null

  wrap.append(
    el('div', { class: 'summary' }, [
      el('span', {}, [`${d.duration}: `, el('b', {}, [clock(transcript.duration)])]),
      el('span', {}, [`${d.words}: `, el('b', {}, [String(wordCount(transcript))])]),
      el('span', {}, [`${d.model}: `, el('b', {}, [transcript.model])]),
      el('span', {}, [`${d.language}: `, el('b', {}, [transcript.language])]),
      opts.elapsedSeconds
        ? el('span', {}, [
            `${d.finishedInLabel}: `,
            el('b', {}, [clock(opts.elapsedSeconds)]),
            ` (${decimal(transcript.duration / Math.max(opts.elapsedSeconds, 0.001))}x ${d.realtimeSuffix})`,
          ])
        : null,
      speakerNote,
    ]),
  )

  const list = el('div', { class: 'transcript' })
  wrap.append(list)

  // One row per segment, built once; search and playback only toggle classes
  // and re-fill the paragraph HTML, never rebuild the list.
  const rows = transcript.segments.map((seg, i) => {
    const para = el('p')
    para.textContent = seg.text
    const showWho = transcript.diarized && seg.speaker && seg.speaker !== transcript.segments[i - 1]?.speaker
    const row = el('div', { class: 'seg' }, [
      el('button', {
        class: 'ts',
        title: d.jumpTo,
        onclick: () => {
          if (!media) return
          media.currentTime = seg.start
          void media.play()
        },
      }, [clock(seg.start)]),
      showWho ? el('span', { class: 'who' }, [seg.speaker || 'SPEAKER']) : null,
      para,
    ])
    return { row, para, seg }
  })
  list.append(...rows.map((r) => r.row))

  const applySearch = () => {
    const q = search.value.trim()
    if (!q) {
      for (const { row, para, seg } of rows) {
        row.classList.remove('hidden')
        para.textContent = seg.text
      }
      count.textContent = ''
      return
    }
    const needle = q.toLowerCase()
    const re = new RegExp(escapeRegExp(q), 'gi')
    let hits = 0
    for (const { row, para, seg } of rows) {
      if (seg.text.toLowerCase().includes(needle)) {
        hits++
        para.innerHTML = escapeHTML(seg.text).replace(re, (m) => `<mark>${m}</mark>`)
        row.classList.remove('hidden')
      } else {
        para.textContent = seg.text
        row.classList.add('hidden')
      }
    }
    count.textContent = hits === 0 ? d.searchNone : d.searchHits(hits)
  }
  search.addEventListener('input', applySearch)

  if (media) {
    let currentIndex = -1
    media.addEventListener('timeupdate', () => {
      const now = media!.currentTime
      const found = rows.findIndex(({ seg }) => now >= seg.start && now < seg.end)
      if (found === currentIndex) return
      if (currentIndex >= 0) rows[currentIndex]?.row.classList.remove('current')
      currentIndex = found
      if (found < 0) return
      const row = rows[found]!.row
      row.classList.add('current')
      if (follow.checked) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    })
  }

  // A transcript with no timeline at all is still worth showing as plain text.
  if (rows.length === 0) {
    list.append(el('p', { class: 'empty' }, [transcriptText(transcript) || d.noSpeech]))
  }

  return wrap
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
