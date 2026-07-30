import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import os from 'node:os'
import { join } from 'node:path'
import { writeAtomic } from '../src/shared/atomic.ts'

async function scratch(): Promise<string> {
  return fs.mkdtemp(join(os.tmpdir(), 'trapram-atomic-'))
}

test('concurrent saves never leave a half-written file behind', async () => {
  const dir = await scratch()
  const path = join(dir, 'accounts.enc')

  const payloads = Array.from({ length: 24 }, (_, i) => Buffer.alloc(256 * 1024, 65 + (i % 26)))
  await Promise.all(payloads.map((p) => writeAtomic(path, p)))

  const onDisk = await fs.readFile(path)
  assert.ok(
    payloads.some((p) => p.equals(onDisk)),
    'the file on disk is not any one of the payloads — bytes were interleaved'
  )

  const leftovers = (await fs.readdir(dir)).filter((n) => n.endsWith('.tmp'))
  assert.deepEqual(leftovers, [])
  await fs.rm(dir, { recursive: true, force: true })
})

test('the last save queued is the one that survives', async () => {
  const dir = await scratch()
  const path = join(dir, 'accounts.enc')

  await Promise.all([writeAtomic(path, 'first'), writeAtomic(path, 'second'), writeAtomic(path, 'third')])

  assert.equal(await fs.readFile(path, 'utf8'), 'third')
  await fs.rm(dir, { recursive: true, force: true })
})

test('a failed write leaves the previous file intact and no temp files', async () => {
  const dir = await scratch()
  const path = join(dir, 'accounts.enc')
  await writeAtomic(path, 'good data')

  await assert.rejects(writeAtomic(join(dir, 'gone', 'accounts.enc'), 'never lands'))

  assert.equal(await fs.readFile(path, 'utf8'), 'good data')
  assert.deepEqual((await fs.readdir(dir)).filter((n) => n.endsWith('.tmp')), [])
  await fs.rm(dir, { recursive: true, force: true })
})

test('a save is durable before the rename is reported done', async () => {
  const dir = await scratch()
  const path = join(dir, 'accounts.enc')
  const body = Buffer.alloc(1024 * 1024, 7)

  await writeAtomic(path, body)

  const stat = await fs.stat(path)
  assert.equal(stat.size, body.length)
  assert.ok(body.equals(await fs.readFile(path)))
  await fs.rm(dir, { recursive: true, force: true })
})
