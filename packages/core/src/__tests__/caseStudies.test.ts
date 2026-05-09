import { describe, expect, it } from "vitest";
import { buildCaseStudyPromptSummary, controlCaseStudies, MEME_CASE_STUDIES, successfulSolanaCaseStudies } from "../index.js";

describe("meme case-study corpus", () => {
  it("contains a broad successful Solana corpus and control set", () => {
    expect(successfulSolanaCaseStudies().length).toBeGreaterThanOrEqual(40);
    expect(controlCaseStudies().length).toBeGreaterThanOrEqual(15);
  });

  it("keeps every case study evidence-backed and archetype-labeled", () => {
    for (const study of MEME_CASE_STUDIES) {
      expect(study.token).toBeTruthy();
      expect(study.symbol).toBeTruthy();
      expect(study.memeticArchetypes.length).toBeGreaterThan(0);
      expect(study.catalysts.length).toBeGreaterThan(0);
      expect(study.riskLessons.length).toBeGreaterThan(0);
      expect(study.evidenceUrls.length).toBeGreaterThan(0);
    }
  });

  it("does not encode static buy decisions", () => {
    for (const study of MEME_CASE_STUDIES) {
      expect(Object.keys(study)).not.toContain("decision");
      expect(Object.keys(study)).not.toContain("buyRule");
    }
  });

  it("builds a compact prompt summary for the OpenAI radar", () => {
    const summary = buildCaseStudyPromptSummary();

    expect(summary.length).toBeLessThanOrEqual(8000);
    expect(summary).toContain("Learn archetypes, not ticker allowlists");
    expect(summary).toContain("Positive archetypes");
    expect(summary).toContain("Negative and context controls");
  });
});
