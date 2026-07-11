import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { getNews, refreshAllNews } from "@/lib/news.functions";
import { NewsCard, type NewsItem } from "./NewsCard";
import { CATEGORIES, type Category } from "@/lib/regions";

type Props = { region?: "nigeria" | "africa" | "america"; title: string; subtitle: string };

export function NewsFeed({ region, title, subtitle }: Props) {
  const [category, setCategory] = useState<Category>("All");
  const qc = useQueryClient();
  const queryKey = ["news", region ?? "all", category];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => getNews({ data: { region: region ?? "all", category } }),
  });

  const refresh = useMutation({
    mutationFn: () => refreshAllNews({ data: undefined }),
    onSuccess: (r) => {
      toast.success(`${r.inserted} new stories curated`);
      qc.invalidateQueries({ queryKey: ["news"] });
    },
    onError: (e) => toast.error(String(e)),
  });

  const items = (data?.items ?? []) as NewsItem[];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <button
          onClick={() => refresh.mutate()}
          disabled={refresh.isPending}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refresh.isPending ? "animate-spin" : ""}`} />
          {refresh.isPending ? "Curating…" : "Refresh"}
        </button>
      </div>

      <div className="mb-6 flex flex-wrap gap-1.5">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
              category === c
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-background text-muted-foreground hover:text-foreground"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-[4/5] animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <p className="text-lg font-semibold">No stories yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Click <span className="font-semibold">Refresh</span> to pull the latest news and curate viral picks.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <NewsCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
