import { createFileRoute } from "@tanstack/react-router";
import { NewsFeed } from "@/components/NewsFeed";

export const Route = createFileRoute("/america")({
  head: () => ({
    meta: [
      { title: "America Stories — US News, Tweet-Ready" },
      { name: "description", content: "The US stories worth posting: politics, scandal, economy, viral moments. Every card copies as a Twitter thread." },
      { property: "og:title", content: "America Stories — Viral US News" },
      { property: "og:description", content: "US news curated for X." },
    ],
  }),
  component: AmericaPage,
});

function AmericaPage() {
  return (
    <NewsFeed
      region="america"
      title="America Stories"
      subtitle="US news, filtered to what actually breaks through on X."
    />
  );
}
