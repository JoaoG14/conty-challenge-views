import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";

const app = createApp();
const post = (body: unknown) => app.request("/classify", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
});

describe("API", () => {
  it("responde com classificação, motivo e valores usados", async () => {
    const response = await post({ views: Array(24).fill(500) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.classification).toBe("suspect");
    expect(body.reason).toContain("índice de variação 0");
    expect(body.signals.repetition).toMatchObject({ mean: 500, standard_deviation: 0, variation_index: 0, match: "strong" });
    expect(body.thresholds.strong_hours).toBe(18);
    expect((await app.request("/health")).status).toBe(200);
  });

  it("rejeita formatos inválidos e contagens fora do contrato", async () => {
    for (const body of [null, [], {}, { views: [] }, { views: Array(169).fill(1) },
      { views: [1, -1] }, { views: [1.5] }, { views: ["100"] }, { views: [null] },
      { views: [Number.MAX_SAFE_INTEGER, 1] }]) {
      const response = await post(body);
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect((await response.json()).error).toBeTypeOf("string");
    }
    expect((await app.request("/classify", { method: "POST", body: "{" })).status).toBe(400);
  });

  it("aceita uma série válida pequena como inconclusiva e limita o tamanho do corpo", async () => {
    const response = await post({ views: [0] });
    expect(response.status).toBe(200);
    expect((await response.json()).classification).toBe("inconclusive");
    expect((await post({ views: Array(20000).fill(100) })).status).toBe(413);
  });
});
