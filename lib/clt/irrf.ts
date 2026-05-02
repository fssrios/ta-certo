/**
 * Tabelas progressivas de IRRF por período de competência.
 *
 * Tabela 1 — Fev/2024 a Abr/2025 (MP 1.206/2024): parcela final R$896,00
 * Tabela 2 — Mai/2025 em diante:                   parcela final R$908,73
 *
 * Desconto progressivo Lei 15.270/2025 — vigente a partir de Jan/2026:
 *   Base ≤ R$5.000      → IRRF = 0 (isenção total)
 *   Base R$5.000–R$7.350 → desconto = R$978,62 − (0,133145 × rendimento bruto)
 *   Base > R$7.350      → sem desconto adicional
 *
 * Base de cálculo = Salário Bruto − INSS − (dependentes × R$ 189,59)
 */

const DEDUCAO_DEPENDENTE = 189.59;

type IrrfFaixa = { limit: number; rate: number; deduction: number };

const FAIXAS_BASE: IrrfFaixa[] = [
  { limit: 2259.20,  rate: 0,     deduction: 0      },
  { limit: 2826.65,  rate: 0.075, deduction: 169.44 },
  { limit: 3751.05,  rate: 0.15,  deduction: 381.44 },
  { limit: 4664.68,  rate: 0.225, deduction: 662.77 },
];

const FAIXA_FINAL_ANTIGA: IrrfFaixa = { limit: Infinity, rate: 0.275, deduction: 896.00 };  // até Abr/2025
const FAIXA_FINAL_NOVA:   IrrfFaixa = { limit: Infinity, rate: 0.275, deduction: 908.73 };  // Mai/2025+

function parseCompetencia(competencia: string): { mes: number; ano: number } {
  const parts = (competencia ?? "").split("/");
  return {
    mes: parseInt(parts[0], 10) || 1,
    ano: parseInt(parts[1], 10) || 2026,
  };
}

function getFaixas(competencia: string): IrrfFaixa[] {
  const { mes, ano } = parseCompetencia(competencia);
  const usaNova = ano > 2025 || (ano === 2025 && mes >= 5);
  return [...FAIXAS_BASE, usaNova ? FAIXA_FINAL_NOVA : FAIXA_FINAL_ANTIGA];
}

export function calcularIRRF(
  salarioBruto: number,
  inss: number,
  dependentes: number,
  competencia: string = "01/2026",
  deducoesAdicionais: number = 0
): number {
  const { ano } = parseCompetencia(competencia);
  const base = round2(salarioBruto - inss - dependentes * DEDUCAO_DEPENDENTE - deducoesAdicionais);
  if (base <= 0) return 0;

  // Cálculo pela tabela progressiva
  let irrf = 0;
  for (const faixa of getFaixas(competencia)) {
    if (base <= faixa.limit) {
      irrf = Math.max(0, round2(base * faixa.rate - faixa.deduction));
      break;
    }
  }

  // Lei 15.270/2025 — desconto progressivo (vigente a partir de Jan/2026)
  if (ano >= 2026 && irrf > 0) {
    if (salarioBruto <= 5000.00) {
      return 0;
    } else if (salarioBruto <= 7350.00) {
      const desconto = round2(978.62 - 0.133145 * salarioBruto);
      irrf = Math.max(0, round2(irrf - Math.max(desconto, 0)));
    }
    // Acima de R$7.350: sem desconto adicional
  }

  return irrf;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
