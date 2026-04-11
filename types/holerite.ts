/**
 * Holerite — representação estruturada e tipada de um contracheque CLT.
 *
 * Usado pelo CLT engine tanto para representar os valores DECLARADOS
 * (extraídos do holerite real) quanto os valores ESPERADOS (recalculados
 * pelas regras da legislação vigente).
 */
export interface Holerite {
  // ── Identificação ──────────────────────────────────────────────────────────
  nomeEmpregado: string;
  nomeEmpregador: string;
  cpf: string | null;
  cnpj: string | null;
  /** Formato "MM/AAAA" ex.: "03/2026" */
  competencia: string;
  dependentes: number;

  // ── Parâmetros do mês (necessários para cálculo de DSR) ───────────────────
  /** Dias úteis (seg–sáb) no mês de referência. Padrão: 22 */
  diasUteisNoMes: number;
  /** Domingos + feriados no mês de referência. Padrão: 4 */
  domingosFeriados: number;

  // ── Proventos (valores em R$) ─────────────────────────────────────────────
  salarioBase: number;
  /** Hora extra 50% — dias úteis (CLT art. 59 §1º) */
  horasExtras50: number;
  /** Hora extra 100% — domingos e feriados (CLT art. 59 §1º) */
  horasExtras100: number;
  /** Adicional noturno 20% sobre hora trabalhada entre 22h–5h (CLT art. 73) */
  adicionalNoturno: number;
  /** Adicional de insalubridade (10/20/40% sobre SM — CLT art. 192) */
  insalubridade: number;
  /** Adicional de periculosidade (30% sobre salário base — CLT art. 193) */
  periculosidade: number;
  /**
   * DSR (Descanso Semanal Remunerado) sobre verbas variáveis.
   * Fórmula: (totalVariáveis / diasÚteis) × domingosFeriados
   */
  dsrSobreVariaveis: number;
  /** Demais créditos (13º, férias, outros) */
  outrosCreditos: number;

  // ── Descontos (sempre positivos, em R$) ───────────────────────────────────
  descontoINSS: number;
  descontoIRRF: number;
  /** Vale-transporte — desconto máximo: 6% do salário base (Lei 7.418/1985) */
  descontoVT: number;
  outrosDescontos: number;

  // ── Totais calculados ─────────────────────────────────────────────────────
  /** salárioBase + todos os adicionais + DSR */
  salarioBruto: number;
  /** salarioBruto − (INSS + IRRF + VT + outrosDescontos) */
  salarioLiquido: number;
  /** Base de cálculo do FGTS (= salarioBruto para regime mensal) */
  baseFGTS: number;
  /** Depósito FGTS pelo empregador: 8% da baseFGTS (Lei 8.036/1990 art. 15) */
  valorFGTS: number;
}

// ── Aliases para legibilidade nos testes ──────────────────────────────────────
export type HoleriteDeclarado = Holerite;
export type HoleriteEsperado = Holerite;
