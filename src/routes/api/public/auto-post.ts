import { createFileRoute } from "@tanstack/react-router";
import { postToBuffer } from "@/lib/news.functions";

const DAILY_CAP = 24;

export const Route = createFileRoute("/api/public/auto-post")({
  server: {
    handlers: {
      POST: async () => {
        const minScore = Number(process.env.X_MIN_VIRAL_SCORE ?? 75);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const regions = ["nigeria"] as const;
        let posted = 0;
        const errors: { id: string; error: string }[] = [];
        const skipped: { region: string; reason: string }[] = [];

        for (const region of regions) {
          // Daily cap: how many posts in the last 24h for this region
          const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
          const { count } = await supabaseAdmin
            .from("news_items")
            .select("id", { count: "exact", head: true })
            .eq("region", region)
            .gte("posted_at", since);

          if ((count ?? 0) >= DAILY_CAP) {
            skipped.push({ region, reason: `daily cap ${DAILY_CAP} reached` });
            continue;
          }

          const { data: candidates } = await supabaseAdmin
            .from("news_items")
            .select("id,tweet_text,image_url,region,viral_score,published_at")
            .is("posted_at", null)
            .eq("region", region)
            .gte("viral_score", minScore)
            .order("viral_score", { ascending: false })
            .order("published_at", { ascending: false })
            .limit(1);

          const item = (candidates ?? [])[0];
          if (!item) {
            skipped.push({ region, reason: "no candidate" });
            continue;
          }

          const result = await postToBuffer({
            id: item.id,
            tweet_text: item.tweet_text,
            image_url: item.image_url,
            region: item.region,
          });
          if (result.ok) {
            await supabaseAdmin
              .from("news_items")
              .update({ posted_at: new Date().toISOString(), post_error: null })
              .eq("id", item.id);
            posted++;
          } else {
            errors.push({ id: item.id, error: result.error });
            await supabaseAdmin
              .from("news_items")
              .update({ post_error: result.error })
              .eq("id", item.id);
          }
        }

        return Response.json({ ok: true, posted, skipped, errors });
      },
      GET: async () => Response.json({ ok: true, hint: "POST to fire auto-post cycle" }),
    },
  },
});
