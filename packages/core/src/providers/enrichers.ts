import { request as httpRequest, type IncomingHttpHeaders, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { Enricher } from "../domain/interfaces.js";
import type { JsonValue, TokenEnrichment, TokenLaunch } from "../domain/types.js";

export class CompositeEnricher implements Enricher {
  readonly name = "composite";
  private readonly perProviderTimeoutMs: number;

  constructor(
    private readonly enrichers: Enricher[],
    options: CompositeEnricherOptions = {}
  ) {
    this.perProviderTimeoutMs = options.perProviderTimeoutMs ?? 3000;
  }

  async enrich(launch: TokenLaunch, signal?: AbortSignal): Promise<TokenEnrichment | null> {
    const results = (
      await Promise.all(this.enrichers.map((enricher) => safeEnrichWithTimeout(enricher, launch, this.perProviderTimeoutMs, signal)))
    ).filter(Boolean);
    if (results.length === 0) return null;
    return mergeEnrichments(launch.mint, results as TokenEnrichment[]);
  }
}

export interface CompositeEnricherOptions {
  perProviderTimeoutMs?: number;
}

interface MetadataHeaders {
  get(name: string): string | null;
}

interface MetadataHttpResponse {
  ok: boolean;
  status: number;
  headers: MetadataHeaders;
  body: string;
}

type FetchMetadata = (
  url: string,
  address: string,
  signal: AbortSignal,
  maxBytes: number
) => Promise<MetadataHttpResponse | MetadataFetchBlocked>;

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

export interface TokenMetadataEnricherOptions {
  timeoutMs?: number;
  maxBytes?: number;
  ipfsGateway?: string;
  arweaveGateway?: string;
  maxRedirects?: number;
  resolveHostname?: (hostname: string) => Promise<string[]>;
  fetchFn?: typeof fetch;
}

export class TokenMetadataEnricher implements Enricher {
  readonly name = "token-metadata-uri";
  private readonly timeoutMs: number;
  private readonly maxBytes: number;
  private readonly ipfsGateway: string;
  private readonly arweaveGateway: string;
  private readonly maxRedirects: number;
  private readonly resolveHostname: (hostname: string) => Promise<string[]>;
  private readonly fetchMetadata: FetchMetadata;

  constructor(options: TokenMetadataEnricherOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 2500;
    this.maxBytes = options.maxBytes ?? 128_000;
    this.ipfsGateway = options.ipfsGateway ?? "https://ipfs.io/ipfs/";
    this.arweaveGateway = options.arweaveGateway ?? "https://arweave.net/";
    this.maxRedirects = options.maxRedirects ?? 3;
    this.resolveHostname = options.resolveHostname ?? defaultResolveHostname;
    this.fetchMetadata = options.fetchFn
      ? (url, _address, signal, maxBytes) => fetchMetadataWithFetch(options.fetchFn as typeof fetch, url, signal, maxBytes)
      : fetchPinnedMetadata;
  }

  async enrich(launch: TokenLaunch, signal?: AbortSignal): Promise<TokenEnrichment | null> {
    const resolvedUrl = this.resolveUri(launch.uri);
    if (!launch.uri) return null;
    if (!resolvedUrl) return metadataFetchFailure(launch, { reason: "unsupported_uri_scheme" });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const abortFromParent = () => controller.abort();
    if (signal?.aborted) controller.abort();
    else signal?.addEventListener("abort", abortFromParent, { once: true });

    try {
      const response = await this.fetchWithSafeRedirects(resolvedUrl, controller.signal);
      if (response instanceof MetadataFetchBlocked) {
        return metadataFetchFailure(launch, {
          reason: response.reason,
          resolvedUrl,
          finalUrl: response.reason === "metadata_too_large" ? response.blockedUrl : undefined,
          blockedUrl: response.blockedUrl,
          redirects: response.redirects
        });
      }
      if (!response.response.ok) {
        return metadataFetchFailure(launch, {
          reason: "http_error",
          resolvedUrl,
          finalUrl: response.finalUrl,
          httpStatus: response.response.status,
          redirects: response.redirects
        });
      }
      const metadata = parseMetadataJson(response.response.body);
      if (!metadata) {
        return metadataFetchFailure(launch, {
          reason: "invalid_metadata_json",
          resolvedUrl,
          finalUrl: response.finalUrl,
          redirects: response.redirects
        });
      }

      const metadataText = metadataTextForMatching(metadata);
      return {
        mint: launch.mint,
        observedAt: new Date(),
        provider: this.name,
        sentimentKeywords: extractKeywords(metadataText),
        socialLinks: metadataSocialLinks(metadata),
        raw: {
          metadataUri: launch.uri,
          resolvedUrl,
          finalUrl: response.finalUrl,
          redirects: response.redirects,
          metadata,
          metadataText
        } as JsonValue
      };
    } catch (error) {
      return metadataFetchFailure(launch, {
        reason: error instanceof Error && error.name === "AbortError" ? "metadata_fetch_timeout" : "metadata_fetch_error",
        resolvedUrl,
        errorText: error instanceof Error ? error.message : String(error)
      });
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abortFromParent);
    }
  }

  private async fetchWithSafeRedirects(
    initialUrl: string,
    signal: AbortSignal
  ): Promise<{ response: MetadataHttpResponse; finalUrl: string; redirects: string[] } | MetadataFetchBlocked> {
    let currentUrl = initialUrl;
    const redirects: string[] = [];

    for (let redirectCount = 0; redirectCount <= this.maxRedirects; redirectCount += 1) {
      const safety = await validatePublicHttpUrl(currentUrl, this.resolveHostname);
      if (!safety.safe) return new MetadataFetchBlocked(safety.reason, currentUrl, redirects);

      const response = await this.fetchMetadata(currentUrl, safety.address, signal, this.maxBytes);
      if (response instanceof MetadataFetchBlocked) return new MetadataFetchBlocked(response.reason, response.blockedUrl, redirects);

      if (!isRedirectStatus(response.status)) return { response, finalUrl: currentUrl, redirects };

      const location = response.headers.get("location");
      if (!location) return new MetadataFetchBlocked("redirect_missing_location", currentUrl, redirects);
      if (redirectCount >= this.maxRedirects) return new MetadataFetchBlocked("too_many_redirects", currentUrl, redirects);
      currentUrl = new URL(location, currentUrl).toString();
      redirects.push(currentUrl);
    }

    return new MetadataFetchBlocked("too_many_redirects", currentUrl, redirects);
  }

  private resolveUri(uri?: string): string | null {
    if (!uri) return null;
    const trimmed = uri.trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (/^ipfs:\/\//i.test(trimmed)) return `${this.ipfsGateway}${trimmed.replace(/^ipfs:\/\//i, "").replace(/^ipfs\//i, "")}`;
    if (/^ar:\/\//i.test(trimmed)) return `${this.arweaveGateway}${trimmed.replace(/^ar:\/\//i, "")}`;
    return null;
  }
}

class MetadataFetchBlocked {
  constructor(
    readonly reason: string,
    readonly blockedUrl: string,
    readonly redirects: string[]
  ) {}
}

async function fetchMetadataWithFetch(
  fetchFn: typeof fetch,
  value: string,
  signal: AbortSignal,
  maxBytes: number
): Promise<MetadataHttpResponse | MetadataFetchBlocked> {
  const response = await fetchFn(value, {
    signal,
    redirect: "manual",
    headers: { accept: "application/json,text/plain;q=0.8,*/*;q=0.1" }
  });
  const status = typeof response.status === "number" ? response.status : response.ok ? 200 : 0;
  if (isRedirectStatus(status)) {
    return {
      ok: Boolean(response.ok),
      status,
      headers: response.headers,
      body: ""
    };
  }

  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > maxBytes) return new MetadataFetchBlocked("metadata_too_large", value, []);
  const body = await readFetchResponseBody(response, maxBytes, value);
  if (body instanceof MetadataFetchBlocked) return body;
  return {
    ok: Boolean(response.ok),
    status,
    headers: response.headers,
    body
  };
}

function fetchPinnedMetadata(
  value: string,
  address: string,
  signal: AbortSignal,
  maxBytes: number
): Promise<MetadataHttpResponse | MetadataFetchBlocked> {
  return new Promise((resolve, reject) => {
    const url = new URL(value);
    const headers = {
      accept: "application/json,text/plain;q=0.8,*/*;q=0.1",
      host: url.host
    };
    const requestOptions = {
      hostname: address,
      port: url.port ? Number(url.port) : undefined,
      path: `${url.pathname}${url.search}`,
      method: "GET",
      headers
    };
    let settled = false;
    let req: ReturnType<typeof httpRequest> | ReturnType<typeof httpsRequest> | undefined;
    const finish = (result: MetadataHttpResponse | MetadataFetchBlocked): void => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", abortRequest);
      resolve(result);
    };
    const fail = (error: unknown): void => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", abortRequest);
      reject(error);
    };
    const abortRequest = (): void => {
      req?.destroy(abortError());
    };
    const handleResponse = (res: IncomingMessage): void => {
      const status = res.statusCode ?? 0;
      const responseHeaders = headersFromIncoming(res.headers);
      const ok = status >= 200 && status < 300;
      if (isRedirectStatus(status)) {
        res.resume();
        finish({ ok, status, headers: responseHeaders, body: "" });
        return;
      }

      const contentLength = Number(responseHeaders.get("content-length") ?? 0);
      if (contentLength > maxBytes) {
        res.resume();
        finish(new MetadataFetchBlocked("metadata_too_large", value, []));
        req?.destroy();
        return;
      }

      const chunks: Buffer[] = [];
      let bytesRead = 0;
      res.on("data", (chunk: Buffer | string) => {
        if (settled) return;
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bytesRead += buffer.byteLength;
        if (bytesRead > maxBytes) {
          finish(new MetadataFetchBlocked("metadata_too_large", value, []));
          req?.destroy();
          return;
        }
        chunks.push(buffer);
      });
      res.on("end", () => {
        if (settled) return;
        finish({
          ok,
          status,
          headers: responseHeaders,
          body: Buffer.concat(chunks, bytesRead).toString("utf8")
        });
      });
      res.on("error", fail);
    };

    req =
      url.protocol === "https:"
        ? httpsRequest(
            {
              ...requestOptions,
              servername: isIP(normalizeHostname(url.hostname)) ? undefined : normalizeHostname(url.hostname)
            },
            handleResponse
          )
        : httpRequest(requestOptions, handleResponse);
    req.on("error", (error) => {
      if (settled) return;
      fail(signal.aborted ? abortError() : error);
    });
    signal.addEventListener("abort", abortRequest, { once: true });
    if (signal.aborted) abortRequest();
    else req.end();
  });
}

async function readFetchResponseBody(response: Response, maxBytes: number, blockedUrl: string): Promise<string | MetadataFetchBlocked> {
  if (response.body && typeof response.body.getReader === "function") {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytesRead = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
        bytesRead += chunk.byteLength;
        if (bytesRead > maxBytes) {
          await reader.cancel().catch(() => undefined);
          return new MetadataFetchBlocked("metadata_too_large", blockedUrl, []);
        }
        chunks.push(chunk);
      }
    } finally {
      reader.releaseLock();
    }
    return new TextDecoder().decode(concatUint8Arrays(chunks, bytesRead));
  }

  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) return new MetadataFetchBlocked("metadata_too_large", blockedUrl, []);
  return text;
}

function concatUint8Arrays(chunks: Uint8Array[], totalLength: number): Uint8Array {
  const output = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function headersFromIncoming(headers: IncomingHttpHeaders): MetadataHeaders {
  return {
    get(name: string): string | null {
      const value = headers[name.toLowerCase()];
      if (Array.isArray(value)) return value.join(", ");
      return value ?? null;
    }
  };
}

function abortError(): Error {
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}

function metadataFetchFailure(
  launch: TokenLaunch,
  details: {
    reason: string;
    resolvedUrl?: string;
    finalUrl?: string;
    blockedUrl?: string;
    httpStatus?: number;
    redirects?: string[];
    errorText?: string;
  }
): TokenEnrichment {
  return {
    mint: launch.mint,
    observedAt: new Date(),
    provider: "token-metadata-uri-failed",
    sentimentKeywords: [],
    socialLinks: {},
    raw: {
      metadataUri: launch.uri,
      status: "failed",
      ...details
    } as JsonValue
  };
}

async function validatePublicHttpUrl(
  value: string,
  resolveHostname: (hostname: string) => Promise<string[]>
): Promise<{ safe: true; address: string } | { safe: false; reason: string }> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { safe: false, reason: "invalid_url" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return { safe: false, reason: "unsupported_url_protocol" };
  if (url.username || url.password) return { safe: false, reason: "url_credentials_not_allowed" };

  const hostname = normalizeHostname(url.hostname);
  if (!hostname) return { safe: false, reason: "missing_hostname" };
  if (isBlockedHostname(hostname)) return { safe: false, reason: "blocked_hostname" };

  if (isIP(hostname)) {
    return isPublicIp(hostname) ? { safe: true, address: hostname } : { safe: false, reason: "blocked_private_ip" };
  }

  const addresses = await resolveHostname(hostname);
  if (addresses.length === 0) return { safe: false, reason: "hostname_resolution_failed" };
  if (addresses.some((address) => !isPublicIp(address))) return { safe: false, reason: "blocked_private_ip" };
  return { safe: true, address: addresses[0] };
}

async function defaultResolveHostname(hostname: string): Promise<string[]> {
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  return addresses.map((item) => item.address);
}

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "").replace(/\.$/, "");
}

function isBlockedHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname === "metadata" ||
    hostname === "metadata.google.internal"
  );
}

function isPublicIp(value: string): boolean {
  const normalized = normalizeHostname(value).split("%")[0];
  if (isIP(normalized) === 4) return isPublicIpv4(normalized);
  if (isIP(normalized) === 6) return isPublicIpv6(normalized);
  return false;
}

function isPublicIpv4(value: string): boolean {
  const parts = value.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 0 || b === 168)) return false;
  if (a === 198 && (b === 18 || b === 19 || b === 51)) return false;
  if (a === 203 && b === 0) return false;
  if (a >= 224) return false;
  return true;
}

function isPublicIpv6(value: string): boolean {
  const normalized = value.toLowerCase();
  if (normalized === "::" || normalized === "::1") return false;
  if (normalized.startsWith("::ffff:")) return isPublicIpv4(normalized.slice("::ffff:".length));
  if (/^f[cd]/.test(normalized)) return false;
  if (/^fe[89ab]/.test(normalized)) return false;
  if (normalized.startsWith("2001:db8:")) return false;
  return true;
}

function isRedirectStatus(status: number): boolean {
  return status >= 300 && status < 400;
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
    const response = await fetch(`https://lite-api.jup.ag/price/v2?ids=${launch.mint},${SOL_MINT}`, { signal });
    if (!response.ok) return null;
    const raw = (await response.json()) as JupiterPriceResponse;
    const item = raw.data?.[launch.mint];
    if (!item) return null;
    const priceUsd = item.price ? Number(item.price) : undefined;
    const solPriceUsd = raw.data?.[SOL_MINT]?.price ? Number(raw.data[SOL_MINT]?.price) : undefined;
    return {
      mint: launch.mint,
      observedAt: new Date(),
      provider: this.name,
      priceSol: priceUsd && solPriceUsd && solPriceUsd > 0 ? priceUsd / solPriceUsd : undefined,
      priceUsd,
      sentimentKeywords: [],
      socialLinks: {},
      raw: raw as JsonValue
    };
  }
}

const SOL_MINT = "So11111111111111111111111111111111111111112";

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
    const returnedHolderTotal = holders.reduce((sum, holder) => sum + Number(holder.amount ?? 0), 0);
    const topHolderAmount = Number(holders[0]?.amount ?? 0);
    const topHolderShare = launch.supply && launch.supply > 0 ? Math.min(1, Math.max(0, topHolderAmount / launch.supply)) : undefined;
    return {
      mint: launch.mint,
      observedAt: new Date(),
      provider: this.name,
      holderCount: raw.data?.total,
      topHolderShare,
      sentimentKeywords: [],
      socialLinks: {},
      raw: {
        ...raw,
        derived: {
          returnedHolderTopShare: returnedHolderTotal > 0 ? topHolderAmount / returnedHolderTotal : undefined,
          topHolderShareBasis: topHolderShare === undefined ? "not_available_without_launch_supply" : "share_of_launch_supply",
          devHoldingShare: "not_inferred_from_top_holder"
        }
      } as JsonValue
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

async function safeEnrichWithTimeout(
  enricher: Enricher,
  launch: TokenLaunch,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<TokenEnrichment | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const abortFromParent = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", abortFromParent, { once: true });

  try {
    return await safeEnrich(enricher, launch, controller.signal);
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromParent);
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
  const watchlist = ["ai", "trump", "fed", "election", "roaring", "cat", "dog", "hippo", "squirrel", "gme", "sol", "btc", "eth", "nvidia"];
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

function parseMetadataJson(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function metadataTextForMatching(metadata: Record<string, unknown>): string {
  const attributes = Array.isArray(metadata.attributes)
    ? metadata.attributes
        .map((attribute) => {
          if (!isRecord(attribute)) return "";
          return [attribute.trait_type, attribute.value].filter((value): value is string => typeof value === "string").join(" ");
        })
        .join(" ")
    : "";
  return [
    metadata.name,
    metadata.symbol,
    metadata.description,
    metadata.image,
    metadata.external_url,
    metadata.website,
    metadata.twitter,
    metadata.x,
    metadata.telegram,
    attributes
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ");
}

function metadataSocialLinks(metadata: Record<string, unknown>): Record<string, string> {
  const links: Record<string, string> = {};
  for (const key of ["external_url", "website", "twitter", "x", "telegram", "discord"]) {
    const value = metadata[key];
    if (typeof value === "string" && /^https?:\/\//i.test(value)) links[key] = value;
  }
  return links;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
