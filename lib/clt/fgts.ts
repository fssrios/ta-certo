// FGTS — 8% sobre salário bruto (art. 15 Lei 8.036/1990)
// Recolhido pelo empregador, não é desconto do funcionário
export function calcularFGTS(salarioBruto: number): number {
  return round2(salarioBruto * 0.08);
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
