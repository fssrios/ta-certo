export type AuditStatus = "pending" | "processing" | "done" | "error";

export interface Audit {
  id: string;
  user_id: string;
  created_at: string;
  file_url: string | null;
  raw_text: string | null;
  parsed_data: ParsedHolerite | null;
  audit_result: AuditResult | null;
  status: AuditStatus;
  error_message: string | null;
}

export interface ParsedHolerite {
  employee_name: string;
  employer_name: string;
  cpf: string | null;
  cnpj: string | null;
  /** Formato "MM/AAAA" */
  competencia: string;
  gross_salary: number;
  dependents: number;
  lines: HoleriteLine[];
  /** Dias úteis no mês — extraído do holerite ou default 22 */
  dias_uteis_no_mes?: number;
  /** Domingos + feriados do mês — extraído do holerite ou default 4 */
  domingos_feriados?: number;
}

export type HoleriteLineType =
  | "salario_base"
  | "hora_extra_50"
  | "hora_extra_100"
  | "adicional_noturno"
  | "dsr"
  | "dsr_sobre_variaveis"
  | "ferias"
  | "adicional_ferias"
  | "decimo_terceiro"
  | "insalubridade"
  | "periculosidade"
  | "inss"
  | "irrf"
  | "fgts"
  | "vale_transporte"
  | "vale_refeicao"
  | "vale_alimentacao"
  | "plano_saude"
  | "outros_creditos"
  | "outros_descontos";

export interface HoleriteLine {
  code: string | null;
  description: string;
  type: HoleriteLineType;
  kind: "credit" | "deduction" | "info";
  declared_value: number;
  /** Base de cálculo: nº de horas para extras/noturno, valor base para DSR etc. */
  basis: number | null;
  rate: number | null;
}

export type LineStatus = "ok" | "error" | "warning" | "info";

export interface AuditLine {
  description: string;
  type: HoleriteLineType;
  kind: "credit" | "deduction" | "info";
  declared_value: number;
  expected_value: number;
  difference: number;
  status: LineStatus;
  note: string | null;
}

export interface AuditResult {
  gross_salary: number;
  net_declared: number;
  net_expected: number;
  total_difference: number;
  lines: AuditLine[];
  summary: AuditSummary;
}

export interface AuditSummary {
  total_errors: number;
  total_warnings: number;
  inss_declared: number;
  inss_expected: number;
  irrf_declared: number;
  irrf_expected: number;
  fgts_declared: number;
  fgts_expected: number;
}

// ── Tipo retornado por /api/analyze (Claude interpreta o OCR) ─────────────────

export interface HoleriteAnalisado {
  salarioBase: number | null;
  horasExtras50: { quantidade: number | null; valor: number | null } | null;
  horasExtras100: { quantidade: number | null; valor: number | null } | null;
  adicionalNoturno: { percentual: number | null; valor: number | null } | null;
  insalubridade: { grau: string | null; valor: number | null } | null;
  periculosidade: { valor: number | null } | null;
  dsrSobreVariaveis: number | null;
  outrosProventos: Array<{ descricao: string; valor: number }> | null;
  descontoINSS: number | null;
  descontoIRRF: number | null;
  descontoVT: number | null;
  outrosDescontos: Array<{ descricao: string; valor: number }> | null;
  salarioBruto: number | null;
  salarioLiquido: number | null;
  baseFGTS: number | null;
  valorFGTS: number | null;
  mesReferencia: string | null;
  empregador: string | null;
  cargo: string | null;
  camposIncertos?: string[];
}

// ── Tabela auditorias ─────────────────────────────────────────────────────────
export interface Auditoria {
  id: string;
  user_id: string;
  created_at: string;
  mes_referencia: string | null;
  empregador: string | null;
  cargo: string | null;
  imagem_url: string | null;
  dados_extraidos: HoleriteAnalisado | null;
  dados_calculados: AuditResult | null;
  diferenca_total: number | null;
  qtd_erros: number | null;
}
