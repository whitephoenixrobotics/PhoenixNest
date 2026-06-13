// Lightweight registry so other blocks (Classifier / Face Recognition) can
// grab a snapshot from any active webcam node — used by their "เก็บตัวอย่าง
// จากกล้อง" buttons. Webcam nodes register a getFrame() function (returning a
// JPEG data URL) while the browser preview stream is open.

type FrameGetter = () => string | null

const registry = new Map<string, FrameGetter>()

export const webcamRegistry = {
  register: (nodeId: string, getFrame: FrameGetter) => {
    registry.set(nodeId, getFrame)
  },
  unregister: (nodeId: string) => {
    registry.delete(nodeId)
  },
  getFrame: (nodeId: string): string | null => {
    return registry.get(nodeId)?.() ?? null
  },
  activeIds: (): string[] => Array.from(registry.keys()),
}
