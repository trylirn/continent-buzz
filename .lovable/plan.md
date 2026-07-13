
## Two things to do

### Part A — Code change (I'll do this)

Limit auto-posting to Nigeria only for now. When you're ready to add Africa/America, we just flip a setting.

**Edit `src/routes/api/public/auto-post.ts`:**
- Change the regions list from `["nigeria", "africa", "america"]` to `["nigeria"]`.
- Everything else stays the same — Africa and America stories still show on the site, they just don't get tweeted.

**Edit `src/components/NewsCard.tsx`:**
- Hide the "Post to X now" button on Africa and America cards (only show it on Nigeria cards). This prevents you from accidentally sending non-Nigeria stories to your Nigeria X account.

That's the only code change. One line of logic. No new secrets, no new tables.

---

### Part B — Finish your Make.com scenario (you do this, I'll walk you through it)

Right now you have **one** module: the Webhook. You need **two more** modules after it. Here's exactly what to click.

#### Step 1 — Save what you have and grab data

1. In the Webhook panel that's open in your screenshot, click **Save** (bottom right, purple button).
2. The panel closes. You'll see a message: "Successfully determined" or "Waiting for data".
3. Open a new browser tab, go to your news site: <https://continent-buzz.lovable.app/nigeria>
4. Find any Nigeria story and click the blue **"Post to X now"** button on the card.
5. Go back to Make.com. It should now say **"Successfully determined"** — this means Make received a sample from your site and now knows what fields to expect (tweet_text, image_url, etc.).

*If nothing arrives:* wait 30 seconds, then click **"Redetermine data structure"** on the Webhook module and try the button again.

#### Step 2 — Add the HTTP module (downloads the image)

1. Hover over the right edge of the Webhooks circle. A **"+"** appears — click it.
2. In the search box, type **HTTP** and pick the **HTTP** app.
3. Choose the action **"Get a file"**.
4. In the URL field, click it once. A small panel opens on the right showing the fields from your webhook. Click **`image_url`** — it should insert as a purple bubble in the URL field.
5. Leave everything else default. Click **OK**.

#### Step 3 — Add the X (Twitter) module

1. Hover over the right edge of the new HTTP circle. Click the **"+"**.
2. Search **X** (or **Twitter**). Pick the app named **X** or **Twitter**.
3. Choose the action **"Create a Post"**.
4. **Connection** dropdown → click **"Add"** → **"Add a connection"**. A popup opens asking you to sign in to X.
   - **This is where you choose which X account.** Log out of X in another tab first if you're logged into the wrong account, then log in with the account you want tweets posted from. Approve the Make.com app.
   - The connection will be saved with a name like "My X connection" — you can rename it "Nigeria News" for clarity.
5. Back in the module settings:
   - **Text** field → click it, then click **`tweet_text`** from the field panel on the right.
   - **Media** section → expand it → **Media** field → click it → click **"Data"** from the HTTP module's output (this is the downloaded image).
   - Optionally set **File name** → click **`id`** + type `.jpg` after it (so filenames look like `abc123.jpg`).
6. Click **OK**.

#### Step 4 — Turn the scenario on

1. Bottom left of the Make.com screen, there's a big **toggle switch** that says **"OFF"** in grey.
2. Click it. It should turn green and say **"ON"**.
3. That's it. Every 15 minutes our system will send Nigeria's top viral story, and Make.com will download the image and post it to X.

#### Step 5 — Test end-to-end right now

1. On the news site, click **"Post to X now"** on any Nigeria card.
2. Wait 5–10 seconds.
3. Check your X account — the tweet with image should appear.
4. Back in Make.com, click **"History"** (clock icon, bottom toolbar) to see the run log. Green = success, red = error (hover to see why).

---

### If something breaks

- **Tweet posts but no image** → in Step 2, make sure you picked **"Get a file"**, not "Make a request". And in Step 3, the Media field must map to HTTP's **"Data"** output, not "URL".
- **"401 Unauthorized" from X** → your X connection expired or you approved the wrong account. In X module → Connection → click the pencil → Reconnect.
- **"Text too long"** → shouldn't happen (we cap at 275 chars), but if it does tell me and I'll tighten the AI prompt further.
- **Duplicate posts** → won't happen. Once a story is posted, our system marks it and never sends it again.

---

### What I'll change in code once you approve

Just the two small edits in Part A above. Two files. Then Nigeria-only auto-posting is locked in, and adding Africa/America later means adding two more Make.com scenarios (one per X account) and re-enabling those regions in one line of code.
