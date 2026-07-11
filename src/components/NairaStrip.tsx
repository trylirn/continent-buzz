import { useQuery } from "@tanstack/react-query";
import { getRates } from "@/lib/news.functions";

export function NairaStrip() {
  const { data } = useQuery({
    queryKey: ["rates"],
    queryFn: () => getRates({ data: undefined }),
    refetchInterval: 5 * 60 * 1000,
  });
  const r = data?.rates;
  if (!r) return null;
  const fmt = (n: number | null | undefined) => (n ? `₦${Number(n).toFixed(0)}` : "—");
  return (
    <div className="border-b border-border bg-emerald-950 text-emerald-50">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-2 text-xs font-mono">
        <span className="font-bold uppercase tracking-wider text-emerald-300">Naira</span>
        <span>USD {fmt(r.usd)}</span>
        <span>GBP {fmt(r.gbp)}</span>
        <span>EUR {fmt(r.eur)}</span>
        <span>CAD {fmt(r.cad)}</span>
        <span className="ml-auto text-emerald-400/70">
          {r.updated_at ? new Date(r.updated_at).toLocaleString() : ""}
        </span>
      </div>
    </div>
  );
}
