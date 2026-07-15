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

        // Two-pass fetch: (1) rows whose image_url still contains 'logo';
        // (2) fill remainder from null-image rows if room remains.
        const [{ data: logoRows }, { data: nullRows }] = await Promise.all([
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
        ]);
        const merged = [...(logoRows ?? []), ...(nullRows ?? [])];
        const targets = merged
          .filter((r) => !r.image_url || looksLikeLogo(r.image_url))
          .slice(0, limit);

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
