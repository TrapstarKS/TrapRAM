import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('browser', {
  send(userId: number, action: string, arg?: string) {
    ipcRenderer.send('browser:cmd', { userId, action, arg })
  },
  onState(fn: (s: unknown) => void) {
    const listener = (_e: Electron.IpcRendererEvent, s: unknown): void => fn(s)
    ipcRenderer.on('browser:state', listener)
    return () => ipcRenderer.removeListener('browser:state', listener)
  }
})
