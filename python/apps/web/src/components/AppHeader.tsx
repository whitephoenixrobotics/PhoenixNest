import Link from "next/link";
import { Home } from "lucide-react";
import { Logo } from "@/components/Logo";

const VERSION = "0.1.0";

export function AppHeader({
  subtitle = "Local Python IDE",
  back,
}: {
  subtitle?: string;
  back?: boolean;
}) {
  return (
    <header className="flex items-center justify-between px-4 py-2 border-b border-zinc-800">
      <div className="flex items-center gap-2.5">
        {back ? (
          <Link
            href="/"
            title="กลับหน้าโปรเจค"
            className="flex items-center justify-center w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-teal-300 hover:border-teal-500/50 hover:bg-zinc-800 transition-colors"
          >
            <Home size={15} />
          </Link>
        ) : (
          <Logo size={28} />
        )}
        <div className="leading-tight">
          <h1 className="text-sm font-semibold leading-tight">PhoenixPy</h1>
          <p className="text-[11px] text-zinc-500 leading-tight">{subtitle}</p>
        </div>
      </div>
      <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-teal-300">
        v{VERSION}
      </span>
    </header>
  );
}
