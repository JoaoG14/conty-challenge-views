import { classify, REPETITION } from "./classifier.ts";
import type { RepetitionRules } from "./classifier.ts";
import type { Sample } from "./dataset.ts";

export function evaluate(samples: Sample[], rules: RepetitionRules = REPETITION) {
  const results = samples.map((sample) => ({
    id: sample.id, scenario: sample.scenario, label: sample.label,
    classification: classify(sample.views, rules).classification,
  }));
  const legitimate = results.filter((item) => item.label === "legitimate");
  const suspicious = results.filter((item) => item.label === "suspicious");
  const falsePositives = legitimate.filter((item) => item.classification === "suspect");
  const detected = suspicious.filter((item) => item.classification === "suspect");
  return {
    total: results.length,
    legitimate: legitimate.length,
    suspicious: suspicious.length,
    false_positives: falsePositives.length,
    false_positive_rate: falsePositives.length / legitimate.length,
    detected: detected.length,
    detection_rate: detected.length / suspicious.length,
    suspicious_not_flagged: suspicious.length - detected.length,
    inconclusive: results.filter((item) => item.classification === "inconclusive").length,
    false_positive_ids: falsePositives.map((item) => item.id),
    by_scenario: [...new Set(results.map((item) => item.scenario))].map((scenario) => {
      const rows = results.filter((item) => item.scenario === scenario);
      return {
        scenario, label: rows[0].label, total: rows.length,
        suspect: rows.filter((item) => item.classification === "suspect").length,
        inconclusive: rows.filter((item) => item.classification === "inconclusive").length,
        not_suspect: rows.filter((item) => item.classification === "not_suspect").length,
      };
    }),
  };
}

const percent = (rate: number) => `${(rate * 100).toFixed(2).replace(".", ",")}%`;

export function evaluationSummary(report: ReturnType<typeof evaluate>): string {
  return [
    `Taxa de falso positivo no dataset: **${percent(report.false_positive_rate)} (${report.false_positives}/${report.legitimate} casos legítimos)**.`,
    `Casos suspeitos sinalizados: **${percent(report.detection_rate)} (${report.detected}/${report.suspicious})**.`,
    `Resultados inconclusivos: **${report.inconclusive}/${report.total}**.`,
  ].join("\n\n");
}
