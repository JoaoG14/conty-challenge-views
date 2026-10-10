import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEVELOPMENT_SEED, EVALUATION_SEED, generateDataset } from "../src/dataset.ts";
import { evaluate, evaluationSummary } from "../src/evaluation.ts";

const samples = generateDataset(EVALUATION_SEED);
const report = evaluate(samples);

describe("avaliação reproduzível", () => {
  it("regenera o dataset entregue e usa exemplos diferentes dos de desenvolvimento", () => {
    const dataset = readFileSync(new URL("../data/dataset.jsonl", import.meta.url), "utf8");
    expect(dataset).toBe(samples.map((sample) => JSON.stringify(sample)).join("\n") + "\n");
    expect(generateDataset(DEVELOPMENT_SEED)[0].views).not.toEqual(samples[0].views);
    expect(JSON.parse(readFileSync(new URL("../data/report.json", import.meta.url), "utf8")))
      .toEqual({ seed: EVALUATION_SEED, ...report });
  });

  it("falha se os números do README divergirem da medição", () => {
    const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
    const documented = readme.match(/<!-- evaluation:start -->\s*([\s\S]*?)\s*<!-- evaluation:end -->/);
    expect(documented, "o README precisa conter o bloco de resultados medidos").not.toBeNull();
    expect(documented![1].trim()).toBe(evaluationSummary(report));
  });

  it("expõe falsos positivos e casos suspeitos que escapam, sem chamar inconclusivo de acerto", () => {
    expect(report.false_positive_rate).toBe(report.false_positives / report.legitimate);
    expect(report.detection_rate).toBe(report.detected / report.suspicious);
    expect(report.false_positive_ids).toContain("organic_flash-1");
    expect(report.by_scenario.find((item) => item.scenario === "disguised_bots"))
      .toMatchObject({ suspect: 0, not_suspect: 24 });
    expect(report.by_scenario.find((item) => item.scenario === "early_peak"))
      .toMatchObject({ suspect: 0, inconclusive: 24 });
  });
});
