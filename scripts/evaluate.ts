import { mkdirSync, writeFileSync } from "node:fs";
import { EVALUATION_SEED, generateDataset } from "../src/dataset.ts";
import { evaluate, evaluationSummary } from "../src/evaluation.ts";

const samples = generateDataset(EVALUATION_SEED);
const report = { seed: EVALUATION_SEED, ...evaluate(samples) };
const dataDirectory = new URL("../data/", import.meta.url);
mkdirSync(dataDirectory, { recursive: true });
writeFileSync(new URL("dataset.jsonl", dataDirectory), samples.map((sample) => JSON.stringify(sample)).join("\n") + "\n");
writeFileSync(new URL("report.json", dataDirectory), JSON.stringify(report, null, 2) + "\n");
console.log(evaluationSummary(report));
console.table(report.by_scenario);
console.log(`Seed ${EVALUATION_SEED}. Dataset e relatório salvos em data/. O README não é alterado pelo comando.`);
