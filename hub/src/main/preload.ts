import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('phoenixHub', {
  getVersion: () => ipcRenderer.invoke('get-version'),
  getModules: () => ipcRenderer.invoke('get-modules'),
  openModule: (id: string) => ipcRenderer.invoke('open-module', id),
  openUrl: (url: string) => ipcRenderer.invoke('open-url', url),
})
