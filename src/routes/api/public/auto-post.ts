import { createFileRoute } from "@tanstack/react-router";
import { postToBuffer } from "@/lib/news.functions";

const DAILY_CAP = 30;
const REGIONS = ["nigeria", "africa", "america"] as const;
const POSTS_PER_REGION_PER_RUN = 1;

export const Route = createFileRoute("/api/public/auto-post")({
  server: {
    handlers: {
      POST: async () => {
        const minScore = Number(process.env.X_MIN_VIRAL_SCORE ?? 55);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        let posted = 0;
        const postedItems: {
          id: string;
          region: string;
          source: string;
          usedImage: boolean;
          retriedWithoutImage: boolean;
        }[] = [];
        const errors: { id: string; region: string; error: string }[] = [];
        const skipped: { region: string; reason: string }[] = [];

        for (const region of REGIONS) {
          const channelId = {
            nigeria: process.env.BUFFER_CHANNEL_ID_NIGERIA,
            africa: process.env.BUFFER_CHANNEL_ID_AFRICA,
            america: process.env.BUFFER_CHANNEL_ID_AMERICA,
          }[region];
          if (!channelId) {
            skipped.push({ region, reason: "Buffer channel not configured" });
            continue;
          }

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
          const remaining = DAILY_CAP - (count ?? 0);
          const limit = Math.min(POSTS_PER_REGION_PER_RUN, remaining);

          // Anti-repeat: skip sources already posted in the last 2 hours
          const recentSince = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
          const { data: recentPosts } = await supabaseAdmin
            .from("news_items")
            .select("source")
            .eq("region", region)
            .gte("posted_at", recentSince);
          const recentSources = Array.from(
            new Set((recentPosts ?? []).map((r) => r.source).filter(Boolean)),
          );

          let query = supabaseAdmin
            .from("news_items")
            .select("id,tweet_text,image_url,region,viral_score,published_at,source,url")
            .is("posted_at", null)
            .eq("region", region)
            .gte("viral_score", minScore);
          if (recentSources.length > 0) {
            query = query.not("source", "in", `(${recentSources.map((s) => `"${s}"`).join(",")})`);
          }
          const { data: candidates } = await query
            .order("viral_score", { ascending: false })
            .order("published_at", { ascending: false })
            .limit(Math.max(limit * 3, 3));

          const items = (candidates ?? []).slice(0, limit);
          if (items.length === 0) {
            skipped.push({ region, reason: "no candidate" });
            continue;
          }

          for (const item of items) {
            const result = await postToBuffer({
              id: item.id,
              tweet_text: item.tweet_text,
              image_url: item.image_url,
              region: item.region,
              source: item.source,
              url: item.url,
            });
            if (result.ok) {
              await supabaseAdmin
                .from("news_items")
                .update({
                  posted_at: new Date().toISOString(),
                  post_error: null,
                  ...(result.imageRejected ? { image_url: null } : {}),
                })
                .eq("id", item.id);
              posted++;
              postedItems.push({
                id: item.id,
                region: item.region,
                source: item.source,
                usedImage: result.usedImage,
                retriedWithoutImage: result.retriedWithoutImage,
              });
            } else {
              errors.push({ id: item.id, region: item.region, error: result.error });
              await supabaseAdmin
                .from("news_items")
                .update({
                  post_error: result.error,
                  ...(result.imageRejected ? { image_url: null } : {}),
                })
                .eq("id", item.id);
            }
          }
        }

        return Response.json({ ok: true, posted, postedItems, skipped, errors });
      },
      GET: async () => Response.json({ ok: true, hint: "POST to fire auto-post cycle" }),
    },
  },
});
