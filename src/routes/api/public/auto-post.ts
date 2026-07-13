import { createFileRoute } from "@tanstack/react-router";

type NewsRow = {
  id: string;
  url: string;
  source: string;
  tweet_text: string;
  image_url: string | null;
  region: string;
  category: string;
  viral_score: number;
};

async function postOne(webhookUrl: string, item: NewsRow) {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: item.id,
      tweet_text: item.tweet_text,
      image_url: item.image_url,
      source_url: item.url,
      source: item.source,
      region: item.region,
      category: item.category,
      viral_score: item.viral_score,
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Webhook ${res.status}: ${body.slice(0, 200)}`);
  }
}

export const Route = createFileRoute("/api/public/auto-post")({
  server: {
    handlers: {
      POST: async () => {
        const webhookUrl = process.env.X_WEBHOOK_URL;
        if (!webhookUrl) {
          return Response.json({ ok: false, reason: "X_WEBHOOK_URL not configured" }, { status: 200 });
        }
        const minScore = Number(process.env.X_MIN_VIRAL_SCORE ?? 75);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const regions = ["nigeria"] as const;
        let posted = 0;
        const errors: { id: string; error: string }[] = [];

        for (const region of regions) {
          const { data: candidates } = await supabaseAdmin
            .from("news_items")
            .select("id,url,source,tweet_text,image_url,region,category,viral_score")
            .is("posted_at", null)
            .eq("region", region)
            .gte("viral_score", minScore)
            .order("viral_score", { ascending: false })
            .order("published_at", { ascending: false })
            .limit(1);

          const item = (candidates ?? [])[0] as NewsRow | undefined;
          if (!item) continue;

          try {
            await postOne(webhookUrl, item);
            await supabaseAdmin
              .from("news_items")
              .update({ posted_at: new Date().toISOString(), post_error: null })
              .eq("id", item.id);
            posted++;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            errors.push({ id: item.id, error: msg });
            await supabaseAdmin.from("news_items").update({ post_error: msg }).eq("id", item.id);
          }
        }

        return Response.json({ ok: true, posted, errors });
      },
      GET: async () => Response.json({ ok: true, hint: "POST to fire auto-post cycle" }),
    },
  },
});
