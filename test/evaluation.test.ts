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
    const regular = Array(24).fill(500);
    const varied = Array.from({ length: 24 }, (_, hour) => [300, 500, 700][hour % 3]);
    const measured = evaluate([
      { id: "rounded", scenario: "legitimate", label: "legitimate", description: "", views: regular },
      { id: "natural", scenario: "legitimate", label: "legitimate", description: "", views: varied },
      { id: "empty", scenario: "legitimate", label: "legitimate", description: "", views: Array(24).fill(0) },
      { id: "mechanical", scenario: "bots", label: "suspicious", description: "", views: regular },
      { id: "disguised", scenario: "bots", label: "suspicious", description: "", views: varied },
    ]);
    expect(measured).toMatchObject({ false_positive_rate: 1 / 3, detection_rate: 1 / 2,
      inconclusive: 1, suspicious_not_flagged: 1, false_positive_ids: ["rounded"] });
    expect(measured.by_scenario).toEqual([
      { scenario: "legitimate", label: "legitimate", total: 3, suspect: 1, not_suspect: 1,
        inconclusive: 1, false_positive_rate: 1 / 3, detection_rate: null, inconclusive_rate: 1 / 3 },
      { scenario: "bots", label: "suspicious", total: 2, suspect: 1, not_suspect: 1,
        inconclusive: 0, false_positive_rate: null, detection_rate: 1 / 2, inconclusive_rate: 0 },
    ]);
  });

  it("equilibra os cenários e cruza duração, ruído e volume nos blocos mecânicos", () => {
    expect(report.by_scenario).toHaveLength(16);
    expect(report.by_scenario.every((row) => row.total === 48)).toBe(true);
    for (const scenario of ["mechanical_launch", "mechanical_block", "short_mechanical_block"]) {
      const rows = samples.filter((sample) => sample.scenario === scenario);
      const durations = scenario === "short_mechanical_block" ? [4, 5, 6, 7, 8, 9] : [7, 8, 9, 17, 18, 19];
      for (const duration of durations) {
        for (const noise of [0.09, 0.11, 0.29, 0.31]) {
          const pair = rows.filter(({ parameters: p }) => p?.duration_hours === duration && p.noise_scale === noise);
          expect(pair).toHaveLength(2);
          expect(pair.map(({ parameters: p }) => p!.mean_views < 10000)).toEqual([true, false]);
        }
      }
    }
  });
});
