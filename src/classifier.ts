import { followingDrop, mean, median, sum, variation } from "./stats.ts";
import { RULES, REPETITION } from "./rules.ts";
import type { RepetitionRules } from "./rules.ts";
export type Classification = "suspect" | "inconclusive" | "not_suspect";

export function validateViews(value: unknown): string | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 168) {
    return "views deve conter de 1 a 168 contagens por hora";
  }
  if (value.some((item) => !Number.isSafeInteger(item) || item < 0)) {
    return "cada contagem deve ser um inteiro não negativo e seguro";
  }
  if (!Number.isSafeInteger(sum(value))) return "a soma das views excede o limite de inteiro seguro";
  return null;
}

function findPeak(views: number[], total: number) {
  const maximum = Math.max(...views);
  const hour = views.indexOf(maximum);
  const baseline = hour >= 5 ? median(views.slice(hour - 5, hour)) : null;
  const ratio = baseline !== null && baseline > 0 ? maximum / baseline : null;
  const share = total > 0 ? maximum / total : 0;
  const after = followingDrop(views, hour, maximum);
  const candidate = maximum > RULES.peak_minimum && share >= RULES.peak_share;
  const previousViews = hour > 0 ? views[hour - 1] : null;
  const followingViews = views.slice(hour + 1, hour + 4);
  const previousRatio = baseline !== null && baseline > 0 && previousViews !== null ? previousViews / baseline : null;
  const followingRatio = baseline !== null && baseline > 0 && followingViews.length > 0 ? followingViews[0] / baseline : null;
  const decliningTail = followingViews.length === 3
    ? followingViews[0] > followingViews[1] && followingViews[1] > followingViews[2] : null;
  const organicContext = previousRatio !== null && previousRatio >= RULES.organic_context_ratio
    && followingRatio !== null && followingRatio >= RULES.organic_context_ratio && decliningTail === true;
  return {
    hour, views: maximum, baseline, ratio, share, ...after,
    previous_views: previousViews, previous_ratio: previousRatio,
    following_views: followingViews, following_ratio: followingRatio,
    declining_tail: decliningTail, organic_context: organicContext,
    detected: candidate && ratio !== null && ratio >= RULES.peak_ratio
      && after.drop !== null && after.drop >= RULES.drop,
    missing_context: candidate && (ratio === null || (ratio >= RULES.peak_ratio && after.drop === null)),
  };
}

function findRepetition(views: number[], total: number, rules: RepetitionRules) {
  type Window = {
    start_hour: number; end_hour: number; hours: number; mean: number;
    standard_deviation: number; variation_index: number; share: number;
    following_mean: number | null; drop: number | null;
    match: "strong" | "with_drop" | null;
  };
  let best: Window | null = null;
  let bestRank = -1;
  for (let start = 0; start <= views.length - RULES.observation_hours; start++) {
    for (let end = start + RULES.observation_hours; end <= views.length; end++) {
      const block = views.slice(start, end);
      const share = sum(block) / total;
      if (share < RULES.repetition_share || mean(block) < RULES.repetition_mean) continue;
      const stats = variation(block);
      if (stats.variation_index === null) continue;
      const after = followingDrop(views, end - 1, stats.mean);
      const strong = block.length >= rules.strong_hours && stats.variation_index <= rules.strong_index;
      const withDrop = block.length >= rules.with_drop_hours && stats.variation_index <= rules.with_drop_index
        && after.drop !== null && after.drop >= RULES.drop;
      const rank = strong ? 2 : withDrop ? 1 : 0;
      // Priorizar uma regra completa antes de comparar a regularidade dos trechos.
      if (best && (rank < bestRank || (rank === bestRank && stats.variation_index >= best.variation_index))) continue;
      bestRank = rank;
      best = {
        start_hour: start, end_hour: end - 1, hours: block.length,
        ...stats, variation_index: stats.variation_index, share, ...after,
        match: strong ? "strong" : withDrop ? "with_drop" : null,
      };
    }
  }
  return best;
}

function findAbruptDrop(views: number[]) {
  let best: { after_hour: number; reference: number; following_mean: number; drop: number } | null = null;
  for (let end = 2; end + 3 < views.length; end++) {
    const reference = mean(views.slice(end - 2, end + 1));
    const after = followingDrop(views, end, reference);
    if (after.drop === null || after.following_mean === null || after.drop < RULES.drop) continue;
    if (!best || after.drop > best.drop || (after.drop === best.drop && reference > best.reference)) {
      best = { after_hour: end, reference, following_mean: after.following_mean, drop: after.drop };
    }
  }
  return best;
}

const number = (value: number) => value.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const percent = (value: number) => `${number(value * 100)}%`;

export function classify(views: number[], repetitionRules: RepetitionRules = REPETITION) {
  const error = validateViews(views);
  if (error) throw new Error(error);
  const total = sum(views);
  const peak = findPeak(views, total);
  const repetition = total > 0 ? findRepetition(views, total, repetitionRules) : null;
  const abruptDrop = findAbruptDrop(views);
  let classification: Classification;
  let reason: string;

  if (views.length < RULES.minimum_hours || total < RULES.minimum_total) {
    classification = "inconclusive";
    reason = `São ${views.length} horas e ${number(total)} views. A análise exige pelo menos 24 horas e 1.000 views.`;
  } else if (peak.detected && !peak.organic_context) {
    classification = "suspect";
    reason = `Na hora ${peak.hour + 1}, o pico teve ${number(peak.views)} views: ${number(peak.ratio!)} vezes a mediana anterior, ${percent(peak.share)} do total e queda de ${percent(peak.drop!)} na média das 3 horas seguintes.`;
  } else if (repetition?.match) {
    classification = "suspect";
    const detail = repetition.match === "strong"
      ? `O índice é no máximo ${number(repetitionRules.strong_index)} e a duração é de pelo menos ${repetitionRules.strong_hours} horas, atendendo à regra forte. Essa regra não exige salto ou queda.`
      : `O índice é no máximo ${number(repetitionRules.with_drop_index)} e a duração é de pelo menos ${repetitionRules.with_drop_hours} horas. A queda nas 3 horas seguintes foi de ${percent(repetition.drop!)}, atingindo o mínimo de ${percent(RULES.drop)}.`;
    reason = `Das horas ${repetition.start_hour + 1} a ${repetition.end_hour + 1}, foram ${repetition.hours} horas com média de ${number(repetition.mean)} views, índice de variação ${number(repetition.variation_index)} e ${percent(repetition.share)} do total. ${detail}`;
  } else if (peak.detected && peak.organic_context) {
    classification = "inconclusive";
    reason = `Na hora ${peak.hour + 1}, o pico teve ${number(peak.views)} views. A hora anterior teve ${number(peak.previous_views!)} views (${number(peak.previous_ratio!)} vezes a mediana anterior). Nas 3 horas seguintes, foram ${peak.following_views.map(number).join(", ")} views, em queda progressiva; a primeira ainda teve ${number(peak.following_ratio!)} vezes a mediana anterior. Esse comportamento é compatível com um viral orgânico, então o pico sozinho não basta para apontar suspeita.`;
  } else if (peak.missing_context) {
    classification = "inconclusive";
    const missing: string[] = [];
    if (peak.baseline === null) missing.push(`o histórico anterior contém ${peak.hour} das 5 horas necessárias`);
    else if (peak.baseline === 0) missing.push("a mediana das 5 horas anteriores é zero, então não é possível calcular a razão entre o pico e essa mediana");
    if (peak.following_mean === null) missing.push(`o contexto posterior contém ${views.length - peak.hour - 1} das 3 horas necessárias para medir a queda`);
    reason = `Na hora ${peak.hour + 1}, o pico teve ${number(peak.views)} views e ${percent(peak.share)} do total. A regra de pico ficou incompleta: ${missing.join("; ")}.`;
  } else if (repetition && repetition.variation_index <= repetitionRules.with_drop_index) {
    classification = "inconclusive";
    const strongMissing: string[] = [];
    const withDropMissing: string[] = [];
    if (repetition.hours < repetitionRules.strong_hours) strongMissing.push(`duração mínima de ${repetitionRules.strong_hours} horas`);
    if (repetition.variation_index > repetitionRules.strong_index) strongMissing.push(`índice de no máximo ${number(repetitionRules.strong_index)}`);
    if (repetition.hours < repetitionRules.with_drop_hours) withDropMissing.push(`duração mínima de ${repetitionRules.with_drop_hours} horas`);
    if (repetition.drop === null) withDropMissing.push(`3 horas seguintes para medir a queda (há ${views.length - repetition.end_hour - 1})`);
    else if (repetition.drop < RULES.drop) withDropMissing.push(`queda mínima de ${percent(RULES.drop)} (a queda medida foi de ${percent(repetition.drop)})`);
    reason = `Das horas ${repetition.start_hour + 1} a ${repetition.end_hour + 1}, o trecho tem ${repetition.hours} horas e índice de variação ${number(repetition.variation_index)}. Para a regra forte, falta: ${strongMissing.join(" e ")}. Para a regra com queda, falta: ${withDropMissing.join(" e ")}.`;
  } else if (abruptDrop) {
    classification = "inconclusive";
    reason = `Após a hora ${abruptDrop.after_hour + 1}, a média caiu ${percent(abruptDrop.drop)}, de ${number(abruptDrop.reference)} para ${number(abruptDrop.following_mean)} views. Uma queda isolada não basta para apontar suspeita.`;
  } else {
    classification = "not_suspect";
    reason = "Nenhuma regra de pico ou repetição foi atendida e não há queda brusca isolada. Isso não comprova que as views sejam humanas.";
  }

  return {
    classification, reason, total_views: total, hours: views.length,
    signals: { peak, repetition, abrupt_drop: abruptDrop },
    thresholds: { ...RULES, ...repetitionRules },
  };
}
