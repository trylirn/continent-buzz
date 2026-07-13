ALTER TABLE public.news_items ADD COLUMN IF NOT EXISTS posted_at timestamptz;
ALTER TABLE public.news_items ADD COLUMN IF NOT EXISTS post_error text;
CREATE INDEX IF NOT EXISTS news_items_unposted_idx ON public.news_items (region, viral_score DESC, published_at DESC) WHERE posted_at IS NULL;