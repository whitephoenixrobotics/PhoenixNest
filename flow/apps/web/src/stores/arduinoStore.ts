import { create } from 'zustand'
import { apiClient, apiErrorMessage } from '@/lib/api-client'

// Mirror of backend manager state — populated by /arduino/status, kept current
// when the user clicks Connect / Disconnect / Flash through this store.

export interface PortInfo {
  device: string
  description: string
  vid: number | null
  pid: number | null
  likely_arduino: boolean
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'flashing'

interface ArduinoState {
  state: ConnectionState
  port: string | null
  firmwareName: string | null
  firmwareVersion: [number, number] | null
  ports: PortInfo[]
  bundleOk: boolean
  bundleMsg: string
  lastError: string | null
  lastFlashLog: string | null

  refreshPorts: () => Promise<void>
  refreshStatus: () => Promise<void>
  connect: (port: string) => Promise<boolean>
  disconnect: () => Promise<void>
  flash: (port: string) => Promise<boolean>
}

export const useArduinoStore = create<ArduinoState>((set, get) => ({
  state: 'disconnected',
  port: null,
  firmwareName: null,
  firmwareVersion: null,
  ports: [],
  bundleOk: false,
  bundleMsg: '',
  lastError: null,
  lastFlashLog: null,

  refreshPorts: async () => {
    try {
      const { data } = await apiClient.get<{ ports: PortInfo[] }>('/arduino/ports')
      set({ ports: data.ports })
    } catch (e) {
      set({ lastError: apiErrorMessage(e) })
    }
  },

  refreshStatus: async () => {
    try {
      const { data } = await apiClient.get<{
        connected: boolean; port: string | null
        firmware_name: string | null; firmware_version: [number, number] | null
        firmware_bundle_ok: boolean; firmware_bundle_msg: string
      }>('/arduino/status')
      set({
        state: data.connected ? 'connected' : 'disconnected',
        port: data.port,
        firmwareName: data.firmware_name,
        firmwareVersion: data.firmware_version,
        bundleOk: data.firmware_bundle_ok,
        bundleMsg: data.firmware_bundle_msg,
      })
    } catch (e) {
      set({ lastError: apiErrorMessage(e) })
    }
  },

  connect: async (port: string) => {
    set({ state: 'connecting', lastError: null })
    try {
      const { data } = await apiClient.post<{
        ok: boolean; port: string
        firmware_name: string | null; firmware_version: [number, number] | null
      }>('/arduino/connect', { port })
      set({
        state: 'connected',
        port: data.port,
        firmwareName: data.firmware_name,
        firmwareVersion: data.firmware_version,
      })
      return true
    } catch (e) {
      set({ state: 'disconnected', lastError: apiErrorMessage(e) })
      return false
    }
  },

  disconnect: async () => {
    try {
      await apiClient.post('/arduino/disconnect')
    } catch (e) {
      set({ lastError: apiErrorMessage(e) })
    }
    set({ state: 'disconnected', port: null, firmwareName: null, firmwareVersion: null })
  },

  flash: async (port: string) => {
    set({ state: 'flashing', lastError: null, lastFlashLog: null })
    try {
      // avrdude takes ~5-10s; if already connected on that port the backend drops it first.
      const { data } = await apiClient.post<{ ok: boolean; duration_s: number; log: string }>(
        '/arduino/flash',
        { port },
        { timeout: 90_000 },
      )
      set({ state: 'disconnected', lastFlashLog: data.log })
      if (!data.ok) {
        set({ lastError: 'อัพโหลด firmware ไม่สำเร็จ — ดู log' })
        return false
      }
      // Give the board ~2s to reboot, then auto-connect.
      await new Promise((r) => setTimeout(r, 2000))
      return get().connect(port)
    } catch (e) {
      set({ state: 'disconnected', lastError: apiErrorMessage(e) })
      return false
    }
  },
}))
