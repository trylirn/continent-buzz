import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function publicClient() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

export const getNews = createServerFn({ method: "GET" })
  .inputValidator((input: { region?: string; category?: string; limit?: number }) => ({
    region: input.region,
    category: input.category ?? "All",
    limit: Math.min(input.limit ?? 60, 100),
  }))
  .handler(async ({ data }) => {
    const supabase = publicClient();
    let q = supabase.from("news_items").select("*").order("published_at", { ascending: false }).limit(data.limit);
    if (data.region && data.region !== "all") q = q.eq("region", data.region);
    if (data.category && data.category !== "All") q = q.eq("category", data.category);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { items: rows ?? [] };
  });

export const getRates = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = publicClient();
  const { data } = await supabase.from("currency_rates").select("*").eq("id", 1).maybeSingle();
  return { rates: data };
});

export const refreshAllNews = createServerFn({ method: "POST" }).handler(async () => {
  const { fetchAllFeeds, aiCurateBatch, refreshCurrencyRates } = await import("./news.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const grouped = await fetchAllFeeds();

  // Filter out URLs we already have to save AI calls
  const allUrls = grouped.flatMap((g) => g.items.map((i) => i.url));
  const { data: existing } = await supabaseAdmin.from("news_items").select("url").in("url", allUrls);
  const seen = new Set((existing ?? []).map((r) => r.url));

  let inserted = 0;
  let rejected = 0;

  for (const group of grouped) {
    const fresh = group.items.filter((i) => !seen.has(i.url));
    if (fresh.length === 0) continue;

    // Batch of 10 for AI
    for (let i = 0; i < fresh.length; i += 10) {
      const batch = fresh.slice(i, i + 10);
      try {
        const results = await aiCurateBatch(
          batch.map((b) => ({
            source: b.source,
            title: b.title,
            description: b.description,
            hint_region: group.region,
          })),
        );
        const rows = batch
          .map((item, idx) => {
            const r = results[idx];
            if (!r || r.region === "reject" || r.viral_score < 55 || !r.tweet_text) {
              rejected++;
              return null;
            }
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
          else console.error("Upsert error:", error.message);
        }
      } catch (err) {
        console.error("AI batch error:", err);
      }
    }
  }

  // Refresh rates
  const rates = await refreshCurrencyRates();
  if (rates) {
    await supabaseAdmin
      .from("currency_rates")
      .upsert({ id: 1, ...rates, updated_at: new Date().toISOString() }, { onConflict: "id" });
  }

  return { inserted, rejected };
});

export const proxyImage = createServerFn({ method: "GET" })
  .inputValidator((input: { url: string }) => ({ url: input.url }))
  .handler(async ({ data }) => {
    try {
      const res = await fetch(data.url, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error("fetch failed");
      const buf = await res.arrayBuffer();
      const contentType = res.headers.get("content-type") ?? "image/jpeg";
      // Return as base64 data URL for client download
      const b64 = Buffer.from(buf).toString("base64");
      return { dataUrl: `data:${contentType};base64,${b64}`, contentType };
    } catch {
      return { dataUrl: null, contentType: null };
    }
  });

export async function postToBuffer(item: {
  id: string;
  tweet_text: string;
  image_url: string | null;
  region: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = process.env.BUFFER_ACCESS_TOKEN;
  const channelId =
    item.region === "nigeria" ? process.env.BUFFER_CHANNEL_ID_NIGERIA : undefined;
  if (!token) return { ok: false, error: "BUFFER_ACCESS_TOKEN not configured" };
  if (!channelId) return { ok: false, error: `No Buffer channel for region ${item.region}` };

  const query = `
    mutation CreatePost($input: CreatePostInput!) {
      createPost(input: $input) {
        ... on PostActionSuccess { post { id } }
        ... on MutationError { message }
      }
    }
  `;
  const input: Record<string, unknown> = {
    text: item.tweet_text,
    channelId,
    mode: "shareNow",
  };
  if (item.image_url) {
    input.assets = [{ image: { url: item.image_url } }];
  }

  const res = await fetch("https://api.buffer.com", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables: { input } }),
    signal: AbortSignal.timeout(20000),
  });
  const body = await res.text().catch(() => "");
  if (!res.ok) return { ok: false, error: `Buffer ${res.status}: ${body.slice(0, 250)}` };

  try {
    const json = JSON.parse(body) as {
      errors?: { message?: string }[];
      data?: { createPost?: { post?: { id?: string }; message?: string } };
    };
    if (json.errors && json.errors.length > 0) {
      return { ok: false, error: `Buffer: ${json.errors.map((e) => e.message).join("; ").slice(0, 250)}` };
    }
    const result = json.data?.createPost;
    if (result?.message) return { ok: false, error: `Buffer: ${result.message}` };
    if (!result?.post?.id) return { ok: false, error: `Buffer: unexpected response ${body.slice(0, 200)}` };
  } catch {
    return { ok: false, error: `Buffer: invalid JSON ${body.slice(0, 200)}` };
  }
  return { ok: true };
}

export const postToX = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string }) => ({ id: input.id }))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: item } = await supabaseAdmin
      .from("news_items")
      .select("id,tweet_text,image_url,region")
      .eq("id", data.id)
      .maybeSingle();
    if (!item) return { ok: false, error: "Story not found" };
    const result = await postToBuffer(item);
    if (!result.ok) {
      await supabaseAdmin.from("news_items").update({ post_error: result.error }).eq("id", item.id);
      return { ok: false, error: result.error };
    }
    await supabaseAdmin
      .from("news_items")
      .update({ posted_at: new Date().toISOString(), post_error: null })
      .eq("id", item.id);
    return { ok: true };
  });

