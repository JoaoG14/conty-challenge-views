import assert from "node:assert/strict";
import { createApp } from "../src/app.ts";
import { EVALUATION_SEED, generateDataset } from "../src/dataset.ts";

const app = createApp();
const samples = generateDataset(EVALUATION_SEED);
for (const [scenario, expected] of [
  ["bought_peak", "suspect"],
  ["organic_wave", "not_suspect"],
  ["mechanical_launch", "suspect"],
  ["collection_gap", "inconclusive"],
] as const) {
  const sample = samples.find((item) => item.scenario === scenario)!;
  const response = await app.request("/classify", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ views: sample.views }),
  });
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.classification, expected);
  console.log(`\n${scenario}: ${result.classification}\n${result.reason}`);
}
