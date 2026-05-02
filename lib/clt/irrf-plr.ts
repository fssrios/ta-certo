/**
 * Tabela exclusiva de IRRF sobre PLR/PPR
 * Lei 10.101/2000 Art. 3º §5º
 * Valores vigentes para 2024/2025 (IN RFB 2.174/2024)
 */

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const FAIXAS_PLR = [
  { limite: 7640.80,  aliquota: 0,     deducao: 0       },
  { limite: 9922.28,  aliquota: 0.075, deducao: 573.06  },
  { limite: 13167.00, aliquota: 0.15,  deducao: 1317.23 },
  { limite: 16380.38, aliquota: 0.225, deducao: 2304.76 },
  { limite: Infinity, aliquota: 0.275, deducao: 3123.78 },
];

export function calcularIRRF_PLR(valorPLR: number): number {
  if (valorPLR <= 0) return 0;

  for (const faixa of FAIXAS_PLR) {
    if (valorPLR <= faixa.limite) {
      return Math.max(0, round2(valorPLR * faixa.aliquota - faixa.deducao));
    }
  }

  const ultima = FAIXAS_PLR[FAIXAS_PLR.length - 1];
  return round2(valorPLR * ultima.aliquota - ultima.deducao);
}

export function getFaixaPLR(valorPLR: number): { aliquota: number; deducao: number; faixaLabel: string } {
  const brl = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2 });

  if (valorPLR <= FAIXAS_PLR[0].limite) {
    return { aliquota: 0, deducao: 0, faixaLabel: `Isento (até R$ ${brl(FAIXAS_PLR[0].limite)})` };
  }

  for (let i = 1; i < FAIXAS_PLR.length; i++) {
    if (valorPLR <= FAIXAS_PLR[i].limite) {
      const f = FAIXAS_PLR[i];
      return {
        aliquota: f.aliquota,
        deducao: f.deducao,
        faixaLabel: `${(f.aliquota * 100).toFixed(1)}% − R$ ${brl(f.deducao)}`,
      };
    }
  }

  const u = FAIXAS_PLR[FAIXAS_PLR.length - 1];
  return {
    aliquota: u.aliquota,
    deducao: u.deducao,
    faixaLabel: `${(u.aliquota * 100).toFixed(1)}% − R$ ${brl(u.deducao)}`,
  };
}
