import React from "react";
import type { Decision } from "@moonshot/core";

type BadgeTone = "buy" | "watch" | "reject" | "neutral" | "risk" | "open" | "closed";

const toneClass: Record<BadgeTone, string> = {
  buy: "border-buy/25 bg-buy/10 text-buy",
  watch: "border-watch/30 bg-watch/10 text-watch",
  reject: "border-reject/25 bg-reject/10 text-reject",
  neutral: "border-line bg-panel-muted/70 text-muted",
  risk: "border-risk/25 bg-risk/10 text-risk",
  open: "border-accent/25 bg-accent/10 text-accent",
  closed: "border-line bg-panel-muted text-muted"
};

export function StatusBadge({ label, tone = "neutral" }: { label: string; tone?: BadgeTone }) {
  return (
    <span className={`inline-flex min-h-5 items-center rounded-full border px-2 text-[0.72rem] font-semibold leading-4 ${toneClass[tone]}`}>
      {label}
    </span>
  );
}

export function DecisionBadge({ decision }: { decision: Decision | "none" }) {
  if (decision === "paper_buy") return <StatusBadge label="paper buy" tone="buy" />;
  if (decision === "watch") return <StatusBadge label="watch" tone="watch" />;
  if (decision === "reject") return <StatusBadge label="reject" tone="reject" />;
  return <StatusBadge label="none" />;
}

export function RiskBadge({ riskScore }: { riskScore: number }) {
  if (riskScore >= 0.7) return <StatusBadge label="high risk" tone="reject" />;
  if (riskScore >= 0.35) return <StatusBadge label="elevated" tone="risk" />;
  return <StatusBadge label="low risk" tone="buy" />;
}
