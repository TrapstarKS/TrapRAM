export function reorderIds(ids: number[], from: number, target: number): number[] | null {
  const at = ids.indexOf(from)
  const to = ids.indexOf(target)
  if (at < 0 || to < 0 || at === to) return null
  const next = ids.filter((id) => id !== from)
  next.splice(next.indexOf(target) + (to > at ? 1 : 0), 0, from)
  return next
}
