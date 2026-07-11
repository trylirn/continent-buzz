import { createFileRoute } from "@tanstack/react-router";
import { NewsFeed } from "@/components/NewsFeed";
import { NairaStrip } from "@/components/NairaStrip";

export const Route = createFileRoute("/nigeria")({
  head: () => ({
    meta: [
      { title: "Latest in Nigeria — Viral News, Tweet-Ready" },
      { name: "description", content: "Breaking Nigerian news curated for virality: politics, security, currency, corruption, sports, quotes. Copy any story as a Twitter thread." },
      { property: "og:title", content: "Latest in Nigeria — Viral News" },
      { property: "og:description", content: "Breaking Nigerian news, curated for X." },
    ],
  }),
  component: NigeriaPage,
});

function NigeriaPage() {
  return (
    <>
      <NairaStrip />
      <NewsFeed
        region="nigeria"
        title="Latest in Nigeria"
        subtitle="Breaking, politics, security, currency, quotes — the wire never sleeps."
      />
    </>
  );
}
