export interface ModuleEntry {
  id: string
  name: string
  path: string
  icon?: string
  description?: string
  stack?: string[]
  status: 'active' | 'scaffold' | 'reserved' | 'disabled'
  launch?: { command: string; cwd: string; shell?: boolean } | null
  url?: string | null
  dependsOn?: string[]
}

export interface GetModulesResult {
  ok: boolean
  error?: string
  ecosystem?: string
  modules: ModuleEntry[]
}

export interface OpenResult {
  ok: boolean
  error?: string
  pid?: number
  url?: string | null
}

declare global {
  interface Window {
    phoenixHub: {
      getVersion: () => Promise<string>
      getModules: () => Promise<GetModulesResult>
      openModule: (id: string) => Promise<OpenResult>
      openUrl: (url: string) => Promise<{ ok: boolean }>
    }
  }
}
