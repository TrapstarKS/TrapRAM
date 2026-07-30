import { randomBytes } from 'node:crypto'
import { dirname } from 'node:path'
import fs from 'node:fs/promises'
import { gate } from './pure.ts'

const writes = gate()

export function writeAtomic(path: string, data: Buffer | string): Promise<void> {
  return writes(async () => {
    const tmp = `${path}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`
    const handle = await fs.open(tmp, 'w', 0o600)
    try {
      await handle.writeFile(data)
      await handle.sync()
    } finally {
      await handle.close()
    }
    try {
      await fs.rename(tmp, path)
    } catch (e) {
      await fs.rm(tmp, { force: true })
      throw e
    }
    const dir = await fs.open(dirname(path), 'r').catch(() => null)
    if (dir) {
      await dir.sync().catch(() => undefined)
      await dir.close()
    }
  })
}
