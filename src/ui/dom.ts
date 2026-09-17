/** The three DOM helpers this app actually needs. No framework. */

type Attrs = Record<string, string | number | boolean | EventListener | undefined>

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: (Node | string | null | undefined)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue
    if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value as EventListener)
    } else if (key === 'class') {
      node.className = String(value)
    } else if (key === 'html') {
      node.innerHTML = String(value)
    } else if (value === true) {
      node.setAttribute(key, '')
    } else {
      node.setAttribute(key, String(value))
    }
  }
  for (const child of children) {
    if (child === null || child === undefined) continue
    node.append(typeof child === 'string' ? document.createTextNode(child) : child)
  }
  return node
}

export function mount(target: HTMLElement, ...nodes: (Node | null)[]): void {
  target.replaceChildren(...nodes.filter((n): n is Node => n !== null))
}

export function need<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id)
  if (!node) throw new Error(`Elemen #${id} tidak ada di halaman.`)
  return node as T
}

/** Escape for the one place we build HTML by hand: search highlighting. */
export function escapeHTML(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

export function download(name: string, text: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }))
  const a = el('a', { href: url, download: name })
  document.body.append(a)
  a.click()
  a.remove()
  // Give the browser a beat to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
