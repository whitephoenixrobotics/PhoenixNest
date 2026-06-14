// Inline phoenix mark — no image asset needed. Scales with `size`.
export function Logo({ size = 48 }: { size?: number }) {
  return (
    <span
      style={{ width: size, height: size, fontSize: size * 0.7 }}
      className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-orange-500 shadow-lg shadow-violet-900/40 select-none"
      aria-label="PhoenixNest"
    >
      🦅
    </span>
  )
}
