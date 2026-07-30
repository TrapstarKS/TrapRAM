import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('browser', {
  send(userId: number, action: string, arg?: string) {
    ipcRenderer.send('browser:cmd', { userId, action, arg })
  },
  onState(fn: (s: unknown) => void) {
    ipcRenderer.on('browser:state', (_e, s) => fn(s))
  }
})
