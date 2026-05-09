type Tone = "neutral" | "good" | "watch" | "bad" | "accent";

const toneClasses: Record<Tone, string> = {
  neutral: "border-line",
  good: "border-buy/30 bg-buy/10",
  watch: "border-watch/30 bg-watch/10",
  bad: "border-reject/30 bg-reject/10",
  accent: "border-accent/30 bg-accent/10"
};

export function MetricCard({
  title,
  value,
  detail,
  tone = "neutral"
}: {
  title: string;
  value: string;
  detail?: string;
  tone?: Tone;
}) {
  return (
    <div className={`panel rounded-md p-4 ${toneClasses[tone]}`}>
      <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">{title}</div>
      <div className="mt-2 text-2xl font-semibold tracking-normal text-ink">{value}</div>
      {detail ? <div className="mt-1 text-sm text-muted">{detail}</div> : null}
    </div>
  );
}
