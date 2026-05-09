type Tone = "neutral" | "good" | "watch" | "bad" | "accent";

const toneClasses: Record<Tone, string> = {
  neutral: "border-line",
  good: "border-buy/35 bg-buy/5",
  watch: "border-watch/35 bg-watch/5",
  bad: "border-reject/35 bg-reject/5",
  accent: "border-accent/35 bg-accent/5"
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
