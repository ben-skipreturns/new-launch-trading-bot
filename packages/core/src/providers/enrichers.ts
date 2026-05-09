import type { Enricher } from "../domain/interfaces.js";
import type { JsonValue, TokenEnrichment, TokenLaunch } from "../domain/types.js";
import { clamp } from "../utils/math.js";

export class CompositeEnricher implements Enricher {
  readonly name = "composite";

  constructor(private readonly enrichers: Enricher[]) {}

  async enrich(launch: TokenLaunch, signal?: AbortSignal): Promise<TokenEnrichment | null> {
    const results = (await Promise.all(this.enrichers.map((enricher) => safeEnrich(enricher, launch, signal)))).filter(Boolean);
    if (results.length === 0) return null;
    return mergeEnrichments(launch.mint, results as TokenEnrichment[]);
  }
}

export class StaticFixtureEnricher implements Enricher {
  readonly name = "fixture";

  constructor(private readonly values: Record<string, Partial<TokenEnrichment>>) {}

  async enrich(launch: TokenLaunch): Promise<TokenEnrichment | null> {
    const value = this.values[launch.mint];
    if (!value) return null;
    return {
      mint: launch.mint,
      observedAt: value.observedAt ?? launch.createdAt,
      provider: "fixture",
      sentimentKeywords: value.sentimentKeywords ?? [],
      socialLinks: value.socialLinks ?? {},
      raw: value.raw ?? {},
      ...value
    };
  }
}

export class DexScreenerEnricher implements Enricher {
  readonly name = "dexscreener";

  async enrich(launch: TokenLaunch, signal?: AbortSignal): Promise<TokenEnrichment | null> {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${launch.mint}`, { signal });
    if (!response.ok) return null;
    const raw = (await response.json()) as DexScreenerResponse;
    const pair = raw.pairs?.find((item) => item.chainId === "solana") ?? raw.pairs?.[0];
    if (!pair) return null;
    return {
      mint: launch.mint,
      observedAt: new Date(),
      provider: this.name,
      priceSol: pair.priceNative ? Number(pair.priceNative) : undefined,
      priceUsd: pair.priceUsd ? Number(pair.priceUsd) : undefined,
      liquidityUsd: pair.liquidity?.usd,
      sentimentKeywords: extractKeywords(`${pair.baseToken?.name ?? ""} ${pair.baseToken?.symbol ?? ""}`),
      socialLinks: linksFromInfo(pair.info),
      raw: raw as JsonValue
    };
  }
}

export class JupiterPriceEnricher implements Enricher {
  readonly name = "jupiter";

  async enrich(launch: TokenLaunch, signal?: AbortSignal): Promise<TokenEnrichment | null> {
    const response = await fetch(`https://lite-api.jup.ag/price/v2?ids=${launch.mint}`, { signal });
    if (!response.ok) return null;
    const raw = (await response.json()) as JupiterPriceResponse;
    const item = raw.data?.[launch.mint];
    if (!item) return null;
    return {
      mint: launch.mint,
      observedAt: new Date(),
      provider: this.name,
      priceUsd: item.price ? Number(item.price) : undefined,
      sentimentKeywords: [],
      socialLinks: {},
      raw: raw as JsonValue
    };
  }
}

export class BirdeyeEnricher implements Enricher {
  readonly name = "birdeye";

  constructor(private readonly apiKey = process.env.BIRDEYE_API_KEY) {}

  async enrich(launch: TokenLaunch, signal?: AbortSignal): Promise<TokenEnrichment | null> {
    if (!this.apiKey) return null;
    const response = await fetch(`https://public-api.birdeye.so/defi/v3/token/holder?address=${launch.mint}`, {
      signal,
      headers: {
        "X-API-KEY": this.apiKey,
        "x-chain": "solana"
      }
    });
    if (!response.ok) return null;
    const raw = (await response.json()) as BirdeyeHolderResponse;
    const holders = raw.data?.items ?? [];
    const total = holders.reduce((sum, holder) => sum + Number(holder.amount ?? 0), 0);
    const topHolderShare = total > 0 ? Number(holders[0]?.amount ?? 0) / total : undefined;
    return {
      mint: launch.mint,
      observedAt: new Date(),
      provider: this.name,
      holderCount: raw.data?.total,
      topHolderShare,
      devHoldingShare: clamp(topHolderShare ?? 0, 0, 1),
      sentimentKeywords: [],
      socialLinks: {},
      raw: raw as JsonValue
    };
  }
}

export class GeckoTerminalEnricher implements Enricher {
  readonly name = "geckoterminal";

  async enrich(launch: TokenLaunch, signal?: AbortSignal): Promise<TokenEnrichment | null> {
    const response = await fetch(`https://api.geckoterminal.com/api/v2/networks/solana/tokens/${launch.mint}/pools`, { signal });
    if (!response.ok) return null;
    const raw = (await response.json()) as GeckoPoolsResponse;
    const pool = raw.data?.[0]?.attributes;
    if (!pool) return null;
    return {
      mint: launch.mint,
      observedAt: new Date(),
      provider: this.name,
      priceUsd: pool.base_token_price_usd ? Number(pool.base_token_price_usd) : undefined,
      liquidityUsd: pool.reserve_in_usd ? Number(pool.reserve_in_usd) : undefined,
      sentimentKeywords: extractKeywords(pool.name ?? ""),
      socialLinks: {},
      raw: raw as JsonValue
    };
  }
}

async function safeEnrich(enricher: Enricher, launch: TokenLaunch, signal?: AbortSignal): Promise<TokenEnrichment | null> {
  try {
    return await enricher.enrich(launch, signal);
  } catch {
    return null;
  }
}

function mergeEnrichments(mint: string, enrichments: TokenEnrichment[]): TokenEnrichment {
  return enrichments.reduce<TokenEnrichment>(
    (merged, current) => ({
      mint,
      observedAt: current.observedAt > merged.observedAt ? current.observedAt : merged.observedAt,
      provider: `${merged.provider}+${current.provider}`,
      priceSol: current.priceSol ?? merged.priceSol,
      priceUsd: current.priceUsd ?? merged.priceUsd,
      liquidityUsd: Math.max(merged.liquidityUsd ?? 0, current.liquidityUsd ?? 0) || undefined,
      holderCount: Math.max(merged.holderCount ?? 0, current.holderCount ?? 0) || undefined,
      topHolderShare: current.topHolderShare ?? merged.topHolderShare,
      devHoldingShare: current.devHoldingShare ?? merged.devHoldingShare,
      insiderShare: current.insiderShare ?? merged.insiderShare,
      bundlerShare: current.bundlerShare ?? merged.bundlerShare,
      sniperShare: current.sniperShare ?? merged.sniperShare,
      organicScore: current.organicScore ?? merged.organicScore,
      sentimentKeywords: [...new Set([...merged.sentimentKeywords, ...current.sentimentKeywords])],
      socialLinks: { ...merged.socialLinks, ...current.socialLinks },
      raw: { merged: merged.raw, current: current.raw } as JsonValue
    }),
    {
      mint,
      observedAt: enrichments[0]?.observedAt ?? new Date(),
      provider: "merged",
      sentimentKeywords: [],
      socialLinks: {},
      raw: {}
    }
  );
}

function extractKeywords(text: string): string[] {
  const watchlist = ["ai", "trump", "fed", "election", "roaring", "cat", "dog", "gme", "sol", "btc", "eth", "nvidia"];
  const lower = text.toLowerCase();
  return watchlist.filter((word) => lower.includes(word));
}

function linksFromInfo(info: DexPair["info"]): Record<string, string> {
  const links: Record<string, string> = {};
  for (const website of info?.websites ?? []) {
    if (website.url) links[website.label ?? "website"] = website.url;
  }
  for (const social of info?.socials ?? []) {
    if (social.url) links[social.type ?? "social"] = social.url;
  }
  return links;
}

interface DexScreenerResponse {
  pairs?: DexPair[];
}

interface DexPair {
  chainId?: string;
  priceNative?: string;
  priceUsd?: string;
  liquidity?: { usd?: number };
  baseToken?: { name?: string; symbol?: string };
  info?: {
    websites?: Array<{ label?: string; url?: string }>;
    socials?: Array<{ type?: string; url?: string }>;
  };
}

interface JupiterPriceResponse {
  data?: Record<string, { price?: string }>;
}

interface BirdeyeHolderResponse {
  data?: {
    total?: number;
    items?: Array<{ amount?: string | number }>;
  };
}

interface GeckoPoolsResponse {
  data?: Array<{
    attributes?: {
      name?: string;
      base_token_price_usd?: string;
      reserve_in_usd?: string;
    };
  }>;
}
