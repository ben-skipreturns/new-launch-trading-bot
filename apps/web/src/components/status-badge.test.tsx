import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DecisionBadge, RiskBadge, StatusBadge } from "./status-badge";

describe("StatusBadge", () => {
  it("renders a compact badge label", () => {
    const html = renderToStaticMarkup(<StatusBadge label="open" tone="open" />);
    expect(html).toContain("open");
    expect(html).toContain("inline-flex");
  });

  it("maps score decisions to operational labels", () => {
    expect(renderToStaticMarkup(<DecisionBadge decision="paper_buy" />)).toContain("paper buy");
    expect(renderToStaticMarkup(<DecisionBadge decision="watch" />)).toContain("watch");
    expect(renderToStaticMarkup(<DecisionBadge decision="reject" />)).toContain("reject");
  });

  it("labels low, elevated, and high risk states", () => {
    expect(renderToStaticMarkup(<RiskBadge riskScore={0.2} />)).toContain("low risk");
    expect(renderToStaticMarkup(<RiskBadge riskScore={0.5} />)).toContain("elevated");
    expect(renderToStaticMarkup(<RiskBadge riskScore={0.8} />)).toContain("high risk");
  });
});
