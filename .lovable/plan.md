# Viral News Aggregator — Nigeria, Africa, America

A news site that pulls real headlines, uses AI to filter for viral relevance to each audience, and formats every story into a copy-paste Twitter thread (tweet + source thread) with image.

## Pages (header nav)

- `/` Home — top 3 stories from each region, mixed feed
- `/nigeria` **Latest in Nigeria**
- `/africa` **Africa Pulse**
- `/america` **America Stories**

Each region page: category filter chips, descending by publish time, infinite scroll.

## Categories (filters per page)

Breaking, Politics & Government, Security, Economy & Currency, Sports, Education & Youth, Celebrity & Scandal, Viral/Human Interest, Disaster, Corruption, Quotes, Tech.

Nigeria page adds a live **Naira rates** strip (USD/GBP/EUR/CAD) at the top.

## News card (the core UI)

Every story renders as a card with:

- Source image (thumbnail from RSS/article)
- AI-written tweet text — punchy, human, "BREAKING:" / "JUST IN:" style, 1–2 sentences, attribution when it's a quote
- **Copy Tweet** button → copies tweet text only
- **Copy Source** button → copies `Source: <publication> — <url>` (for the reply thread)
- **Copy Both (thread)** button → copies tweet + newline + source block
- **Download Image** button → saves the source image so user can attach it on X
- Meta: source name, time ago, category badge, region badge
- Link out to original article

Sort: `published_at DESC` always. Latest at top.

## Data pipeline

**Sources** — free RSS feeds (no paid API needed):
- Nigeria: Premium Times, Punch, Vanguard, Channels TV, Sahara Reporters, Daily Trust, TheCable
- Africa: AllAfrica, BBC Africa, Al Jazeera Africa, Reuters Africa, News24
- America: AP Top News, Reuters US, NPR, CBS, ABC
- Currency: exchangerate.host (free) for Naira rates

**Ingestion** — a TanStack server function `refreshFeeds` that:
1. Fetches all RSS feeds in parallel
2. For each item extracts title, description, image (media:content / og:image / enclosure), url, source, published date
3. Sends batches to Lovable AI Gateway (`google/gemini-3-flash-preview`) with a structured-output schema that returns per item:
   - `region`: nigeria | africa | america | reject
   - `category`: one of the category list
   - `viral_score`: 0–100 (based on the viral criteria: corruption, disaster, breaking politics/security, celebrity scandal, xenophobia, currency, human interest, sports wins, education bans, quotes, giveaways)
   - `tweet_text`: rewritten in the described tone — punchy, neutral, factual, "BREAKING:"/"JUST IN:" when appropriate, attribution with "~ Person says" for quotes
   - `reject_reason` if not relevant (e.g. Mbappé for Africa → reject unless it's an African player/team angle)
4. Drops items with `region=reject` or `viral_score < 55`
5. Upserts survivors into `news_items` table

**Refresh trigger** — a public cron endpoint `/api/public/refresh-feeds` (HMAC-verified) hit by pg_cron every 15 minutes. Also a manual "Refresh" button on each page for the owner.

## Backend (Lovable Cloud)

Enable Lovable Cloud. One table:

```
news_items(
  id uuid pk, url text unique, source text, source_logo text,
  title text, tweet_text text, image_url text,
  region text, category text, viral_score int,
  published_at timestamptz, created_at timestamptz
)
```

Public SELECT policy (read-only news, no auth needed for viewers). Writes only from server functions using service role. `currency_rates` table (single row upserted) for Naira strip.

## Twitter-thread copy UX (technical detail)

Tweet text is stored pre-formatted, ≤ 270 chars, ready to paste. Source block format:
```
Source: <Publication>
<article url>
```
Copy buttons use `navigator.clipboard.writeText`. Image download uses a server function that fetches the image and returns it (avoids CORS on `<a download>`).

## Design direction

Newsroom / wire-service feel: dense card list, mono headline accents for "BREAKING:", high-contrast light theme with a strong accent for the copy actions, mobile-first (this is a phone-first workflow — user is copying to X on mobile). Region badges in distinct colors: Nigeria green, Africa amber, America blue.

## Build order

1. Enable Lovable Cloud, create schema + RLS + grants
2. Header nav + 4 route files (home, nigeria, africa, america)
3. `NewsCard` component with copy buttons + image download
4. `refreshFeeds` server function (RSS parse + AI filter/rewrite)
5. Public cron endpoint + manual refresh button
6. Category filter chips + Naira strip
7. Seed the DB with a first refresh so the site isn't empty

## Notes / limits

- News is only as fresh as the RSS feeds and the 15-min cron.
- AI filtering costs Lovable AI credits per refresh; batching keeps this small.
- Images are hotlinked from source publications; the download button proxies them so you can attach on X.
- No login — the site is public; the refresh action is protected by a shared secret, not user auth.
