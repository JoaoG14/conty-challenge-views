import { describe, expect, it } from "vitest";
import { classify } from "../src/classifier.ts";
import { variation } from "../src/stats.ts";

const repeat = (values: number[], times: number) => Array.from({ length: times }, () => values).flat();

describe("classificação de views", () => {
  it("distingue pico concentrado de um viral com crescimento e cauda", () => {
    const bought = [...Array(12).fill(100), 12000, ...Array(11).fill(100)];
    const organic = [100, 120, 180, 300, 600, 1200, 2500, 4500, 7000, 9500, 11000, 12000,
      11000, 9500, 8000, 6500, 5000, 4000, 3000, 2200, 1600, 1000, 600, 300];
    expect(classify(bought).classification).toBe("suspect");
    expect(classify(organic).classification).toBe("not_suspect");
  });

  it("aceita os limites de 10 vezes, 50% do total e queda de 90%", () => {
    const views = [...Array(5).fill(1000), 10000, ...Array(3).fill(1000), ...Array(14).fill(0), 2000];
    expect(classify(views)).toMatchObject({
      classification: "suspect", total_views: 20000,
      signals: { peak: { ratio: 10, share: 0.5, drop: 0.9, detected: true } },
    });
  });

  it("prefere não acusar um viral curto com crescimento e cauda mesmo atendendo à regra de pico", () => {
    const views = [...Array(11).fill(100), 200, 12000, 200, 150, 100, ...Array(8).fill(100)];
    const result = classify(views);
    expect(result).toMatchObject({
      classification: "inconclusive",
      signals: { peak: { detected: true, organic_context: true, baseline: 100,
        previous_views: 200, previous_ratio: 2, following_views: [200, 150, 100],
        following_ratio: 2, declining_tail: true } },
      thresholds: { organic_context_ratio: 2 },
    });
    expect(result.reason).toContain("compatível com um viral orgânico");
    expect(result.reason).toContain("200, 150, 100 views, em queda progressiva");
  });

  it("só protege o pico com crescimento antes e depois e uma cauda estritamente decrescente", () => {
    for (const [previous, ...tail] of [[199, 200, 150, 100], [200, 199, 150, 100],
      [200, 200, 200, 100], [200, 200, 100, 150]]) {
      const views = [...Array(11).fill(100), previous, 12000, ...tail, ...Array(8).fill(100)];
      expect(classify(views)).toMatchObject({ classification: "suspect",
        signals: { peak: { detected: true, organic_context: false } } });
    }
  });

  it("mantém a suspeita por repetição independente mesmo com contexto orgânico no pico", () => {
    const views = [...Array(5).fill(100), 200, 50000, 200, 150, 100, ...Array(18).fill(2000)];
    const result = classify(views);
    expect(result).toMatchObject({ classification: "suspect", signals: {
      peak: { detected: true, organic_context: true }, repetition: { match: "strong" },
    } });
    expect(result.reason).toContain("atendendo à regra forte");
  });

  it("exige mais de 5.000 views, mesmo com os outros critérios atendidos", () => {
    const views = [...Array(5).fill(500), 5000, ...Array(18).fill(10)];
    expect(classify(views).signals.peak.detected).toBe(false);
    views[5] = 5001;
    expect(classify(views).signals.peak.detected).toBe(true);
  });

  it("usa a mediana das cinco horas anteriores para tolerar um valor alto isolado", () => {
    const views = [...Array(7).fill(10), 500, 500, 2000, 500, 500, 6000, ...Array(11).fill(10)];
    expect(classify(views)).toMatchObject({
      classification: "suspect", signals: { peak: { baseline: 500, ratio: 12 } },
    });
  });

  it.each([
    { name: "sem histórico", views: [12000, ...Array(23).fill(100)],
      details: ["o histórico anterior contém 0 das 5 horas necessárias"] },
    { name: "mediana zero", views: [...Array(12).fill(0), 12000, ...Array(11).fill(100)],
      details: ["a mediana das 5 horas anteriores é zero", "não é possível calcular a razão"] },
    { name: "sem horas seguintes suficientes", views: [...Array(22).fill(100), 12000, 100],
      details: ["o contexto posterior contém 1 das 3 horas necessárias"] },
    { name: "mediana zero e contexto posterior incompleto", views: [...Array(22).fill(0), 12000, 100],
      details: ["a mediana das 5 horas anteriores é zero", "o contexto posterior contém 1 das 3 horas necessárias"] },
  ])("explica o contexto que falta no pico: $name", ({ views, details }) => {
    const result = classify(views);
    expect(result.classification).toBe("inconclusive");
    expect(result.signals.peak.missing_context).toBe(true);
    expect(result.signals.peak.organic_context).toBe(false);
    for (const detail of details) expect(result.reason).toContain(detail);
    expect(result.reason).not.toContain("antes/depois ou");
  });

  it("detecta repetição desde a publicação, sem salto nem queda", () => {
    const result = classify(Array(24).fill(500));
    expect(result.classification).toBe("suspect");
    expect(result.signals.repetition?.match).toBe("strong");
    expect(result.signals.repetition?.start_hour).toBe(0);
    expect(result.signals.repetition?.variation_index).toBe(0);
    expect(result.signals.repetition?.drop).toBe(0);
    expect(result.reason).toContain("no máximo 0,1");
    expect(result.reason).toContain("pelo menos 18 horas");
    const adjusted = classify(Array(24).fill(500), { strong_hours: 20, strong_index: 0.08,
      with_drop_hours: 8, with_drop_index: 0.3 });
    expect(adjusted.reason).toContain("no máximo 0,08");
    expect(adjusted.reason).toContain("pelo menos 20 horas");
  });

  it("ajusta a regularidade pelo volume em vez de acusar um viral por variar menos de 2%", () => {
    const small = variation([199, 200, 201, 199, 200, 201]);
    const viral = variation([998000, 1000000, 1002000, 998000, 1000000, 1002000]);
    expect(small.variation_index).toBeCloseTo(0.06325, 4);
    expect(viral.variation_index).toBeCloseTo(1.78885, 4);
    expect(classify(repeat([998000, 1000000, 1002000], 8)).classification).toBe("not_suspect");
  });

  it("combina repetição moderada de oito horas com queda após o mesmo trecho", () => {
    const block = repeat([9980, 10020], 4);
    const result = classify([...Array(8).fill(100), ...block, ...Array(8).fill(100)]);
    expect(result.classification).toBe("suspect");
    expect(result.signals.repetition).toMatchObject({ start_hour: 8, end_hour: 15, hours: 8, match: "with_drop", drop: 0.99 });
    expect(result.reason).toContain("no máximo 0,3");
    expect(result.reason).toContain("pelo menos 8 horas");
    expect(result.reason).toContain("99%, atingindo o mínimo de 90%");
    const noDrop = classify([...Array(8).fill(3000), ...block, ...Array(8).fill(3000)]);
    expect(noDrop.classification).toBe("inconclusive");
    expect(noDrop.reason).toContain("queda mínima de 90% (a queda medida foi de 70,009%)");
  });

  it("não usa uma queda distante para completar uma repetição", () => {
    const views = [...repeat([9980, 10020], 4), ...repeat([2500, 3000, 3500], 4), ...Array(4).fill(0)];
    const result = classify(views);
    expect(result.signals.abrupt_drop).not.toBeNull();
    expect(result.signals.repetition?.match).toBeNull();
    expect(result.classification).toBe("inconclusive");
  });

  it("deixa uma repetição curta inconclusiva mesmo com queda", () => {
    const views = [...Array(8).fill(100), ...Array(6).fill(5000), ...Array(10).fill(100)];
    const result = classify(views);
    expect(result).toMatchObject({ classification: "inconclusive", signals: { repetition: { hours: 6, match: null } } });
    expect(result.reason).toContain("Para a regra forte, falta: duração mínima de 18 horas.");
    expect(result.reason).toContain("Para a regra com queda, falta: duração mínima de 8 horas.");
  });

  it("explica quando a repetição termina sem as horas necessárias para medir a queda", () => {
    const result = classify([...Array(16).fill(100), ...repeat([9980, 10020], 4)]);
    expect(result.classification).toBe("inconclusive");
    expect(result.reason).toContain("duração mínima de 18 horas e índice de no máximo 0,1");
    expect(result.reason).toContain("3 horas seguintes para medir a queda (há 0)");
  });

  it("uma queda isolada pode ser falha de coleta e não basta para suspeitar", () => {
    const result = classify([...repeat([4000, 7000, 9000], 8), ...Array(24).fill(0)]);
    expect(result.classification).toBe("inconclusive");
    expect(result.signals.abrupt_drop?.drop).toBe(1);
  });

  it("uma regra completa prevalece mesmo se o pico estiver sem histórico", () => {
    const result = classify([30000, ...Array(23).fill(1000)]);
    expect(result.signals.peak.missing_context).toBe(true);
    expect(result.signals.repetition?.match).toBe("strong");
    expect(result.classification).toBe("suspect");
  });

  it("não transforma pouco volume ou série curta em prova de repetição", () => {
    for (const views of [Array(24).fill(0), Array(24).fill(10), Array(18).fill(1000)]) {
      expect(classify(views).classification).toBe("inconclusive");
    }
  });
});
