import type {
  FeatureSnapshot,
  LaunchEvent,
  PaperOrder,
  ScoreSnapshot,
  TokenEnrichment,
  TokenMemeMatch,
  TokenLaunch,
  TrendObservation,
  TrendTopic,
} from "./types.js";

export interface LaunchFeed {
  readonly name: string;
  stream(signal?: AbortSignal): AsyncIterable<LaunchEvent>;
}

export interface Enricher {
  readonly name: string;
  enrich(launch: TokenLaunch, signal?: AbortSignal): Promise<TokenEnrichment | null>;
}

export interface FeatureExtractor {
  extract(input: FeatureExtractionInput): Promise<FeatureSnapshot>;
}

export interface FeatureExtractionInput {
  launch: TokenLaunch;
  asOf: Date;
  triggerType: FeatureSnapshot["triggerType"];
  triggerValue: string;
  enrichment?: TokenEnrichment | null;
}

export interface Scorer {
  score(snapshot: FeatureSnapshot): ScoreSnapshot;
}

export interface PaperBroker {
  onScore(score: ScoreSnapshot): Promise<PaperOrder | null>;
  onPrice(score: ScoreSnapshot): Promise<PaperOrder[]>;
}

export interface TrendSource {
  readonly name: string;
  fetchObservations(signal?: AbortSignal): Promise<TrendObservation[]>;
}

export interface MemeMatcher {
  match(input: MemeMatchInput): Promise<TokenMemeMatch>;
}

export interface MemeMatchInput {
  launch: TokenLaunch;
  topics: TrendTopic[];
  enrichment?: TokenEnrichment | null;
  observedAt: Date;
}

export interface ExecutionAdapter {
  readonly enabled: false;
  execute(): never;
}

export class DisabledExecutionAdapter implements ExecutionAdapter {
  readonly enabled = false as const;

  execute(): never {
    throw new Error("Live execution is disabled in v1. No private keys or wallet trading are supported.");
  }
}
