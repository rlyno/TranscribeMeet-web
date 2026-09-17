/**
 * Two languages, one dictionary shape.
 *
 * `Dict` is derived from the Indonesian file, so adding a string there and
 * forgetting it in English is a type error rather than a blank spot in the UI.
 */

import { en } from './en'
import { id, type Dict } from './id'

export type { Dict }
export type LangCode = 'id' | 'en'

const DICTS: Record<LangCode, Dict> = { id, en }
const STORAGE_KEY = 'transcribemeet.lang'

function initial(): LangCode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'id' || saved === 'en') return saved
  } catch {
    // Private windows and blocked site data both land here; the browser's own
    // language is a perfectly good answer.
  }
  const preferred = navigator.languages ?? [navigator.language]
  for (const tag of preferred) {
    const base = tag.toLowerCase().split('-')[0]
    if (base === 'id' || base === 'ms') return 'id'
    if (base === 'en') return 'en'
  }
  return 'id'
}

let current: LangCode = initial()
const listeners = new Set<() => void>()

/** The active dictionary. Call it fresh on every render — never cache it. */
export function t(): Dict {
  return DICTS[current]
}

export function lang(): LangCode {
  return current
}

export function setLang(next: LangCode): void {
  if (next === current) return
  current = next
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // A preference we cannot persist is still a preference for this session.
  }
  document.documentElement.lang = DICTS[next].htmlLang
  for (const fn of listeners) fn()
}

export function onLangChange(fn: () => void): void {
  listeners.add(fn)
}

export const LANGS: LangCode[] = ['id', 'en']

export function langLabel(code: LangCode): string {
  return DICTS[code].name
}
