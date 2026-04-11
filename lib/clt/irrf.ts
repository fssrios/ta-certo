/**
 * IRRF 2026 — tabela vigente
 * Base legal: RIR art. 677 + MP 1.206/2024
 * Base de cálculo = Salário Bruto − INSS − (dependentes × R$ 189,59)
 */
const IRRF_TABLE = [
  { limit: 2259.2, rate: 0, deduction: 0 },
  { limit: 2826.65, rate: 0.075, deduction: 169.44 },
  { limit: 3751.05, rate: 0.15, deduction: 381.44 },
  { limit: 4664.68, rate: 0.225, deduction: 662.77 },
  { limit: Infinity, rate: 0.275, deduction: 896.0 },
] as const;

const DEDUCAO_DEPENDENTE = 189.59;

export function calcularIRRF(
  salarioBruto: number,
  inss: number,
  dependentes: number
): number {
  const base = salarioBruto - inss - dependentes * DEDUCAO_DEPENDENTE;
  if (base <= 0) return 0;

  for (const faixa of IRRF_TABLE) {
    if (base <= faixa.limit) {
      return round2(Math.max(0, base * faixa.rate - faixa.deduction));
    }
  }

  return 0;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
