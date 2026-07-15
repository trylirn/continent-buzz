import { createFileRoute } from "@tanstack/react-router";

// Re-scrape og:image for rows whose image_url is a logo/placeholder or null.
// Safe to call repeatedly. Processes up to `limit` rows per invocation.
export const Route = createFileRoute("/api/public/backfill-images")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 300);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { fetchOgImage, looksLikeLogo } = await import("@/lib/news.server");

        // Grab candidates: null image, or image_url that looks like a logo/placeholder.
        // We pull a wider pool then filter in JS so we don't OR too many LIKEs.
        const { data: rows } = await supabaseAdmin
          .from("news_items")
          .select("id,url,image_url,source")
          .order("created_at", { ascending: false })
          .limit(limit * 3);

        const targets = (rows ?? []).filter(
          (r) => !r.image_url || looksLikeLogo(r.image_url),
        ).slice(0, limit);

        let updated = 0;
        let cleared = 0;
        const CONCURRENCY = 8;
        let cursor = 0;
        async function worker() {
          while (cursor < targets.length) {
            const row = targets[cursor++];
            const og = await fetchOgImage(row.url);
            if (og && !looksLikeLogo(og)) {
              await supabaseAdmin.from("news_items").update({ image_url: og }).eq("id", row.id);
              updated++;
            } else if (row.image_url && looksLikeLogo(row.image_url)) {
              // Wipe the logo so the card renders imageless rather than showing a Punch logo.
              await supabaseAdmin.from("news_items").update({ image_url: null }).eq("id", row.id);
              cleared++;
            }
          }
        }
        await Promise.all(
          Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker),
        );

        return Response.json({ ok: true, scanned: targets.length, updated, cleared });
      },
      GET: async () => Response.json({ ok: true, hint: "POST to backfill og:image for existing rows" }),
    },
  },
});
