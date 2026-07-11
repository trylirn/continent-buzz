import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getNews } from "@/lib/news.functions";
import { NewsCard, type NewsItem } from "@/components/NewsCard";
import { REGIONS, type Region } from "@/lib/regions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "The Wire — Africa, Nigeria & US News, Ready for X" },
      {
        name: "description",
        content:
          "AI-curated viral news from Nigeria, Africa and America. Every story comes tweet-ready — copy, paste, thread the source.",
      },
      { property: "og:title", content: "The Wire — Africa, Nigeria & US News" },
      {
        property: "og:description",
        content: "AI-curated viral news, ready to post as a Twitter thread.",
      },
    ],
  }),
  component: Home,
});

function Section({ region }: { region: Region }) {
  const meta = REGIONS[region];
  const { data } = useQuery({
    queryKey: ["news", region, "All", "home"],
    queryFn: () => getNews({ data: { region, limit: 6 } }),
  });
  const items = (data?.items ?? []) as NewsItem[];
  return (
    <section className="mb-12">
      <div className="mb-4 flex items-end justify-between">
        <h2 className="text-2xl font-black tracking-tight">{meta.label}</h2>
        <Link to={meta.path} className="text-sm font-semibold text-muted-foreground hover:text-foreground">
          See all →
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No stories yet. Refresh from the region page.</p>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {items.slice(0, 3).map((item) => (
            <NewsCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </section>
  );
}

function Home() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-10 rounded-xl border border-border bg-gradient-to-br from-foreground to-foreground/80 p-8 text-background">
        <p className="text-xs font-bold uppercase tracking-widest text-red-400">Live Wire</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-5xl">
          Viral news from Africa, ready for X.
        </h1>
        <p className="mt-3 max-w-2xl text-sm opacity-80 sm:text-base">
          Every headline is filtered by AI for what actually goes viral in Nigeria and across Africa — corruption, breaking politics,
          security, celebrity scandal, currency shocks, human-interest wins. Each card copies as a tweet-ready thread.
        </p>
      </div>
      <Section region="nigeria" />
      <Section region="africa" />
      <Section region="america" />
    </div>
  );
}
