import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/refresh-feeds")({
  server: {
    handlers: {
      POST: async () => {
        const { fetchAllFeeds, aiCurateBatch, refreshCurrencyRates } = await import("@/lib/news.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const grouped = await fetchAllFeeds();
        const allUrls = grouped.flatMap((g) => g.items.map((i) => i.url));
        const { data: existing } = await supabaseAdmin.from("news_items").select("url").in("url", allUrls);
        const seen = new Set((existing ?? []).map((r) => r.url));

        let inserted = 0;
        for (const group of grouped) {
          const fresh = group.items.filter((i) => !seen.has(i.url));
          for (let i = 0; i < fresh.length; i += 10) {
            const batch = fresh.slice(i, i + 10);
            try {
              const results = await aiCurateBatch(
                batch.map((b) => ({ source: b.source, title: b.title, description: b.description, hint_region: group.region })),
              );
              const rows = batch
                .map((item, idx) => {
                  const r = results[idx];
                  if (!r || r.region === "reject" || r.viral_score < 55 || !r.tweet_text) return null;
                  return {
                    url: item.url,
                    source: item.source,
                    title: item.title,
                    tweet_text: r.tweet_text,
                    image_url: item.image_url,
                    region: r.region,
                    category: r.category,
                    viral_score: r.viral_score,
                    published_at: item.published_at,
                  };
                })
                .filter((x): x is NonNullable<typeof x> => x !== null);
              if (rows.length > 0) {
                const { error } = await supabaseAdmin.from("news_items").upsert(rows, { onConflict: "url" });
                if (!error) inserted += rows.length;
              }
            } catch (err) {
              console.error("AI batch error:", err);
            }
          }
        }

        const rates = await refreshCurrencyRates();
        if (rates) {
          await supabaseAdmin.from("currency_rates").upsert({ id: 1, ...rates, updated_at: new Date().toISOString() }, { onConflict: "id" });
        }

        return Response.json({ ok: true, inserted });
      },
      GET: async () => Response.json({ ok: true, hint: "POST to refresh" }),
    },
  },
});
