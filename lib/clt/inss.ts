/**
 * INSS — tabela progressiva temporal
 *
 * FAIXAS_2025 — Jan/2025 a Dez/2025 (Portaria MPS/MF nº 6/2025)
 *   Teto: R$ 951,63 (base máx R$ 8.157,41)
 *   Salário mínimo: R$ 1.518,00
 *
 * FAIXAS_2026 — Jan/2026 em diante (Portaria MPS/MF nº 13/2026)
 *   Teto calculado progressivo até R$ 8.475,55
 *   Salário mínimo: R$ 1.621,00
 */

interface FaixaINSS {
  limite: number;
  aliquota: number;
}

const FAIXAS_2025: FaixaINSS[] = [
  { limite: 1518.00,  aliquota: 0.075 },
  { limite: 2793.88,  aliquota: 0.09  },
  { limite: 4190.83,  aliquota: 0.12  },  // 3ª faixa — teto resulta em R$ 951,63
  { limite: 8157.41,  aliquota: 0.14  },
];

const FAIXAS_2026: FaixaINSS[] = [
  { limite: 1621.00,  aliquota: 0.075 },
  { limite: 2902.84,  aliquota: 0.09  },
  { limite: 4354.27,  aliquota: 0.12  },
  { limite: 8475.55,  aliquota: 0.14  },
];

function parseCompetencia(competencia: string): { mes: number; ano: number } {
  const parts = (competencia ?? "").split("/");
  const mes = parseInt(parts[0], 10) || 1;
  const ano = parseInt(parts[1], 10) || 2026;
  return { mes, ano };
}

function getFaixasINSS(competencia: string): FaixaINSS[] {
  const { ano } = parseCompetencia(competencia);
  return ano <= 2025 ? FAIXAS_2025 : FAIXAS_2026;
}

export function calcularINSS(salarioBruto: number, competencia: string = "01/2026"): number {
  const faixas = getFaixasINSS(competencia);
  const teto = faixas[faixas.length - 1].limite;
  const base = Math.min(salarioBruto, teto);

  let inss = 0;
  let anterior = 0;
  for (const faixa of faixas) {
    if (base <= anterior) break;
    const parcela = Math.min(base, faixa.limite) - anterior;
    inss += round2(parcela * faixa.aliquota);
    anterior = faixa.limite;
  }
  return round2(inss);
}

/** Teto máximo de desconto INSS para a competência informada */
export function getINSSTeto(competencia: string = "01/2026"): number {
  const faixas = getFaixasINSS(competencia);
  let teto = 0;
  let anterior = 0;
  for (const faixa of faixas) {
    teto += round2((faixa.limite - anterior) * faixa.aliquota);
    anterior = faixa.limite;
  }
  return round2(teto);
}

/** Salário mínimo nacional vigente na competência */
export function getSalarioMinimo(competencia: string = "01/2026"): number {
  const { ano } = parseCompetencia(competencia);
  return ano <= 2025 ? 1518.00 : 1621.00;
}

/** Salário família — limite de renda e valor do benefício */
export function getSalarioFamilia(competencia: string = "01/2026"): { limite: number; valor: number } {
  const { ano } = parseCompetencia(competencia);
  if (ano <= 2025) return { limite: 1819.26, valor: 62.04 };
  return { limite: 1944.40, valor: 67.54 };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
