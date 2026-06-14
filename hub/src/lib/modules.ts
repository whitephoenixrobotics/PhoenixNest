// The ecosystem module catalog the Hub shows. "installed" is tracked locally
// (Electron later persists it); until a real downloader lands, installing is a
// front-end state change so the flow (pick → install → open) is demonstrable.

export interface ModuleDef {
  id: string
  name: string
  icon: string
  description: string
  /** Approximate download size shown in the add dialog. */
  size: string
  /** Modules that ship as downloadable bundles vs. reserved placeholders. */
  available: boolean
}

// Catalog of everything that *can* be added. None are installed at first run.
export const CATALOG: ModuleDef[] = [
  {
    id: 'ai-flow',
    name: 'AI Flow',
    icon: '🤖',
    description: 'Visual AI task automation — node editor, execution engine, AI/ML blocks',
    size: '~1.2 GB',
    available: true,
  },
  {
    id: 'circuit',
    name: 'Circuit',
    icon: '🔌',
    description: 'IoT / hardware integration — Arduino, sensors, device control',
    size: '—',
    available: false,
  },
  {
    id: 'python',
    name: 'Python Tools',
    icon: '🐍',
    description: 'Shared Python utilities and automation scripts',
    size: '—',
    available: false,
  },
]

export function getModule(id: string): ModuleDef | undefined {
  return CATALOG.find((m) => m.id === id)
}
