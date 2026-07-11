// Server-only helpers: RSS fetching + AI filtering/rewriting.
import { XMLParser } from "fast-xml-parser";

export type FeedItem = {
  url: string;
  source: string;
  title: string;
  description: string;
  image_url: string | null;
  published_at: string;
};

const FEEDS: { region: "nigeria" | "africa" | "america"; source: string; url: string }[] = [
  // Nigeria
  { region: "nigeria", source: "Premium Times", url: "https://www.premiumtimesng.com/feed" },
  { region: "nigeria", source: "Punch", url: "https://punchng.com/feed/" },
  { region: "nigeria", source: "Vanguard", url: "https://www.vanguardngr.com/feed/" },
  { region: "nigeria", source: "Channels TV", url: "https://www.channelstv.com/feed/" },
  { region: "nigeria", source: "Sahara Reporters", url: "https://saharareporters.com/rss.xml" },
  { region: "nigeria", source: "TheCable", url: "https://www.thecable.ng/feed" },
  { region: "nigeria", source: "Daily Trust", url: "https://dailytrust.com/feed/" },
  // Africa
  { region: "africa", source: "AllAfrica", url: "https://allafrica.com/tools/headlines/rdf/latest/headlines.rdf" },
  { region: "africa", source: "BBC Africa", url: "https://feeds.bbci.co.uk/news/world/africa/rss.xml" },
  { region: "africa", source: "News24", url: "https://feeds.24.com/articles/news24/TopStories/rss" },
  { region: "africa", source: "Al Jazeera Africa", url: "https://www.aljazeera.com/xml/rss/all.xml" },
  // America
  { region: "america", source: "AP Top News", url: "https://apnews.com/index.rss" },
  { region: "america", source: "NPR", url: "https://feeds.npr.org/1001/rss.xml" },
  { region: "america", source: "CBS", url: "https://www.cbsnews.com/latest/rss/main" },
  { region: "america", source: "ABC News", url: "https://abcnews.go.com/abcnews/topstories" },
];

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
});

function extractImage(item: Record<string, unknown>): string | null {
  const g = (k: string) => item[k] as unknown;
  const media = g("media:content") ?? g("media:thumbnail");
  if (media) {
    const arr = Array.isArray(media) ? media : [media];
    for (const m of arr) {
      const url = (m as Record<string, unknown>)["@_url"];
      if (typeof url === "string") return url;
    }
  }
  const enclosure = g("enclosure") as Record<string, unknown> | undefined;
  if (enclosure && typeof enclosure["@_url"] === "string") return enclosure["@_url"] as string;
  // Try to extract from description/content
  const content = (g("content:encoded") ?? g("description") ?? "") as string;
  if (typeof content === "string") {
    const m = content.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (m) return m[1];
  }
  return null;
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

async function fetchFeed(feed: (typeof FEEDS)[number]): Promise<FeedItem[]> {
  try {
    const res = await fetch(feed.url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; NewsAggregator/1.0)" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const data = parser.parse(xml) as Record<string, unknown>;
    // Handle RSS 2.0 and RDF
    const rss = data.rss as Record<string, unknown> | undefined;
    const channel = (rss?.channel as Record<string, unknown> | undefined) ?? (data["rdf:RDF"] as Record<string, unknown> | undefined);
    const feedRoot = data.feed as Record<string, unknown> | undefined; // Atom
    let items: Record<string, unknown>[] = [];
    if (channel) {
      const raw = (channel.item ?? data["rdf:RDF"]) as unknown;
      const arr = (raw && Array.isArray(raw) ? raw : channel.item ? [channel.item] : []) as Record<string, unknown>[];
      // For RDF, items are siblings of channel
      if (arr.length === 0 && data["rdf:RDF"]) {
        const rdf = data["rdf:RDF"] as Record<string, unknown>;
        const rdfItems = rdf.item;
        items = (Array.isArray(rdfItems) ? rdfItems : rdfItems ? [rdfItems] : []) as Record<string, unknown>[];
      } else {
        items = arr;
      }
    } else if (feedRoot) {
      const entries = feedRoot.entry;
      items = (Array.isArray(entries) ? entries : entries ? [entries] : []) as Record<string, unknown>[];
    }

    return items.slice(0, 15).map((item) => {
      const link = item.link;
      let url = "";
      if (typeof link === "string") url = link;
      else if (Array.isArray(link)) {
        const first = link[0] as Record<string, unknown> | string;
        url = typeof first === "string" ? first : (first["@_href"] as string) ?? "";
      } else if (link && typeof link === "object") {
        const l = link as Record<string, unknown>;
        url = (l["@_href"] as string) ?? (l["#text"] as string) ?? "";
      }
      const title = stripHtml(String(item.title ?? ""));
      const description = stripHtml(String(item.description ?? item.summary ?? item["content:encoded"] ?? ""));
      const pubDate = item.pubDate ?? item.published ?? item["dc:date"] ?? item.updated;
      const published_at = pubDate ? new Date(String(pubDate)).toISOString() : new Date().toISOString();
      return {
        url,
        source: feed.source,
        title,
        description: description.slice(0, 500),
        image_url: extractImage(item),
        published_at,
      };
    }).filter((i) => i.url && i.title);
  } catch (err) {
    console.error(`Feed error ${feed.source}:`, err);
    return [];
  }
}

export async function fetchAllFeeds(): Promise<{ region: "nigeria" | "africa" | "america"; items: FeedItem[] }[]> {
  const results = await Promise.all(
    FEEDS.map(async (f) => ({ region: f.region, items: await fetchFeed(f) })),
  );
  // Group by region
  const grouped: Record<string, FeedItem[]> = { nigeria: [], africa: [], america: [] };
  for (const r of results) grouped[r.region].push(...r.items);
  return (["nigeria", "africa", "america"] as const).map((region) => ({ region, items: grouped[region] }));
}

export type AIResult = {
  region: "nigeria" | "africa" | "america" | "reject";
  category: string;
  viral_score: number;
  tweet_text: string;
};

const CATEGORIES = ["Breaking","Politics","Security","Economy","Sports","Education","Celebrity","Viral","Disaster","Corruption","Quote","Tech"];

function fallbackCurate(
  items: { source: string; title: string; description: string; hint_region: string }[],
): AIResult[] {
  return items.map((it) => {
    const region = (["nigeria", "africa", "america"].includes(it.hint_region)
      ? it.hint_region
      : "africa") as AIResult["region"];
    // Keep original content — no AI rewrite available.
    const text = it.title.length > 260 ? it.title.slice(0, 257) + "…" : it.title;
    return { region, category: "Breaking", viral_score: 60, tweet_text: text };
  });
}

export async function aiCurateBatch(
  items: { source: string; title: string; description: string; hint_region: string }[],
): Promise<AIResult[]> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) {
    console.warn("Missing LOVABLE_API_KEY — using original content fallback");
    return fallbackCurate(items);
  }

  const prompt = `You curate viral news for a Twitter (X) account targeting Nigerian and African audiences (plus a separate America feed).

For each item, decide:
- region: "nigeria" if primarily Nigerian, "africa" if primarily African (excluding Nigeria-only), "america" if primarily US news, "reject" if irrelevant to those audiences (e.g. Mbappé/France records, non-African/non-US celebrity gossip, generic Europe/Asia news with no Africa angle).
- category: one of ${CATEGORIES.join(", ")}.
- viral_score: 0-100. HIGH scores for: corruption, disaster, breaking politics/security, bandit attacks, celebrity scandal, xenophobia (esp. SA), currency shocks, governor drama, government spending, human-interest videos, AFCON/football wins involving Africans, education bans, quotes from politicians/pastors. LOW scores for: dry policy analysis, foreign news with no Africa angle, minor local stories.
- tweet_text: rewrite as a punchy, human, neutral-factual tweet ready to paste on X. Use "BREAKING:" or "JUST IN:" prefix ONLY for genuinely breaking/urgent items. Use "~ [Person] says" for quotes. 1-2 sentences, under 260 chars. No hashtags, no emojis (unless truly warranted), no "click here". Sound like a real news wire, not clickbait.

Return a JSON array with one object per input item, in the same order. Only these fields: region, category, viral_score, tweet_text.

INPUT:
${JSON.stringify(items, null, 2)}`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: "You are a viral news curator. Return only valid JSON arrays. No prose." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.warn(`AI gateway ${res.status} (${body.slice(0, 120)}) — falling back to original content`);
    return fallbackCurate(items);
  }
  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  const raw = data.choices[0]?.message?.content ?? "[]";
  // Model may wrap array in an object like {"results": [...]}
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Extract JSON array with regex fallback
    const m = raw.match(/\[[\s\S]*\]/);
    parsed = m ? JSON.parse(m[0]) : [];
  }
  let arr: unknown[] = [];
  if (Array.isArray(parsed)) arr = parsed;
  else if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    const key = Object.keys(obj).find((k) => Array.isArray(obj[k]));
    if (key) arr = obj[key] as unknown[];
  }
  return arr.map((x): AIResult => {
    const o = (x ?? {}) as Record<string, unknown>;
    return {
      region: (o.region as AIResult["region"]) ?? "reject",
      category: (o.category as string) ?? "Breaking",
      viral_score: Number(o.viral_score) || 0,
      tweet_text: String(o.tweet_text ?? "").slice(0, 275),
    };
  });
}

export async function refreshCurrencyRates(): Promise<{ usd: number; gbp: number; eur: number; cad: number } | null> {
  try {
    // Free API, base NGN
    const res = await fetch("https://open.er-api.com/v6/latest/NGN", {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { rates?: Record<string, number> };
    if (!data.rates) return null;
    // These are NGN->X. Invert to get how many NGN per 1 of foreign currency.
    return {
      usd: 1 / data.rates.USD,
      gbp: 1 / data.rates.GBP,
      eur: 1 / data.rates.EUR,
      cad: 1 / data.rates.CAD,
    };
  } catch {
    return null;
  }
}
