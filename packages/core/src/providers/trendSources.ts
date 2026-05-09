import type { TrendSource } from "../domain/interfaces.js";
import type { JsonValue, TrendObservation } from "../domain/types.js";
import { normalizePhrase, slugify } from "../meme/text.js";

export class StaticTrendSource implements TrendSource {
  constructor(
    readonly name: string,
    private readonly observations: TrendObservation[]
  ) {}

  async fetchObservations(): Promise<TrendObservation[]> {
    return this.observations;
  }
}

export class GoogleTrendsRssSource implements TrendSource {
  readonly name = "google-trends-rss";

  constructor(private readonly url = "https://trends.google.com/trends/trendingsearches/daily/rss?geo=US") {}

  async fetchObservations(signal?: AbortSignal): Promise<TrendObservation[]> {
    const xml = await fetchText(this.url, signal);
    return parseRssItems(xml).map((item, index) => ({
      id: `${this.name}:${slugify(item.title)}:${item.pubDate?.getTime() ?? index}`,
      source: this.name,
      phrase: item.title,
      observedAt: item.pubDate ?? new Date(),
      url: item.link,
      title: item.title,
      summary: item.description,
      traffic: parseTraffic(item.extra["ht:approx_traffic"] ?? item.extra.approx_traffic),
      weight: 1,
      geo: "US",
      raw: item as unknown as JsonValue
    }));
  }
}

export class RssTrendSource implements TrendSource {
  constructor(
    readonly name: string,
    private readonly urls: string[],
    private readonly weight = 0.7
  ) {}

  async fetchObservations(signal?: AbortSignal): Promise<TrendObservation[]> {
    const allItems = (await Promise.all(this.urls.map(async (url) => parseRssItems(await fetchText(url, signal))))).flat();
    return allItems.map((item, index) => ({
      id: `${this.name}:${slugify(item.title)}:${item.pubDate?.getTime() ?? index}`,
      source: this.name,
      phrase: item.title,
      observedAt: item.pubDate ?? new Date(),
      url: item.link,
      title: item.title,
      summary: item.description,
      weight: this.weight,
      raw: item as unknown as JsonValue
    }));
  }
}

export class GdeltDocTrendSource implements TrendSource {
  readonly name = "gdelt-doc";

  constructor(private readonly query = "(viral OR meme OR tiktok OR internet OR celebrity OR election OR animal OR AI)") {}

  async fetchObservations(signal?: AbortSignal): Promise<TrendObservation[]> {
    const params = new URLSearchParams({
      query: this.query,
      mode: "ArtList",
      format: "json",
      timespan: "24h",
      maxrecords: "50"
    });
    const response = await fetch(`https://api.gdeltproject.org/api/v2/doc/doc?${params.toString()}`, { signal });
    if (!response.ok) return [];
    const raw = (await response.json()) as GdeltResponse;
    return (raw.articles ?? []).map((article, index) => ({
      id: `${this.name}:${slugify(article.title ?? "untitled")}:${article.seendate ?? index}`,
      source: this.name,
      phrase: article.title ?? "",
      observedAt: parseGdeltDate(article.seendate) ?? new Date(),
      url: article.url,
      title: article.title,
      summary: article.domain,
      weight: 0.8,
      raw: article as unknown as JsonValue
    }));
  }
}

export class WikimediaPageviewsTrendSource implements TrendSource {
  readonly name = "wikimedia-pageviews";

  constructor(private readonly pageTitles: string[]) {}

  async fetchObservations(signal?: AbortSignal): Promise<TrendObservation[]> {
    const end = new Date();
    const start = new Date(end.getTime() - 2 * 24 * 60 * 60 * 1000);
    const results = await Promise.all(this.pageTitles.map((title) => this.fetchPage(title, start, end, signal)));
    return results.filter((item): item is TrendObservation => Boolean(item));
  }

  private async fetchPage(title: string, start: Date, end: Date, signal?: AbortSignal): Promise<TrendObservation | null> {
    const encoded = encodeURIComponent(title.replace(/\s+/g, "_"));
    const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${encoded}/daily/${formatDay(
      start
    )}/${formatDay(end)}`;
    const response = await fetch(url, { signal, headers: { "User-Agent": "moonshot-paper-trader/0.1" } });
    if (!response.ok) return null;
    const raw = (await response.json()) as WikimediaPageviewsResponse;
    const views = raw.items?.reduce((sum, item) => sum + item.views, 0) ?? 0;
    return {
      id: `${this.name}:${slugify(title)}:${formatDay(end)}`,
      source: this.name,
      phrase: title,
      observedAt: end,
      url: `https://en.wikipedia.org/wiki/${encoded}`,
      title,
      traffic: views,
      weight: views > 100_000 ? 1 : views > 25_000 ? 0.75 : 0.4,
      raw: raw as unknown as JsonValue
    };
  }
}

interface RssItem {
  title: string;
  link?: string;
  description?: string;
  pubDate?: Date;
  extra: Record<string, string>;
}

interface GdeltResponse {
  articles?: Array<{ title?: string; url?: string; domain?: string; seendate?: string }>;
}

interface WikimediaPageviewsResponse {
  items?: Array<{ views: number }>;
}

async function fetchText(url: string, signal?: AbortSignal): Promise<string> {
  const response = await fetch(url, { signal, headers: { "User-Agent": "moonshot-paper-trader/0.1" } });
  if (!response.ok) return "";
  return response.text();
}

function parseRssItems(xml: string): RssItem[] {
  return [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((match) => {
    const itemXml = match[0];
    const extra: Record<string, string> = {};
    for (const tag of [...itemXml.matchAll(/<([a-z0-9:_-]+)\b[^>]*>([\s\S]*?)<\/\1>/gi)]) {
      extra[tag[1]] = stripXml(tag[2]);
    }
    const title = extra.title ?? "";
    return {
      title: normalizePhrase(title) || stripXml(title),
      link: extra.link,
      description: extra.description,
      pubDate: extra.pubDate ? new Date(extra.pubDate) : undefined,
      extra
    };
  });
}

function stripXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseTraffic(value?: string): number | undefined {
  if (!value) return undefined;
  const normalized = value.replace(/,/g, "").trim().toUpperCase();
  const match = normalized.match(/^([0-9.]+)\s*([KMB])?\+?$/);
  if (!match) return undefined;
  const base = Number(match[1]);
  const multiplier = match[2] === "B" ? 1_000_000_000 : match[2] === "M" ? 1_000_000 : match[2] === "K" ? 1_000 : 1;
  return base * multiplier;
}

function parseGdeltDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const match = value.match(/^(\d{4})(\d{2})(\d{2})T?(\d{2})?(\d{2})?(\d{2})?/);
  if (!match) return undefined;
  return new Date(
    Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4] ?? 0),
      Number(match[5] ?? 0),
      Number(match[6] ?? 0)
    )
  );
}

function formatDay(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}
