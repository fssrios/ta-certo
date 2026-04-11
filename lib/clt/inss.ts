/**
 * INSS 2026 — tabela progressiva
 * Portaria MPS (mesmos valores de 2025; atualizar quando nova portaria for publicada)
 * Teto: R$ 8.157,41
 */
const INSS_TABLE = [
  { limit: 1518.0, rate: 0.075 },
  { limit: 2793.88, rate: 0.09 },
  { limit: 4190.83, rate: 0.12 },
  { limit: 8157.41, rate: 0.14 },
] as const;

export function calcularINSS(salarioBruto: number): number {
  let inss = 0;
  let anterior = 0;
  const base = Math.min(salarioBruto, INSS_TABLE[INSS_TABLE.length - 1].limit);

  for (const faixa of INSS_TABLE) {
    if (base <= anterior) break;
    const valor = Math.min(base, faixa.limit) - anterior;
    inss += valor * faixa.rate;
    anterior = faixa.limit;
  }

  return round2(inss);
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
