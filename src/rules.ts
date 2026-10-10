export const RULES = {
  minimum_hours: 24,
  minimum_total: 1000,
  peak_minimum: 5000,
  peak_ratio: 10,
  peak_share: 0.5,
  organic_context_ratio: 2,
  drop: 0.9,
  repetition_mean: 200,
  repetition_share: 0.3,
  observation_hours: 6,
};

export const REPETITION_CONFIGS = {
  sensível: { strong_hours: 6, strong_index: 0.3, with_drop_hours: 6, with_drop_index: 0.8 },
  intermediária: { strong_hours: 12, strong_index: 0.2, with_drop_hours: 6, with_drop_index: 0.5 },
  restritiva: { strong_hours: 18, strong_index: 0.1, with_drop_hours: 8, with_drop_index: 0.3 },
};

export const REPETITION = REPETITION_CONFIGS.restritiva;
export type RepetitionRules = typeof REPETITION;
