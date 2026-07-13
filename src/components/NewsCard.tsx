import { useState } from "react";
import { Copy, Check, Link2, Download, ExternalLink, Send } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { proxyImage, postToX } from "@/lib/news.functions";

import { REGIONS, type Region } from "@/lib/regions";

export type NewsItem = {
  id: string;
  url: string;
  source: string;
  title: string;
  tweet_text: string;
  image_url: string | null;
  region: string;
  category: string;
  viral_score: number;
  published_at: string;
  posted_at?: string | null;
  post_error?: string | null;
};


async function copy(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  } catch {
    toast.error("Copy failed");
  }
}

export function NewsCard({ item }: { item: NewsItem }) {
  const [downloading, setDownloading] = useState(false);
  const region = REGIONS[item.region as Region];
  const sourceBlock = `Source: ${item.source}\n${item.url}`;
  const threadBlock = `${item.tweet_text}\n\n---\n${sourceBlock}`;
  const timeAgo = (() => {
    try {
      return formatDistanceToNow(new Date(item.published_at), { addSuffix: true });
    } catch {
      return "";
    }
  })();

  async function download() {
    if (!item.image_url) return;
    setDownloading(true);
    try {
      const { dataUrl } = await proxyImage({ data: { url: item.image_url } });
      if (!dataUrl) {
        toast.error("Image unavailable");
        return;
      }
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `news-${item.id}.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success("Image downloaded — attach it on X");
    } catch {
      toast.error("Download failed");
    } finally {
      setDownloading(false);
    }
  }

  const isBreaking = /^(BREAKING|JUST IN)/i.test(item.tweet_text);

  return (
    <article className="group overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-shadow hover:shadow-md">
      {item.image_url && (
        <div className="relative aspect-[16/9] w-full overflow-hidden bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.image_url}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
            onError={(e) => {
              (e.currentTarget.parentElement as HTMLElement).style.display = "none";
            }}
          />
        </div>
      )}
      <div className="p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          {region && (
            <span className={`${region.accent} rounded px-2 py-0.5 font-bold uppercase tracking-wide text-white`}>
              {region.label.split(" ")[0] === "Latest" ? "Nigeria" : region.label.split(" ")[0]}
            </span>
          )}
          <span className="rounded bg-muted px-2 py-0.5 font-semibold uppercase tracking-wide text-muted-foreground">
            {item.category}
          </span>
          {isBreaking && (
            <span className="rounded bg-red-600 px-2 py-0.5 font-black uppercase tracking-wider text-white animate-pulse">
              LIVE
            </span>
          )}
          <span className="ml-auto text-muted-foreground">
            {item.source} · {timeAgo}
          </span>
        </div>

        <p className="whitespace-pre-line text-[15px] leading-relaxed text-foreground">
          {item.tweet_text}
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <button
            onClick={() => copy(item.tweet_text, "Tweet")}
            className="inline-flex items-center justify-center gap-1.5 rounded-md bg-foreground px-3 py-2 text-sm font-semibold text-background transition-opacity hover:opacity-90"
          >
            <Copy className="h-3.5 w-3.5" /> Copy Tweet
          </button>
          <button
            onClick={() => copy(sourceBlock, "Source thread")}
            className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-sm font-semibold hover:bg-muted"
          >
            <Link2 className="h-3.5 w-3.5" /> Copy Source
          </button>
          <button
            onClick={() => copy(threadBlock, "Thread")}
            className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-sm font-semibold hover:bg-muted"
          >
            <Check className="h-3.5 w-3.5" /> Copy Both
          </button>
          {item.image_url ? (
            <button
              onClick={download}
              disabled={downloading}
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" /> {downloading ? "…" : "Image"}
            </button>
          ) : (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-sm font-semibold hover:bg-muted"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Source
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
