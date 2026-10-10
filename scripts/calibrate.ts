import { REPETITION } from "../src/classifier.ts";
import { DEVELOPMENT_SEED, generateDataset } from "../src/dataset.ts";
import { evaluate } from "../src/evaluation.ts";

const samples = generateDataset(DEVELOPMENT_SEED);
const candidates = [
  { name: "sensível", strong_hours: 6, strong_index: 0.3, with_drop_hours: 6, with_drop_index: 0.8 },
  { name: "intermediária", strong_hours: 12, strong_index: 0.2, with_drop_hours: 6, with_drop_index: 0.5 },
  { name: "restritiva", strong_hours: 18, strong_index: 0.1, with_drop_hours: 8, with_drop_index: 0.3 },
];
const comparisons = candidates.map(({ name, ...rules }) => {
  const report = evaluate(samples, rules);
  return {
    name, ...rules, false_positives: report.false_positives,
    false_positive_rate: report.false_positive_rate, detected: report.detected,
    detection_rate: report.detection_rate, inconclusive: report.inconclusive,
  };
});
console.log(`Comparação na seed de desenvolvimento ${DEVELOPMENT_SEED}. Não usa a seed de avaliação.`);
console.table(comparisons);
// O teto é uma escolha do exercício, não uma garantia sobre tráfego real.
const acceptable = comparisons.filter((item) => item.false_positive_rate <= 0.03);
acceptable.sort((a, b) => b.detected - a.detected || a.false_positives - b.false_positives);
console.log(acceptable.length ? `Maior detecção com até 3% de falsos positivos: ${acceptable[0].name}.` : "Nenhuma configuração ficou abaixo do teto de 3%.");
console.log("Configuração em uso:", REPETITION);
