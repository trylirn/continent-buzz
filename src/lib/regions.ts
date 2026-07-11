export type Region = "nigeria" | "africa" | "america";

export const REGIONS: Record<Region, { label: string; path: string; color: string; accent: string }> = {
  nigeria: { label: "Latest in Nigeria", path: "/nigeria", color: "#0a7d3e", accent: "bg-emerald-600" },
  africa: { label: "Africa Pulse", path: "/africa", color: "#b45309", accent: "bg-amber-600" },
  america: { label: "America Stories", path: "/america", color: "#1d4ed8", accent: "bg-blue-700" },
};

export const CATEGORIES = [
  "All",
  "Breaking",
  "Politics",
  "Security",
  "Economy",
  "Sports",
  "Education",
  "Celebrity",
  "Viral",
  "Disaster",
  "Corruption",
  "Quote",
  "Tech",
] as const;
export type Category = (typeof CATEGORIES)[number];
