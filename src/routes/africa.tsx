import { createFileRoute } from "@tanstack/react-router";
import { NewsFeed } from "@/components/NewsFeed";

export const Route = createFileRoute("/africa")({
  head: () => ({
    meta: [
      { title: "Africa Pulse — Continental News, Tweet-Ready" },
      { name: "description", content: "The stories moving Africa right now: politics, xenophobia, AFCON, currency, disaster, breakthroughs. Every card copies as a Twitter thread." },
      { property: "og:title", content: "Africa Pulse — Viral News from the Continent" },
      { property: "og:description", content: "Viral African stories curated for X." },
    ],
  }),
  component: AfricaPage,
});

function AfricaPage() {
  return (
    <NewsFeed
      region="africa"
      title="Africa Pulse"
      subtitle="The continent's biggest and most shareable stories, curated for social."
    />
  );
}
