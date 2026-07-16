import { createFileRoute } from "@tanstack/react-router";

// Re-scrape real article images for rows whose image_url is a source logo,
// placeholder, broken/unusable image, or null.
// Safe to call repeatedly. Processes up to `limit` rows per invocation.
export const Route = createFileRoute("/api/public/backfill-images")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 300);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { fetchOgImage, isUsableStoryImage, looksLikeLogo, shouldRefetchArticleImage } = await import("@/lib/news.server");

        // Multiple passes: rows with obvious logos/placeholders/null first,
        // then a fresh sample so broken or publisher-default images are repaired too.
        const [{ data: logoRows }, { data: nullRows }, { data: recentRows }] = await Promise.all([
          supabaseAdmin
            .from("news_items")
            .select("id,url,image_url,source")
            .ilike("image_url", "%logo%")
            .order("created_at", { ascending: false })
            .limit(limit),
          supabaseAdmin
            .from("news_items")
            .select("id,url,image_url,source")
            .is("image_url", null)
            .order("created_at", { ascending: false })
            .limit(limit),
          supabaseAdmin
            .from("news_items")
            .select("id,url,image_url,source")
            .order("created_at", { ascending: false })
            .limit(limit),
        ]);
        const deduped = new Map<string, NonNullable<typeof recentRows>[number]>();
        for (const row of [...(logoRows ?? []), ...(nullRows ?? []), ...(recentRows ?? [])]) {
          deduped.set(row.id, row);
        }
        const targets = Array.from(deduped.values())
          .filter((r) => shouldRefetchArticleImage(r.source, r.image_url))
          .slice(0, limit);

        let updated = 0;
        let cleared = 0;
        let kept = 0;
        const CONCURRENCY = 8;
        let cursor = 0;
        async function worker() {
          while (cursor < targets.length) {
            const row = targets[cursor++];
            const og = await fetchOgImage(row.url, row.source);
            if (og) {
              if (og !== row.image_url) {
                await supabaseAdmin.from("news_items").update({ image_url: og }).eq("id", row.id);
                updated++;
              } else {
                kept++;
              }
            } else {
              const usableOriginal = await isUsableStoryImage(row.image_url, row.url, row.source);
              if (usableOriginal && !looksLikeLogo(usableOriginal, row.source)) {
                if (usableOriginal !== row.image_url) {
                  await supabaseAdmin.from("news_items").update({ image_url: usableOriginal }).eq("id", row.id);
                  updated++;
                } else {
                  kept++;
                }
              } else if (row.image_url) {
                // Wipe logos/broken/default source art so the card renders imageless rather than showing a publisher logo.
                await supabaseAdmin.from("news_items").update({ image_url: null }).eq("id", row.id);
                cleared++;
              }
            }
          }
        }
        await Promise.all(
          Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker),
        );

        return Response.json({ ok: true, scanned: targets.length, updated, cleared, kept });
      },
      GET: async () => Response.json({ ok: true, hint: "POST to backfill og:image for existing rows" }),
    },
  },
});
