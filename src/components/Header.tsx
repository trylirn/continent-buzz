import { Link, useRouterState } from "@tanstack/react-router";
import { Radio } from "lucide-react";

const NAV = [
  { to: "/", label: "Home" },
  { to: "/nigeria", label: "Latest in Nigeria" },
  { to: "/africa", label: "Africa Pulse" },
  { to: "/america", label: "America Stories" },
] as const;

export function Header() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link to="/" className="flex items-center gap-2 font-black tracking-tight text-lg">
          <Radio className="h-5 w-5 text-red-600" />
          <span>THE WIRE</span>
          <span className="hidden sm:inline text-xs font-medium text-muted-foreground uppercase tracking-widest">Africa · Nigeria · US</span>
        </Link>
        <nav className="flex items-center gap-1 overflow-x-auto">
          {NAV.map((n) => {
            const active = pathname === n.to;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
                  active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
