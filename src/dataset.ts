export const DEVELOPMENT_SEED = 20261010;
export const EVALUATION_SEED = 20261011;

export type Sample = {
  id: string;
  scenario: string;
  label: "legitimate" | "suspicious";
  description: string;
  views: number[];
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
  function add(scenario: string, label: Sample["label"], description: string, build: () => number[], amount = 24) {
    for (let i = 0; i < amount; i++) {
      samples.push({ id: `${scenario}-${i + 1}`, scenario, label, description, views: build() });
    }
  }

  add("steady_small", "legitimate", "Audiência pequena com chegadas independentes.", () => steady(48, between(200, 800)));
  add("steady_viral", "legitimate", "Grande volume com ritmo estável e variação de contagem.", () => steady(48, between(500000, 1500000)));
  add("organic_wave", "legitimate", "Viral orgânico que cresce e perde alcance gradualmente.", wave);
  add("organic_launch", "legitimate", "Publicação começa forte e perde alcance ao longo das horas.", () => {
    const height = between(5000, 100000);
    const decay = between(5, 10);
    return Array.from({ length: 48 }, (_, hour) => count(80 + height * Math.exp(-hour / decay)));
  });
  add("organic_flash", "legitimate", "Evento legítimo curto, com pico concentrado; pode ser indistinguível de um pico comprado.", () => {
    const views = steady(48, between(50, 90));
    const peak = integer(between(10000, 20000));
    views[15] = peak;
    views[14] = count(peak * between(0.03, 0.07));
    views[16] = count(peak * between(0.04, 0.1));
    views[17] = count(peak * between(0.01, 0.04));
    return views;
  }, 6);
  add("smoothed_counts", "legitimate", "Relatório suaviza contagens com média móvel de quatro horas e arredonda os valores.", () => {
    const raw = steady(51, between(500000, 1500000));
    return Array.from({ length: 48 }, (_, hour) => integer(raw.slice(hour, hour + 4).reduce((a, b) => a + b, 0) / 4));
  });
  add("short_plateau", "legitimate", "Contagem arredondada mantém seis horas iguais, sem queda de 90%.", () => {
    const level = integer(between(200, 500));
    const views = steady(24, level * 0.3);
    views.splice(8, 6, ...Array(6).fill(level));
    return views;
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
    const views = steady(48, between(50, 180));
    views[18] += integer(between(8000, 14000));
    return views;
  });
  add("mechanical_launch", "suspicious", "Emissão mecânica começa na publicação e continua até o fim da série.", () => {
    const level = between(300, 2000);
    return Array.from({ length: 48 }, () => integer(level + between(-2, 2)));
  });
  add("mechanical_block", "suspicious", "Emissão mecânica mantém um patamar durante dezesseis horas.", () => {
    const views = steady(48, between(50, 100));
    const level = between(3000, 10000);
    views.splice(12, 16, ...Array.from({ length: 16 }, () => integer(level + Math.sqrt(level) * 0.1 * normal())));
    return views;
  });
  add("short_mechanical_block", "suspicious", "Emissão mecânica com ruído termina após seis horas.", () => {
    const views = steady(48, between(50, 100));
    const level = between(3000, 15000);
    views.splice(12, 6, ...Array.from({ length: 6 }, () => integer(level + Math.sqrt(level) * 0.45 * normal())));
    return views;
  });
  add("disguised_bots", "suspicious", "Bots simulam a mesma distribuição de uma onda orgânica; só as contagens não revelam a origem.", wave);
  return samples;
}
