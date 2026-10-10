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
    [12000, ...Array(23).fill(100)],
    [...Array(12).fill(0), 12000, ...Array(11).fill(100)],
    [...Array(22).fill(100), 12000, 100],
  ])("prefere não acusar um pico sem referência completa: %j", (...views) => {
    const result = classify(views);
    expect(result.classification).toBe("inconclusive");
    expect(result.signals.peak.missing_context).toBe(true);
    expect(JSON.stringify(result)).not.toContain("NaN");
  });

  it("detecta repetição desde a publicação, sem salto nem queda", () => {
    const result = classify(Array(24).fill(500));
    expect(result.classification).toBe("suspect");
    expect(result.signals.repetition?.match).toBe("strong");
    expect(result.signals.repetition?.start_hour).toBe(0);
    expect(result.signals.repetition?.variation_index).toBe(0);
    expect(result.signals.repetition?.drop).toBe(0);
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
    expect(classify([...Array(8).fill(3000), ...block, ...Array(8).fill(3000)]).classification).toBe("inconclusive");
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
    expect(classify(views)).toMatchObject({ classification: "inconclusive", signals: { repetition: { hours: 6, match: null } } });
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
