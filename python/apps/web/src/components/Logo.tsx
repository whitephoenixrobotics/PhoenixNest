interface LogoProps {
  size?: number;
  className?: string;
}

// Placeholder mark for the Python module — a rounded tile with the 🐍 glyph.
// Swap for a real /public/logo.png later (see flow's Logo for the pattern).
export function Logo({ size = 36, className }: LogoProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500/20 to-emerald-600/10 ring-1 ring-teal-400/30 ${className ?? ""}`}
      style={{ width: size, height: size, fontSize: size * 0.55 }}
      aria-label="Phoenix Nest Python"
    >
      🐍
    </span>
  );
}
