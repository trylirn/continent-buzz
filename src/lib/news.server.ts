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
  { region: "nigeria", source: "Guardian NG", url: "https://guardian.ng/feed/" },
  { region: "nigeria", source: "Leadership", url: "https://leadership.ng/feed/" },
  { region: "nigeria", source: "The Nation", url: "https://thenationonlineng.net/feed/" },
  { region: "nigeria", source: "Nairametrics", url: "https://nairametrics.com/feed/" },
  { region: "nigeria", source: "BusinessDay", url: "https://businessday.ng/feed/" },
  { region: "nigeria", source: "Legit.ng", url: "https://www.legit.ng/rss/all.rss" },
  { region: "nigeria", source: "Pulse.ng", url: "https://www.pulse.ng/rss" },
  { region: "nigeria", source: "Ripples Nigeria", url: "https://www.ripplesnigeria.com/feed/" },
  { region: "nigeria", source: "PM News", url: "https://pmnewsnigeria.com/feed/" },
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

// Sources whose RSS media:thumbnail is often a site logo, not the article image.
const LOGO_ONLY_SOURCES = new Set([
  "Punch",
  "Vanguard",
  "Channels TV",
  "Daily Trust",
  "Guardian NG",
  "Leadership",
  "The Nation",
  "PM News",
  "Legit.ng",
]);

export function normalizeImageUrl(raw: string | null | undefined, baseUrl?: string): string | null {
  if (!raw) return null;
  const cleaned = decodeEntities(String(raw))
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .trim();
  if (!cleaned || cleaned.startsWith("data:") || cleaned.startsWith("blob:")) return null;
  try {
    const resolved = cleaned.startsWith("//")
      ? new URL(`https:${cleaned}`)
      : new URL(cleaned, baseUrl);
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return null;
    return resolved.toString();
  } catch {
    return null;
  }
}

export function looksLikeLogo(url: string | null, source?: string | null): boolean {
  if (!url) return false;
  const normalized = normalizeImageUrl(url) ?? url;
  const u = normalized.toLowerCase();
  let path = u;
  let file = u;
  try {
    const parsed = new URL(normalized);
    path = decodeURIComponent(parsed.pathname).toLowerCase();
    file = path.split("/").pop() ?? path;
  } catch {
    // Keep the lowercased raw URL as fallback.
  }
  const sourceSlug = (source ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const compactFile = file.replace(/[^a-z0-9]+/g, "");
  return (
    /(^|[\/\-_.])(logo|logotype|wordmark|brandmark|brand|favicon|icon|apple-touch-icon|android-chrome)([\/\-_.]|$)/.test(path) ||
    /(site|header|footer|mobile)[\-_]?(logo|brand|icon)/.test(path) ||
    /(placeholder|default[\-_]?(image|thumbnail|photo)|no[\-_]?image|blank|avatar|gravatar)/.test(path) ||
    /punchlogo/.test(compactFile) ||
    /channelstvlogo/.test(compactFile) ||
    /vanguardlogo/.test(compactFile) ||
    /guardianlogo/.test(compactFile) ||
    /leadershiplogo/.test(compactFile) ||
    (Boolean(sourceSlug) && compactFile.includes(sourceSlug) && /(logo|brand|icon|mark)/.test(compactFile)) ||
    /\.(svg|ico)(\?|$)/.test(u)
  );
}

function getHtmlAttr(tag: string, attr: string): string | null {
  const re = new RegExp(`${attr}\\s*=\\s*(["'])(.*?)\\1`, "i");
  return tag.match(re)?.[2] ?? null;
}

function collectArticleImageCandidates(html: string, articleUrl: string): string[] {
  const candidates: string[] = [];
  const add = (value: string | null | undefined) => {
    const normalized = normalizeImageUrl(value, articleUrl);
    if (normalized && !candidates.includes(normalized)) candidates.push(normalized);
  };

  const metaTags = html.match(/<meta\b[^>]*>/gi) ?? [];
  const wanted = new Set([
    "og:image:secure_url",
    "og:image:url",
    "og:image",
    "twitter:image:src",
    "twitter:image",
  ]);
  for (const tag of metaTags) {
    const key = (getHtmlAttr(tag, "property") ?? getHtmlAttr(tag, "name") ?? "").toLowerCase();
    if (wanted.has(key)) add(getHtmlAttr(tag, "content"));
  }

  const linkTags = html.match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of linkTags) {
    const rel = (getHtmlAttr(tag, "rel") ?? "").toLowerCase();
    if (rel.includes("image_src")) add(getHtmlAttr(tag, "href"));
  }

  const imgTags = html.match(/<img\b[^>]*>/gi) ?? [];
  for (const tag of imgTags.slice(0, 80)) {
    const className = `${getHtmlAttr(tag, "class") ?? ""} ${getHtmlAttr(tag, "id") ?? ""}`.toLowerCase();
    if (/(logo|avatar|icon|author|profile|ad-|advert|tracking|pixel|spinner)/.test(className)) continue;
    add(
      getHtmlAttr(tag, "data-src") ??
        getHtmlAttr(tag, "data-lazy-src") ??
        getHtmlAttr(tag, "data-original") ??
        getHtmlAttr(tag, "src"),
    );
  }

  return candidates;
}

export async function isUsableStoryImage(
  rawUrl: string | null | undefined,
  articleUrl?: string,
  source?: string | null,
): Promise<string | null> {
  const imageUrl = normalizeImageUrl(rawUrl, articleUrl);
  if (!imageUrl || looksLikeLogo(imageUrl, source)) return null;
  try {
    const res = await fetch(imageUrl, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; NewsAggregator/1.0)",
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        Range: "bytes=0-8191",
      },
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok && res.status !== 206) return null;
    const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
    if (!contentType.startsWith("image/") || contentType.includes("svg")) return null;
    const length = Number(res.headers.get("content-length") ?? 0);
    if (length > 0 && length < 3500) return null;
    await res.body?.cancel().catch(() => undefined);
    return imageUrl;
  } catch {
    return null;
  }
}

export function shouldRefetchArticleImage(source: string | null, imageUrl: string | null): boolean {
  return !imageUrl || looksLikeLogo(imageUrl, source) || LOGO_ONLY_SOURCES.has(source ?? "");
}

export async function fetchOgImage(articleUrl: string, source?: string | null): Promise<string | null> {
  try {
    const res = await fetch(articleUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; NewsAggregator/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, 200_000);
    for (const candidate of collectArticleImageCandidates(html, articleUrl)) {
      const usable = await isUsableStoryImage(candidate, articleUrl, source);
      if (usable) return usable;
    }
    return null;
  } catch {
    return null;
  }
}

async function enrichImages(items: FeedItem[]): Promise<FeedItem[]> {
  const targets = items
    .map((it, idx) => ({ it, idx }))
    .filter(({ it }) => shouldRefetchArticleImage(it.source, it.image_url));

  const CONCURRENCY = 8;
  let cursor = 0;
  async function worker() {
    while (cursor < targets.length) {
      const { it, idx } = targets[cursor++];
      const og = await fetchOgImage(it.url, it.source);
      if (og) {
        items[idx] = { ...it, image_url: og };
        continue;
      }
      const usableOriginal = await isUsableStoryImage(it.image_url, it.url, it.source);
      items[idx] = { ...it, image_url: usableOriginal };
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker));
  return items;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
});

function extractImage(item: Record<string, unknown>, articleUrl: string, source: string): string | null {
  const g = (k: string) => item[k] as unknown;
  const media = g("media:content") ?? g("media:thumbnail");
  if (media) {
    const arr = Array.isArray(media) ? media : [media];
    for (const m of arr) {
      const url = (m as Record<string, unknown>)["@_url"];
      if (typeof url === "string") {
        const normalized = normalizeImageUrl(url, articleUrl);
        if (normalized && !looksLikeLogo(normalized, source)) return normalized;
      }
    }
  }
  const enclosure = g("enclosure") as Record<string, unknown> | undefined;
  if (enclosure && typeof enclosure["@_url"] === "string") {
    const normalized = normalizeImageUrl(enclosure["@_url"] as string, articleUrl);
    if (normalized && !looksLikeLogo(normalized, source)) return normalized;
  }
  // Try to extract from description/content
  const content = (g("content:encoded") ?? g("description") ?? "") as string;
  if (typeof content === "string") {
    const m = content.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (m) {
      const normalized = normalizeImageUrl(m[1], articleUrl);
      if (normalized && !looksLikeLogo(normalized, source)) return normalized;
    }
  }
  return null;
}

function decodeEntities(s: string): string {
  const named: Record<string, string> = {
    amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
    ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’", hellip: "…",
    mdash: "—", ndash: "–", copy: "©", reg: "®", trade: "™",
  };
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => named[name.toLowerCase()] ?? m);
}

function stripHtml(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

export function cleanTweet(s: string): string {
  return decodeEntities(s)
    // normalize smart quotes/dashes to plain ASCII where sensible
    .replace(/[\u2018\u2019\u201A\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u2033]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    // remove stray control chars
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
        image_url: extractImage(item, url, feed.source),
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
  // Replace logo-only RSS images with the real article og:image
  await Promise.all(
    (["nigeria", "africa", "america"] as const).map(async (region) => {
      grouped[region] = await enrichImages(grouped[region]);
    }),
  );
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
    const cleaned = cleanTweet(it.title);
    const text = cleaned.length > 260 ? cleaned.slice(0, 257) + "..." : cleaned;
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
- tweet_text: write a genuinely scroll-stopping tweet, not a stiff news-wire rewrite. Lead with the most striking, concrete detail (a number, a quote, a consequence, or the "why this matters" angle) instead of a flat headline restatement. You may add a brief line of sharp, factual commentary or context — what this means, who it affects, what happens next — as long as it stays fully grounded in the actual reporting: never invent facts, numbers, or quotes, and never make the story sound bigger or different than what actually happened. If the story needs a touch of background to make sense to someone who has not been following it (an unfamiliar name, acronym, or ongoing situation), add one short clarifying clause; skip this when the story is already self-explanatory — don't force it into every tweet. Aim for 220-279 characters (hard cap 279 — never exceed X's 280-character limit). Use "BREAKING:" or "JUST IN:" ONLY for genuinely breaking/urgent items. Use "~ [Person] says" style for quotes. 2-4 sentences allowed. Do not include the article URL or say "link in thread" — the source link is added automatically as a reply underneath. No hashtags, no emojis, no "click here", no clickbait phrasing the story doesn't actually back up. Use plain ASCII punctuation only: straight quotes ('), hyphens (-), three dots (...) — never smart quotes, curly apostrophes, em-dashes, or HTML entities like &#8217;. Avoid ALL CAPS shouting except for the BREAKING/JUST IN prefix.
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
  if (arr.length === 0) return fallbackCurate(items);
  const fb = fallbackCurate(items);
  return items.map((_, i): AIResult => {
    const o = (arr[i] ?? {}) as Record<string, unknown>;
    const tweet = cleanTweet(String(o.tweet_text ?? "")).slice(0, 275);
    if (!tweet) return fb[i];
    return {
      region: (o.region as AIResult["region"]) ?? fb[i].region,
      category: (o.category as string) ?? "Breaking",
      viral_score: Number(o.viral_score) || fb[i].viral_score,
      tweet_text: tweet,
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
