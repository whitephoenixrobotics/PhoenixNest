import { create } from 'zustand'
import { apiClient, apiErrorMessage } from '@/lib/api-client'

// LINE Messaging connector — the token lives only on the backend disk
// (storage/extensions/line.json). The frontend never holds it; we just track
// "configured" + bot identity + the default target id for display.

export type LineState = 'idle' | 'configuring' | 'configured' | 'testing'

interface Store {
  state: LineState
  configured: boolean
  defaultTo: string
  botName: string
  botUserId: string
  lastError: string | null
  lastTestOk: boolean | null

  refreshStatus: () => Promise<void>
  configure: (token: string, defaultTo: string) => Promise<boolean>
  disconnect: () => Promise<void>
  test: (to: string, text: string) => Promise<boolean>
}

export const useLineStore = create<Store>((set, get) => ({
  state: 'idle',
  configured: false,
  defaultTo: '',
  botName: '',
  botUserId: '',
  lastError: null,
  lastTestOk: null,

  refreshStatus: async () => {
    try {
      const { data } = await apiClient.get<{
        configured: boolean
        has_token: boolean
        default_to: string
        bot_name: string
        bot_user_id: string
      }>('/line/status')
      set({
        configured: data.configured,
        defaultTo: data.default_to,
        botName: data.bot_name,
        botUserId: data.bot_user_id,
        state: data.configured ? 'configured' : 'idle',
      })
    } catch (e) {
      set({ lastError: apiErrorMessage(e) })
    }
  },

  configure: async (token: string, defaultTo: string) => {
    set({ state: 'configuring', lastError: null })
    try {
      await apiClient.post('/line/configure', { token, default_to: defaultTo })
      await get().refreshStatus()
      return true
    } catch (e) {
      set({ state: 'idle', lastError: apiErrorMessage(e) })
      return false
    }
  },

  disconnect: async () => {
    try {
      await apiClient.post('/line/disconnect')
    } catch (e) {
      set({ lastError: apiErrorMessage(e) })
    }
    set({
      state: 'idle',
      configured: false,
      defaultTo: '',
      botName: '',
      botUserId: '',
      lastTestOk: null,
    })
  },

  test: async (to: string, text: string) => {
    set({ state: 'testing', lastError: null, lastTestOk: null })
    try {
      await apiClient.post('/line/test', { to, text })
      set({ state: 'configured', lastTestOk: true })
      return true
    } catch (e) {
      set({ state: 'configured', lastTestOk: false, lastError: apiErrorMessage(e) })
      return false
    }
  },
}))
