const TRACE = 'https://www.cloudflare.com/cdn-cgi/trace'
const TTL_MS = 30_000
const TIMEOUT_MS = 6000

let cached: { at: number; code: string } | null = null

export async function current(): Promise<string> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.code
  try {
    const res = await fetch(TRACE, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    const code = /^loc=([A-Z]{2})$/m.exec(await res.text())?.[1] ?? ''
    cached = { at: Date.now(), code }
    return code
  } catch {
    return ''
  }
}
