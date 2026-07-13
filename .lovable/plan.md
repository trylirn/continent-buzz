
## Free X auto-posting via webhook (Make.com or n8n)

Both Make.com and self-hosted n8n work the same way from our side: the app POSTs a JSON payload to a webhook URL you provide, and your scenario/workflow handles the actual X post (upload media + create tweet). No X API costs on our side, no OAuth code to maintain.

### 1. Schema

Add to `news_items`:
- `posted_at timestamptz null` — set when the webhook accepts the post
- `post_error text null` — last error, for retries/visibility

Add a settings table so you can paste the webhook URL from the UI (no code redeploy needed):

```sql
create table public.app_settings (
  id int primary key default 1,
  x_webhook_url text,
  auto_post_enabled boolean not null default false,
  min_viral_score int not null default 75,
  updated_at timestamptz not null default now()
);
-- GRANTs + RLS: anon read of a redacted view or authenticated-only; write via server fn only
```

### 2. Webhook payload we send

Per story, one POST:

```json
{
  "id": "uuid",
  "tweet_text": "BREAKING: ...\n\n...",
  "image_url": "https://source.com/photo.jpg",
  "source_url": "https://source.com/article",
  "source": "Punch",
  "region": "nigeria",
  "category": "Politics",
  "viral_score": 84
}
```

Your Make/n8n scenario:
- Make.com: Webhook trigger → HTTP module to download `image_url` → X "Upload media" → X "Create a post" with `tweet_text` + media ID. Free tier = 1,000 ops/month; each post ~3 ops → ~330 posts/month.
- n8n: Webhook node → HTTP Request (download image) → X node (post with media). Unlimited on self-host.

### 3. New server route — `POST /api/public/auto-post`

Called by pg_cron every 15 min. Logic:
1. Read `app_settings`. If `auto_post_enabled=false` or no `x_webhook_url`, exit.
2. Query `news_items` where `posted_at is null` and `viral_score >= min_viral_score`, ordered by `viral_score desc, published_at desc`. Take top **1 per region** (nigeria/africa/america) per run → ~12 posts/hour max, ~288/day cap; in practice far fewer since only high-score items qualify.
3. For each item: POST payload to `x_webhook_url`. On 2xx → set `posted_at=now()`. On error → store `post_error`, leave `posted_at` null (auto-retry next run).
4. Return `{ posted: N, skipped: M, errors: [...] }`.

Route lives at `src/routes/api/public/auto-post.ts`, uses `supabaseAdmin` inside the handler. Public prefix bypasses auth; the webhook URL itself is the shared secret.

### 4. Cron

Extend the existing 15-min cron (or add a second job) to also hit `/api/public/auto-post` after `/api/public/refresh-feeds`, so fresh curated stories can post in the same cycle.

```sql
select cron.schedule(
  'auto-post-x', '*/15 * * * *',
  $$ select net.http_post(
       url:='https://project--92a0d9a7-d9cc-4e1e-ba81-56d0e5a53030.lovable.app/api/public/auto-post',
       headers:='{"Content-Type":"application/json"}'::jsonb,
       body:='{}'::jsonb
     ); $$
);
```

### 5. Settings UI

Small admin panel at `/settings` (or inline on `/`) with:
- Webhook URL input (paste from Make.com or your n8n instance)
- Toggle: Auto-post enabled
- Min viral score slider (default 75)
- "Send test post" button that fires a sample payload so you verify the scenario before turning auto-post on
- Recent post log: last 20 items with status (posted / pending / error)

Writes go through an authenticated server fn; reads via server fn too so the URL isn't exposed to anon.

### 6. Fallbacks & safety

- If webhook returns non-2xx, we don't mark posted → next run retries automatically.
- Same-story dedupe: `posted_at is null` filter guarantees no double-post.
- If AI fallback produced a weak tweet (score 60 default), it won't meet the 75 threshold — nothing posts until real AI curation runs.
- Manual "Post now" button on each `NewsCard` fires the same webhook for that one item (opt-in for lower-score gems).

### Technical section

- `Make.com` free plan: 1,000 ops/month, 15-min minimum polling but our webhook is push so that limit doesn't apply. `n8n` self-host = free/unlimited.
- Both platforms provide the X OAuth handshake in their UI — you connect your X account once, we never touch tokens.
- No new secrets needed in Lovable (webhook URL is stored in DB via UI). Optional `X_WEBHOOK_URL` env var supported as override if you'd rather not use the settings table.

### What I need from you to build

Just approve the plan. You'll paste the webhook URL later once you set up the Make/n8n scenario — no credentials needed upfront.
