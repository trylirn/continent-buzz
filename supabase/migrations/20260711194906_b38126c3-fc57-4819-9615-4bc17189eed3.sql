
CREATE TABLE public.news_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  url text NOT NULL UNIQUE,
  source text NOT NULL,
  title text NOT NULL,
  tweet_text text NOT NULL,
  image_url text,
  region text NOT NULL CHECK (region IN ('nigeria','africa','america')),
  category text NOT NULL,
  viral_score int NOT NULL DEFAULT 0,
  published_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_news_region_published ON public.news_items (region, published_at DESC);
CREATE INDEX idx_news_category ON public.news_items (category);

GRANT SELECT ON public.news_items TO anon, authenticated;
GRANT ALL ON public.news_items TO service_role;
ALTER TABLE public.news_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read news" ON public.news_items FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.currency_rates (
  id int PRIMARY KEY DEFAULT 1,
  usd numeric,
  gbp numeric,
  eur numeric,
  cad numeric,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (id = 1)
);
GRANT SELECT ON public.currency_rates TO anon, authenticated;
GRANT ALL ON public.currency_rates TO service_role;
ALTER TABLE public.currency_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read rates" ON public.currency_rates FOR SELECT TO anon, authenticated USING (true);
