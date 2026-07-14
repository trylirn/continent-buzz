## Answering your two questions first

### 1. Is your Channel ID `LatestINigeria`?

**No.** `LatestINigeria` is just the display name (nickname) of your X channel in Buffer. The real Channel ID is a long random string of letters and numbers, like `6712abc9f4e2d1a8b3c45678`.

**How to find it:**
1. Go to <https://publish.buffer.com/developers/api>
2. Scroll to the **"Channels"** (or **"Profiles"**) section — it lists each connected account.
3. Next to **LatestINigeria** you'll see an **ID** field. Copy that long string. That's what I need.

### 2. Do you need to do anything to hit 1–2 posts per hour?

**Yes — two small things**, and then it's fully automatic.

**How Buffer posting works (important to understand):**
- Buffer has two modes: **"Add to Queue"** (posts at your scheduled slots) or **"Share Now"** (posts immediately, ignoring the schedule).
- The schedule in your screenshot only matters for **queued** posts.

**We'll use "Share Now" mode** — meaning our system posts *immediately* whenever it fires, and Buffer's schedule/slots become irrelevant. This gives us full control over timing from our side.

**What you do in Buffer:**
- **Nothing.** You can leave the posting schedule as-is (or even delete all the slots) — it won't matter. We're bypassing it.

**What I do in code:**
- Change the auto-post cron to run **every 30 minutes** instead of every 15 (currently every 15). That gives up to **2 posts per hour = 48/day max**.
- Since we still want a reasonable daily cap, I'll set it to **24 posts/day** (1 per hour average). If you'd rather have a hard cap of 20 like before, just say the word.
- Each cron cycle: pick the top-viral unposted Nigeria story, send to Buffer with `now=true`, mark it posted. Skip cycle if there's no fresh story or we've hit today's cap.

---

## Updated full plan

### Part A — You do in Buffer (2 min)

1. Confirm **LatestINigeria** X channel is connected in Buffer ✅ (done, per screenshot).
2. Go to <https://publish.buffer.com/developers/api>.
3. **Create Access Token** → copy the token string.
4. In the **Channels** section, copy the **ID** next to LatestINigeria.
5. Say "go" — I'll open the secure form for you to paste both values.

### Part B — I do in code

1. **Add two secrets** (via secure form): `BUFFER_ACCESS_TOKEN`, `BUFFER_CHANNEL_ID_NIGERIA`.
2. **Rewrite `postToX`** in `src/lib/news.functions.ts` to call Buffer's API directly (`POST https://api.bufferapp.com/1/updates/create.json`) with the tweet text, image URL, and channel ID, `now=true`. Save Buffer's post ID on success; save error message on failure.
3. **Rewrite `src/routes/api/public/auto-post.ts`** to:
   - Count Nigeria posts in the last 24h. If `>= 24`, exit silently.
   - Otherwise pick the top-viral unposted Nigeria story and send to Buffer.
4. **Update the cron schedule** from every 15 min to every 30 min.
5. **Retire `X_WEBHOOK_URL`** — code no longer reads it. You can delete the Make.com scenario anytime after this ships.

### Part C — Test

1. Click **"Post to X now"** on any Nigeria card.
2. Within 5 seconds it should appear on your X account.
3. The 30-minute cron takes it from there automatically.

---

## Technical details (skip if you like)

- Endpoint: `POST https://api.bufferapp.com/1/updates/create.json`, form-encoded: `text`, `profile_ids[]`, `media[photo]`, `now=true`. Auth: `Authorization: Bearer $BUFFER_ACCESS_TOKEN`.
- Daily cap query: `select count(*) from news_items where region='nigeria' and posted_at > now() - interval '24 hours'`. Skip if `>= 24`.
- Cron: update `cron.schedule` interval in the pg_cron job from `*/15 * * * *` to `*/30 * * * *`.
- Files touched: `src/lib/news.functions.ts`, `src/routes/api/public/auto-post.ts`, one SQL update to reschedule the cron. No schema changes.

Approve and I'll start with the secrets form.