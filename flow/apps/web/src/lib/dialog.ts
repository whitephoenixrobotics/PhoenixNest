// Promise-based replacements for window.prompt/confirm that work in Electron
// (the renderer does not support window.prompt). A mounted <DialogHost/>
// registers a handler; calls made before it mounts fall back to the native API.

export type DialogRequest =
  | {
      kind: 'prompt'
      message: string
      defaultValue: string
      resolve: (value: string | null) => void
    }
  | {
      kind: 'confirm'
      message: string
      resolve: (value: boolean) => void
    }
  | {
      kind: 'alert'
      message: string
      resolve: () => void
    }

let handler: ((req: DialogRequest) => void) | null = null

export function registerDialogHandler(fn: ((req: DialogRequest) => void) | null) {
  handler = fn
}

export function uiPrompt(message: string, defaultValue = ''): Promise<string | null> {
  return new Promise((resolve) => {
    if (handler) {
      handler({ kind: 'prompt', message, defaultValue, resolve })
    } else if (typeof window !== 'undefined' && typeof window.prompt === 'function') {
      try {
        resolve(window.prompt(message, defaultValue))
      } catch {
        resolve(null)
      }
    } else {
      resolve(null)
    }
  })
}

export function uiAlert(message: string): Promise<void> {
  return new Promise((resolve) => {
    if (handler) {
      handler({ kind: 'alert', message, resolve })
    } else {
      if (typeof window !== 'undefined' && typeof window.alert === 'function') {
        try {
          window.alert(message)
        } catch {
          /* Electron without alert support — nothing else we can do */
        }
      }
      resolve()
    }
  })
}

export function uiConfirm(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (handler) {
      handler({ kind: 'confirm', message, resolve })
    } else if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      resolve(window.confirm(message))
    } else {
      resolve(false)
    }
  })
}
