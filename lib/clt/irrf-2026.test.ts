/**
 * Testes da Lei 15.270/2025 — desconto progressivo de IRRF (jan/2026+)
 *
 * Parâmetros de cada caso: calcularIRRF(salarioBruto, inss, dependentes, competencia)
 * INSS = 0 e dependentes = 0 para isolar a tabela IRRF e o desconto Lei 15.270.
 *
 * Três zonas:
 *   salarioBruto ≤ R$5.000      → IRRF = 0 (isenção total)
 *   R$5.000 < bruto ≤ R$7.350  → desconto = R$978,62 − (0,133145 × bruto), IRRF reduzido
 *   salarioBruto > R$7.350      → tabela progressiva pura, sem desconto adicional
 */

import { describe, it, expect } from "vitest";
import { calcularIRRF } from "./irrf";

describe("IRRF 2026 — Lei 15.270/2025 (desconto progressivo)", () => {

  // ── Zona 1: isenção total (salarioBruto ≤ R$5.000) ────────────────────────

  it("caso 1 — bruto R$3.000 → IRRF = 0 (isenção total)", () => {
    // base = 3.000, faixa 15%: raw = 3000 × 0,15 − 381,44 = 68,56
    // Lei 15.270: 3.000 ≤ 5.000 → return 0
    expect(calcularIRRF(3000, 0, 0, "01/2026")).toBe(0);
  });

  it("caso 2 — bruto exatamente R$5.000 → IRRF = 0 (limite da isenção)", () => {
    // base = 5.000, faixa 27,5%: raw = 5000 × 0,275 − 908,73 = 466,27
    // Lei 15.270: 5.000 ≤ 5.000 → return 0
    expect(calcularIRRF(5000, 0, 0, "01/2026")).toBe(0);
  });

  // ── Zona 2: desconto progressivo (R$5.000 < bruto ≤ R$7.350) ────────────

  it("caso 3 — bruto R$5.000,01 → início do desconto parcial", () => {
    // base = 5.000,01, faixa 27,5%: raw = round2(5000,01 × 0,275 − 908,73) = 466,27
    // desconto = round2(978,62 − 0,133145 × 5.000,01) = round2(978,62 − 665,73) = 312,89
    // IRRF = round2(466,27 − 312,89) = 153,38
    expect(calcularIRRF(5000.01, 0, 0, "01/2026")).toBe(153.38);
  });

  it("caso 4 — bruto R$6.000 → desconto progressivo aplicado", () => {
    // base = 6.000, faixa 27,5%: raw = round2(6000 × 0,275 − 908,73) = round2(741,27) = 741,27
    // desconto = round2(978,62 − 0,133145 × 6.000) = round2(978,62 − 798,87) = 179,75
    // IRRF = round2(741,27 − 179,75) = 561,52
    expect(calcularIRRF(6000, 0, 0, "01/2026")).toBe(561.52);
  });

  it("caso 5 — bruto R$7.350 → limite superior do desconto (desconto ≈ R$0)", () => {
    // base = 7.350, faixa 27,5%: raw = round2(7350 × 0,275 − 908,73) = round2(1112,52) = 1112,52
    // desconto = round2(978,62 − 0,133145 × 7.350) = round2(978,62 − 978,62) = 0,00
    // IRRF = round2(1112,52 − 0,00) = 1112,52
    expect(calcularIRRF(7350, 0, 0, "01/2026")).toBe(1112.52);
  });

  // ── Zona 3: tabela progressiva pura, sem desconto Lei 15.270 ──────────────

  it("caso 6 — bruto R$7.350,01 → SEM desconto Lei 15.270 (acima do teto)", () => {
    // base = 7.350,01, faixa 27,5%: raw = round2(7350,01 × 0,275 − 908,73) = round2(1112,52) = 1112,52
    // Lei 15.270: 7.350,01 > 7.350 → sem desconto adicional
    // IRRF = 1112,52
    expect(calcularIRRF(7350.01, 0, 0, "01/2026")).toBe(1112.52);
  });

  it("caso 7 — bruto R$15.000 → tabela pura 27,5%, sem desconto", () => {
    // base = 15.000, faixa 27,5%: raw = round2(15000 × 0,275 − 908,73) = round2(3216,27) = 3216,27
    // Lei 15.270: 15.000 > 7.350 → sem desconto
    // IRRF = 3216,27
    expect(calcularIRRF(15000, 0, 0, "01/2026")).toBe(3216.27);
  });

  // ── Regressão: competência 2025 NÃO aplica Lei 15.270 ────────────────────

  it("caso 8 — regressão: bruto R$6.000 em jun/2025 → tabela Mai/2025 SEM desconto", () => {
    // base = 6.000, tabela Mai/2025 (deducao = R$908,73)
    // raw = round2(6000 × 0,275 − 908,73) = round2(741,27) = 741,27
    // ano = 2025 < 2026 → Lei 15.270 NÃO se aplica
    // IRRF = 741,27
    expect(calcularIRRF(6000, 0, 0, "06/2025")).toBe(741.27);
  });

  // ── Regressão: competência anterior a Mai/2025 usa parcela R$896,00 ───────

  it("caso 9 — regressão: bruto R$6.000 em jan/2025 → tabela Fev/2024 (deducao R$896,00)", () => {
    // base = 6.000, tabela antiga (deducao = R$896,00, vigente até Abr/2025)
    // raw = round2(6000 × 0,275 − 896,00) = round2(1650 − 896,00) = round2(754,00) = 754,00
    // ano = 2025 < 2026 → Lei 15.270 NÃO se aplica
    // IRRF = 754,00
    expect(calcularIRRF(6000, 0, 0, "01/2025")).toBe(754.00);
  });

  // ── Casos com dependentes e INSS (cenário realista) ──────────────────────

  it("caso 10 — bruto R$4.500, INSS R$450, 1 dependente, jan/2026 → IRRF = 0", () => {
    // base = round2(4500 − 450 − 189,59) = round2(3860,41) = 3860,41
    // faixa 15%: raw = round2(3860,41 × 0,15 − 381,44) = round2(579,06 − 381,44) = round2(197,62) = 197,62
    // Lei 15.270: salarioBruto = 4.500 ≤ 5.000 → IRRF = 0
    expect(calcularIRRF(4500, 450, 1, "01/2026")).toBe(0);
  });

  it("caso 11 — bruto R$6.500, INSS R$660, 0 dependentes, jan/2026 → desconto parcial aplicado", () => {
    // base = round2(6500 − 660) = 5840
    // faixa 27,5%: raw = round2(5840 × 0,275 − 908,73) = round2(1606 − 908,73) = round2(697,27) = 697,27
    // desconto = round2(978,62 − 0,133145 × 6500) = round2(978,62 − 865,44) = round2(113,18) = 113,18
    // IRRF = round2(697,27 − 113,18) = 584,09
    const inss = 660;
    const base = Math.round((6500 - inss) * 100) / 100; // = 5840
    const rawIRRF = Math.round((5840 * 0.275 - 908.73) * 100) / 100;
    const desconto = Math.round((978.62 - 0.133145 * 6500) * 100) / 100;
    const expected = Math.max(0, Math.round((rawIRRF - Math.max(desconto, 0)) * 100) / 100);
    expect(calcularIRRF(6500, inss, 0, "01/2026")).toBe(expected);
  });
});
