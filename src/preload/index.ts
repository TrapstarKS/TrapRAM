import { contextBridge, ipcRenderer } from 'electron'

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const res = (await ipcRenderer.invoke(channel, ...args)) as Result<T>
  if (!res.ok) throw new Error(res.error)
  return res.value
}

const on = (channel: string, fn: (payload: never) => void): (() => void) => {
  const listener = (_e: Electron.IpcRendererEvent, payload: unknown): void => fn(payload as never)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

contextBridge.exposeInMainWorld('api', { call, on })
