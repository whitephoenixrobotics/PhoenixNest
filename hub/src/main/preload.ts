import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('phoenixHub', {
  getVersion: () => ipcRenderer.invoke('get-version'),
})
