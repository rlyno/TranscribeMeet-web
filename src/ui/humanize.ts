/** Human-readable durations, in whichever language the UI is showing. */

import { t } from '../i18n'

export function formatDuration(seconds: number): string {
  const d = t()
  if (!isFinite(seconds) || seconds <= 0) return `0 ${d.unitSecond}`
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.round(seconds % 60)
  if (h > 0) return `${h} ${d.unitHour} ${m} ${d.unitMinute}`
  if (m > 0) return `${m} ${d.unitMinute} ${s} ${d.unitSecond}`
  return `${s} ${d.unitSecond}`
}

/** Indonesian writes 1,5 where English writes 1.5. */
export function decimal(n: number, places = 1): string {
  const text = n.toFixed(places)
  return t().code === 'id' ? text.replace('.', ',') : text
}
