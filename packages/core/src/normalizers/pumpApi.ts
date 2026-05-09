import { z } from "zod";
import type { JsonValue, LaunchEvent, LaunchEventType, TokenLaunch, TradeEvent } from "../domain/types.js";
import { toDate } from "../utils/time.js";

const PumpApiEventSchema = z
  .object({
    signature: z.string(),
    txType: z.string(),
    mint: z.string().optional(),
    pool: z.string().optional(),
    poolId: z.string().optional(),
    txSigner: z.string().optional(),
    creatorFeeAddress: z.string().optional(),
    timestamp: z.union([z.string(), z.number()]).optional(),
    block: z.number().optional(),
    tokenAmount: z.number().optional(),
    initialBuy: z.number().optional(),
    solAmount: z.number().optional(),
    tokensInPool: z.number().optional(),
    solInPool: z.number().optional(),
    vSolInBondingCurve: z.number().optional(),
    price: z.number().optional(),
    marketCapSol: z.number().optional(),
    name: z.string().optional(),
    symbol: z.string().optional(),
    uri: z.string().optional(),
    supply: z.number().optional(),
    priorityFee: z.number().optional(),
    mintAuthority: z.string().nullable().optional(),
    freezeAuthority: z.string().nullable().optional(),
    tradersInvolved: z.record(z.unknown()).optional(),
    tokenExtensions: z.record(z.unknown()).optional()
  })
  .passthrough();

const supportedTypes = new Set<LaunchEventType>(["create", "buy", "sell", "migration", "pool_created"]);

export function normalizePumpApiEvent(rawInput: unknown): LaunchEvent | null {
  const parsed = PumpApiEventSchema.safeParse(rawInput);
  if (!parsed.success) return null;

  const raw = parsed.data;
  const eventType = normalizeType(raw.txType);
  if (!eventType || !supportedTypes.has(eventType)) return null;

  const timestamp = toDate(raw.timestamp);
  const mint = raw.mint;
  const pool = raw.pool ?? raw.poolId ?? "unknown";

  if (!mint && eventType !== "pool_created") return null;

  const base = {
    eventType,
    source: "pumpapi",
    signature: raw.signature,
    mint,
    pool,
    timestamp,
    block: raw.block,
    raw: raw as JsonValue
  } satisfies LaunchEvent;

  if (eventType === "create" && mint) {
    const launch: TokenLaunch = {
      mint,
      source: "pumpapi",
      signature: raw.signature,
      pool,
      creator: raw.txSigner ?? raw.creatorFeeAddress,
      name: raw.name,
      symbol: raw.symbol,
      uri: raw.uri,
      supply: raw.supply,
      createdAt: timestamp,
      initialBuyTokens: raw.initialBuy,
      initialBuySol: raw.solAmount,
      vSolInBondingCurve: raw.vSolInBondingCurve,
      marketCapSol: raw.marketCapSol,
      raw: raw as JsonValue
    };

    return { ...base, tokenLaunch: launch };
  }

  if (mint && ["buy", "sell", "migration", "pool_created"].includes(eventType)) {
    const trade: TradeEvent = {
      signature: raw.signature,
      source: "pumpapi",
      mint,
      eventType: eventType as TradeEvent["eventType"],
      trader: raw.txSigner,
      occurredAt: timestamp,
      tokenAmount: raw.tokenAmount,
      solAmount: raw.solAmount,
      vSolInBondingCurve: raw.vSolInBondingCurve,
      priceSol: raw.price,
      marketCapSol: raw.marketCapSol,
      isBotLike: inferBotLike(raw),
      isWashTrade: inferWashTrade(raw),
      raw: raw as JsonValue
    };

    return { ...base, tradeEvent: trade };
  }

  return base;
}

function normalizeType(txType: string): LaunchEventType | null {
  const normalized = txType.toLowerCase().replace(/-/g, "_");
  if (normalized === "create_pool") return "pool_created";
  if (normalized === "migrate") return "migration";
  if (supportedTypes.has(normalized as LaunchEventType)) return normalized as LaunchEventType;
  return null;
}

function inferBotLike(raw: z.infer<typeof PumpApiEventSchema>): boolean {
  const traders = Object.keys(raw.tradersInvolved ?? {}).length;
  const highPriorityFee = (raw.priorityFee ?? 0) >= 0.0001;
  const multiTraderSingleTx = traders > 1;
  return Boolean(highPriorityFee || multiTraderSingleTx);
}

function inferWashTrade(raw: z.infer<typeof PumpApiEventSchema>): boolean {
  return raw.txType.toLowerCase().includes("wash") || Boolean((raw as Record<string, unknown>).washTrade);
}
