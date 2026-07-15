
## 1. Fix why posts aren't reaching X (root cause)

The cron has been running fine every 30 min and Buffer is accepting every call (48 successful `posted_at` rows today, zero errors). The posts are being **queued in Buffer, not sent** because our GraphQL `createPost` mutation combines conflicting flags:

- `mode: "shareNow"` → post immediately
- `schedulingType: "automatic"` → drop into the next Buffer queue slot

Buffer honors `schedulingType`, so posts wait for Buffer's daily schedule (which is why you saw one post 20h ago).

**Fix in `src/lib/news.functions.ts` → `postToBuffer`:** remove `schedulingType` entirely. Send only `text`, `channelId`, `mode: "shareNow"`, and optional `assets`. That's Buffer's documented "post now" shape.

## 2. Full automation, cap 30/day

- Change `DAILY_CAP` from 24 → **30** in `src/routes/api/public/auto-post.ts`.
- Keep the pg_cron `auto-post-x` schedule at `*/30 * * * *`. The rolling 24h cap in the handler auto-throttles once 30 is reached.
- Add an anti-repeat filter: skip candidates from any source already posted in the last 2 hours, so we don't stack two Punch posts back-to-back.
- No user action needed.

## 3. More Nigerian sources

Add to `FEEDS` in `src/lib/news.server.ts`:
- Guardian Nigeria — `https://guardian.ng/feed/`
- Leadership — `https://leadership.ng/feed/`
- The Nation — `https://thenationonlineng.net/feed/`
- Nairametrics — `https://nairametrics.com/feed/`
- BusinessDay — `https://businessday.ng/feed/`
- Legit.ng — `https://www.legit.ng/rss/all.rss`
- Pulse.ng — `https://www.pulse.ng/rss`
- Ripples Nigeria — `https://www.ripplesnigeria.com/feed/`
- PM News — `https://pmnewsnigeria.com/feed/`

Any feed that 404s just returns `[]` — safe. Also cap **5 fresh items per source per refresh cycle** in `refreshAllNews` so no single outlet monopolizes the AI budget or the candidate pool.

## 4. Real story images (not the Punch logo)

Punch, Vanguard, Channels TV, Daily Trust and a few others put their site logo in `media:thumbnail` instead of the article image. Fix in `src/lib/news.server.ts`:

- Add `fetchOgImage(url)` helper: fetches the article HTML (5s timeout, ~200 KB cap), regex-extracts `<meta property="og:image">`, falling back to `twitter:image`.
- After building each `FeedItem`, run enrichment (concurrency 8) for items where source is in a "logo-only-in-RSS" list OR the current `image_url` looks like a logo (matches `/logo`, `logo.png`, `logo.jpg`, brand-slug patterns).
- Replace `image_url` with the og:image when found; fall back to the RSS value on failure.

## Files changed

- `src/lib/news.functions.ts` — remove `schedulingType` from `postToBuffer`; add per-source cap in `refreshAllNews`.
- `src/lib/news.server.ts` — add feeds, add `fetchOgImage`, upgrade image extraction.
- `src/routes/api/public/auto-post.ts` — `DAILY_CAP = 30`, add 2-hour same-source anti-repeat filter.

No schema, secret, or cron changes required.
