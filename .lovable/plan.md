## Confirmed direction

You’re right: **real story images means the actual image attached to the article/story**, such as article `og:image`, `twitter:image`, or in-article media. It does **not** mean the publisher/source logo. Logos should be rejected and cleared if no article image is found.

## Implementation plan

1. **Permanently fix story images**
  - Rework image extraction to prioritize:
  1. article `og:image:secure_url`
  2. article `og:image`
  3. article `twitter:image`
  4. article body image candidates
  5. RSS image only if it is clearly not a logo/default publisher image
    d stronger logo/source-image rejection for Punch and other outlets:
    reject URLs containing logo/brand/placeholder/default publisher assets
    reject known source-logo patterns even when the URL does not literally say `logo`
    normalize encoded URLs like `&amp;`
    resolve relative image URLs against the article URL
    lidate candidate images before saving or posting:
    must return an image content type
    must be publicly reachable
    must not be an obvious tiny/static publisher asset
     no real article image is found, store `null` so the UI shows no image instead of showing a source logo.
    ply this both to new refreshes and existing database rows with a backfill run.
2. **Protect manual “Post to X now” while fixing automation**
  - Keep the currently working manual button behavior.
  - Move the Buffer posting logic into a shared safe helper used by both manual and scheduled posting.
  - Only mark a story as posted when Buffer returns a clear successful post result.
  - If Buffer rejects an image URL, retry that same story without the image before failing it, so bad images do not stop automation.
  - Save clear per-story errors when Buffer still rejects a post.
3. **Make auto-posting actually run by itself**
  - Keep the cron schedule, but make the endpoint fast and reliable.
  - Process a small number of stories per run rather than doing long work in one request.
  - Keep the maximum at **30 posts per day**.
  - Avoid repeating the same source too close together.
  - Update the scheduled job call so it uses the stable backend endpoint correctly and does not falsely timeout after 5 seconds.
  - Make the auto-post response show exactly what happened: posted, skipped due to cap, skipped due to missing channel, failed with Buffer error, or retried without image.
4. **Add the same X posting features for Africa Pulse**
  - Show **Post to X now** on Africa and America story cards too.
  - Extend auto-posting to Nigeria, Africa independently.
  - Use separate Buffer channel IDs by region:
    - Nigeria: existing saved channel
    - Africa: `BUFFER_CHANNEL_ID_AFRICA`
  - If Africa channel IDs are not saved yet, Nigeria keeps working and those regions are skipped with a clear message.
5. **What I need from your end**
  - I can implement the code and backend job fixes.
  - You only need to provide the **Africa Buffer channel ID** if they should post to different Buffer channels/accounts.
  - I will request those through secure secret fields after implementation if they are missing; don’t paste them in chat.

## Files to update

- `src/lib/news.server.ts`
- `src/lib/news.functions.ts`
- `src/routes/api/public/auto-post.ts`
- `src/routes/api/public/refresh-feeds.ts`
- `src/routes/api/public/backfill-images.ts`
- `src/components/NewsCard.tsx`
- backend scheduled job configuration

## Safety rules

- Do not remove or break the working manual Nigeria post button.
- Do not reset or delete existing stories.
- Do not show source logos as story images.
- Do not let missing Africa/America channels break Nigeria automation.