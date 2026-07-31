export function reorderIds(ids: number[], from: number, target: number): number[] | null {
  const at = ids.indexOf(from)
  const to = ids.indexOf(target)
  if (at < 0 || to < 0 || at === to) return null
  const next = ids.filter((id) => id !== from)
  next.splice(next.indexOf(target) + (to > at ? 1 : 0), 0, from)
  return next
}

export function utcMillis(iso: string): number {
  return Date.parse(/[Zz]$|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`)
}

export function quickCode(raw: string): string | null {
  const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return code.length === 6 ? code : null
}

export const editTargets = (userId: number, selected: number[]): number[] =>
  selected.length > 1 && selected.includes(userId) ? selected : [userId]

export type BulkLine = { kind: 'cookie'; value: string } | { kind: 'credential'; username: string; password: string }

export function parseBulkLines(raw: string): BulkLine[] {
  const lines: BulkLine[] = []
  for (const line of raw.split('\n').map((l) => l.trim()).filter(Boolean)) {
    const i = line.indexOf(':')
    if (line.length <= 100 && i > 0) {
      const username = line.slice(0, i).trim()
      const password = line.slice(i + 1).trim()
      if (username && password) {
        lines.push({ kind: 'credential', username, password })
        continue
      }
    }
    lines.push({ kind: 'cookie', value: line })
  }
  return lines
}
