export const DEVELOPMENT_SEED = 20261010;
export const EVALUATION_SEED = 20261011;

export type Sample = {
  id: string;
  scenario: string;
  label: "legitimate" | "suspicious";
  description: string;
  views: number[];
  parameters?: Record<string, number>;
};

export function generateDataset(seed: number): Sample[] {
  let state = seed;
  function random() {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  }
  const between = (minimum: number, maximum: number) => minimum + random() * (maximum - minimum);
  const normal = () => Math.sqrt(-2 * Math.log(random())) * Math.cos(2 * Math.PI * random());
  const integer = (value: number) => Math.max(0, Math.round(value));

  function count(average: number) {
    // Poisson exata em volumes baixos; aproximação normal nos maiores.
    if (average >= 50) return integer(average + Math.sqrt(average) * normal());
    const limit = Math.exp(-average);
    let product = 1;
    let result = -1;
    do { result++; product *= random(); } while (product > limit);
    return result;
  }

  const steady = (hours: number, average: number) => Array.from({ length: hours }, () => count(average));
  function wave() {
    const height = between(5000, 80000);
    const center = between(15, 30);
    const width = between(4, 9);
    return Array.from({ length: 48 }, (_, hour) => count(100 + height * Math.exp(-0.5 * ((hour - center) / width) ** 2)));
  }

  const samples: Sample[] = [];
  function add(scenario: string, label: Sample["label"], description: string,
    build: (index: number) => number[] | Pick<Sample, "views" | "parameters">) {
    for (let i = 0; i < 48; i++) {
      const series = build(i);
      samples.push({ id: `${scenario}-${i + 1}`, scenario, label, description,
        ...(Array.isArray(series) ? { views: series } : series) });
    }
  }

  // Cada duração aparece com quatro ruídos e dois volumes. Não consulta as regras.
  function mechanical(index: number, durations: number[], start: number, remainingRatio: number) {
    const duration = durations[Math.floor(index / 8)];
    const noise = [0.09, 0.11, 0.29, 0.31][Math.floor(index / 2) % 4];
    const level = index % 2 === 0 ? between(300, 1000) : between(300000, 1000000);
    const views = steady(48, level * remainingRatio);
    const block = Array.from({ length: duration }, () => integer(level + Math.sqrt(level) * noise * normal()));
    views.splice(start, duration, ...block);
    return { views, parameters: { start_hour: start, duration_hours: duration, noise_scale: noise, mean_views: level, remaining_ratio: remainingRatio } };
  }

  add("steady_small", "legitimate", "Audiência pequena com chegadas independentes.", () => steady(48, between(200, 800)));
  add("steady_viral", "legitimate", "Grande volume com ritmo estável e variação de contagem.", () => steady(48, between(500000, 1500000)));
  add("organic_wave", "legitimate", "Viral orgânico que cresce e perde alcance gradualmente.", wave);
  add("organic_launch", "legitimate", "Publicação começa forte e perde alcance ao longo das horas.", () => {
    const height = between(5000, 100000);
    const decay = between(5, 10);
    return Array.from({ length: 48 }, (_, hour) => count(80 + height * Math.exp(-hour / decay)));
  });
  add("organic_flash", "legitimate", "Evento legítimo curto com pico e cauda de intensidades variadas.", () => {
    const views = steady(48, between(50, 250));
    const peak = integer(between(6000, 30000));
    const hour = Math.floor(between(8, 35));
    const tail = between(0.02, 0.5);
    views[hour] = peak;
    views[hour - 1] = count(peak * between(0.03, 0.4));
    views[hour + 1] = count(peak * tail);
    views[hour + 2] = count(peak * tail * 0.5);
    views[hour + 3] = count(peak * tail * 0.25);
    return { views, parameters: { peak_hour: hour, peak_views: peak, tail_ratio: tail } };
  });
  add("smoothed_counts", "legitimate", "Relatório suaviza contagens com médias móveis de diferentes durações.", (index) => {
    const window = [2, 4, 8, 16][index % 4];
    const raw = steady(48 + window - 1, between(500000, 1500000));
    const views = Array.from({ length: 48 }, (_, hour) => integer(raw.slice(hour, hour + window).reduce((a, b) => a + b, 0) / window));
    return { views, parameters: { smoothing_hours: window } };
  });
  add("rounded_plateau", "legitimate", "Relatório arredonda uma audiência legítima para centenas durante um patamar.", (index) => {
    const duration = [7, 8, 9, 17, 18, 19][Math.floor(index / 8)];
    const level = integer(between(2, 8)) * 100;
    const views = steady(48, level * 0.3);
    const block = steady(duration, level).map((value) => Math.round(value / 100) * 100);
    views.splice(12, duration, ...block);
    return { views, parameters: { start_hour: 12, duration_hours: duration, mean_views: level, rounding_step: 100 } };
  });
  add("collection_gap", "legitimate", "Falha de coleta registrada como zeros, sem compra de views.", () => [
    ...steady(24, between(5000, 10000)), ...Array(24).fill(0),
  ]);
  add("daily_cycle", "legitimate", "Audiência muda entre horários do dia por três dias.", () => {
    const level = between(300, 2000);
    return Array.from({ length: 72 }, (_, hour) => count(level * (1 + 0.7 * Math.sin(hour * Math.PI / 12))));
  });
  add("early_peak", "legitimate", "Pico na publicação, sem histórico anterior para comparação.", () => {
    const views = steady(24, between(50, 100));
    views[0] = integer(between(8000, 15000));
    return views;
  });
  add("low_activity", "legitimate", "Poucas views para concluir algo sobre o comportamento.", () => steady(24, between(5, 20)));

  add("bought_peak", "suspicious", "Compra simulada acrescenta um lote de views numa hora.", () => {
    const views = steady(48, between(50, 250));
    views[Math.floor(between(5, 44))] += integer(between(3000, 18000));
    return views;
  });
  add("mechanical_launch", "suspicious", "Emissão mecânica começa na publicação; depois permanece audiência residual, sem queda de 90%.",
    (index) => mechanical(index, [7, 8, 9, 17, 18, 19], 0, 0.35));
  add("mechanical_block", "suspicious", "Emissão mecânica com duração e ruído variados, seguida de queda.",
    (index) => mechanical(index, [7, 8, 9, 17, 18, 19], 12, 0.03));
  add("short_mechanical_block", "suspicious", "Emissão mecânica curta, com duração e ruído variados, seguida de queda.",
    (index) => mechanical(index, [4, 5, 6, 7, 8, 9], 12, 0.03));
  add("disguised_bots", "suspicious", "Bots simulam a mesma distribuição de uma onda orgânica; só as contagens não revelam a origem.", wave);
  return samples;
}
