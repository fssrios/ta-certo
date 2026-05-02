export type AuditStatus = "pending" | "processing" | "done" | "error";

export type TipoHolerite =
  | "folha_mensal"
  | "ferias"
  | "decimo_terceiro_1"
  | "decimo_terceiro_2"
  | "plr"
  | "rescisao"
  | "desconhecido";

export type TipoRescisao = "sem_justa_causa" | "pedido_demissao" | "acordo_mutuo" | "justa_causa";

export interface CenarioRescisao {
  tipo_rescisao: TipoRescisao | null;
  anos_servico: number | null;
  modalidade_aviso: "trabalhado" | "indenizado" | "nenhum" | null;
  ferias_vencidas_periodos: number;
  consistente: boolean;
  anomalias: string[];
  confianca: "alta" | "media" | "baixa";
}

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
  /** null = não extraído (AI não encontrou no holerite) */
  dependents: number | null;
  lines: HoleriteLine[];
  /** Dias úteis no mês — extraído do holerite ou default 22 */
  dias_uteis_no_mes?: number;
  /** Domingos + feriados do mês — extraído do holerite ou default 4 */
  domingos_feriados?: number;
  /** Horas mensais contratuais — informado pelo usuário ou default 220 (44h/sem) */
  horas_mensais_contrato?: number;
  /** Tipo de contrato — informado pelo usuário na tela de perguntas */
  tipo_contrato?: "privado" | "publico" | "aprendiz" | null;
  /** Tipo de holerite confirmado pelo usuário (sobrescreve a detecção automática) */
  tipo_holerite_confirmado?: TipoHolerite | null;
  /** Usuário confirmou que vendeu dias de férias (abono pecuniário) */
  abono_pecuniario?: boolean | null;
  /** Usuário confirmou que seu intervalo intrajornada é inferior a 1 hora */
  intervalo_reduzido?: boolean | null;
  /** Data de admissão — extraída do TRCT ou informada pelo usuário (DD/MM/AAAA) */
  data_admissao?: string | null;
  /** Data de rescisão / afastamento — extraída do TRCT (DD/MM/AAAA) */
  data_rescisao?: string | null;
  /** Tipo de rescisão — confirmado pelo usuário */
  tipo_rescisao?: TipoRescisao | null;
  /** Saldo total acumulado do FGTS — extraído do TRCT (para cálculo da multa) */
  saldo_fgts_acumulado?: number | null;
  /** Anos completos de serviço — fallback quando data_admissao não está disponível */
  anos_servico_completos?: number | null;
  /** Modalidade do aviso prévio — informada pelo usuário */
  modalidade_aviso?: "trabalhado" | "indenizado" | "nenhum" | null;
  /** Períodos de férias vencidas — informado pelo usuário */
  ferias_vencidas_periodos?: number | null;
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

export type LineStatus = "ok" | "error" | "warning" | "info" | "legal_violation" | "unverifiable" | "manual_check";

export interface ConditionalScenario {
  /** Ex: "Se você fez 10h extras" */
  label: string;
  /** Valor correto nesse cenário */
  expected: number;
  /** true se o valor declarado coincide com esse cenário (tolerância R$0,05) */
  matches: boolean;
  /** declared_value − expected (negativo = holerite paga menos) */
  difference: number;
  /** Quando true, oculta a coluna de comparação (a mais/a menos) na UI — usado em tabelas de consulta como sobreaviso */
  hideComparison?: boolean;
}

export interface AuditLine {
  description: string;
  type: HoleriteLineType;
  kind: "credit" | "deduction" | "info";
  declared_value: number;
  expected_value: number;
  difference: number;
  status: LineStatus;
  note: string | null;
  /** Citação legal quando status === "legal_violation" — ex.: "CLT Art. 59 §1º" */
  legal_citation?: string | null;
  /** Cenários condicionais quando status === "manual_check" */
  scenarios?: ConditionalScenario[] | null;
  /** Dica de como o usuário pode verificar por conta própria */
  tip?: string | null;
  /** Classifica se a violação é recorrente (todo mês) ou pontual (ocorreu 1x) */
  recurrence?: "recurring" | "one_time" | "unknown";
}

export interface AuditResult {
  gross_salary: number;
  net_declared: number;
  net_expected: number;
  total_difference: number;
  lines: AuditLine[];
  summary: AuditSummary;
  /** Campos pulados pelo usuário na tela de perguntas (UI only, não calculado pelo engine) */
  campos_pulados?: string[];
  /** Tipo de holerite detectado automaticamente pelo motor */
  tipo_holerite?: TipoHolerite;
  /** Soma das violações classificadas como recorrentes (impacto mensal) */
  impactoRecorrente?: number;
  /** Soma das violações classificadas como pontuais (ocorreram uma vez) */
  impactoPontual?: number;
  /** Projeção anual: impactoRecorrente × 12; null se não houver recorrentes */
  projecaoAnual?: number | null;
  /** Cenário inferido a partir das verbas declaradas (rescisão) */
  cenario_inferido?: CenarioRescisao;
  /** true quando tipoR ou anosTrab foram obtidos via inferência (não informados pelo usuário) */
  usou_inferencia?: boolean;
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
  horasExtras50: { percentual: number | null; quantidade: number | null; valor: number | null } | null;
  horasExtras100: { percentual: number | null; quantidade: number | null; valor: number | null } | null;
  adicionalNoturno: { percentual: number | null; quantidade: number | null; valor: number | null } | null;
  insalubridade: { grau: string | null; valor: number | null } | null;
  periculosidade: { valor: number | null } | null;
  dsrSobreVariaveis: number | null;
  /** Referência declarada na linha de DSR, ex: "4/24" → diasDsr:4, diasUteis:24 */
  dsrReferencia: { diasDsr: number; diasUteis: number } | null;
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
  /** Número de dependentes IRRF — extraído do holerite se constar no documento */
  dependentes?: number | null;
  /** Jornada mensal contratual (ex: 220) — extraída do holerite se constar */
  jornadaMensal?: number | null;
  /** Tipo de holerite classificado pela IA — alimenta tipo_holerite_confirmado no ParsedHolerite */
  tipoHolerite?: TipoHolerite | null;
  camposIncertos?: string[];
  /** Campos específicos de rescisão (TRCT) */
  dataAdmissao?: string | null;
  dataRescisao?: string | null;
  tipoRescisao?: "sem_justa_causa" | "pedido_demissao" | "acordo_mutuo" | "justa_causa" | null;
  saldoFGTSAcumulado?: number | null;
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
