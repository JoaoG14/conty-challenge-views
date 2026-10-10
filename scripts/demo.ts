import assert from "node:assert/strict";
import { createApp } from "../src/app.ts";
import { EVALUATION_SEED, generateDataset } from "../src/dataset.ts";

const app = createApp();
const samples = generateDataset(EVALUATION_SEED);
// Exemplos específicos: o resultado pode variar dentro do mesmo cenário.
for (const [id, expected] of [
  ["bought_peak-1", "suspect"],
  ["organic_wave-1", "not_suspect"],
  ["mechanical_launch-41", "suspect"], // 19 horas, ruído 0,09.
  ["collection_gap-1", "inconclusive"],
] as const) {
  const sample = samples.find((item) => item.id === id)!;
  const response = await app.request("/classify", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ views: sample.views }),
  });
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.classification, expected);
  console.log(`\n${id}: ${result.classification}\n${result.reason}`);
}
