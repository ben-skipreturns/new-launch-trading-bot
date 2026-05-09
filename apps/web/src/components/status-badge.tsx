import React from "react";
import type { Decision } from "@moonshot/core";

type BadgeTone = "buy" | "watch" | "reject" | "neutral" | "risk" | "open" | "closed";

const toneClass: Record<BadgeTone, string> = {
  buy: "border-buy/25 bg-buy/10 text-buy",
  watch: "border-watch/30 bg-watch/12 text-[#8a5a00]",
  reject: "border-reject/25 bg-reject/10 text-reject",
  neutral: "border-line bg-panel text-muted",
  risk: "border-[#8b5cf6]/25 bg-[#8b5cf6]/10 text-[#5b21b6]",
  open: "border-accent/25 bg-accent/10 text-accent",
  closed: "border-line bg-[#eef1ec] text-muted"
};

export function StatusBadge({ label, tone = "neutral" }: { label: string; tone?: BadgeTone }) {
  return (
    <span className={`inline-flex min-h-6 items-center rounded-full border px-2.5 text-xs font-semibold ${toneClass[tone]}`}>
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
