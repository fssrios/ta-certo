/**
 * CLT Engine 2026
 *
 * Motor de regras que recalcula cada linha de um holerite conforme a
 * legislação CLT vigente e produz o AuditResult com a comparação
 * linha a linha (declarado × esperado).
 */
import type {
  ParsedHolerite,
  HoleriteLine,
  AuditResult,
  AuditLine,
  AuditSummary,
  LineStatus,
  ConditionalScenario,
  TipoHolerite,
  TipoRescisao,
  CenarioRescisao,
} from "@/lib/types";
import type { Holerite, HoleriteDeclarado, HoleriteEsperado } from "@/types/holerite";
import { calcularINSS, getINSSTeto, getSalarioMinimo } from "./inss";
import { calcularIRRF } from "./irrf";
import { calcularIRRF_PLR, getFaixaPLR } from "./irrf-plr";
import { calcularFGTS } from "./fgts";

// ── Constantes ──────────────────────────────────────────────────────────────

/** Tolerância de arredondamento bancário (R$ 0,05) */
const TOLERANCE = 0.05;

/** Jornada mensal CLT: 44h/sem × 30 dias ÷ 7 dias = ~220h */
const HORAS_MES = 220;

/** Defaults para meses sem informação explícita no holerite */
const DEFAULT_DIAS_UTEIS = 22;
const DEFAULT_DOMINGOS_FERIADOS = 4;

// ── Deduções adicionais da base de cálculo do IRRF ──────────────────────────

/**
 * Identifica se uma rubrica de desconto é dedutível da base do IRRF, além do
 * INSS e dependentes (RIR/2018 Art. 677; IN RFB 2.145/2023).
 *
 * Dedutíveis: previdência complementar/oficial, plano de saúde vinculado ao
 * empregador, pensão alimentícia judicial, PGBL.
 * NÃO dedutíveis: associações de classe (AMIAMSPE, CREMERS, CRMSP),
 * contribuição sindical/assistencial, consignado, VT.
 *
 * ATENÇÃO: "AMIAMSPE ASSOC MEDICA DO IAMSPE" contém "IAMSPE" no final —
 * por isso as EXCLUSÕES devem rodar ANTES dos testes de inclusão.
 */
export function isDedutivelIRRF(description: string): boolean {
  const d = description.toUpperCase();

  // ── Exclusões (rodam primeiro) ─────────────────────────────────────────────
  if (/^AMI[A-Z]|ASSOC[A-Z.\s]*M[EÉ]D|ASSOC[A-Z.\s]*CLASSE|ASSOCIA[CÇ][AÃ]O/i.test(d)) return false;
  if (/SINDICAT|CONTRIBUI[CÇ][AÃ]O\s*(SINDIC|ASSIST|CONFED)/i.test(d)) return false;
  if (/CONSIGNAD|EMPR[EÉ]STIMO|CRM[A-Z]{2,}|CREA\b|OAB\b|CREMERS|CRMSP|CREMESP/i.test(d)) return false;

  // ── Inclusões (só chegam aqui se não foram excluídas) ─────────────────────
  // Previdência complementar/oficial — dedutível na base mensal do IRRF
  if (/SPPREVCOM|FUNPRESP|PETROS\b|CENTRUS|REGIUS/.test(d)) return true;
  if (/PREVID[EÊ]NCIA|PREV\s*COMP/.test(d)) return true;
  if (/\bPGBL\b/.test(d)) return true;
  // Pensão alimentícia judicial — dedutível na base mensal do IRRF
  if (/PENS[AÃ]O\s*(ALIMENT|JUDICIAL)/.test(d)) return true;
  // Plano de saúde e IAMSPE NÃO são dedutíveis na base mensal do IRRF;
  // só na DIRPF anual. Mantidos fora deliberadamente.

  return false;
}

// ── Cross-check IRRF: busca combinatória de deduções não identificadas ────────

interface ExplicacaoIRRF {
  explicou: boolean;
  parcial: boolean;
  residual: number;
  descricao: string;
}

/**
 * Tenta explicar uma divergência de IRRF (motor > declarado) testando
 * combinações de outros descontos como possíveis deduções da base.
 * Força bruta para n≤8 candidatas; apenas individuais+pares acima disso.
 */
function tentarExplicarDiferencaIRRF(
  salarioBruto: number,
  inssCalculado: number,
  dependentes: number,
  competencia: string,
  deducoesBase: number,
  irrfDeclarado: number,
  candidatas: HoleriteLine[]
): ExplicacaoIRRF {
  const TOLE = 1.00;

  function irrfComExtra(extra: number): number {
    return calcularIRRF(salarioBruto, inssCalculado, dependentes, competencia, deducoesBase + extra);
  }

  const n = candidatas.length;
  if (n === 0) return { explicou: false, parcial: false, residual: 0, descricao: "" };

  // Força bruta para até 8 candidatas (2^8 = 256 combinações)
  if (n <= 8) {
    for (let mask = 1; mask < (1 << n); mask++) {
      const subset: HoleriteLine[] = [];
      let total = 0;
      for (let i = 0; i < n; i++) {
        if (mask & (1 << i)) { subset.push(candidatas[i]); total += candidatas[i].declared_value; }
      }
      if (Math.abs(irrfComExtra(total) - irrfDeclarado) <= TOLE) {
        return {
          explicou: true,
          parcial: false,
          residual: 0,
          descricao: subset.map((l) => `${l.description} (${fmt(l.declared_value)})`).join(" + "),
        };
      }
    }
  } else {
    // Mais de 8: testar individuais e pares
    for (const c of candidatas) {
      if (Math.abs(irrfComExtra(c.declared_value) - irrfDeclarado) <= TOLE) {
        return { explicou: true, parcial: false, residual: 0, descricao: `${c.description} (${fmt(c.declared_value)})` };
      }
    }
    for (let i = 0; i < candidatas.length; i++) {
      for (let j = i + 1; j < candidatas.length; j++) {
        const total = candidatas[i].declared_value + candidatas[j].declared_value;
        if (Math.abs(irrfComExtra(total) - irrfDeclarado) <= TOLE) {
          return {
            explicou: true, parcial: false, residual: 0,
            descricao: `${candidatas[i].description} (${fmt(candidatas[i].declared_value)}) + ${candidatas[j].description} (${fmt(candidatas[j].declared_value)})`,
          };
        }
      }
    }
  }

  // Verificar explicação parcial: somar todas as candidatas melhora significativamente?
  const totalAll = candidatas.reduce((s, c) => s + c.declared_value, 0);
  const residualSemNada = Math.abs(irrfComExtra(0) - irrfDeclarado);
  const residualComTudo = Math.abs(irrfComExtra(totalAll) - irrfDeclarado);
  if (residualComTudo < residualSemNada / 2 && residualComTudo > TOLE) {
    return {
      explicou: false, parcial: true, residual: residualComTudo,
      descricao: candidatas.map((l) => `${l.description} (${fmt(l.declared_value)})`).join(" + "),
    };
  }

  return { explicou: false, parcial: false, residual: residualSemNada, descricao: "" };
}

// ── Classificação de recorrência ─────────────────────────────────────────────

const RECURRING_RE = /\b(sal[aá]rio|inss|irrf|fgts|vale[- ]transporte|\bvt\b|vale[- ]refei[cç][aã]o|\bvr\b|vale[- ]alimenta[cç][aã]o|\bva\b|plano\s*de?\s*sa[uú]de|hora[s]?\s*extra|adicional\s*noturno|insalubridade|periculosidade|dsr|desconto\s*sindical|contribui[cç][aã]o\s*sindical|pis\b|cofins\b)\b/i;
const ONE_TIME_RE = /\b(f[eé]rias|terço\s*constitucional|1\/3|adicional\s*de\s*f[eé]rias|13[°º]?\s*sal[aá]rio|d[eé]cimo|plr\b|participa[cç][aã]o\s*nos\s*lucros|abono|aviso\s*pr[eé]vio|multa\s*40|saldo\s*de\s*sal[aá]rio|acerto|rescis[aã]o|indeniza[cç][aã]o|gratifica[cç][aã]o\s*de\s*f[eé]rias|licen[cç]a\s*pr[eê]mio)\b/i;

/**
 * Classifica se uma violação é recorrente (acontece todo mês) ou pontual (1x).
 * Para tipos de holerite que são por natureza pontuais (férias, 13º, PLR, rescisão),
 * todas as linhas são classificadas como `one_time`.
 */
export function classifyRecurrence(
  description: string,
  tipoHolerite: TipoHolerite
): "recurring" | "one_time" | "unknown" {
  if (tipoHolerite === "ferias" || tipoHolerite === "decimo_terceiro_1" || tipoHolerite === "decimo_terceiro_2" || tipoHolerite === "plr" || tipoHolerite === "rescisao") {
    return "one_time";
  }
  if (ONE_TIME_RE.test(description)) return "one_time";
  if (RECURRING_RE.test(description)) return "recurring";
  return "unknown";
}

// ── Detecção do tipo de holerite ─────────────────────────────────────────────

/**
 * Identifica automaticamente o tipo de demonstrativo a partir das rubricas.
 * Se `parsed.tipo_holerite_confirmado` estiver definido, usa esse valor.
 */
export function detectarTipoHolerite(parsed: ParsedHolerite): TipoHolerite {
  if (parsed.tipo_holerite_confirmado) return parsed.tipo_holerite_confirmado;

  const allDescs = parsed.lines.map((l) => l.description).join(" | ");
  const tipos = new Set(parsed.lines.map((l) => l.type));

  // Rescisão — keywords fortes indicam TRCT
  if (/aviso\s*pr[eé]vio|multa\s*40|saldo\s*de\s*sal[aá]rio|f[eé]rias\s*proporcionais?|13[°º]\s*proporcional|\btrct\b|rescis[aã]o/i.test(allDescs)) {
    return "rescisao";
  }

  // PLR puro (sem rubrica de salário base mensal)
  if (
    /\bplr\b|\bppr\b|participa[çc][aã]o.{0,10}(lucros|resultados)/i.test(allDescs) &&
    !tipos.has("salario_base")
  ) {
    return "plr";
  }

  // 13º salário — type exato
  if (tipos.has("decimo_terceiro")) {
    const d13Descs = parsed.lines
      .filter((l) => l.type === "decimo_terceiro")
      .map((l) => l.description)
      .join(" | ");
    if (/1[aª°].{0,10}parcela|adiantamento|primeira.{0,8}parcela/i.test(d13Descs)) {
      return "decimo_terceiro_1";
    }
    return "decimo_terceiro_2";
  }

  // 13º salário — detecção por description quando IA não mapeou o type
  const D13_DESC_RE = /13[°º]?\s*(sal[aá]rio|terceiro)|d[eé]cimo\s*terceiro|gratifica[çc][aã]o\s*natalina/i;
  const ADIANT_D13_RE = /adiantamento|1[aª°]\s*parcela|antecipa[çc][aã]o/i;
  const d13DescLines = parsed.lines.filter(
    (l) => l.kind === "credit" && D13_DESC_RE.test(l.description)
  );
  if (d13DescLines.length > 0) {
    const d13Descs = d13DescLines.map((l) => l.description).join(" | ");
    if (/1[aª°].{0,10}parcela|adiantamento|primeira.{0,8}parcela/i.test(d13Descs)) {
      return "decimo_terceiro_1";
    }
    if (/2[aª°].{0,10}parcela|segunda.{0,8}parcela|complemento|saldo/i.test(d13Descs)) {
      return "decimo_terceiro_2";
    }
    // Desconto de adiantamento/1ª parcela no mesmo holerite → é a 2ª parcela
    const temAdiantamentoDesconto = parsed.lines.some(
      (l) => l.kind === "deduction" && ADIANT_D13_RE.test(l.description)
    );
    if (temAdiantamentoDesconto) return "decimo_terceiro_2";
    // Sem indicação de parcela: usar mês da competência
    const comp = parsed.competencia;
    if (comp) {
      const mes = parseInt(comp.split("/")[0], 10);
      if (!isNaN(mes) && mes <= 11) return "decimo_terceiro_1";
      if (!isNaN(mes) && mes === 12) return "decimo_terceiro_2";
    }
    return "decimo_terceiro_1"; // default: 1ª parcela
  }

  // Férias
  if (
    tipos.has("ferias") ||
    /\bf[eé]rias\b|1\/3\s*(constitucional|f[eé]rias)|ter[çc]o\s*constitucional|abono\s*pec[uú]ni[aá]rio/i.test(allDescs)
  ) {
    return "ferias";
  }

  // Folha mensal regular — type exato
  if (tipos.has("salario_base")) {
    return "folha_mensal";
  }

  // Folha mensal — detecção por description quando IA não mapeou o type corretamente
  const SAL_BASE_DESC_RE = /\bsal[aá]rio\s*(base|contratual|mensal)?\b|\bvencimento\b|\bremuner[aá][çc][aã]o\b|\bsal\.?\s*base\b|\bordenado\b/i;
  const temSalarioBaseDesc = parsed.lines.some(
    (l) => l.kind === "credit" && SAL_BASE_DESC_RE.test(l.description) && l.declared_value > 0 && !/13[°º]?\s*sal|d[eé]cimo|gratif.*natalin/i.test(l.description)
  );
  if (temSalarioBaseDesc) {
    return "folha_mensal";
  }

  // Fallback: qualquer crédito presente → provavelmente folha mensal (tipo mais comum)
  const temQualquerCredito = parsed.lines.some((l) => l.kind === "credit" && l.declared_value > 0);
  if (temQualquerCredito) {
    return "folha_mensal";
  }

  return "desconhecido";
}

// ── Funções de construção do Holerite ────────────────────────────────────────

/**
 * Extrai os valores DECLARADOS pelo empregador do ParsedHolerite e os
 * organiza no tipo Holerite estruturado.
 */
export function construirHoleriteDeclarado(parsed: ParsedHolerite): HoleriteDeclarado {
  const get = (type: string) =>
    parsed.lines.find((l) => l.type === type)?.declared_value ?? 0;

  const SAL_BASE_DESC_RE_DECL = /\bsal[aá]rio\s*(base|contratual|mensal)?\b|\bvencimento\b|\bremuner[aá][çc][aã]o\b|\bsal\.?\s*base\b|\bordenado\b/i;
  const salarioBaseLine =
    parsed.lines.find((l) => l.type === "salario_base") ??
    parsed.lines.find(
      (l) => l.kind === "credit" && SAL_BASE_DESC_RE_DECL.test(l.description) && l.declared_value > 0 && !/13[°º]?\s*sal|d[eé]cimo|gratif.*natalin/i.test(l.description)
    );
  const salarioBase = salarioBaseLine?.declared_value ?? parsed.gross_salary;
  const horasExtras50 = get("hora_extra_50");
  const horasExtras100 = get("hora_extra_100");
  const adicionalNoturno = get("adicional_noturno");
  const insalubridade = get("insalubridade");
  const periculosidade = get("periculosidade");
  const dsrSobreVariaveis = get("dsr_sobre_variaveis") || get("dsr");

  // Verbas não salariais — NÃO integram base de INSS/IRRF/FGTS (CLT Art. 457 §2º)
  const NAO_SALARIAL_RE =
    /\bplr\b|\bppr\b|participa[çc][aã]o.{0,10}(lucros|resultados)|di[aá]ria[s]?\b|ajuda\s*de\s*custo|pr[eê]mio\s*(eventual|espor[aá]dico)|\babono\b|reembols/i;

  // Rubricas de desconto que a IA pode ter classificado errado como crédito
  const DESCONTO_COMO_CREDITO_RE =
    /adiantamento|antecipa[çc][aã]o\s*salarial|consignado|pens[aã]o\s*aliment|\bplano\s*(de\s*)?(sa[uú]de|odonto)|coparticipa[çc][aã]o|contribui[çc][aã]o\s+sindical|mensalidade\s+(sindical|m[eé]dic|odont)|seguro\s*de\s*vida|farm[aá]cia|conv[eê]nio\s*(m[eé]dic|odont|sa[uú]de)/i;

  const outrosCreditos = parsed.lines
    .filter(
      (l) =>
        l.kind === "credit" &&
        ![
          "salario_base",
          "hora_extra_50",
          "hora_extra_100",
          "adicional_noturno",
          "insalubridade",
          "periculosidade",
          "dsr_sobre_variaveis",
          "dsr",
          "decimo_terceiro",
          "ferias",
          "adicional_ferias",
        ].includes(l.type) &&
        !NAO_SALARIAL_RE.test(l.description) &&
        !DESCONTO_COMO_CREDITO_RE.test(l.description)
    )
    .reduce((s, l) => s + l.declared_value, 0);

  const descontoINSS = get("inss");
  const descontoIRRF = get("irrf");
  const descontoVT = get("vale_transporte");

  const outrosDescontos = parsed.lines
    .filter(
      (l) =>
        l.kind === "deduction" &&
        !["inss", "irrf", "vale_transporte"].includes(l.type)
    )
    .reduce((s, l) => s + l.declared_value, 0);

  const fgtsLine = parsed.lines.find((l) => l.type === "fgts");
  const valorFGTS = fgtsLine?.declared_value ?? 0;

  const salarioBruto = round2(
    salarioBase +
      horasExtras50 +
      horasExtras100 +
      adicionalNoturno +
      insalubridade +
      periculosidade +
      dsrSobreVariaveis +
      outrosCreditos
  );

  const salarioLiquido = round2(
    salarioBruto - descontoINSS - descontoIRRF - descontoVT - outrosDescontos
  );

  return {
    nomeEmpregado: parsed.employee_name,
    nomeEmpregador: parsed.employer_name,
    cpf: parsed.cpf,
    cnpj: parsed.cnpj,
    competencia: parsed.competencia,
    dependentes: parsed.dependents ?? 0,
    horasMensais: parsed.horas_mensais_contrato ?? HORAS_MES,
    diasUteisNoMes: parsed.dias_uteis_no_mes ?? DEFAULT_DIAS_UTEIS,
    domingosFeriados: parsed.domingos_feriados ?? DEFAULT_DOMINGOS_FERIADOS,
    salarioBase,
    horasExtras50,
    horasExtras100,
    adicionalNoturno,
    insalubridade,
    periculosidade,
    dsrSobreVariaveis,
    outrosCreditos,
    descontoINSS,
    descontoIRRF,
    descontoVT,
    outrosDescontos,
    salarioBruto,
    salarioLiquido,
    baseFGTS: salarioBruto,
    valorFGTS,
  };
}

/**
 * Recalcula todos os valores conforme a CLT 2026 e retorna o Holerite
 * com os valores ESPERADOS (corretos).
 */
export function calcularHoleriteEsperado(
  declarado: HoleriteDeclarado,
  parsed: ParsedHolerite
): HoleriteEsperado {
  const valorHoraBase = declarado.salarioBase / declarado.horasMensais;

  // Extrai o ano do competência para selecionar a tabela correta de IRRF
  const anoCompetencia = (() => {
    const parts = declarado.competencia?.split("/");
    if (parts?.length === 2) {
      const a = parseInt(parts[1], 10);
      if (!isNaN(a) && a >= 2000) return a;
    }
    return 2026;
  })();

  // ── Insalubridade (10/20/40% do SM — CLT art. 192) ──────────────────────
  // Calculada antes das HEs pois integra a base da hora extra (Súmula 139 TST)
  const sm = getSalarioMinimo(declarado.competencia ?? "01/2026");
  const insalubridadeGraus = {
    minimo: round2(sm * 0.1),
    medio: round2(sm * 0.2),
    maximo: round2(sm * 0.4),
  };
  const insalubridadeEsperada = encontrarGrauInsalubridade(
    declarado.insalubridade,
    insalubridadeGraus
  );
  const insalubridade = declarado.insalubridade > 0
    ? insalubridadeEsperada
    : 0;

  // ── Periculosidade (30% do salário base — CLT art. 193) ─────────────────
  // Calculada antes das HEs pois integra a base da hora extra (Súmula 191 TST)
  const periculosidade = declarado.periculosidade > 0
    ? round2(declarado.salarioBase * 0.3)
    : 0;

  // Bug 3 — Súmula 139/191 TST: insalubridade e periculosidade integram a base da HE
  const valorHoraParaHE = (declarado.salarioBase + insalubridade + periculosidade) / declarado.horasMensais;
  // Bug 2 — OJ 97 SDI-1 TST: hora extra noturna usa valorHora × 1,20 como base
  const valorHoraHEBase = declarado.adicionalNoturno > 0
    ? round2(valorHoraParaHE * 1.20)
    : valorHoraParaHE;

  // ── Hora extra 50% (dias úteis) ─────────────────────────────────────────
  const he50Line = parsed.lines.find((l) => l.type === "hora_extra_50");
  const qtdHE50 = he50Line?.basis ?? null;
  const taxaHE50Decl = he50Line?.rate ?? null;
  let horasExtras50: number;
  if (qtdHE50 !== null) {
    horasExtras50 = round2(valorHoraHEBase * qtdHE50 * 1.5);
  } else if (taxaHE50Decl !== null && taxaHE50Decl < 0.495 && declarado.horasExtras50 > TOLERANCE) {
    // Bug 6: taxa abaixo do legal sem horas — corrige proporcionalmente para propagar nos reflexos
    horasExtras50 = round2(declarado.horasExtras50 * 1.5 / (1 + taxaHE50Decl));
  } else {
    horasExtras50 = declarado.horasExtras50;
  }

  // ── Hora extra 100% (domingos / feriados) ───────────────────────────────
  const he100Line = parsed.lines.find((l) => l.type === "hora_extra_100");
  const qtdHE100 = he100Line?.basis ?? null;
  const taxaHE100Decl = he100Line?.rate ?? null;
  let horasExtras100: number;
  if (qtdHE100 !== null) {
    horasExtras100 = round2(valorHoraHEBase * qtdHE100 * 2.0);
  } else if (taxaHE100Decl !== null && taxaHE100Decl < 0.95 && declarado.horasExtras100 > TOLERANCE) {
    horasExtras100 = round2(declarado.horasExtras100 * 2.0 / (1 + taxaHE100Decl));
  } else {
    horasExtras100 = declarado.horasExtras100;
  }

  // ── Adicional noturno 20% (22h–5h) ──────────────────────────────────────
  const noturnoLine = parsed.lines.find((l) => l.type === "adicional_noturno");
  const qtdHorasNoturnas = noturnoLine?.basis ?? null;
  const taxaNoturnaDecl = noturnoLine?.rate ?? null;
  let adicionalNoturno: number;
  if (qtdHorasNoturnas !== null) {
    adicionalNoturno = round2(valorHoraBase * qtdHorasNoturnas * 0.2);
  } else if (taxaNoturnaDecl !== null && taxaNoturnaDecl < 0.199 && taxaNoturnaDecl > 0.001) {
    // Bug 6: taxa abaixo do legal sem horas — corrige proporcionalmente para propagar nos reflexos
    adicionalNoturno = round2(declarado.adicionalNoturno * 0.2 / taxaNoturnaDecl);
  } else {
    adicionalNoturno = declarado.adicionalNoturno;
  }

  // ── DSR sobre verbas variáveis ───────────────────────────────────────────
  // DSR incide sobre HEs e comissões; adicional noturno habitual não entra na base
  const COMISSAO_RE = /comiss[oõãa]/i;
  const comissoes = parsed.lines
    .filter((l) => l.kind === "credit" && COMISSAO_RE.test(l.description))
    .reduce((s, l) => s + l.declared_value, 0);
  const verbasVariaveis = horasExtras50 + horasExtras100 + comissoes;
  const dsrLine = parsed.lines.find((l) => l.type === "dsr_sobre_variaveis" || l.type === "dsr");
  let dsrSobreVariaveis: number;
  if (dsrLine?.basis != null && dsrLine.rate != null && dsrLine.rate > 0) {
    // Referência declarada (basis=diasDSR, rate=diasÚteis): verifica a conta da empresa
    // com as verbas DECLARADAS para que bruto/INSS/FGTS sejam consistentes
    const verbasDecl = declarado.horasExtras50 + declarado.horasExtras100 + comissoes;
    dsrSobreVariaveis = verbasDecl > 0
      ? round2((verbasDecl / dsrLine.rate) * dsrLine.basis)
      : 0;
  } else if (verbasVariaveis > 0) {
    // Sem referência declarada: calcula pelo calendário real do mês de competência
    const diasDoMesEsp = calcularDiasDoMes(declarado.competencia, declarado.horasMensais);
    dsrSobreVariaveis = round2((verbasVariaveis / diasDoMesEsp.diasUteis) * diasDoMesEsp.domingosFeriados);
  } else {
    dsrSobreVariaveis = 0;
  }

  // ── Salário bruto esperado ───────────────────────────────────────────────
  const salarioBruto = round2(
    declarado.salarioBase +
      horasExtras50 +
      horasExtras100 +
      adicionalNoturno +
      insalubridade +
      periculosidade +
      dsrSobreVariaveis +
      declarado.outrosCreditos
  );

  // ── 13º 1ª parcela: sem INSS/IRRF; FGTS só sobre a parcela paga ─────────
  const tipoParaFgts = detectarTipoHolerite(parsed);
  if (tipoParaFgts === "decimo_terceiro_1") {
    const D13_RE = /13[°º]?\s*(sal[aá]rio|terceiro)|d[eé]cimo\s*terceiro|gratifica[çc][aã]o\s*natalina/i;
    const d13Line =
      parsed.lines.find((l) => l.type === "decimo_terceiro") ??
      parsed.lines.find((l) => l.kind === "credit" && D13_RE.test(l.description));
    const valorParcela = d13Line?.declared_value ?? salarioBruto;
    const fgts13 = calcularFGTS(valorParcela);
    return {
      ...declarado,
      horasExtras50,
      horasExtras100,
      adicionalNoturno,
      insalubridade,
      periculosidade,
      dsrSobreVariaveis,
      salarioBruto: valorParcela,
      descontoINSS: 0,
      descontoIRRF: 0,
      descontoVT: 0,
      salarioLiquido: valorParcela,
      baseFGTS: valorParcela,
      valorFGTS: fgts13,
    };
  }

  // ── Descontos esperados ──────────────────────────────────────────────────
  const comp = declarado.competencia ?? "01/2026";
  const descontoINSS = calcularINSS(salarioBruto, comp);
  // Deduções adicionais da base IRRF: previdência complementar, plano de saúde
  // vinculado ao empregador, pensão alimentícia judicial (RIR Art. 677)
  const deducoesAdicionaisIRRF = round2(
    parsed.lines
      .filter((l) => l.kind === "deduction" && isDedutivelIRRF(l.description))
      .reduce((sum, l) => sum + l.declared_value, 0)
  );
  const descontoIRRF = calcularIRRF(salarioBruto, descontoINSS, declarado.dependentes, comp, deducoesAdicionaisIRRF);

  const limiteVT = round2(declarado.salarioBase * 0.06);
  const descontoVT = declarado.descontoVT > 0
    ? Math.min(declarado.descontoVT, limiteVT)
    : 0;

  // ── FGTS (8% da remuneração bruta — Lei 8.036/1990 art. 15) ────────────
  const baseFGTS = salarioBruto;
  const valorFGTS = calcularFGTS(baseFGTS);

  const salarioLiquido = round2(
    salarioBruto -
      descontoINSS -
      descontoIRRF -
      descontoVT -
      declarado.outrosDescontos
  );

  return {
    ...declarado,
    horasExtras50,
    horasExtras100,
    adicionalNoturno,
    insalubridade,
    periculosidade,
    dsrSobreVariaveis,
    salarioBruto,
    descontoINSS,
    descontoIRRF,
    descontoVT,
    salarioLiquido,
    baseFGTS,
    valorFGTS,
  };
}

// ── Rescisão: utilitários de data ─────────────────────────────────────────────

function parseDDMMAAAA(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = parseInt(m[1], 10), mo = parseInt(m[2], 10) - 1, y = parseInt(m[3], 10);
  const dt = new Date(y, mo, d);
  return isNaN(dt.getTime()) ? null : dt;
}

function parseDtFromComp(competencia: string): Date | null {
  const parts = (competencia ?? "").split("/");
  const mes = parseInt(parts[0], 10), ano = parseInt(parts[1], 10);
  if (isNaN(mes) || isNaN(ano) || mes < 1 || mes > 12) return null;
  return new Date(ano, mes - 1, 28); // dia 28 como default seguro (existe em todos os meses)
}

function anosCompletos(admissao: Date, rescisao: Date): number {
  let anos = rescisao.getFullYear() - admissao.getFullYear();
  if (rescisao.getMonth() < admissao.getMonth() ||
     (rescisao.getMonth() === admissao.getMonth() && rescisao.getDate() < admissao.getDate())) {
    anos--;
  }
  return Math.max(0, anos);
}

/**
 * Conta meses entre `inicio` e `fim` onde meses com ≥ 15 dias trabalhados
 * contam como mês inteiro (Lei 4.090/62 Art. 1º §2º — regra do 13º proporcional).
 */
function mesesComFracao15(inicio: Date, fim: Date): number {
  if (inicio >= fim) return 0;
  let count = 0;
  let cur = new Date(inicio.getFullYear(), inicio.getMonth(), 1);
  while (cur.getFullYear() < fim.getFullYear() ||
        (cur.getFullYear() === fim.getFullYear() && cur.getMonth() <= fim.getMonth())) {
    const cy = cur.getFullYear(), cm = cur.getMonth();
    const daysInM = new Date(cy, cm + 1, 0).getDate();
    const dayFrom = (cy === inicio.getFullYear() && cm === inicio.getMonth()) ? inicio.getDate() : 1;
    const dayTo   = (cy === fim.getFullYear()    && cm === fim.getMonth())    ? fim.getDate()   : daysInM;
    if (dayTo >= dayFrom && (dayTo - dayFrom + 1) >= 15) count++;
    cur = new Date(cy, cm + 1, 1);
  }
  return count;
}

function ultimoAnivContrato(admissao: Date, referencia: Date): Date {
  let aniv = new Date(admissao.getFullYear(), admissao.getMonth(), admissao.getDate());
  for (;;) {
    const next = new Date(aniv.getFullYear() + 1, aniv.getMonth(), aniv.getDate());
    if (next > referencia) break;
    aniv = next;
  }
  return aniv;
}

function addDiasData(d: Date, dias: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + dias);
}

// ── Rescisão: reconhecimento de verbas ───────────────────────────────────────

const RSC_SALDO_RE     = /saldo\s*(de\s*)?(sal[aá]rio|vencimento|contrato)|sal[aá]rio\s*(do\s*m[eê]s|rescis)/i;
const RSC_AVISO_INDENIZ_RE = /aviso\s*pr[eé]vio(?!\s*trab)(\s*(indeniz\w*|a\s*pagar|n[aã]o\s*cumprido))?/i;
const RSC_AVISO_TRAB_RE    = /aviso\s*pr[eé]vio\s*(trabalhado|cumprido)/i;
const RSC_D13_RE       = /13[°º]?\s*(sal[aá]rio\s*)?proporcional|d[eé]cimo\s*terceiro\s*prop/i;
const RSC_FERIAS_PROP_RE   = /f[eé]rias\s*(proporcional|indenizad)/i;
const RSC_FERIAS_VENC_RE   = /f[eé]rias\s*(vencidas?|do\s*per[ií]odo(?!\s*aquisit))/i;
const RSC_FERIAS_DOBRO_RE  = /f[eé]rias\s*em\s*dobro/i;
const RSC_ADIC_FERIAS_RE   = /adicional\s*(de\s*)?f[eé]rias|1\/3\s*(const\w*)?|ter[çc]o\s*(const\w*|f[eé]r)/i;
const RSC_MULTA_RE     = /multa.*fgts|fgts.*multa|multa\s*(de\s*)?(40|20)\s*%?|indeniza[çc][aã]o\s*(rescis|fgts)|\bmulta\s*rescis/i;

// ── Rescisão: verbas identificadas ───────────────────────────────────────────

interface VerbasRescisao {
  saldoSalLine: HoleriteLine | null;
  avisoIndenizLine: HoleriteLine | null;
  avisoTrabLine: HoleriteLine | null;
  avisoLine: HoleriteLine | null;
  avisoIndenizado: boolean;
  decimo13Line: HoleriteLine | null;
  feriasPropLine: HoleriteLine | null;
  adicFeriasLine: HoleriteLine | null;
  feriasVencLine: HoleriteLine | null;
  feriasVencAdicLine: HoleriteLine | null;
  feriasDobro: HoleriteLine | null;
  multaLine: HoleriteLine | null;
  inssLines: HoleriteLine[];
  irrfLines: HoleriteLine[];
  fgtsLines: HoleriteLine[];
  outrasLinhas: HoleriteLine[];
  /** Estimativa bruta de remuneração mensal (13º×2 → férias×2 → aviso; 0 se indisponível) */
  remuneracao: number;
}

function identificarVerbasRescisao(parsed: ParsedHolerite): VerbasRescisao {
  let saldoSalLine: HoleriteLine | null = null;
  let avisoIndenizLine: HoleriteLine | null = null;
  let avisoTrabLine: HoleriteLine | null = null;
  let decimo13Line: HoleriteLine | null = null;
  let feriasPropLine: HoleriteLine | null = null;
  let adicFeriasLine: HoleriteLine | null = null;
  let feriasVencLine: HoleriteLine | null = null;
  let feriasVencAdicLine: HoleriteLine | null = null;
  let feriasDobro: HoleriteLine | null = null;
  let multaLine: HoleriteLine | null = null;
  const inssLines: HoleriteLine[] = [];
  const irrfLines: HoleriteLine[] = [];
  const fgtsLines: HoleriteLine[] = [];
  const outrasLinhas: HoleriteLine[] = [];

  for (const line of parsed.lines) {
    const d = line.description;
    if (line.type === "inss" || (line.kind === "deduction" && /\binss\b|previd[eê]ncia\s*social/i.test(d))) {
      inssLines.push(line); continue;
    }
    if (line.type === "irrf" || (line.kind === "deduction" && /\birrf\b|imposto\s*(de\s*)?renda/i.test(d))) {
      irrfLines.push(line); continue;
    }
    if (line.type === "fgts" || (line.kind === "info" && /\bfgts\b/i.test(d))) {
      fgtsLines.push(line); continue;
    }
    if (line.kind === "credit") {
      if      (!saldoSalLine     && RSC_SALDO_RE.test(d))            saldoSalLine     = line;
      else if (!avisoTrabLine    && RSC_AVISO_TRAB_RE.test(d))       avisoTrabLine    = line;
      else if (!avisoIndenizLine && RSC_AVISO_INDENIZ_RE.test(d))    avisoIndenizLine = line;
      else if (!decimo13Line     && RSC_D13_RE.test(d))              decimo13Line     = line;
      else if (!feriasDobro      && RSC_FERIAS_DOBRO_RE.test(d))     feriasDobro      = line;
      else if (!feriasVencLine   && RSC_FERIAS_VENC_RE.test(d))      feriasVencLine   = line;
      else if (!feriasPropLine   && RSC_FERIAS_PROP_RE.test(d))      feriasPropLine   = line;
      else if (!adicFeriasLine   && RSC_ADIC_FERIAS_RE.test(d))      adicFeriasLine   = line;
      else if (!multaLine        && RSC_MULTA_RE.test(d))             multaLine        = line;
      else outrasLinhas.push(line);
    } else if (line.kind === "deduction") {
      if (!feriasVencAdicLine && RSC_ADIC_FERIAS_RE.test(d) && feriasVencLine) {
        feriasVencAdicLine = line;
      } else {
        outrasLinhas.push(line);
      }
    } else {
      outrasLinhas.push(line);
    }
  }

  const avisoLine = avisoTrabLine ?? avisoIndenizLine;
  const avisoIndenizado = !avisoTrabLine && !!avisoIndenizLine;

  // Estimativa bruta de remuneração — prioriza fontes não-circulares
  let remuneracao = 0;
  if (decimo13Line?.declared_value) {
    remuneracao = round2(decimo13Line.declared_value * 2); // assume ~6 meses
  } else if (feriasPropLine?.declared_value) {
    remuneracao = round2(feriasPropLine.declared_value * 2); // assume ~6 meses
  } else if (avisoIndenizLine?.declared_value) {
    remuneracao = avisoIndenizLine.declared_value; // assume 30 dias (mínimo)
  }

  return {
    saldoSalLine, avisoIndenizLine, avisoTrabLine, avisoLine, avisoIndenizado,
    decimo13Line, feriasPropLine, adicFeriasLine, feriasVencLine, feriasVencAdicLine,
    feriasDobro, multaLine, inssLines, irrfLines, fgtsLines, outrasLinhas, remuneracao,
  };
}

// ── Rescisão: cenário inferido ────────────────────────────────────────────────

export function inferirCenarioRescisao(parsed: ParsedHolerite): CenarioRescisao {
  const verbas = identificarVerbasRescisao(parsed);

  // 1. Inferir anos de serviço a partir do aviso indenizado
  // aviso = remuneracao / 30 * (30 + anos*3)  →  anos = (aviso*30/remuneracao - 30) / 3
  let anosInferido: number | null = null;
  if (verbas.avisoIndenizLine && verbas.remuneracao > 0) {
    const diasInferidos = Math.round(verbas.avisoIndenizLine.declared_value * 30 / verbas.remuneracao);
    anosInferido = Math.max(0, Math.round((diasInferidos - 30) / 3));
    if (anosInferido > 30) anosInferido = null; // implausível
  }

  // 2. Inferir tipo de rescisão a partir das verbas presentes
  const temAviso  = !!verbas.avisoIndenizLine || !!verbas.avisoTrabLine;
  const temMulta  = !!verbas.multaLine;
  const temD13    = !!verbas.decimo13Line;
  const temFeriasProp = !!verbas.feriasPropLine;

  let tipoInferido: TipoRescisao | null = null;
  if      (temAviso && temMulta)              tipoInferido = "sem_justa_causa";
  else if (temAviso && !temMulta && temD13)   tipoInferido = "acordo_mutuo";
  else if (!temAviso && temD13 && temFeriasProp) tipoInferido = "pedido_demissao";
  else if (!temAviso && !temD13 && !temFeriasProp) tipoInferido = "justa_causa";

  // 3. Inferir modalidade do aviso
  let modalidadeInferida: "trabalhado" | "indenizado" | "nenhum" | null = null;
  if      (verbas.avisoIndenizLine)  modalidadeInferida = "indenizado";
  else if (verbas.avisoTrabLine)     modalidadeInferida = "trabalhado";
  else if (tipoInferido === "justa_causa" || tipoInferido === "pedido_demissao") modalidadeInferida = "nenhum";

  // 4. Inferir períodos de férias vencidas
  const periodosVencidos = (verbas.feriasVencLine ? 1 : 0) + (verbas.feriasDobro ? 1 : 0);

  // 5. Detectar anomalias
  const anomalias: string[] = [];
  if (tipoInferido === "pedido_demissao" && temMulta) {
    anomalias.push("Multa FGTS presente em pedido de demissão (não devida pela CLT).");
  }
  if (tipoInferido === "sem_justa_causa" && !temMulta && (anosInferido ?? 0) > 0) {
    anomalias.push("Demissão sem justa causa sem multa FGTS — verifique se a multa foi paga em separado.");
  }
  if (anosInferido === 0 && temD13 && verbas.remuneracao > 0 && verbas.decimo13Line!.declared_value > verbas.remuneracao) {
    anomalias.push("13º proporcional muito alto para alguém com menos de 1 ano de serviço.");
  }

  // 6. Calcular confiança
  let confianca: "alta" | "media" | "baixa" = "alta";
  if (tipoInferido === null || anosInferido === null) confianca = "baixa";
  else if (anomalias.length > 0) confianca = "media";

  return {
    tipo_rescisao: tipoInferido,
    anos_servico: anosInferido,
    modalidade_aviso: modalidadeInferida,
    ferias_vencidas_periodos: periodosVencidos,
    consistente: anomalias.length === 0,
    anomalias,
    confianca,
  };
}

// ── Rescisão: motor de auditoria ─────────────────────────────────────────────

function auditarRescisao(parsed: ParsedHolerite): AuditResult {
  const comp = parsed.competencia ?? "01/2026";
  const dependentes = parsed.dependents ?? 0;

  // ── Datas e tempo de serviço ────────────────────────────────────────────
  const dtAdmissao = parseDDMMAAAA(parsed.data_admissao);
  const dtRescisao = parseDDMMAAAA(parsed.data_rescisao) ?? parseDtFromComp(comp);
  const datasDisp  = dtAdmissao !== null && dtRescisao !== null;

  const anosTraData: number | null = datasDisp
    ? anosCompletos(dtAdmissao!, dtRescisao!)
    : null;

  // ── Cenário inferido + resolução de tipoR/anosTrab ───────────────────────
  const cenarioInferido = inferirCenarioRescisao(parsed);

  const tipoR: TipoRescisao =
    (parsed.tipo_rescisao as TipoRescisao | null) ??
    cenarioInferido.tipo_rescisao ??
    "sem_justa_causa";

  const anosTrab: number | null =
    anosTraData ??
    parsed.anos_servico_completos ??
    cenarioInferido.anos_servico ??
    null;

  const usouInferencia =
    !parsed.tipo_rescisao ||
    (anosTraData === null && (parsed.anos_servico_completos === null || parsed.anos_servico_completos === undefined));

  console.log("[CENARIO USADO] tipoR:", tipoR, "(fonte:", parsed.tipo_rescisao ? "usuario" : cenarioInferido.tipo_rescisao ? "inferido" : "fallback", ")");
  console.log("[CENARIO USADO] anosTrab:", anosTrab, "(fonte:", anosTraData !== null ? "datas" : parsed.anos_servico_completos != null ? "usuario" : cenarioInferido.anos_servico != null ? "inferido" : "null", ")");
  console.log("[CENARIO USADO] usouInferencia:", usouInferencia);
  console.log("[CENARIO USADO] cenarioInferido:", JSON.stringify(cenarioInferido));

  // Dias trabalhados no mês da rescisão (denominador = 30, limite legal)
  const diasRescisao = dtRescisao ? Math.min(dtRescisao.getDate(), 30) : null;

  // ── Dias de aviso prévio esperado ───────────────────────────────────────
  const avisoMaxDias = anosTrab !== null ? Math.min(30 + anosTrab * 3, 90) : null;
  let diasAvisoEsp: number | null;
  if (tipoR === "justa_causa" || tipoR === "pedido_demissao") {
    diasAvisoEsp = 0;
  } else if (tipoR === "acordo_mutuo") {
    diasAvisoEsp = avisoMaxDias !== null ? Math.round(avisoMaxDias * 0.5) : null;
  } else {
    diasAvisoEsp = avisoMaxDias; // sem_justa_causa
  }

  // ── Data efetiva de término (aviso prévio projeta o contrato — Súmula 371 TST) ──
  const dtEfetiva = dtRescisao && diasAvisoEsp !== null
    ? addDiasData(dtRescisao, diasAvisoEsp)
    : dtRescisao;

  // ── Meses para 13º proporcional (CLT Art. 1º §2º Lei 4.090/62) ──────────
  let meses13Calc: number | null = null;
  if (dtRescisao && dtEfetiva) {
    const anoR = dtRescisao.getFullYear();
    const inicioCalc = dtAdmissao && dtAdmissao.getFullYear() === anoR
      ? dtAdmissao
      : new Date(anoR, 0, 1); // 1º de janeiro
    const fimCalc = dtEfetiva.getFullYear() === anoR
      ? dtEfetiva
      : new Date(anoR, 11, 31); // 31 de dezembro
    meses13Calc = Math.min(mesesComFracao15(inicioCalc, fimCalc), 12);
  }

  // ── Meses para férias proporcionais ─────────────────────────────────────
  let mesesFeriasCalc: number | null = null;
  if (datasDisp && dtEfetiva) {
    const ultimoAniv = ultimoAnivContrato(dtAdmissao!, dtEfetiva);
    mesesFeriasCalc = Math.min(mesesComFracao15(ultimoAniv, dtEfetiva), 11);
  }

  // ── Identificar verbas nas linhas declaradas ─────────────────────────────
  const {
    saldoSalLine, avisoIndenizLine, avisoTrabLine, avisoLine, avisoIndenizado,
    decimo13Line, feriasPropLine, adicFeriasLine, feriasVencLine, feriasVencAdicLine,
    feriasDobro, multaLine, inssLines, irrfLines, fgtsLines, outrasLinhas,
  } = identificarVerbasRescisao(parsed);

  console.log("[RESCISAO DEBUG] === Reconhecimento de verbas ===");
  console.log("[RESCISAO DEBUG] saldoSalLine:", saldoSalLine?.description, saldoSalLine?.declared_value);
  console.log("[RESCISAO DEBUG] avisoIndenizLine:", avisoIndenizLine?.description, avisoIndenizLine?.declared_value);
  console.log("[RESCISAO DEBUG] avisoTrabLine:", avisoTrabLine?.description, avisoTrabLine?.declared_value);
  console.log("[RESCISAO DEBUG] decimo13Line:", decimo13Line?.description, decimo13Line?.declared_value);
  console.log("[RESCISAO DEBUG] feriasPropLine:", feriasPropLine?.description, feriasPropLine?.declared_value);
  console.log("[RESCISAO DEBUG] adicFeriasLine:", adicFeriasLine?.description, adicFeriasLine?.declared_value);
  console.log("[RESCISAO DEBUG] feriasVencLine:", feriasVencLine?.description, feriasVencLine?.declared_value);
  console.log("[RESCISAO DEBUG] multaLine:", multaLine?.description, multaLine?.declared_value);
  console.log("[RESCISAO DEBUG] inssLines.length:", inssLines.length, "→", inssLines.map(l => `${l.description}=${l.declared_value}`));
  console.log("[RESCISAO DEBUG] irrfLines.length:", irrfLines.length, "→", irrfLines.map(l => `${l.description}=${l.declared_value}`));
  console.log("[RESCISAO DEBUG] fgtsLines.length:", fgtsLines.length, "→", fgtsLines.map(l => `${l.description}=${l.declared_value}`));
  console.log("[RESCISAO DEBUG] outrasLinhas:", outrasLinhas.map(l => `${l.description}=${l.declared_value}`));

  // ── Inferir remuneração mensal ───────────────────────────────────────────
  let remuneracao: number | null = null;
  // Prioridade: aviso (mais confiável) → saldo → 13º → férias
  if (avisoLine?.declared_value && diasAvisoEsp && diasAvisoEsp > 0) {
    remuneracao = round2(avisoLine.declared_value / diasAvisoEsp * 30);
  } else if (saldoSalLine?.declared_value && diasRescisao) {
    remuneracao = round2(saldoSalLine.declared_value / diasRescisao * 30);
  } else if (decimo13Line?.declared_value && meses13Calc && meses13Calc > 0) {
    remuneracao = round2(decimo13Line.declared_value / meses13Calc * 12);
  } else if (feriasPropLine?.declared_value && mesesFeriasCalc && mesesFeriasCalc > 0) {
    remuneracao = round2(feriasPropLine.declared_value / mesesFeriasCalc * 12);
  }

  // ── Valores esperados ─────────────────────────────────────────────────────
  const saldoEsp = remuneracao !== null && diasRescisao
    ? round2(remuneracao / 30 * diasRescisao) : null;

  const avisoEsp = tipoR !== "justa_causa" && tipoR !== "pedido_demissao"
    && remuneracao !== null && diasAvisoEsp && diasAvisoEsp > 0
    ? round2(remuneracao / 30 * diasAvisoEsp) : null;

  const decimo13Esp = tipoR !== "justa_causa" && remuneracao !== null && meses13Calc !== null
    ? round2(remuneracao / 12 * meses13Calc) : null;

  const feriasPropEsp = tipoR !== "justa_causa" && remuneracao !== null && mesesFeriasCalc !== null
    ? round2(remuneracao / 12 * mesesFeriasCalc) : null;

  const adicFeriasEsp = feriasPropEsp !== null ? round2(feriasPropEsp / 3) : null;

  // ── INSS e IRRF (CLT Art. 477 + Decreto 3.048/99) ───────────────────────
  // INSS: incide sobre saldo de salário. Aviso prévio INDENIZADO = isento.
  // 13º proporcional: INSS calculado SEPARADAMENTE sobre o valor do 13º.
  const baseSaldoParaInss = saldoEsp ?? saldoSalLine?.declared_value ?? 0;
  const baseD13ParaInss   = decimo13Esp ?? decimo13Line?.declared_value ?? 0;
  const inssEspSaldo  = calcularINSS(baseSaldoParaInss, comp);
  const inssEspD13    = calcularINSS(baseD13ParaInss, comp);
  const inssEspTotal  = round2(inssEspSaldo + inssEspD13);

  // IRRF: sobre saldo − INSS − dependentes. Aviso indenizado = isento. 13º = separado.
  const irrfEspSaldo = calcularIRRF(baseSaldoParaInss, inssEspSaldo, dependentes, comp);
  const irrfEspD13   = calcularIRRF(baseD13ParaInss, inssEspD13, 0, comp);
  const irrfEspTotal = round2(irrfEspSaldo + irrfEspD13);

  // ── FGTS do mês (Lei 8.036/90 Art. 15 + Súmula 305 TST) ─────────────────
  // Base: saldo + 13º prop. + aviso indenizado (FGTS incide mesmo com INSS isento)
  const baseFgtsCalc = round2(
    baseSaldoParaInss +
    baseD13ParaInss +
    (avisoIndenizado ? (avisoEsp ?? avisoIndenizLine?.declared_value ?? 0) : 0)
  );
  const fgtsEspTotal = round2(baseFgtsCalc * 0.08);

  console.log("[RESCISAO DEBUG] === Datas e tempo ===");
  console.log("[RESCISAO DEBUG] dtAdmissao:", parsed.data_admissao, "→", dtAdmissao);
  console.log("[RESCISAO DEBUG] dtRescisao:", parsed.data_rescisao, "→", dtRescisao);
  console.log("[RESCISAO DEBUG] tipoR:", tipoR, "anosTrab:", anosTrab, "diasAvisoEsp:", diasAvisoEsp);
  console.log("[RESCISAO DEBUG] === Cálculos ===");
  console.log("[RESCISAO DEBUG] remuneracao inferida:", remuneracao);
  console.log("[RESCISAO DEBUG] saldoEsp:", saldoEsp, "avisoEsp:", avisoEsp, "decimo13Esp:", decimo13Esp, "feriasPropEsp:", feriasPropEsp);
  console.log("[RESCISAO DEBUG] baseSaldoParaInss:", baseSaldoParaInss, "baseD13ParaInss:", baseD13ParaInss);
  console.log("[RESCISAO DEBUG] inssEspTotal:", inssEspTotal, "irrfEspTotal:", irrfEspTotal, "fgtsEspTotal:", fgtsEspTotal);

  // ── Construir linhas de auditoria ────────────────────────────────────────
  const auditLines: AuditLine[] = [];

  function pushAuditLine(
    line: HoleriteLine,
    expectedValue: number | null,
    legalCitation: string | null,
    manualNote?: string
  ) {
    if (expectedValue === null || manualNote) {
      // Não conseguimos calcular — manual_check
      auditLines.push({
        description: line.description,
        type: line.type,
        kind: line.kind,
        declared_value: line.declared_value,
        expected_value: line.declared_value,
        difference: 0,
        status: "manual_check",
        note: manualNote ?? "Não foi possível calcular o valor esperado com os dados disponíveis.",
        legal_citation: legalCitation,
        scenarios: null,
        tip: null,
      });
      return;
    }
    const diff = round2(line.declared_value - expectedValue);
    const hasDivergence = Math.abs(diff) > TOLERANCE;
    auditLines.push({
      description: line.description,
      type: line.type,
      kind: line.kind,
      declared_value: line.declared_value,
      expected_value: expectedValue,
      difference: diff,
      status: hasDivergence ? (line.kind === "deduction" ? "error" : "error") : "ok",
      note: hasDivergence
        ? legalNote(legalCitation ?? "", fmt(line.declared_value), fmt(expectedValue))
        : null,
      legal_citation: hasDivergence ? legalCitation : null,
      scenarios: null,
      tip: null,
    });
  }

  // 1. Saldo de salário
  if (saldoSalLine) {
    pushAuditLine(
      saldoSalLine,
      saldoEsp,
      "CLT Art. 477 §1º",
      saldoEsp === null
        ? `Saldo de salário = remuneração / 30 × dias trabalhados no mês. ${diasRescisao === null ? "Data de rescisão não disponível — não é possível calcular o número de dias." : `Dias trabalhados: ${diasRescisao}.`} ${remuneracao === null ? "Remuneração mensal não identificada." : `Remuneração inferida: ${fmt(remuneracao)}.`}`
        : undefined
    );
  }

  // 2. Aviso prévio
  if (avisoLine) {
    if (avisoEsp === null && tipoR !== "justa_causa" && tipoR !== "pedido_demissao") {
      pushAuditLine(
        avisoLine,
        null,
        "Lei 12.506/2011 Art. 1º",
        `Aviso prévio: 30 dias + 3 dias/ano de serviço, máximo 90 dias. ${anosTrab === null ? "Tempo de serviço não disponível — informe a data de admissão." : `Com ${anosTrab} ano(s) de serviço: ${avisoMaxDias} dias.`} ${remuneracao === null ? "Remuneração mensal não identificada." : `Esperado: ${fmt(round2((remuneracao ?? 0) / 30 * (avisoMaxDias ?? 30)))}.`}`
      );
    } else {
      const noteBase = avisoEsp !== null && anosTrab !== null
        ? `Aviso prévio: ${diasAvisoEsp} dias (30 + ${anosTrab} ano(s) × 3${tipoR === "acordo_mutuo" ? " × 50% acordo mútuo" : ""})${remuneracao ? ` × ${fmt(remuneracao)}/30 = ${fmt(avisoEsp)}` : ""}.`
        : null;
      pushAuditLine(avisoLine, avisoEsp, "Lei 12.506/2011 Art. 1º", avisoEsp === null ? `Aviso prévio não calculável — informe a data de admissão.` : undefined);
      if (avisoEsp !== null && !diverge(avisoLine.declared_value, avisoEsp) && noteBase) {
        const al = auditLines[auditLines.length - 1];
        al.note = noteBase;
      }
    }
  }

  // 3. 13º proporcional
  if (decimo13Line) {
    pushAuditLine(
      decimo13Line,
      decimo13Esp,
      "Lei 4.090/62 + Súmula 157 TST",
      decimo13Esp === null
        ? `13º proporcional = remuneração / 12 × meses. ${meses13Calc === null ? "Datas não disponíveis." : `Meses no ano: ${meses13Calc}.`} ${remuneracao === null ? "Remuneração não identificada." : ""}`
        : undefined
    );
  }

  // 4. Férias proporcionais
  if (feriasPropLine) {
    pushAuditLine(
      feriasPropLine,
      feriasPropEsp,
      "CLT Art. 147 + Súmula 261 TST",
      feriasPropEsp === null
        ? `Férias proporcionais = remuneração / 12 × meses desde último aniversário. ${mesesFeriasCalc === null ? "Datas não disponíveis." : `Meses: ${mesesFeriasCalc}.`} ${remuneracao === null ? "Remuneração não identificada." : ""}`
        : undefined
    );
  }

  // 5. Adicional de férias (1/3 constitucional)
  if (adicFeriasLine) {
    // Pode ser 1/3 sobre férias proporcionais OU vencidas
    const baseParaAdic = feriasPropEsp ?? feriasPropLine?.declared_value;
    const adicEsp = adicFeriasEsp ?? (baseParaAdic !== undefined ? round2(baseParaAdic / 3) : null);
    pushAuditLine(
      adicFeriasLine,
      adicEsp,
      "CF Art. 7º XVII",
      adicEsp === null ? "1/3 constitucional = férias / 3. Não foi possível calcular as férias base." : undefined
    );
  }

  // 6. Férias vencidas (aceitar valor declarado — motor não tem os períodos aquisitivos)
  if (feriasVencLine) {
    const feriasVencEsp = remuneracao !== null ? remuneracao : null;
    auditLines.push({
      description: feriasVencLine.description,
      type: feriasVencLine.type,
      kind: "credit",
      declared_value: feriasVencLine.declared_value,
      expected_value: feriasVencEsp ?? feriasVencLine.declared_value,
      difference: feriasVencEsp !== null ? round2(feriasVencLine.declared_value - feriasVencEsp) : 0,
      status: "manual_check",
      note: `Férias vencidas = 1 mês de remuneração por período aquisitivo completo não gozado.${remuneracao !== null ? ` Remuneração inferida: ${fmt(remuneracao)}. Valor declarado: ${fmt(feriasVencLine.declared_value)}.` : " Verifique se o valor corresponde a um mês de remuneração completo por período."} Confirme quantos períodos aquisitivos estavam pendentes.`,
      legal_citation: "CLT Art. 137",
      scenarios: null,
      tip: "Consulte o controle de férias para saber quantos períodos aquisitivos completos não foram gozados.",
    });
  }

  // 6b. Férias em dobro
  if (feriasDobro) {
    const dobro = remuneracao !== null ? round2(remuneracao * 2) : null;
    auditLines.push({
      description: feriasDobro.description,
      type: feriasDobro.type,
      kind: "credit",
      declared_value: feriasDobro.declared_value,
      expected_value: dobro ?? feriasDobro.declared_value,
      difference: dobro !== null ? round2(feriasDobro.declared_value - dobro) : 0,
      status: "manual_check",
      note: `Férias em dobro = período concessivo expirado sem gozo (CLT Art. 137 §1º). Valor = 2 × remuneração mensal.${remuneracao !== null ? ` Esperado: ${fmt(round2(remuneracao * 2))}.` : ""} Confirme se o período concessivo venceu.`,
      legal_citation: "CLT Art. 137 §1º",
      scenarios: null,
      tip: null,
    });
  }

  // 7. Multa FGTS
  if (multaLine) {
    const pctMulta = tipoR === "acordo_mutuo" ? 20 : 40;
    const saldoAcum = parsed.saldo_fgts_acumulado;
    const multaEsp = saldoAcum !== null && saldoAcum !== undefined
      ? round2(saldoAcum * pctMulta / 100) : null;
    auditLines.push({
      description: multaLine.description,
      type: multaLine.type,
      kind: "credit",
      declared_value: multaLine.declared_value,
      expected_value: multaEsp ?? multaLine.declared_value,
      difference: multaEsp !== null ? round2(multaLine.declared_value - multaEsp) : 0,
      status: multaEsp !== null && diverge(multaLine.declared_value, multaEsp) ? "error" : "manual_check",
      note: multaEsp !== null
        ? `Multa ${pctMulta}% FGTS = ${pctMulta}% × saldo total acumulado de ${fmt(saldoAcum!)} = ${fmt(multaEsp)}.`
        : `Multa ${pctMulta}% incide sobre o saldo TOTAL acumulado do FGTS na conta do trabalhador. Consulte o extrato FGTS no aplicativo FGTS (Caixa Econômica Federal) e verifique se o valor de ${fmt(multaLine.declared_value)} corresponde a ${pctMulta}% do seu saldo.`,
      legal_citation: tipoR === "acordo_mutuo" ? "CLT Art. 484-A §1º II" : "Lei 8.036/90 Art. 18 §1º",
      scenarios: null,
      tip: "Para verificar o saldo FGTS: baixe o app 'FGTS' da Caixa Econômica Federal ou acesse o portal FGTS.caixa.gov.br.",
    });
  } else if (tipoR === "sem_justa_causa" || tipoR === "acordo_mutuo") {
    // Multa esperada mas não declarada
    const pctMulta = tipoR === "acordo_mutuo" ? 20 : 40;
    auditLines.push({
      description: `Multa ${pctMulta}% FGTS`,
      type: "outros_creditos",
      kind: "credit",
      declared_value: 0,
      expected_value: 0,
      difference: 0,
      status: "manual_check",
      note: `Esta verba não foi encontrada no TRCT. Em ${tipoR === "acordo_mutuo" ? "acordo mútuo" : "demissão sem justa causa"}, o empregador deve pagar multa de ${pctMulta}% sobre o saldo total do FGTS. Verifique se consta em outro documento ou se foi omitida.`,
      legal_citation: tipoR === "acordo_mutuo" ? "CLT Art. 484-A §1º II" : "Lei 8.036/90 Art. 18 §1º",
      scenarios: null,
      tip: "A multa FGTS é paga diretamente na conta FGTS do trabalhador pela empresa, e pode não aparecer no TRCT mas deve constar na rescisão homologada.",
    });
  }

  // 8. INSS total
  const inssDecl = inssLines.reduce((s, l) => s + l.declared_value, 0);
  if (inssLines.length > 0) {
    const diff = round2(inssDecl - inssEspTotal);
    const hasDivergence = Math.abs(diff) > 2.00; // tolerância maior em rescisão
    const line0 = inssLines[0];
    auditLines.push({
      description: inssLines.length > 1 ? "INSS (total)" : line0.description,
      type: "inss",
      kind: "deduction",
      declared_value: inssDecl,
      expected_value: inssEspTotal,
      difference: diff,
      status: hasDivergence ? "error" : "ok",
      note: `Base INSS: saldo de salário ${fmt(baseSaldoParaInss)} → INSS ${fmt(inssEspSaldo)}; 13º proporcional ${fmt(baseD13ParaInss)} → INSS ${fmt(inssEspD13)}. Total esperado: ${fmt(inssEspTotal)}.${hasDivergence ? ` Declarado: ${fmt(inssDecl)}.` : ""}`,
      legal_citation: hasDivergence ? "Lei 8.212/91 Art. 28" : null,
      scenarios: null,
      tip: null,
    });
    for (let i = 1; i < inssLines.length; i++) {
      // linhas adicionais de INSS já somadas — marcar como info
      auditLines.push({
        description: inssLines[i].description + " (incluído no total acima)",
        type: "inss", kind: "deduction",
        declared_value: inssLines[i].declared_value, expected_value: inssLines[i].declared_value,
        difference: 0, status: "ok", note: null, legal_citation: null, scenarios: null, tip: null,
      });
    }
  }

  // 9. IRRF total
  const irrfDecl = irrfLines.reduce((s, l) => s + l.declared_value, 0);
  if (irrfLines.length > 0) {
    const diff = round2(irrfDecl - irrfEspTotal);
    const hasDivergence = Math.abs(diff) > 2.00;
    const line0 = irrfLines[0];
    auditLines.push({
      description: irrfLines.length > 1 ? "IRRF (total)" : line0.description,
      type: "irrf",
      kind: "deduction",
      declared_value: irrfDecl,
      expected_value: irrfEspTotal,
      difference: diff,
      status: hasDivergence ? "error" : "ok",
      note: `IRRF sobre saldo: base ${fmt(baseSaldoParaInss)} − INSS ${fmt(inssEspSaldo)}${dependentes > 0 ? ` − ${dependentes} dep.` : ""} = ${fmt(round2(baseSaldoParaInss - inssEspSaldo - dependentes * 189.59))} → ${fmt(irrfEspSaldo)}. IRRF sobre 13º: base ${fmt(baseD13ParaInss)} − INSS ${fmt(inssEspD13)} → ${fmt(irrfEspD13)}. Total: ${fmt(irrfEspTotal)}.${hasDivergence ? ` Declarado: ${fmt(irrfDecl)}.` : ""}`,
      legal_citation: hasDivergence ? "Decreto 9.580/18 Art. 688" : null,
      scenarios: null,
      tip: null,
    });
    for (let i = 1; i < irrfLines.length; i++) {
      auditLines.push({
        description: irrfLines[i].description + " (incluído no total acima)",
        type: "irrf", kind: "deduction",
        declared_value: irrfLines[i].declared_value, expected_value: irrfLines[i].declared_value,
        difference: 0, status: "ok", note: null, legal_citation: null, scenarios: null, tip: null,
      });
    }
  }

  // 10. FGTS do mês
  const fgtsDecl = fgtsLines.reduce((s, l) => s + l.declared_value, 0);
  if (fgtsLines.length > 0) {
    const diff = round2(fgtsDecl - fgtsEspTotal);
    const hasDivergence = Math.abs(diff) > 1.00;
    auditLines.push({
      description: fgtsLines.length > 1 ? "FGTS (total)" : fgtsLines[0].description,
      type: "fgts",
      kind: "info",
      declared_value: fgtsDecl,
      expected_value: fgtsEspTotal,
      difference: diff,
      status: hasDivergence ? "warning" : "ok",
      note: `Base FGTS: saldo ${fmt(baseSaldoParaInss)} + 13º ${fmt(baseD13ParaInss)}${avisoIndenizado && (avisoEsp ?? 0) > 0 ? ` + aviso indenizado ${fmt(avisoEsp ?? 0)}` : ""} = ${fmt(baseFgtsCalc)}. Esperado 8% = ${fmt(fgtsEspTotal)}.`,
      legal_citation: hasDivergence ? "Lei 8.036/90 Art. 15 + Súmula 305 TST" : null,
      scenarios: null,
      tip: null,
    });
  }

  // 11. Outras linhas (pass-through)
  for (const line of outrasLinhas) {
    auditLines.push({
      description: line.description,
      type: line.type,
      kind: line.kind,
      declared_value: line.declared_value,
      expected_value: line.declared_value,
      difference: 0,
      status: "info",
      note: null,
      legal_citation: null,
      scenarios: null,
      tip: null,
    });
  }

  // ── Classificar recorrência (todas one_time em rescisão) ──────────────────
  for (const line of auditLines) {
    line.recurrence = "one_time";
  }

  // ── Suavizar erros quando cenário foi inferido e é consistente ──────────
  // Enquanto o usuário não confirmar as perguntas, não mostrar vermelho —
  // os valores batem com o cenário inferido pelo motor.
  if (usouInferencia && cenarioInferido.consistente) {
    for (const al of auditLines) {
      if (al.status === "error") {
        al.status = "ok";
        al.note = al.note
          ? `${al.note} (calculado com base no cenário inferido — responda as perguntas para confirmar)`
          : "Calculado com base no cenário inferido. Responda as perguntas para confirmar os valores.";
      }
    }
  }

  // ── Totais ────────────────────────────────────────────────────────────────
  const totalVencimentos = parsed.lines
    .filter(l => l.kind === "credit").reduce((s, l) => s + l.declared_value, 0);
  const totalDescontos = parsed.lines
    .filter(l => l.kind === "deduction").reduce((s, l) => s + l.declared_value, 0);
  const netDeclared = round2(totalVencimentos - totalDescontos);

  const linhasComErro = auditLines.filter(l => l.status === "error" || l.status === "legal_violation");
  const descontosIndevidos = linhasComErro
    .filter(l => l.kind === "deduction" && l.declared_value > l.expected_value + TOLERANCE)
    .reduce((s, l) => s + round2(l.declared_value - l.expected_value), 0);
  const creditosFaltantes = linhasComErro
    .filter(l => l.kind === "credit" && l.expected_value > l.declared_value + TOLERANCE)
    .reduce((s, l) => s + round2(l.expected_value - l.declared_value), 0);

  const inssLine0 = auditLines.find(l => l.type === "inss");
  const irrfLine0 = auditLines.find(l => l.type === "irrf");
  const fgtsLine0 = auditLines.find(l => l.type === "fgts");

  const summary: AuditSummary = {
    total_errors: auditLines.filter(l => l.status === "error" || l.status === "legal_violation").length,
    total_warnings: auditLines.filter(l => l.status === "warning").length,
    inss_declared: inssDecl,
    inss_expected: inssEspTotal,
    irrf_declared: irrfDecl,
    irrf_expected: irrfEspTotal,
    fgts_declared: fgtsDecl,
    fgts_expected: fgtsEspTotal,
  };

  return {
    gross_salary: totalVencimentos,
    net_declared: netDeclared,
    net_expected: round2(netDeclared + descontosIndevidos + creditosFaltantes),
    total_difference: round2(descontosIndevidos + creditosFaltantes),
    tipo_holerite: "rescisao",
    lines: auditLines,
    summary,
    impactoRecorrente: 0,
    impactoPontual: round2(descontosIndevidos + creditosFaltantes),
    projecaoAnual: null,
    cenario_inferido: cenarioInferido,
    usou_inferencia: usouInferencia,
  };
}

// ── Função principal exportada ───────────────────────────────────────────────

/**
 * Audita um holerite: compara valores declarados × valores esperados (CLT 2026).
 * Retorna AuditResult com status semáforo por linha e totais de diferença.
 */
export function auditarHolerite(parsed: ParsedHolerite): AuditResult {
  const tipoDetectado = detectarTipoHolerite(parsed);
  // ── Rescisão: motor próprio (verbas rescisórias têm regras específicas) ───
  if (tipoDetectado === "rescisao") {
    return auditarRescisao(parsed);
  }

  // ── 13º 1ª parcela: auditar antes da lógica geral ────────────────────────
  if (tipoDetectado === "decimo_terceiro_1") {
    const D13_RE = /13[°º]?\s*(sal[aá]rio|terceiro)|d[eé]cimo\s*terceiro|gratifica[çc][aã]o\s*natalina/i;
    const d13Line =
      parsed.lines.find((l) => l.type === "decimo_terceiro") ??
      parsed.lines.find((l) => l.kind === "credit" && D13_RE.test(l.description));
    const valorParcela = d13Line?.declared_value ?? parsed.gross_salary;
    const fgts13Esperado = calcularFGTS(valorParcela);

    const d13AuditLines: AuditLine[] = parsed.lines.map((line): AuditLine => {
      if (line.type === "inss") {
        if (line.declared_value > TOLERANCE) {
          return {
            description: line.description,
            type: line.type,
            kind: line.kind,
            declared_value: line.declared_value,
            expected_value: 0,
            difference: round2(-line.declared_value),
            status: "error",
            note: legalNote(
              "A 1ª parcela do 13º salário não tem incidência de INSS. O desconto ocorre apenas na 2ª parcela, sobre o valor total do 13º.",
              fmt(line.declared_value),
              "R$ 0,00 — INSS não incide na 1ª parcela"
            ),
            legal_citation: "Lei 7.713/88 Art. 16",
            scenarios: null,
            tip: null,
          };
        }
        return { description: line.description, type: line.type, kind: line.kind, declared_value: 0, expected_value: 0, difference: 0, status: "ok", note: null, scenarios: null, tip: null };
      }

      if (line.type === "irrf") {
        if (line.declared_value > TOLERANCE) {
          return {
            description: line.description,
            type: line.type,
            kind: line.kind,
            declared_value: line.declared_value,
            expected_value: 0,
            difference: round2(-line.declared_value),
            status: "error",
            note: legalNote(
              "A 1ª parcela do 13º salário não tem incidência de IRRF. O IRRF incide apenas na 2ª parcela, sobre o valor total do 13º.",
              fmt(line.declared_value),
              "R$ 0,00 — IRRF não incide na 1ª parcela"
            ),
            legal_citation: "Decreto 9.580/18 Art. 688",
            scenarios: null,
            tip: null,
          };
        }
        return { description: line.description, type: line.type, kind: line.kind, declared_value: 0, expected_value: 0, difference: 0, status: "ok", note: null, scenarios: null, tip: null };
      }

      if (line.type === "fgts") {
        const hasDivergence = diverge(line.declared_value, fgts13Esperado);
        return {
          description: line.description,
          type: line.type,
          kind: line.kind,
          declared_value: line.declared_value,
          expected_value: fgts13Esperado,
          difference: round2(line.declared_value - fgts13Esperado),
          status: hasDivergence ? "error" : "ok",
          note: hasDivergence
            ? legalNote(
                `FGTS da 1ª parcela do 13º = 8% sobre o valor da parcela paga.`,
                fmt(line.declared_value),
                `${fmt(fgts13Esperado)} = 8% × ${fmt(valorParcela)}`
              )
            : null,
          legal_citation: hasDivergence ? "Lei 8.036/90 Art. 15" : null,
          scenarios: null,
          tip: null,
        };
      }

      // Demais linhas: pass-through ok
      return {
        description: line.description,
        type: line.type,
        kind: line.kind,
        declared_value: line.declared_value,
        expected_value: line.declared_value,
        difference: 0,
        status: "ok",
        note: null,
        scenarios: null,
        tip: null,
      };
    });

    const netDeclared = round2(
      parsed.lines.filter((l) => l.kind === "credit").reduce((s, l) => s + l.declared_value, 0) -
      parsed.lines.filter((l) => l.kind === "deduction").reduce((s, l) => s + l.declared_value, 0)
    );

    const inssD13 = d13AuditLines.find((l) => l.type === "inss");
    const irrfD13 = d13AuditLines.find((l) => l.type === "irrf");
    const fgtsD13 = d13AuditLines.find((l) => l.type === "fgts");

    return {
      gross_salary: valorParcela,
      net_declared: netDeclared,
      net_expected: valorParcela,
      total_difference: round2(valorParcela - netDeclared),
      tipo_holerite: "decimo_terceiro_1",
      lines: d13AuditLines,
      summary: {
        total_errors: d13AuditLines.filter((l) => l.status === "error" || l.status === "legal_violation").length,
        total_warnings: d13AuditLines.filter((l) => l.status === "warning").length,
        inss_declared: inssD13?.declared_value ?? 0,
        inss_expected: 0,
        irrf_declared: irrfD13?.declared_value ?? 0,
        irrf_expected: 0,
        fgts_declared: fgtsD13?.declared_value ?? 0,
        fgts_expected: fgts13Esperado,
      },
    };
  }

  // ── 13º 2ª parcela: INSS e IRRF sobre o TOTAL do 13º, FGTS sobre o total ──
  if (tipoDetectado === "decimo_terceiro_2") {
    const declarado2 = construirHoleriteDeclarado(parsed);

    const D13_RE2 = /13[°º]?\s*(sal[aá]rio|terceiro)|d[eé]cimo\s*terceiro|gratifica[çc][aã]o\s*natalina/i;
    const d13Line2 =
      parsed.lines.find((l) => l.type === "decimo_terceiro" && l.kind === "credit") ??
      parsed.lines.find((l) => l.kind === "credit" && D13_RE2.test(l.description));
    const totalD13 = d13Line2?.declared_value ?? declarado2.salarioBase;

    const ADIANT_RE2 = /adiantamento|1[aª°]\s*parcela|antecipa[çc][aã]o/i;
    const adiantLine = parsed.lines.find((l) => l.kind === "deduction" && ADIANT_RE2.test(l.description));
    const adiantamento = adiantLine?.declared_value ?? 0;

    const dependentes2 = parsed.dependents ?? 0;
    const comp13 = parsed.competencia ?? "01/2026";
    const inssEsperado2 = calcularINSS(totalD13, comp13);
    const irrfEsperado2 = calcularIRRF(totalD13, inssEsperado2, dependentes2, comp13);
    const fgtsEsperado2 = calcularFGTS(totalD13);
    const liquidoEsperado2 = round2(totalD13 - inssEsperado2 - irrfEsperado2 - adiantamento);

    const d13AuditLines2: AuditLine[] = parsed.lines.map((line): AuditLine => {
      if ((line.type === "decimo_terceiro" || D13_RE2.test(line.description)) && line.kind === "credit") {
        return {
          description: line.description,
          type: line.type,
          kind: "credit",
          declared_value: line.declared_value,
          expected_value: line.declared_value,
          difference: 0,
          status: "ok",
          note: `13º salário — 2ª parcela. INSS e IRRF incidem sobre o valor total: ${fmt(totalD13)}.`,
          legal_citation: "Lei 4.090/62",
          scenarios: null,
          tip: null,
        };
      }

      if (line.type === "inss") {
        const diff2 = round2(line.declared_value - inssEsperado2);
        const hasDivergence2 = Math.abs(diff2) > TOLERANCE;
        return {
          description: line.description,
          type: line.type,
          kind: "deduction",
          declared_value: line.declared_value,
          expected_value: inssEsperado2,
          difference: diff2,
          status: hasDivergence2 ? "error" : "ok",
          note: hasDivergence2
            ? legalNote(
                `INSS do 13º incide sobre o valor total (${fmt(totalD13)}).`,
                fmt(line.declared_value),
                `${fmt(inssEsperado2)} = tabela progressiva sobre ${fmt(totalD13)}`
              )
            : null,
          legal_citation: hasDivergence2 ? "Lei 8.212/91 Art. 28" : null,
          scenarios: null,
          tip: null,
        };
      }

      if (line.type === "irrf") {
        const baseIrrf2 = round2(totalD13 - inssEsperado2);
        const diff2 = round2(line.declared_value - irrfEsperado2);
        const hasDivergence2 = Math.abs(diff2) > TOLERANCE;
        return {
          description: line.description,
          type: line.type,
          kind: "deduction",
          declared_value: line.declared_value,
          expected_value: irrfEsperado2,
          difference: diff2,
          status: hasDivergence2 ? "error" : "ok",
          note: hasDivergence2
            ? legalNote(
                `IRRF do 13º incide sobre o total menos INSS. Base: ${fmt(baseIrrf2)}${dependentes2 > 0 ? ` − ${dependentes2} dep.` : ""}.`,
                fmt(line.declared_value),
                `${fmt(irrfEsperado2)}`
              )
            : null,
          legal_citation: hasDivergence2 ? "Decreto 9.580/18 Art. 688" : null,
          scenarios: null,
          tip: null,
        };
      }

      if (line.type === "fgts") {
        const diff2 = round2(line.declared_value - fgtsEsperado2);
        const hasDivergence2 = Math.abs(diff2) > TOLERANCE;
        return {
          description: line.description,
          type: line.type,
          kind: "info",
          declared_value: line.declared_value,
          expected_value: fgtsEsperado2,
          difference: diff2,
          status: hasDivergence2 ? "warning" : "ok",
          note: `FGTS do 13º = 8% × ${fmt(totalD13)} = ${fmt(fgtsEsperado2)}.`,
          legal_citation: "Lei 8.036/90 Art. 15",
          scenarios: null,
          tip: null,
        };
      }

      if (ADIANT_RE2.test(line.description) && line.kind === "deduction") {
        return {
          description: line.description,
          type: line.type,
          kind: "deduction",
          declared_value: line.declared_value,
          expected_value: line.declared_value,
          difference: 0,
          status: "ok",
          note: `Abatimento da 1ª parcela já paga: ${fmt(line.declared_value)}.`,
          legal_citation: null,
          scenarios: null,
          tip: null,
        };
      }

      return {
        description: line.description,
        type: line.type,
        kind: line.kind,
        declared_value: line.declared_value,
        expected_value: line.declared_value,
        difference: 0,
        status: "ok",
        note: null,
        legal_citation: null,
        scenarios: null,
        tip: null,
      };
    });

    // Alerta se INSS ausente mas devido
    if (!d13AuditLines2.some((l) => l.type === "inss") && inssEsperado2 > TOLERANCE) {
      d13AuditLines2.push({
        description: "INSS s/ 13º (não consta no holerite)",
        type: "inss",
        kind: "deduction",
        declared_value: 0,
        expected_value: inssEsperado2,
        difference: round2(-inssEsperado2),
        status: "error",
        note: `A 2ª parcela do 13º deve ter INSS sobre o valor total (${fmt(totalD13)}). Esperado: ${fmt(inssEsperado2)}.`,
        legal_citation: "Lei 8.212/91 Art. 28",
        scenarios: null,
        tip: "Verifique se o INSS do 13º foi retido em folha separada.",
      });
    }

    // Alerta se IRRF ausente mas devido
    if (!d13AuditLines2.some((l) => l.type === "irrf") && irrfEsperado2 > TOLERANCE) {
      d13AuditLines2.push({
        description: "IRRF s/ 13º (não consta no holerite)",
        type: "irrf",
        kind: "deduction",
        declared_value: 0,
        expected_value: irrfEsperado2,
        difference: round2(-irrfEsperado2),
        status: "error",
        note: `A 2ª parcela do 13º deve ter IRRF sobre o total menos INSS. Base: ${fmt(round2(totalD13 - inssEsperado2))}. Esperado: ${fmt(irrfEsperado2)}.`,
        legal_citation: "Decreto 9.580/18 Art. 688",
        scenarios: null,
        tip: "Verifique se o IRRF do 13º foi retido em folha separada.",
      });
    }

    const netDeclared2 = round2(
      totalD13 -
      (parsed.lines.find((l) => l.type === "inss")?.declared_value ?? 0) -
      (parsed.lines.find((l) => l.type === "irrf")?.declared_value ?? 0) -
      adiantamento
    );

    return {
      gross_salary: totalD13,
      net_declared: netDeclared2,
      net_expected: liquidoEsperado2,
      total_difference: round2(liquidoEsperado2 - netDeclared2),
      tipo_holerite: "decimo_terceiro_2",
      lines: d13AuditLines2,
      summary: {
        total_errors: d13AuditLines2.filter((l) => l.status === "error" || l.status === "legal_violation").length,
        total_warnings: d13AuditLines2.filter((l) => l.status === "warning").length,
        inss_declared: parsed.lines.find((l) => l.type === "inss")?.declared_value ?? 0,
        inss_expected: inssEsperado2,
        irrf_declared: parsed.lines.find((l) => l.type === "irrf")?.declared_value ?? 0,
        irrf_expected: irrfEsperado2,
        fgts_declared: parsed.lines.find((l) => l.type === "fgts")?.declared_value ?? 0,
        fgts_expected: fgtsEsperado2,
      },
    };
  }

  // ── PLR: sem INSS, sem FGTS, IRRF pela tabela exclusiva ──────────────────
  if (tipoDetectado === "plr") {
    const PLR_RE = /\bplr\b|\bppr\b|participa[çc][aã]o.{0,10}(lucros|resultados)/i;
    const plrLine = parsed.lines.find((l) => l.kind === "credit" && PLR_RE.test(l.description));
    const valorPLR = plrLine?.declared_value ?? parsed.gross_salary;
    const irrfPLREsperado = calcularIRRF_PLR(valorPLR);
    const faixaInfo = getFaixaPLR(valorPLR);

    const plrAuditLines: AuditLine[] = parsed.lines.map((line): AuditLine => {
      if (line.kind === "credit" && PLR_RE.test(line.description)) {
        return {
          description: line.description,
          type: line.type,
          kind: "credit",
          declared_value: line.declared_value,
          expected_value: line.declared_value,
          difference: 0,
          status: "ok",
          note: `PLR/PPR: não incide INSS nem FGTS (Lei 10.101/2000 Art. 3º). IRRF pela tabela exclusiva.`,
          legal_citation: "Lei 10.101/2000 Art. 3º",
          scenarios: null,
          tip: null,
        };
      }
      if (line.type === "inss") {
        const isOk = line.declared_value <= TOLERANCE;
        return {
          description: line.description,
          type: "inss",
          kind: "deduction",
          declared_value: line.declared_value,
          expected_value: 0,
          difference: round2(line.declared_value),
          status: isOk ? "ok" : "error",
          note: isOk ? "PLR não tem incidência de INSS." : "PLR NÃO tem incidência de INSS (Lei 10.101/2000 Art. 3º). Desconto indevido.",
          legal_citation: "Lei 10.101/2000 Art. 3º",
          scenarios: null,
          tip: null,
        };
      }
      if (line.type === "irrf") {
        const diff = round2(line.declared_value - irrfPLREsperado);
        return {
          description: line.description,
          type: "irrf",
          kind: "deduction",
          declared_value: line.declared_value,
          expected_value: irrfPLREsperado,
          difference: diff,
          status: Math.abs(diff) <= TOLERANCE ? "ok" : "error",
          note: `IRRF sobre PLR pela tabela exclusiva (Lei 10.101/2000 Art. 3º §5º). PLR: ${fmt(valorPLR)}. Faixa: ${faixaInfo.faixaLabel}. IRRF esperado: ${fmt(irrfPLREsperado)}.`,
          legal_citation: "Lei 10.101/2000 Art. 3º §5º",
          scenarios: null,
          tip: null,
        };
      }
      if (line.type === "fgts") {
        const isOk = line.declared_value <= TOLERANCE;
        return {
          description: line.description,
          type: "fgts",
          kind: "info",
          declared_value: line.declared_value,
          expected_value: 0,
          difference: round2(line.declared_value),
          status: isOk ? "ok" : "error",
          note: isOk ? "PLR não tem incidência de FGTS." : "PLR NÃO tem incidência de FGTS (Lei 10.101/2000 Art. 3º). Depósito indevido.",
          legal_citation: "Lei 10.101/2000 Art. 3º",
          scenarios: null,
          tip: null,
        };
      }
      return {
        description: line.description,
        type: line.type,
        kind: line.kind,
        declared_value: line.declared_value,
        expected_value: line.declared_value,
        difference: 0,
        status: "ok",
        note: null,
        legal_citation: null,
        scenarios: null,
        tip: null,
      };
    });

    const liquidoDeclarado = round2(
      valorPLR - (parsed.lines.find((l) => l.type === "irrf")?.declared_value ?? 0)
    );
    const liquidoEsperado = round2(valorPLR - irrfPLREsperado);

    return {
      gross_salary: valorPLR,
      net_declared: liquidoDeclarado,
      net_expected: liquidoEsperado,
      total_difference: round2(liquidoEsperado - liquidoDeclarado),
      tipo_holerite: "plr",
      lines: plrAuditLines,
      summary: {
        total_errors: plrAuditLines.filter((l) => l.status === "error" || l.status === "legal_violation").length,
        total_warnings: plrAuditLines.filter((l) => l.status === "warning").length,
        inss_declared: parsed.lines.find((l) => l.type === "inss")?.declared_value ?? 0,
        inss_expected: 0,
        irrf_declared: parsed.lines.find((l) => l.type === "irrf")?.declared_value ?? 0,
        irrf_expected: irrfPLREsperado,
        fgts_declared: parsed.lines.find((l) => l.type === "fgts")?.declared_value ?? 0,
        fgts_expected: 0,
      },
    };
  }

  const declarado = construirHoleriteDeclarado(parsed);
  const esperado = calcularHoleriteEsperado(declarado, parsed);
  const tipoContrato = parsed.tipo_contrato ?? null;

  const COMISSAO_RE_AUDIT = /comiss[oõãa]/i;
  const comissoesTotal = parsed.lines
    .filter((l) => l.kind === "credit" && COMISSAO_RE_AUDIT.test(l.description))
    .reduce((s, l) => s + l.declared_value, 0);

  const auditLines: AuditLine[] = parsed.lines.map((line) =>
    auditarLinha(line, declarado, esperado, tipoContrato, comissoesTotal, tipoDetectado)
  );

  // Regra 9: Terço constitucional ausente quando há férias no holerite
  const temLinhaFerias = parsed.lines.some((l) => l.type === "ferias");
  const temAdicionalFerias = parsed.lines.some((l) => l.type === "adicional_ferias");
  if (temLinhaFerias && !temAdicionalFerias) {
    const valorFerias = parsed.lines.find((l) => l.type === "ferias")?.declared_value ?? 0;
    const tercoProporcional = round2(valorFerias / 3);
    auditLines.push(
      buildSyntheticLine(
        "Terço constitucional de férias (não constou)",
        "adicional_ferias",
        "credit",
        0,
        tercoProporcional,
        legalNote(
          "O terço constitucional de férias (1/3 do valor das férias) é obrigatório e deve constar no holerite (CF Art. 7º XVII + CLT Art. 148). Nenhum acordo pode suprimi-lo.",
          "Rubrica ausente no holerite",
          `${fmt(tercoProporcional)} = ${fmt(valorFerias)} ÷ 3`
        ),
        "CF Art. 7º XVII + CLT Art. 148"
      )
    );
  }

  // DSR sobre variáveis ausente no holerite mas devido pelo engine
  if (declarado.dsrSobreVariaveis === 0 && esperado.dsrSobreVariaveis > 0) {
    auditLines.push(
      buildSyntheticLine(
        "DSR s/ variáveis (não constou)",
        "dsr_sobre_variaveis",
        "credit",
        0,
        esperado.dsrSobreVariaveis,
        "DSR sobre verbas variáveis não encontrado no holerite, mas é devido."
      )
    );
  }

  // Salário mínimo — só verifica se não existe linha salario_base (já auditada acima)
  const temLinhaBase = auditLines.some((l) => l.type === "salario_base");
  if (!temLinhaBase) {
    const smAudit = getSalarioMinimo(declarado.competencia ?? "01/2026");
    const minSalario = round2(smAudit * declarado.horasMensais / HORAS_MES);
    if (declarado.salarioBase < minSalario - TOLERANCE) {
      auditLines.unshift(
        buildSyntheticLine(
          "Salário Base (abaixo do mínimo legal)",
          "salario_base",
          "credit",
          declarado.salarioBase,
          minSalario,
          legalNote(
            `Salário mínimo nacional: ${fmt(smAudit)} para jornada de 220h. ` +
              `Para jornada de ${declarado.horasMensais}h, o mínimo proporcional é ${fmt(minSalario)}.`,
            fmt(declarado.salarioBase),
            `No mínimo ${fmt(minSalario)}`
          ),
          "CF Art. 7º IV + CLT Art. 76"
        )
      );
    }
  }

  // ── Regra 5: Salário-família — verifica elegibilidade quando não consta ─
  const LIMITE_SAL_FAMILIA = 1819.26;
  const VALOR_SAL_FAMILIA_UNIT = 62.04;
  const SAL_FAM_RE_CHECK = /sal[aá]rio[\s-]*fam[ií]lia|sal\.?\s*fam\.?/i;
  const temSalFamiliaNoHolerite = parsed.lines.some((l) => SAL_FAM_RE_CHECK.test(l.description));

  if (!temSalFamiliaNoHolerite && declarado.salarioBruto <= LIMITE_SAL_FAMILIA && declarado.dependentes > 0) {
    const valorRef = round2(VALOR_SAL_FAMILIA_UNIT * declarado.dependentes);
    const sfScenarios: ConditionalScenario[] = [
      {
        label: `Você TEM filhos menores de 14 anos: tem direito a ${fmt(VALOR_SAL_FAMILIA_UNIT)} por filho — solicite ao RH com certidão de nascimento e carteira de vacinação`,
        expected: valorRef,
        matches: false,
        difference: -valorRef,
      },
      {
        label: "Você NÃO tem filhos menores de 14 anos: não se aplica",
        expected: 0,
        matches: true,
        difference: 0,
      },
    ];
    auditLines.push({
      description: "Salário-Família (não consta no holerite)",
      type: "outros_creditos",
      kind: "credit",
      declared_value: 0,
      expected_value: 0,
      difference: 0,
      status: "manual_check",
      note: `Seu salário bruto de ${fmt(declarado.salarioBruto)} está abaixo do limite de ${fmt(LIMITE_SAL_FAMILIA)} para recebimento de salário-família. Seu holerite não mostra essa rubrica.`,
      legal_citation: "Lei 4.749/65 + Portaria MPS",
      scenarios: sfScenarios,
      tip: "Apresente certidão de nascimento e carteira de vacinação atualizada ao RH para habilitar o benefício.",
    });
  }

  // ── Regra 6: Consignado — limite 35% da remuneração bruta ────────────────
  const CONSIGNADO_RE = /consignado|empr[eé]st\.?\s*consig|cart[aã]o\s*consignado/i;
  const linhasConsignado = parsed.lines.filter(
    (l) => l.kind === "deduction" && CONSIGNADO_RE.test(l.description)
  );
  const totalConsignado = round2(linhasConsignado.reduce((s, l) => s + l.declared_value, 0));

  if (totalConsignado > 0 && declarado.salarioBruto > 0) {
    const pctConsignado = totalConsignado / declarado.salarioBruto;
    if (pctConsignado > 0.351) {
      const limiteValor = round2(declarado.salarioBruto * 0.35);
      const excesso = round2(totalConsignado - limiteValor);
      auditLines.push({
        description: "Consignado — total acima do limite legal",
        type: "outros_descontos",
        kind: "deduction",
        declared_value: totalConsignado,
        expected_value: limiteValor,
        difference: round2(totalConsignado - limiteValor),
        status: "warning",
        note: `Os descontos de consignado somam ${fmt(totalConsignado)} (${(pctConsignado * 100).toFixed(1)}% do salário bruto de ${fmt(declarado.salarioBruto)}). O limite legal é 35% (Lei 10.820/2003). Excesso: ${fmt(excesso)}. Você pode solicitar a adequação junto ao banco credor e ao RH.`,
        legal_citation: "Lei 10.820/2003 Art. 1º §1º",
        scenarios: null,
        tip: null,
      });
    }
  }

  // ── Intervalo intrajornada ausente mas declarado pelo usuário ────────────
  if (parsed.intervalo_reduzido === true && tipoDetectado === "folha_mensal") {
    const INTERVALO_PRESENTE_RE = /intervalo|intrajornada|supressão\s*intervalo/i;
    const temIntervaloNoHolerite = parsed.lines.some(
      (l) => l.kind === "credit" && INTERVALO_PRESENTE_RE.test(l.description)
    );
    if (!temIntervaloNoHolerite) {
      const valorHora = declarado.salarioBase / declarado.horasMensais;
      const exp30min = round2(valorHora * 0.5 * 1.5);
      auditLines.push({
        description: "Intervalo intrajornada suprimido (não consta no holerite)",
        type: "outros_creditos",
        kind: "credit",
        declared_value: 0,
        expected_value: 0,
        difference: 0,
        status: "manual_check",
        note: `Você indicou que seu intervalo de almoço é inferior a 1 hora. Para jornadas acima de 6 horas, o intervalo mínimo é de 1 hora (CLT Art. 71). O período suprimido deve ser pago com acréscimo de 50%.`,
        legal_citation: "CLT Art. 71 §4º",
        scenarios: [
          { label: `30 min suprimidos × 150%: ${fmt(exp30min)}`, expected: exp30min, matches: false, difference: -exp30min },
          { label: `1h suprimida × 150%: ${fmt(round2(valorHora * 1.5))}`, expected: round2(valorHora * 1.5), matches: false, difference: -round2(valorHora * 1.5) },
        ],
        tip: "Solicite ao RH o pagamento do intervalo não concedido ou registre reclamação na DRT (Delegacia Regional do Trabalho).",
      });
    }
  }

  // ── Regra 12: Limite de 2h extras por dia — CLT Art. 59 ─────────────────────
  if (tipoDetectado === "folha_mensal") {
    const heLinhasComBasis = parsed.lines.filter(
      (l) => (l.type === "hora_extra_50" || l.type === "hora_extra_100") && l.basis !== null
    );
    if (heLinhasComBasis.length > 0) {
      const totalHorasExtras = heLinhasComBasis.reduce((s, l) => s + (l.basis ?? 0), 0);
      const diasDoMesR12 = calcularDiasDoMes(declarado.competencia, declarado.horasMensais);
      const mediaDiaria = totalHorasExtras / diasDoMesR12.diasUteis;
      if (mediaDiaria > 2.0 + TOLERANCE) {
        const limiteHorasMes = diasDoMesR12.diasUteis * 2;
        auditLines.push({
          description: "Horas extras — verificar limite diário",
          type: "outros_creditos",
          kind: "info",
          declared_value: 0,
          expected_value: 0,
          difference: 0,
          status: "manual_check",
          note: `Suas ${totalHorasExtras}h extras em ${diasDoMesR12.diasUteis} dias úteis representam uma média de ${mediaDiaria.toFixed(1)}h por dia. O limite legal é 2h extras por dia (CLT Art. 59).\n• Se sua categoria tem acordo ou convenção coletiva permitindo mais de 2h/dia: pode ser válido.\n• Se não há acordo coletivo: as horas acima de 2h/dia podem ser consideradas irregulares.\nDica: confira a convenção coletiva do seu sindicato.`,
          legal_citation: "CLT Art. 59",
          scenarios: [
            {
              label: "Sua categoria TEM acordo coletivo permitindo > 2h extras/dia: situação pode ser válida",
              expected: 0,
              matches: true,
              difference: 0,
            },
            {
              label: `Sem acordo coletivo: o máximo seria ${limiteHorasMes}h/mês (${diasDoMesR12.diasUteis} dias × 2h). Excedente: ${round2(totalHorasExtras - limiteHorasMes)}h`,
              expected: limiteHorasMes,
              matches: Math.abs(totalHorasExtras - limiteHorasMes) <= TOLERANCE,
              difference: round2(totalHorasExtras - limiteHorasMes),
            },
          ],
          tip: "Verifique a convenção coletiva da sua categoria no site do MTE ou consulte o RH.",
        });
      }
    }
  }

  // ── Regra 13: VA/VR — desconto do PAT (20% máximo) ──────────────────────────
  {
    const VA_VR_PROVENTO_RE = /vale[\s-]*(refei[çc][aã]o|alimenta[çc][aã]o)|aux[íi]lio[\s-]*(refei[çc][aã]o|alimenta[çc][aã]o)|ticket[\s-]*(refei[çc][aã]o|alimenta[çc][aã]o)|\bVR\b|\bVA\b/i;
    const VA_VR_DESCONTO_RE = /desc\.?\s*(VR|VA|refei[çc][aã]o|alimenta[çc][aã]o)|participa[çc][aã]o\s*(VR|VA)|coparticip\.?\s*(VR|VA)/i;
    const vaVrProvento = parsed.lines.find(
      (l) => l.kind === "credit" && (l.type === "vale_refeicao" || l.type === "vale_alimentacao" || VA_VR_PROVENTO_RE.test(l.description))
    );
    const vaVrDesconto = parsed.lines.find(
      (l) => l.kind === "deduction" && VA_VR_DESCONTO_RE.test(l.description)
    );
    if (vaVrProvento && vaVrDesconto && vaVrProvento.declared_value > TOLERANCE) {
      const pctVA = vaVrDesconto.declared_value / vaVrProvento.declared_value;
      if (pctVA > 0.201) {
        const limiteVA = round2(vaVrProvento.declared_value * 0.20);
        const excessoVA = round2(vaVrDesconto.declared_value - limiteVA);
        const tipoLabel = /alimenta[çc][aã]o|\bVA\b/i.test(vaVrProvento.description) ? "VA" : "VR";
        auditLines.push({
          description: `Desconto de ${tipoLabel} — verificar limite PAT`,
          type: "outros_descontos",
          kind: "deduction",
          declared_value: vaVrDesconto.declared_value,
          expected_value: limiteVA,
          difference: round2(vaVrDesconto.declared_value - limiteVA),
          status: "manual_check",
          note: `Seu empregador concede ${tipoLabel} de ${fmt(vaVrProvento.declared_value)} e desconta ${fmt(vaVrDesconto.declared_value)} (${(pctVA * 100).toFixed(1)}%).\n• Se a empresa é inscrita no PAT: o desconto máximo é 20% do valor concedido (${fmt(limiteVA)}). Seu desconto excede em ${fmt(excessoVA)}.\n• Se a empresa NÃO participa do PAT: o limite de 20% não se aplica, mas o desconto deve estar previsto em contrato ou acordo coletivo.\nDica: pergunte ao RH se a empresa participa do PAT.`,
          legal_citation: "CLT Art. 457 §2º + PAT",
          scenarios: [
            {
              label: `Empresa inscrita no PAT: desconto máximo = ${fmt(limiteVA)} (20%). Excesso indevido: ${fmt(excessoVA)}`,
              expected: limiteVA,
              matches: Math.abs(vaVrDesconto.declared_value - limiteVA) <= TOLERANCE,
              difference: round2(vaVrDesconto.declared_value - limiteVA),
            },
            {
              label: "Empresa NÃO inscrita no PAT: sem limite de 20%, mas desconto deve estar em contrato/acordo",
              expected: vaVrDesconto.declared_value,
              matches: true,
              difference: 0,
            },
          ],
          tip: "Pergunte ao RH se a empresa é inscrita no PAT (Programa de Alimentação do Trabalhador) no SIGI/MTE. Se sim, o desconto máximo é 20% do valor do benefício.",
        });
      }
    }
  }

  // ── Regra 15: Gratificação de função e controle de jornada — CLT Art. 62 ────
  {
    const GRAT_FUNC_RE = /gratifica[çc][aã]o[\s-]*(de\s*)?fun[çc][aã]o|grat\.?\s*fun[çc][aã]o|cargo[\s-]*confian[çc]a|gratifica[çc][aã]o[\s-]*confian[çc]a/i;
    const gratFuncLine = parsed.lines.find((l) => l.kind === "credit" && GRAT_FUNC_RE.test(l.description));
    if (gratFuncLine && declarado.salarioBase > TOLERANCE) {
      const pctGrat = gratFuncLine.declared_value / declarado.salarioBase;
      const temHorasExtras = parsed.lines.some((l) => l.type === "hora_extra_50" || l.type === "hora_extra_100");
      if (pctGrat >= 0.40 && temHorasExtras) {
        auditLines.push({
          description: "Gratificação de função ≥ 40% + horas extras (CLT Art. 62)",
          type: "outros_creditos",
          kind: "info",
          declared_value: 0,
          expected_value: 0,
          difference: 0,
          status: "manual_check",
          note: `Seu holerite mostra gratificação de função de ${fmt(gratFuncLine.declared_value)} (${(pctGrat * 100).toFixed(1)}% do salário base) E horas extras. Se sua gratificação é ≥ 40% do salário base, seu empregador pode enquadrá-lo como cargo de confiança (CLT Art. 62) e dispensar o controle de jornada — nesse caso, horas extras não seriam devidas. Confira seu enquadramento com o RH.`,
          legal_citation: "CLT Art. 62 II",
          scenarios: [
            {
              label: "Você É cargo de confiança (CLT Art. 62): horas extras não são devidas — a gratificação compensa a jornada sem controle",
              expected: 0,
              matches: false,
              difference: 0,
            },
            {
              label: "Você NÃO é cargo de confiança: horas extras são devidas normalmente e estão corretas",
              expected: gratFuncLine.declared_value,
              matches: true,
              difference: 0,
            },
          ],
          tip: "Verifique no seu contrato de trabalho se há cláusula de cargo de confiança (CLT Art. 62). Se houver e a gratificação é ≥ 40%, a empresa pode dispensar o controle de jornada.",
        });
      } else if (pctGrat < 0.40 && !temHorasExtras) {
        auditLines.push({
          description: "Gratificação de função < 40% — direitos de jornada mantidos",
          type: "outros_creditos",
          kind: "info",
          declared_value: 0,
          expected_value: 0,
          difference: 0,
          status: "manual_check",
          note: `Sua gratificação de função é de ${(pctGrat * 100).toFixed(1)}%, abaixo dos 40% previstos no CLT Art. 62. Isso significa que você NÃO pode ser excluído do controle de jornada e mantém direito a horas extras se trabalhar além da jornada contratual.`,
          legal_citation: "CLT Art. 62 II",
          scenarios: [
            {
              label: "Se você fez horas extras sem receber: você tem direito ao pagamento — solicite ao RH",
              expected: 0,
              matches: true,
              difference: 0,
            },
          ],
          tip: "A exclusão do controle de jornada (CLT Art. 62) exige gratificação de no mínimo 40% do salário base. Abaixo disso, todas as regras de jornada CLT se aplicam.",
        });
      }
      // pctGrat < 40% com HE → situação correta, não alertar
    }
  }

  // ── Regra 17: Banco de horas — CLT Art. 59 §§2º e 5º ────────────────────────
  {
    const BH_RE = /banco\s*(de\s*)?horas?|compensa[çc][aã]o\s*(de\s*)?horas?|saldo\s*bh\b/i;
    const bhLine = parsed.lines.find((l) => BH_RE.test(l.description));
    const temHE = parsed.lines.some((l) => l.type === "hora_extra_50" || l.type === "hora_extra_100");
    const bhInformadoPeloUsuario = (parsed as ParsedHolerite & { banco_horas?: boolean }).banco_horas === true;

    if (bhLine) {
      auditLines.push({
        description: "Banco de horas (CLT Art. 59)",
        type: "outros_creditos",
        kind: "info",
        declared_value: 0,
        expected_value: 0,
        difference: 0,
        status: "manual_check",
        note: "Seu holerite indica regime de banco de horas.\n• Acordo individual escrito: compensação em até 6 meses (CLT Art. 59 §5º).\n• Acordo ou convenção coletiva: compensação em até 1 ano (CLT Art. 59 §2º).\n• Acordo tácito: compensação no mesmo mês (CLT Art. 59 §6º).\nSe as horas não forem compensadas dentro do prazo, devem ser pagas como hora extra com adicional de no mínimo 50%.",
        legal_citation: "CLT Art. 59 §§2º e 5º",
        scenarios: [
          { label: "Banco em dia: horas registradas dentro do prazo de compensação — situação regular", expected: 0, matches: true, difference: 0 },
          { label: "Banco vencido: horas fora do prazo devem ser pagas como HE (mínimo 50%) — solicite planilha de saldo ao RH", expected: 0, matches: false, difference: 0 },
        ],
        tip: "Solicite ao RH a planilha de saldo do banco de horas com as datas de vencimento.",
      });
    } else if (bhInformadoPeloUsuario && temHE) {
      auditLines.push({
        description: "Banco de horas + HE paga no mesmo período",
        type: "outros_creditos",
        kind: "info",
        declared_value: 0,
        expected_value: 0,
        difference: 0,
        status: "manual_check",
        note: "Você informou que tem banco de horas, mas seu holerite mostra pagamento de hora extra. Isso pode significar que o banco estourou o prazo de compensação ou que a empresa optou por pagar diretamente.",
        legal_citation: "CLT Art. 59 §§2º e 5º",
        scenarios: [
          { label: "Banco estourou o prazo: HE paga com adicional correto — verificar se o adicional é de no mínimo 50%", expected: 0, matches: true, difference: 0 },
          { label: "Empresa optou por pagar em vez de compensar: regular se o adicional está correto", expected: 0, matches: true, difference: 0 },
        ],
        tip: "Solicite ao RH o extrato do banco de horas para confirmar se o pagamento cobre todas as horas acumuladas.",
      });
    }
  }

  // ── Regra 19: Descontos duplicados ───────────────────────────────────────────
  {
    const INDEVIDO_RE_DUP = /indevid[ao]|duplicad[ao]|cobran[çc]a\s*indevid|erro\s*(de\s*)?desconto/i;
    const deductions = parsed.lines.filter((l) => l.kind === "deduction" && l.type === "outros_descontos");
    const normalizeDesc = (s: string) =>
      s.replace(/\d[aª°]\s*(baixa|parcela)?/gi, "")
       .replace(/\s+/g, " ").trim().toLowerCase();
    for (let i = 0; i < deductions.length; i++) {
      for (let j = i + 1; j < deductions.length; j++) {
        const a = deductions[i];
        const b = deductions[j];
        // Se qualquer rubrica já tem keyword de irregularidade, ela já foi tratada pelo INDEVIDO_RE — pular
        if (INDEVIDO_RE_DUP.test(a.description) || INDEVIDO_RE_DUP.test(b.description)) continue;
        if (
          normalizeDesc(a.description) === normalizeDesc(b.description) &&
          Math.abs(a.declared_value - b.declared_value) <= TOLERANCE
        ) {
          auditLines.push({
            description: `Possível desconto duplicado: "${a.description}" e "${b.description}"`,
            type: "outros_descontos",
            kind: "info",
            declared_value: b.declared_value,
            expected_value: 0,
            difference: round2(b.declared_value),
            status: "legal_violation",
            note: `Duas rubricas com descrição semelhante e mesmo valor de ${fmt(a.declared_value)} foram descontadas. Se uma delas é duplicada, o desconto de ${fmt(b.declared_value)} é indevido (CLT Art. 462).\n\nDescrição 1: "${a.description}"\nDescrição 2: "${b.description}"`,
            legal_citation: "CLT Art. 462",
            scenarios: [
              { label: `Desconto duplicado (erro do empregador): ${fmt(b.declared_value)} devolvido ao empregado`, expected: 0, matches: false, difference: round2(b.declared_value) },
              { label: "Dois descontos legítimos distintos: situação regular", expected: b.declared_value, matches: true, difference: 0 },
            ],
            tip: "Verifique com o RH se este desconto foi duplicado. Se confirmado, solicite estorno imediato.",
          });
        }
      }
    }
  }

  // ── Deduções adicionais IRRF (previdência complementar, pensão alimentícia) ──
  const deducoesAdicionaisIRRF = round2(
    parsed.lines
      .filter((l) => l.kind === "deduction" && isDedutivelIRRF(l.description))
      .reduce((sum, l) => sum + l.declared_value, 0)
  );

  // ── Cross-checks: tentar explicar divergências antes de marcar erro ──────────
  {
    const ccInss = auditLines.find((l) => l.type === "inss");
    const ccIrrf = auditLines.find((l) => l.type === "irrf");
    const ccFgts = auditLines.find((l) => l.type === "fgts");

    // CC-2: INSS — tolerância R$2 (diferenças de arredondamento de tabela)
    if (ccInss && ccInss.status !== "ok") {
      const diff = Math.abs(ccInss.declared_value - ccInss.expected_value);
      if (diff <= 2.00) {
        ccInss.status = "ok";
        ccInss.difference = 0;
        ccInss.note = `Diferença de ${fmt(diff)} dentro da tolerância de arredondamento.`;
      }
    }

    // CC-3: FGTS — tolerância R$1
    if (ccFgts && ccFgts.status !== "ok") {
      const diff = Math.abs(ccFgts.declared_value - ccFgts.expected_value);
      if (diff <= 1.00) {
        ccFgts.status = "ok";
        ccFgts.difference = 0;
        ccFgts.note = `Diferença de ${fmt(diff)} dentro da tolerância de arredondamento.`;
      }
    }

    // CC-1: IRRF motor > declarado em >R$5 → buscar deduções não identificadas
    if (ccIrrf && ccIrrf.status !== "ok") {
      const diffCC1 = ccIrrf.expected_value - ccIrrf.declared_value;
      if (diffCC1 > 5.00) {
        const candidatas = parsed.lines.filter(
          (l) =>
            l.kind === "deduction" &&
            !isDedutivelIRRF(l.description) &&
            !["inss", "irrf", "vale_transporte"].includes(l.type)
        );
        const resultado = tentarExplicarDiferencaIRRF(
          declarado.salarioBruto,
          esperado.descontoINSS,
          declarado.dependentes,
          parsed.competencia,
          deducoesAdicionaisIRRF,
          ccIrrf.declared_value,
          candidatas
        );
        if (resultado.explicou) {
          ccIrrf.status = "ok";
          ccIrrf.expected_value = ccIrrf.declared_value;
          ccIrrf.difference = 0;
          ccIrrf.note = `Possíveis deduções da base IRRF: ${resultado.descricao}. Com essas deduções, o IRRF calculado coincide com o declarado.`;
        } else if (resultado.parcial) {
          ccIrrf.status = "manual_check";
          ccIrrf.note = `Possíveis deduções da base IRRF: ${resultado.descricao}. Resíduo não explicado: ${fmt(resultado.residual)}. Confirme com o RH quais descontos reduzem a base de cálculo do IRRF.`;
        }
      }
    }

    // CC-4: IRRF declarado > motor em >R$5 → testar sem dependentes
    if (ccIrrf && ccIrrf.status !== "ok") {
      const diffCC4 = ccIrrf.declared_value - ccIrrf.expected_value;
      if (diffCC4 > 5.00 && declarado.dependentes > 0) {
        const irrfSemDep = calcularIRRF(
          declarado.salarioBruto,
          esperado.descontoINSS,
          0,
          parsed.competencia,
          deducoesAdicionaisIRRF
        );
        if (Math.abs(irrfSemDep - ccIrrf.declared_value) <= 1.00) {
          const irrfCorreto = ccIrrf.expected_value;
          ccIrrf.status = "manual_check";
          ccIrrf.note = `O IRRF cobrado (${fmt(ccIrrf.declared_value)}) corresponde ao cálculo SEM os ${declarado.dependentes} dependente(s) declarado(s). Verifique com o RH se seus dependentes estão cadastrados. Se não estiverem, você está pagando ${fmt(diffCC4)} a mais de IRRF por mês.`;
          ccIrrf.scenarios = [
            {
              label: `Dependentes NÃO cadastrados no RH: IRRF correto seria ${fmt(irrfCorreto)} — você paga ${fmt(diffCC4)} a mais por mês`,
              expected: irrfCorreto,
              matches: false,
              difference: round2(diffCC4),
            },
            {
              label: `Você nunca formalizou os dependentes: IRRF cobrado (${fmt(ccIrrf.declared_value)}) está correto para 0 dependentes`,
              expected: ccIrrf.declared_value,
              matches: true,
              difference: 0,
            },
          ];
        }
      }
    }
  }

  // Atualizar nota do IRRF com breakdown de deduções já identificadas (apenas se CC não setou nota)
  if (deducoesAdicionaisIRRF > 0.05) {
    const irrfAuditLine = auditLines.find((l) => l.type === "irrf");
    if (irrfAuditLine && !irrfAuditLine.note) {
      const linhasDedutiveis = parsed.lines.filter(
        (l) => l.kind === "deduction" && isDedutivelIRRF(l.description)
      );
      const deducoesStr = linhasDedutiveis
        .map((l) => `${l.description} (${fmt(l.declared_value)})`)
        .join(" + ");
      const depDeduc = round2(declarado.dependentes * 189.59);
      const baseIrrfFinal = round2(
        declarado.salarioBruto - esperado.descontoINSS - deducoesAdicionaisIRRF - depDeduc
      );
      const deducBase = `INSS (${fmt(esperado.descontoINSS)})` +
        (deducoesStr ? ` + ${deducoesStr}` : "") +
        (declarado.dependentes > 0 ? ` + ${declarado.dependentes} dep. (${fmt(depDeduc)})` : "");
      irrfAuditLine.note = `Deduções consideradas: ${deducBase}. Base IRRF: ${fmt(baseIrrfFinal)}. Esperado: ${fmt(esperado.descontoIRRF)}.`;
    }
  }

  const inssLine = auditLines.find((l) => l.type === "inss");
  const irrfLine = auditLines.find((l) => l.type === "irrf");
  const fgtsLine = auditLines.find((l) => l.type === "fgts");

  const summary: AuditSummary = {
    total_errors: auditLines.filter((l) => l.status === "error" || l.status === "legal_violation").length,
    total_warnings: auditLines.filter((l) => l.status === "warning").length,
    inss_declared: inssLine?.declared_value ?? 0,
    inss_expected: esperado.descontoINSS,
    irrf_declared: irrfLine?.declared_value ?? 0,
    irrf_expected: esperado.descontoIRRF,
    fgts_declared: fgtsLine?.declared_value ?? 0,
    fgts_expected: esperado.valorFGTS,
  };

  // Classificar recorrência em todas as linhas
  for (const line of auditLines) {
    line.recurrence = classifyRecurrence(line.description, tipoDetectado);
  }

  // CC-5: sanity check de líquido — se há grande divergência mas nenhuma violação encontrada
  {
    const liquidoDeclarado = declarado.salarioLiquido;
    const liquidoCalculado = esperado.salarioLiquido;
    const diffLiquido = Math.abs(liquidoCalculado - liquidoDeclarado);
    const temViolacoes = auditLines.some((l) => l.status === "legal_violation" || l.status === "error");
    if (diffLiquido > 50 && !temViolacoes) {
      auditLines.push({
        description: "Verificação de líquido",
        type: "outros_descontos",
        kind: "info",
        declared_value: liquidoDeclarado,
        expected_value: liquidoCalculado,
        difference: round2(liquidoCalculado - liquidoDeclarado),
        status: "manual_check",
        note: `O líquido declarado (${fmt(liquidoDeclarado)}) difere do calculado (${fmt(liquidoCalculado)}) em ${fmt(diffLiquido)}, mas o motor não identificou violações específicas. Pode haver rubricas não reconhecidas ou deduções fora do padrão. Confira cada linha manualmente.`,
        legal_citation: null,
        scenarios: null,
        tip: "Compare cada rubrica do holerite com a coluna 'Esperado' nesta auditoria. Se encontrar discrepâncias, contacte o RH.",
      });
    }
  }

  const descontosIndevidos = auditLines
    .filter(l =>
      l.kind === "deduction" &&
      (l.status === "legal_violation" || l.status === "error") &&
      l.declared_value > l.expected_value + 0.05
    )
    .reduce((sum, l) => sum + round2(l.declared_value - l.expected_value), 0);

  const creditosFaltantes = auditLines
    .filter(l =>
      l.kind === "credit" &&
      (l.status === "legal_violation" || l.status === "error") &&
      l.expected_value > l.declared_value + 0.05
    )
    .reduce((sum, l) => sum + round2(l.expected_value - l.declared_value), 0);

  const netExpectedFinal = round2(esperado.salarioLiquido + descontosIndevidos + creditosFaltantes);

  // Calcular impacto por recorrência (apenas linhas com erro/violação que afetam o líquido)
  const linhasComErro = auditLines.filter(
    l => l.status === "legal_violation" || l.status === "error"
  );
  const impactoRecorrente = round2(
    linhasComErro
      .filter(l => l.recurrence === "recurring")
      .reduce((sum, l) => {
        if (l.kind === "deduction" && l.declared_value > l.expected_value + 0.05) return sum + round2(l.declared_value - l.expected_value);
        if (l.kind === "credit" && l.expected_value > l.declared_value + 0.05) return sum + round2(l.expected_value - l.declared_value);
        return sum;
      }, 0)
  );
  const impactoPontual = round2(
    linhasComErro
      .filter(l => l.recurrence === "one_time" || l.recurrence === "unknown")
      .reduce((sum, l) => {
        if (l.kind === "deduction" && l.declared_value > l.expected_value + 0.05) return sum + round2(l.declared_value - l.expected_value);
        if (l.kind === "credit" && l.expected_value > l.declared_value + 0.05) return sum + round2(l.expected_value - l.declared_value);
        return sum;
      }, 0)
  );
  const projecaoAnual = impactoRecorrente > 0.05 ? round2(impactoRecorrente * 12) : null;

  return {
    gross_salary: declarado.salarioBruto,
    net_declared: declarado.salarioLiquido,
    net_expected: netExpectedFinal,
    total_difference: round2(netExpectedFinal - declarado.salarioLiquido),
    tipo_holerite: tipoDetectado,
    lines: auditLines,
    summary,
    impactoRecorrente,
    impactoPontual,
    projecaoAnual,
  };
}

// ── Lógica de auditoria por linha ────────────────────────────────────────────

function auditarLinha(
  line: HoleriteLine,
  declarado: HoleriteDeclarado,
  esperado: HoleriteEsperado,
  tipoContrato: "privado" | "publico" | "aprendiz" | null,
  comissoes: number = 0,
  tipoHolerite: TipoHolerite = "desconhecido"
): AuditLine {
  const valorHoraBase = declarado.salarioBase / declarado.horasMensais;
  // Bug 3 — Súmula 139/191 TST: insalubridade/periculosidade integram base da HE
  const valorHoraParaHE = (declarado.salarioBase + declarado.insalubridade + declarado.periculosidade) / declarado.horasMensais;
  // Bug 2 — OJ 97 SDI-1 TST: hora extra noturna usa valorHora × 1,20
  const valorHoraHEBase = declarado.adicionalNoturno > 0 ? round2(valorHoraParaHE * 1.20) : valorHoraParaHE;
  let expectedValue = line.declared_value;
  let note: string | null = null;
  let legalCitation: string | null = null;
  let forceStatus: LineStatus | null = null;
  let scenarios: import("@/lib/types").ConditionalScenario[] | null = null;
  let tip: string | null = null;

  switch (line.type) {

    // ── Salário base — valida salário mínimo ─────────────────────────────
    case "salario_base": {
      const smLine = getSalarioMinimo(declarado.competencia ?? "01/2026");
      const minSalario = round2(smLine * declarado.horasMensais / HORAS_MES);
      if (line.declared_value < minSalario - TOLERANCE) {
        expectedValue = minSalario;
        legalCitation = "CF Art. 7º IV + CLT Art. 76";
        note = legalNote(
          `Salário mínimo nacional: ${fmt(smLine)} para jornada de 220h. ` +
            `Para jornada de ${declarado.horasMensais}h, o mínimo proporcional é ${fmt(minSalario)}.`,
          fmt(line.declared_value),
          `No mínimo ${fmt(minSalario)}`
        );
        forceStatus = "legal_violation";
      }
      break;
    }

    // ── Descontos principais ──────────────────────────────────────────────
    case "inss": {
      // PLR puro: não incide INSS — se há desconto, é indevido
      if (tipoHolerite === "plr") {
        if (line.declared_value > TOLERANCE) {
          expectedValue = 0;
          legalCitation = "Lei 10.101/2000 Art. 3º";
          note = legalNote(
            "PLR/PPR não integra a base de cálculo do INSS (Lei 10.101/2000 Art. 3º). Desconto indevido.",
            fmt(line.declared_value),
            "R$ 0,00 — INSS não incide sobre PLR"
          );
          forceStatus = "error";
        } else {
          forceStatus = "ok";
        }
        break;
      }
      // 13º 1ª parcela: INSS não incide
      if (tipoHolerite === "decimo_terceiro_1") {
        if (line.declared_value > TOLERANCE) {
          expectedValue = 0;
          legalCitation = "Lei 7.713/88 Art. 16";
          note = legalNote(
            "A 1ª parcela do 13º salário não tem incidência de INSS. O desconto de INSS ocorre apenas na 2ª parcela, sobre o valor total do 13º.",
            fmt(line.declared_value),
            "R$ 0,00 — INSS não incide na 1ª parcela"
          );
          forceStatus = "error";
        } else {
          forceStatus = "ok";
        }
        break;
      }
      expectedValue = esperado.descontoINSS; // já travado pelo calcularINSS
      const inssTeto = getINSSTeto(declarado.competencia ?? "01/2026");
      if (line.declared_value > inssTeto + TOLERANCE) {
        // Desconto acima do teto legal — empregador está retendo a mais
        legalCitation = "Lei 8.212/91 Art. 28 §5º + Portaria MPS";
        note = legalNote(
          `O desconto de INSS tem teto máximo de ${fmt(inssTeto)} para esta competência. Nenhum empregado pode ter mais do que isso descontado, independentemente do salário.`,
          fmt(line.declared_value),
          `Máximo legal: ${fmt(inssTeto)}`
        );
        forceStatus = "error";
      } else if (diverge(line.declared_value, expectedValue)) {
        note =
          `INSS esperado pela tabela progressiva: ${fmt(expectedValue)}. ` +
          `Base: ${fmt(declarado.salarioBruto)}`;
      }
      break;
    }

    case "irrf": {
      // PLR: IRRF calculado pela tabela exclusiva (Lei 10.101/2000 Art. 3º §5º)
      if (tipoHolerite === "plr") {
        const valorPLR = declarado.salarioBruto;
        const irrfPLREsperado = calcularIRRF_PLR(valorPLR);
        const faixaInfo = getFaixaPLR(valorPLR);
        expectedValue = irrfPLREsperado;
        legalCitation = "Lei 10.101/2000 Art. 3º §5º";
        if (diverge(line.declared_value, irrfPLREsperado)) {
          forceStatus = Math.abs(line.declared_value - irrfPLREsperado) <= 1.0 ? "warning" : "error";
          note = `IRRF sobre PLR calculado pela tabela exclusiva (Lei 10.101/2000 Art. 3º §5º).\nPLR: ${fmt(valorPLR)}.\nFaixa: ${faixaInfo.faixaLabel}.\nIRRF esperado: ${fmt(irrfPLREsperado)}.\nIRRF declarado: ${fmt(line.declared_value)}.`;
        } else {
          forceStatus = "ok";
          note = `IRRF sobre PLR calculado pela tabela exclusiva. Faixa: ${faixaInfo.faixaLabel}. Valor correto: ${fmt(irrfPLREsperado)}.`;
        }
        break;
      }
      // 13º 1ª parcela: IRRF não incide
      if (tipoHolerite === "decimo_terceiro_1") {
        if (line.declared_value > TOLERANCE) {
          expectedValue = 0;
          legalCitation = "Decreto 9.580/18 Art. 688";
          note = legalNote(
            "A 1ª parcela do 13º salário não tem incidência de IRRF. O IRRF incide apenas na 2ª parcela, sobre o valor total do 13º.",
            fmt(line.declared_value),
            "R$ 0,00 — IRRF não incide na 1ª parcela"
          );
          forceStatus = "error";
        } else {
          forceStatus = "ok";
        }
        break;
      }
      // 13º 2ª parcela: IRRF deve ser calculado sobre o total do 13º (sem histórico da 1ª parcela, verificação manual)
      if (tipoHolerite === "decimo_terceiro_2") {
        forceStatus = "manual_check";
        note = "IRRF do 13º salário incide sobre o valor total do 13º (1ª + 2ª parcela somadas), com dedução do INSS do 13º. Como não temos o valor da 1ª parcela, a verificação exata não é possível automaticamente.";
        scenarios = [
          { label: "Verifique: base = total do 13º − INSS do 13º. Confira com o espelho de pagamento da 2ª parcela.", expected: line.declared_value, matches: true, difference: 0 },
        ];
        tip = "O holerite da 2ª parcela do 13º deve conter uma linha de INSS e IRRF calculados sobre o valor total (1ª + 2ª) do décimo terceiro.";
        break;
      }
      expectedValue = esperado.descontoIRRF;
      if (diverge(line.declared_value, expectedValue)) {
        const base = round2(declarado.salarioBruto - esperado.descontoINSS);
        note =
          `IRRF esperado pela tabela 2026: ${fmt(expectedValue)}. ` +
          `Base (bruto − INSS): ${fmt(base)}` +
          (declarado.dependentes > 0
            ? ` − ${declarado.dependentes} dependente(s)`
            : "");
      }
      break;
    }

    // ── FGTS — base deve ser o bruto total ───────────────────────────────
    case "fgts":
      expectedValue = esperado.valorFGTS;
      if (line.declared_value < expectedValue - TOLERANCE) {
        legalCitation = "Lei 8.036/90 Art. 15";
        const pctEfetivo = declarado.salarioBruto > 0
          ? ((line.declared_value / declarado.salarioBruto) * 100).toFixed(1)
          : "0";
        note = legalNote(
          "FGTS é de 8% sobre a remuneração bruta total, incluindo horas extras, adicionais e DSR.",
          `${fmt(line.declared_value)} — equivalente a ${pctEfetivo}% do bruto declarado`,
          `${fmt(expectedValue)} = 8% × ${fmt(declarado.salarioBruto)}`
        );
        forceStatus = "legal_violation";
      } else if (diverge(line.declared_value, expectedValue)) {
        note = `FGTS esperado = 8% × ${fmt(declarado.salarioBruto)}: ${fmt(expectedValue)}`;
      }
      break;

    // ── Hora extra 50% — mínimo 50% em dia útil; 100% se feriado/domingo ──
    // line.rate = extra-% como decimal (0.5 = 50%, 1.0 = 100%)
    case "hora_extra_50": {
      // Regra 2: se a descrição indica feriado ou domingo, aplica mínimo de 100%
      const isFeriadoHE = /feriado|domingo|\bhe\s*100\b/i.test(line.description);

      if (isFeriadoHE) {
        const taxaHE = line.rate !== null
          ? line.rate
          : (line.basis !== null && valorHoraHEBase * line.basis > TOLERANCE)
            ? (line.declared_value / (valorHoraHEBase * line.basis)) - 1
            : null;

        if (taxaHE !== null && taxaHE < 0.95 && line.declared_value > TOLERANCE) {
          legalCitation = "CLT Art. 70 + Lei 605/49 + CF Art. 7º XVI";
          const pctDeclarado = Math.round(taxaHE * 100);
          expectedValue = line.basis !== null
            ? round2(valorHoraHEBase * line.basis * 2.0)
            : round2(line.declared_value * 2.0 / (1 + taxaHE));
          note = legalNote(
            "Hora extra em feriado ou domingo tem adicional mínimo de 100% sobre a hora normal (CLT Art. 70 + Lei 605/49). O adicional de 50% se aplica apenas a dias úteis comuns.",
            `Adicional de ${pctDeclarado}% em feriado/domingo — abaixo do mínimo legal de 100%`,
            line.basis !== null
              ? `Adicional mínimo de 100%: ${fmt(expectedValue)} (${line.basis}h × ${fmt(valorHoraHEBase)} × 2,0)`
              : `Adicional mínimo de 100%: ${fmt(expectedValue)} (estimado pela taxa declarada)`
          );
          forceStatus = "legal_violation";
        } else if (line.basis !== null) {
          expectedValue = round2(valorHoraHEBase * line.basis * 2.0);
          if (diverge(line.declared_value, expectedValue)) {
            note = `HE feriado/domingo: ${line.basis}h × ${fmt(valorHoraHEBase)} × 2,0 = ${fmt(expectedValue)}`;
          }
        } else {
          forceStatus = "manual_check";
          note = "O valor depende de quantas horas você trabalhou em feriados ou domingos (mínimo 100%):";
          scenarios = [4, 8, 12, 16, 20].map((h) => {
            const exp = round2(valorHoraHEBase * h * 2.0);
            return { label: `${h}h em feriado/domingo (100%)`, expected: exp, matches: Math.abs(line.declared_value - exp) <= TOLERANCE, difference: round2(line.declared_value - exp) };
          });
          tip = "Confira no espelho de ponto os dias de feriado e domingo em que você trabalhou.";
        }
      } else {
        // Regra padrão: adicional mínimo de 50% em dia útil
        const taxaHE50 = line.rate !== null
          ? line.rate
          : (line.basis !== null && valorHoraHEBase * line.basis > TOLERANCE)
            ? (line.declared_value / (valorHoraHEBase * line.basis)) - 1
            : null;

        const violaLegalHE50 =
          taxaHE50 !== null &&
          taxaHE50 < 0.495 &&
          tipoContrato !== "aprendiz" &&
          line.declared_value > TOLERANCE;

        if (violaLegalHE50 && taxaHE50 !== null) {
          legalCitation = "CLT Art. 59 §1º + CF Art. 7º XVI";
          const pctDeclarado = Math.round(taxaHE50 * 100);
          expectedValue = line.basis !== null
            ? round2(valorHoraHEBase * line.basis * 1.5)
            : round2(line.declared_value * 1.5 / (1 + taxaHE50));
          note = legalNote(
            "Hora extra em dia útil deve ser paga com acréscimo mínimo de 50% sobre a hora normal.",
            `Hora extra com adicional de ${pctDeclarado}% — abaixo do mínimo legal`,
            line.basis !== null
              ? `Adicional mínimo de 50%: ${fmt(expectedValue)} (${line.basis}h × ${fmt(valorHoraHEBase)} × 1,5)`
              : `Adicional mínimo de 50%: ${fmt(expectedValue)} (estimado pela taxa declarada)`
          );
          forceStatus = "legal_violation";
        } else if (line.basis !== null) {
          expectedValue = round2(valorHoraHEBase * line.basis * 1.5);
          if (diverge(line.declared_value, expectedValue)) {
            note = `HE 50%: (${fmt(declarado.salarioBase)} ÷ ${declarado.horasMensais}h) × ${line.basis}h × 1,5 = ${fmt(expectedValue)}`;
          }
        } else {
          forceStatus = "manual_check";
          note = "O valor depende de quantas horas extras você fez. Compare com o seu controle de ponto:";
          scenarios = [5, 10, 15, 20, 25].map((h) => {
            const exp = round2(valorHoraHEBase * h * 1.5);
            return { label: `${h}h extras a 50%`, expected: exp, matches: Math.abs(line.declared_value - exp) <= TOLERANCE, difference: round2(line.declared_value - exp) };
          });
          tip = "Confira no espelho de ponto ou no controle de jornada.";
        }
      }
      break;
    }

    // ── Hora extra 100% — mínimo legal: 100% em dom/feriado ─────────────
    // line.rate = extra-% como decimal (1.0 = 100%)
    case "hora_extra_100": {
      const taxaHE100 = line.rate !== null
        ? line.rate
        : (line.basis !== null && valorHoraHEBase * line.basis > TOLERANCE)
          ? (line.declared_value / (valorHoraHEBase * line.basis)) - 1
          : null;

      const violaLegalHE100 =
        taxaHE100 !== null &&
        taxaHE100 < 0.95 &&
        line.declared_value > TOLERANCE;

      if (violaLegalHE100 && taxaHE100 !== null) {
        legalCitation = "CLT Art. 59 §1º + CF Art. 7º XVI";
        const pctDeclarado = Math.round(taxaHE100 * 100);
        if (line.basis !== null) {
          expectedValue = round2(valorHoraHEBase * line.basis * 2.0);
        } else {
          expectedValue = round2(line.declared_value * 2.0 / (1 + taxaHE100));
        }
        note = legalNote(
          "Hora extra em domingo ou feriado deve ser paga com acréscimo mínimo de 100% sobre a hora normal.",
          `Hora extra com adicional de ${pctDeclarado}% — abaixo do mínimo legal`,
          line.basis !== null
            ? `Adicional mínimo de 100%: ${fmt(expectedValue)} (${line.basis}h × ${fmt(valorHoraHEBase)} × 2,0)`
            : `Adicional mínimo de 100%: ${fmt(expectedValue)} (estimado pela taxa declarada)`
        );
        forceStatus = "legal_violation";
      } else if (line.basis !== null) {
        expectedValue = round2(valorHoraHEBase * line.basis * 2.0);
        if (diverge(line.declared_value, expectedValue)) {
          note = `HE 100%: (${fmt(declarado.salarioBase)} ÷ ${declarado.horasMensais}h) × ${line.basis}h × 2 = ${fmt(expectedValue)}`;
        }
      } else {
        // Sem taxa e sem horas → análise condicional
        forceStatus = "manual_check";
        note = "O valor depende de quantas horas você trabalhou em domingos e feriados. Compare com o ponto:";
        const horas100 = [4, 8, 12, 16, 20];
        scenarios = horas100.map((h) => {
          const exp = round2(valorHoraHEBase * h * 2.0);
          return { label: `${h}h em dom/feriado`, expected: exp, matches: Math.abs(line.declared_value - exp) <= TOLERANCE, difference: round2(line.declared_value - exp) };
        });
        tip = "Confira no espelho de ponto os domingos e feriados em que você trabalhou.";
      }
      break;
    }

    // ── Adicional noturno — mínimo legal: 20% (22h–5h) ──────────────────
    case "adicional_noturno": {
      // Taxa efetiva: explícita (line.rate) ou inferida pelas horas (basis)
      const taxaExplicita = line.rate;
      const taxaInferida = (line.basis !== null && valorHoraBase * line.basis > TOLERANCE)
        ? line.declared_value / (valorHoraBase * line.basis)
        : null;
      const taxaEfetiva = taxaExplicita ?? taxaInferida ?? null;

      if (taxaEfetiva !== null && taxaEfetiva < 0.199 && line.declared_value > TOLERANCE) {
        // Taxa abaixo do mínimo legal → violação
        legalCitation = "CLT Art. 73";
        const pctDeclarado = Math.round(taxaEfetiva * 100);
        expectedValue = line.basis !== null
          ? round2(valorHoraBase * line.basis * 0.2)
          : round2(line.declared_value * 0.2 / taxaEfetiva);
        note = legalNote(
          "Adicional noturno mínimo: 20% sobre a hora diurna, para trabalho realizado entre 22h e 5h.",
          line.basis !== null
            ? `${fmt(line.declared_value)} (${line.basis}h × ${fmt(valorHoraBase)} → taxa efetiva de ${pctDeclarado}% — abaixo do mínimo legal)`
            : `Adicional de ${pctDeclarado}% — abaixo do mínimo legal`,
          line.basis !== null
            ? `${fmt(expectedValue)} = ${line.basis}h × ${fmt(valorHoraBase)} × 20%`
            : `Adicional mínimo de 20%: ${fmt(expectedValue)}`
        );
        forceStatus = "legal_violation";
      } else if (line.basis !== null) {
        // Regra 11: verificar se as horas são equivalentes ou de relógio (CLT Art. 73 §1º)
        const isHorasEquivalentes = /h\s*eq\b|equivalente|eq\s*h/i.test(line.description);
        if (isHorasEquivalentes) {
          // Horas já convertidas para equivalentes (52min30s): cálculo direto
          expectedValue = round2(valorHoraBase * line.basis * 0.2);
          if (diverge(line.declared_value, expectedValue)) {
            note = `Adicional noturno: (${fmt(declarado.salarioBase)} ÷ ${declarado.horasMensais}h) × ${line.basis}h eq × 20% = ${fmt(expectedValue)}`;
          }
        } else {
          // Horas sem indicação de equivalência — pode ser relógio ou já convertidas
          // CLT Art. 73 §1º: hora noturna = 52min30s; fator = 60/52,5 = 1,1429
          forceStatus = "manual_check";
          legalCitation = "CLT Art. 73 §1º";
          const expHorasEq = round2(valorHoraBase * line.basis * 0.2);
          const expHorasRelogio = round2(valorHoraBase * round2(line.basis * 1.1429) * 0.2);
          note = `Seu holerite mostra ${line.basis}h noturnas. A CLT Art. 73 §1º prevê que a hora noturna equivale a 52 minutos e 30 segundos (fator 1,1429). O valor correto depende de como as horas foram contabilizadas:`;
          scenarios = [
            {
              label: `Horas JÁ CONVERTIDAS (h eq): correto = ${fmt(expHorasEq)} (${line.basis}h eq × ${fmt(valorHoraBase)} × 20%)`,
              expected: expHorasEq,
              matches: Math.abs(line.declared_value - expHorasEq) <= TOLERANCE,
              difference: round2(line.declared_value - expHorasEq),
            },
            {
              label: `Horas DE RELÓGIO (não convertidas): correto = ${fmt(expHorasRelogio)} (${line.basis}h × 1,1429 = ${round2(line.basis * 1.1429)}h eq × ${fmt(valorHoraBase)} × 20%)`,
              expected: expHorasRelogio,
              matches: Math.abs(line.declared_value - expHorasRelogio) <= TOLERANCE,
              difference: round2(line.declared_value - expHorasRelogio),
            },
          ];
          tip = "Confira no seu espelho de ponto se as horas noturnas constam como 'h eq' (horas equivalentes já convertidas) ou como horas de relógio normais.";
        }
      } else {
        // Sem taxa e sem horas → análise condicional
        forceStatus = "manual_check";
        note = "O valor depende de quantas horas você trabalhou entre 22h e 5h. Compare com o ponto:";
        const horasNoturnas = [40, 50, 60, 80, 100];
        scenarios = horasNoturnas.map((h) => {
          const exp = round2(valorHoraBase * h * 0.2);
          return { label: `${h}h noturnas`, expected: exp, matches: Math.abs(line.declared_value - exp) <= TOLERANCE, difference: round2(line.declared_value - exp) };
        });
        tip = "Confira nas marcações de ponto as horas trabalhadas entre 22h e 5h.";
      }
      break;
    }

    // ── Insalubridade — 10/20/40% do SM (CLT art. 192) ──────────────────
    case "insalubridade": {
      const smIns = getSalarioMinimo(declarado.competencia ?? "01/2026");
      const grauMin = round2(smIns * 0.1);
      const grauMed = round2(smIns * 0.2);
      const grauMax = round2(smIns * 0.4);
      const graus = [grauMin, grauMed, grauMax];
      const grauLabels = ["mínimo (10%)", "médio (20%)", "máximo (40%)"];

      const matchIdx = graus.findIndex((g) => Math.abs(line.declared_value - g) <= TOLERANCE);

      if (matchIdx === -1) {
        // Não bate com nenhum grau → violação legal
        expectedValue = encontrarGrauInsalubridade(line.declared_value, {
          minimo: grauMin,
          medio: grauMed,
          maximo: grauMax,
        });
        const nearestIdx = graus.indexOf(expectedValue);
        const nearestLabel = nearestIdx >= 0 ? grauLabels[nearestIdx] : "mais próximo";
        legalCitation = "CLT Art. 192";
        note = legalNote(
          `Insalubridade calculada sobre o salário mínimo (${fmt(smIns)}): ` +
            `grau mínimo ${fmt(grauMin)} | grau médio ${fmt(grauMed)} | grau máximo ${fmt(grauMax)}. ` +
            `Nota: a base de cálculo (salário mínimo vs salário base) é objeto de controvérsia jurídica ` +
            `(Súmula Vinculante 4/STF). Usamos o salário mínimo conforme entendimento atual do TST.`,
          `${fmt(line.declared_value)} — não corresponde a nenhum grau`,
          `Grau ${nearestLabel}: ${fmt(expectedValue)}`
        );
        forceStatus = "legal_violation";
      } else {
        // Valor correto — snap para o grau exato
        expectedValue = graus[matchIdx];
      }
      break;
    }

    // ── Periculosidade — 30% do salário base (CLT art. 193 §1º) ─────────
    case "periculosidade": {
      expectedValue = round2(declarado.salarioBase * 0.3);
      if (line.declared_value < expectedValue - TOLERANCE) {
        legalCitation = "CLT Art. 193 §1º";
        const pctEfetivo = declarado.salarioBase > 0
          ? Math.round((line.declared_value / declarado.salarioBase) * 100)
          : 0;
        note = legalNote(
          `Periculosidade é fixada em 30% do salário base (sem gratificações ou PLR). ` +
            `Não acumula com insalubridade — empregado escolhe o mais vantajoso (CLT Art. 193 §2º).`,
          `${fmt(line.declared_value)} — equivale a ${pctEfetivo}% do salário base`,
          `${fmt(expectedValue)} = 30% × ${fmt(declarado.salarioBase)}`
        );
        forceStatus = "legal_violation";
      } else if (diverge(line.declared_value, expectedValue)) {
        note = `Periculosidade esperada = 30% × ${fmt(declarado.salarioBase)} = ${fmt(expectedValue)}`;
      }
      break;
    }

    // ── DSR sobre variáveis ───────────────────────────────────────────────
    case "dsr_sobre_variaveis":
    case "dsr": {
      if (line.basis !== null && line.rate !== null && line.rate > 0) {
        // Referência declarada (X/Y): verifica se a conta fecha com as verbas DECLARADAS
        const verbasDecl = declarado.horasExtras50 + declarado.horasExtras100 + comissoes;
        expectedValue = round2((verbasDecl / line.rate) * line.basis);
        if (diverge(line.declared_value, expectedValue)) {
          note = `DSR = (${fmt(verbasDecl)} ÷ ${line.rate} dias úteis) × ${line.basis} dom/feriados = ${fmt(expectedValue)}`;
        }
      } else {
        // Sem referência declarada: calcula pelo calendário com verbas CORRIGIDAS
        const verbasVar = esperado.horasExtras50 + esperado.horasExtras100 + comissoes;
        if (verbasVar > 0) {
          const diasDoMes = calcularDiasDoMes(declarado.competencia, declarado.horasMensais);
          expectedValue = round2((verbasVar / diasDoMes.diasUteis) * diasDoMes.domingosFeriados);
          if (diverge(line.declared_value, expectedValue)) {
            note = `DSR = (${fmt(verbasVar)} ÷ ${diasDoMes.diasUteis} dias úteis) × ${diasDoMes.domingosFeriados} dom/feriados = ${fmt(expectedValue)}`;
          }
        }
      }
      break;
    }

    // ── Vale-transporte — máximo 6% do salário base (Lei 7.418/85) ───────
    case "vale_transporte": {
      const limiteVT = round2(declarado.salarioBase * 0.06);
      if (line.declared_value > limiteVT + TOLERANCE) {
        expectedValue = limiteVT;
        legalCitation = "Lei 7.418/85 Art. 4º";
        const pctEfetivo = declarado.salarioBase > 0
          ? ((line.declared_value / declarado.salarioBase) * 100).toFixed(1)
          : "0";
        note = legalNote(
          "O desconto do vale-transporte está limitado a 6% do salário base do empregado.",
          `${fmt(line.declared_value)} — equivale a ${pctEfetivo}% do salário base`,
          `Máximo legal: ${fmt(limiteVT)} = 6% × ${fmt(declarado.salarioBase)}`
        );
        forceStatus = "legal_violation";
      }
      break;
    }

    // ── Outros descontos — afastamentos, saúde, sindical e faltas ────────
    case "outros_descontos": {
      const desc = line.description;
      const val = line.declared_value;

      // ── Detecção automática de irregularidade por keywords na descrição ──
      const INDEVIDO_RE = /indevid[ao]|duplicad[ao]|cobran[çc]a\s*indevid|erro\s*(de\s*)?desconto|desconto\s*irregular|estorno\s*pend/i;
      if (INDEVIDO_RE.test(desc) && val > TOLERANCE) {
        expectedValue = 0;
        legalCitation = "CLT Art. 462";
        forceStatus = "legal_violation";
        note = `A própria descrição da rubrica indica irregularidade: "${desc}".\nValor descontado indevidamente: ${fmt(val)}.\nO empregador deve estornar esse valor integralmente.\n\nA CLT Art. 462 proíbe descontos não autorizados ou indevidos no salário do trabalhador.`;
        tip = "Solicite ao RH o estorno imediato deste desconto. Guarde este holerite como prova. Se não houver correção, procure o sindicato ou um advogado trabalhista.";
        break;
      }

      if (/paternidade/i.test(desc) && val > TOLERANCE) {
        // ── Licença-paternidade (CLT Art. 473 V) ─────────────────────────
        expectedValue = 0;
        legalCitation = "CLT Art. 473 V";
        note = legalNote(
          "Licença-paternidade (5 dias corridos) é afastamento legal remunerado — o salário desse período NÃO pode ser descontado.",
          fmt(val),
          "R$ 0,00 — nenhum desconto é permitido"
        );
        forceStatus = "legal_violation";

      } else if (/maternidade/i.test(desc) && val > TOLERANCE) {
        // ── Licença-maternidade (CLT Art. 392) ───────────────────────────
        expectedValue = 0;
        legalCitation = "CLT Art. 392";
        note = legalNote(
          "Licença-maternidade (120–180 dias) é paga pela Previdência Social como salário-maternidade — o empregador NÃO pode descontar o salário desse período.",
          fmt(val),
          "R$ 0,00 — nenhum desconto é permitido"
        );
        forceStatus = "legal_violation";

      } else if (/\bnojo\b|\bluto\b|\bgala\b|\bcasamento\b|alistamento|reservista|doa[çc][aã]o.{0,6}sangue|doador.{0,4}sangue|j[uú]r[ií]|servi[çc]o.{0,6}militar/i.test(desc) && val > TOLERANCE) {
        // ── Afastamentos garantidos CLT Art. 473 ─────────────────────────
        expectedValue = 0;
        legalCitation = "CLT Art. 473";
        note = legalNote(
          "CLT Art. 473 garante ausências remuneradas: casamento/gala (3 dias), falecimento de parente próximo/nojo (2 dias), doação de sangue (1 dia), alistamento militar (2 dias), serviço do júri (duração necessária). O empregador NÃO pode descontar o salário nesses casos.",
          fmt(val),
          "R$ 0,00 — nenhum desconto é permitido"
        );
        forceStatus = "legal_violation";

      } else if (
        /contribui[çc][aã]o\s+sindical|imposto\s+sindical|contrib\.?\s*sindical|taxa\s+sindical|mensalidade\s+sindical/i.test(desc) &&
        !/taxa\s+assistencial|confederativa/i.test(desc)
      ) {
        // ── Contribuição sindical — exige autorização expressa (Regra 3) ─
        forceStatus = "manual_check";
        legalCitation = "Lei 13.467/2017 Art. 578-579";
        note = `Seu holerite mostra desconto de Contribuição Sindical de ${fmt(val)}. Desde novembro de 2017 (Reforma Trabalhista — Lei 13.467/2017, Art. 578-579), esse desconto só é válido com sua autorização prévia e EXPRESSA por escrito.`;
        scenarios = [
          {
            label: "Você NÃO autorizou por escrito: desconto é indevido — solicite a devolução ao sindicato ou empregador",
            expected: 0,
            matches: Math.abs(val) <= TOLERANCE,
            difference: round2(val),
          },
          {
            label: "Você autorizou expressamente por escrito: desconto é válido",
            expected: val,
            matches: true,
            difference: 0,
          },
        ];
        tip = "Verifique se há autorização assinada por você no contrato ou em documento separado. Sem autorização escrita, você tem direito à devolução.";

      } else if (/licen[çc]a.{0,4}sa[uú]de|afastamento|atestado|licen[çc]a.{0,4}m[eé]dica|aux[\s-]?doen[çc]a|falta.{0,4}m[eé]dica/i.test(desc)) {
        // ── Afastamento por saúde / doença ───────────────────────────────
        const diasMatch = desc.match(/(\d+)\s*dias?/i);
        const dias = line.basis !== null
          ? Math.round(line.basis)
          : diasMatch ? parseInt(diasMatch[1], 10) : null;
        const diasStr = dias !== null ? `${dias} dia${dias !== 1 ? "s" : ""}` : "período";

        if (dias !== null && dias > 15) {
          expectedValue = 0;
          legalCitation = "Lei 8.213/91 Art. 60 §3º";
          note = legalNote(
            "Os primeiros 15 dias de afastamento são pagos pelo empregador; a partir do 16º dia o INSS paga o auxílio-doença (benefício 31) e o empregador NÃO pode descontar o salário.",
            `Desconto de ${fmt(val)} por ${diasStr} — acima do limite de 15 dias`,
            "Nenhum desconto após o 15º dia; exija o afastamento pelo INSS"
          );
          forceStatus = "legal_violation";
        } else {
          forceStatus = "manual_check";
          note = `Seu empregador descontou ${diasStr} de salário (${fmt(val)}) por motivo de saúde. O que se aplica ao seu caso:`;
          scenarios = [
            {
              label: "Com atestado médico entregue ao RH — desconto é irregular (Lei 8.213/91, Art. 60 §3º)",
              expected: 0,
              matches: Math.abs(val) <= TOLERANCE,
              difference: round2(val),
            },
            {
              label: "Falta sem justificativa médica — desconto pode ser válido",
              expected: val,
              matches: true,
              difference: 0,
            },
          ];
          tip = "Verifique se você entregou atestado médico ao RH para este período. Se entregou, você tem direito à devolução.";
        }

      } else if (/\bfaltas?\b|\baus[eê]ncia|\bdias?\s+n[aã]o\s+trabalhad|desconto\s+d[ae]\s+falt/i.test(desc)) {
        // ── Desconto de faltas — proporcionalidade (Regra 4) ─────────────
        const diasMatch2 = desc.match(/(\d+(?:[,\.]\d+)?)\s*dias?/i);
        const diasDecl = line.basis !== null
          ? line.basis
          : diasMatch2 ? parseFloat(diasMatch2[1].replace(",", ".")) : null;

        const valorDiario = round2(declarado.salarioBase / 30);
        const expectedProp = diasDecl !== null ? round2(valorDiario * diasDecl) : null;
        const diasStr2 = diasDecl !== null ? `${diasDecl} dia(s)` : "alguns dias";
        const propStr = expectedProp !== null ? fmt(expectedProp) : "(salário ÷ 30 × dias)";

        if (expectedProp !== null && val > expectedProp + TOLERANCE) {
          forceStatus = "error";
          expectedValue = expectedProp;
          note = legalNote(
            `Desconto por falta injustificada é proporcional: salário ÷ 30 × dias. Para ${diasStr2}: ${fmt(valorDiario)} × ${diasDecl} = ${propStr}.`,
            `${fmt(val)} descontado — acima do proporcional`,
            propStr
          );
        } else {
          forceStatus = "manual_check";
          note = `Seu empregador descontou ${diasStr2} de salário (${fmt(val)}).`;
          scenarios = [
            {
              label: "Falta JUSTIFICADA (atestado médico, declaração de comparecimento, ou motivo previsto no Art. 473 CLT): desconto é irregular — valor correto é R$ 0,00",
              expected: 0,
              matches: Math.abs(val) <= TOLERANCE,
              difference: round2(val),
            },
            {
              label: `Falta INJUSTIFICADA: desconto proporcional correto = ${propStr}`,
              expected: expectedProp ?? val,
              matches: expectedProp !== null ? Math.abs(val - expectedProp) <= TOLERANCE : true,
              difference: expectedProp !== null ? round2(val - expectedProp) : 0,
            },
          ];
          tip = "Guarde sempre seus atestados e comprovantes de ausência justificada. A falta justificada não pode ser descontada.";
        }

      } else if (/desconto\s*(de\s*)?(material|equipamento|uniforme|ferramenta|epi|farda)|\b(quebra|avaria|reposi[çc][aã]o)\b|desc\.?\s*(uniforme|farda|epi)|dano\s*(ao?\s*)?(equipamento|material)/i.test(desc)) {
        // ── Desconto de equipamento/material — CLT Art. 462 (Regra 7) ────
        forceStatus = "manual_check";
        legalCitation = "CLT Art. 462";
        note = `Seu empregador descontou ${fmt(val)} referente a: "${desc}".`;
        scenarios = [
          {
            label: "Sem previsão expressa no contrato de trabalho: desconto é irregular (CLT Art. 462)",
            expected: 0,
            matches: Math.abs(val) <= TOLERANCE,
            difference: round2(val),
          },
          {
            label: "Contrato prevê o desconto E o dano foi doloso (intencional): pode ser válido",
            expected: val,
            matches: true,
            difference: 0,
          },
          {
            label: "Contrato prevê o desconto mas o dano foi CULPOSO (acidental): há discussão jurídica — consulte advogado",
            expected: val,
            matches: true,
            difference: 0,
          },
        ];
        tip = "Verifique a cláusula de descontos no seu contrato de trabalho. Sem previsão contratual, o desconto por dano acidental é vedado pela CLT.";

      } else if (/\batraso|\bdesc\.?\s*atraso|desconto\s*(de\s*)?atraso|atraso\s*ponto/i.test(desc)) {
        // ── Desconto por atraso — tolerância CLT Art. 58 §1º (Regra 8) ──
        forceStatus = "manual_check";
        legalCitation = "CLT Art. 58 §1º";
        note = `Seu holerite mostra desconto por atraso de ${fmt(val)}.`;
        scenarios = [
          {
            label: "Atrasos de até 5 min por marcação / 10 min por dia: desconto é IRREGULAR — tolerância legal (CLT Art. 58 §1º)",
            expected: 0,
            matches: Math.abs(val) <= TOLERANCE,
            difference: round2(val),
          },
          {
            label: "Atrasos que excederam a tolerância de 10 min/dia: desconto pode ser válido proporcionalmente",
            expected: val,
            matches: true,
            difference: 0,
          },
        ];
        tip = "Confira seu espelho de ponto para verificar os minutos exatos de cada atraso. Se todos ficaram dentro da tolerância de 10 min/dia, você pode contestar o desconto.";

      } else if (/pens[aã]o\s*(aliment[íi]cia|judicial)?/i.test(desc)) {
        // ── Regra 18: Pensão alimentícia — verificação de base ───────────────
        forceStatus = "manual_check";
        legalCitation = "CPC Art. 833 IV · CLT Art. 48";
        const baseInss = round2(declarado.salarioBruto - declarado.descontoINSS);
        const pctMatch = desc.match(/(\d{1,3}(?:[,\.]\d{1,2})?)\s*%/);
        const pctDecl = pctMatch ? parseFloat(pctMatch[1].replace(",", ".")) / 100 : null;
        const expectedLiquido = pctDecl !== null ? round2(baseInss * pctDecl) : null;
        const expectedBruto   = pctDecl !== null ? round2(declarado.salarioBruto * pctDecl) : null;
        note = `Seu holerite mostra pensão alimentícia de ${fmt(val)}.`;
        scenarios = [
          ...(expectedLiquido !== null ? [{
            label: `Se a decisão judicial define ${(pctDecl! * 100).toFixed(0)}% do salário líquido (bruto − INSS): ${fmt(expectedLiquido)}`,
            expected: expectedLiquido,
            matches: Math.abs(val - expectedLiquido) <= TOLERANCE,
            difference: round2(val - expectedLiquido),
          }] : []),
          ...(expectedBruto !== null ? [{
            label: `Se a decisão define ${(pctDecl! * 100).toFixed(0)}% dos rendimentos brutos: ${fmt(expectedBruto)}`,
            expected: expectedBruto,
            matches: Math.abs(val - expectedBruto) <= TOLERANCE,
            difference: round2(val - expectedBruto),
          }] : []),
          {
            label: "Se a decisão judicial define valor fixo: confira se o valor foi atualizado conforme indexador",
            expected: val,
            matches: true,
            difference: 0,
          },
        ];
        tip = "Consulte a decisão judicial que fixou a pensão para confirmar a base de cálculo correta. A pensão é dedutível da base de IRRF — verifique se o desconto já foi considerado no cálculo do imposto.";
      }
      break;
    }

    // ── Férias — base inclui média de variáveis (CLT Art. 142) ──────────
    case "ferias": {
      forceStatus = "manual_check";
      legalCitation = "CLT Art. 142 + CF Art. 7º XVII";
      note = `O valor declarado das suas férias é ${fmt(line.declared_value)}. Se você recebeu horas extras, comissões ou adicionais nos últimos 12 meses, a média dessas verbas deve ser incluída na base das férias (CLT Art. 142 §§3-5). Confira com seu RH se a média foi considerada.`;
      const dobroFerias = round2(line.declared_value * 2);
      scenarios = [
        {
          label: "Você NÃO recebeu verbas variáveis nos últimos 12 meses: valor pode estar correto",
          expected: line.declared_value,
          matches: true,
          difference: 0,
        },
        {
          label: "Você recebeu HE, comissões ou adicionais: a média desses valores deveria entrar na base — confira com o RH",
          expected: line.declared_value,
          matches: true,
          difference: 0,
        },
        {
          label: `Férias concedidas em atraso (após 12 meses do fim do período aquisitivo): valor correto em dobro seria ${fmt(dobroFerias)} (CLT Art. 137)`,
          expected: dobroFerias,
          matches: Math.abs(line.declared_value - dobroFerias) <= TOLERANCE,
          difference: round2(line.declared_value - dobroFerias),
        },
      ];
      tip = "Verifique as datas do aviso de férias e compare com o término do período aquisitivo (12 meses trabalhados). Confira também sua média de variáveis nos últimos 12 contracheques.";
      break;
    }

    // ── 1/3 constitucional de férias (CF Art. 7º XVII — obrigatório) ─────
    case "adicional_ferias":
      legalCitation = "CF Art. 7º XVII + CLT Art. 148";
      if (line.basis) {
        expectedValue = round2(line.basis / 3);
        if (diverge(line.declared_value, expectedValue)) {
          note = legalNote(
            "O terço constitucional (1/3) sobre o valor das férias é obrigatório (CF Art. 7º XVII). Calculado sobre o valor bruto das férias.",
            fmt(line.declared_value),
            `${fmt(expectedValue)} = ${fmt(line.basis)} ÷ 3`
          );
          forceStatus = "error";
        }
      } else {
        // Sem basis: não temos o valor de férias para calcular — verificação condicional
        forceStatus = "manual_check";
        note = `Terço constitucional de férias declarado: ${fmt(line.declared_value)}. Para verificar, o valor correto é 1/3 do valor bruto das suas férias.`;
        tip = "Divida o valor das suas férias por 3. O resultado deve ser igual ao terço constitucional.";
      }
      break;

    // ── 13º salário — regras especiais de INSS/IRRF ──────────────────────
    case "decimo_terceiro": {
      const is1a = /1[aª°].{0,10}parcela|adiantamento|primeira.{0,8}parcela/i.test(line.description);
      const is2a = /2[aª°].{0,10}parcela|segunda.{0,8}parcela|complemento|saldo/i.test(line.description);
      forceStatus = "manual_check";
      if (is1a) {
        note = "13º salário — 1ª parcela: não incide INSS nem IRRF. Incide FGTS (8%) sobre o valor pago.";
        scenarios = [
          { label: "Valor = 50% do salário base + médias de variáveis", expected: line.declared_value, matches: true, difference: 0 },
        ];
        tip = "Verifique se o valor equivale a metade do seu salário mensal (+ médias de horas extras, se houver).";
      } else if (is2a) {
        note = "13º salário — 2ª parcela: INSS e IRRF incidem sobre o total do 13º (1ª + 2ª parcela), não sobre o dobro. Os descontos devem aparecer como linhas separadas no holerite.";
        scenarios = [
          { label: "2ª parcela = 13º total − INSS 13º − IRRF 13º − 1ª parcela já paga", expected: line.declared_value, matches: true, difference: 0 },
        ];
        tip = "Verifique se há linhas de INSS s/ 13º e IRRF s/ 13º separadas neste holerite.";
      } else {
        note = "13º salário: a 1ª parcela (até novembro) não tem INSS/IRRF; a 2ª parcela (dezembro) tem INSS/IRRF calculados sobre o valor total do 13º.";
        scenarios = [
          { label: "1ª parcela — sem INSS/IRRF nesta linha", expected: line.declared_value, matches: true, difference: 0 },
          { label: "2ª parcela — INSS/IRRF devem aparecer separados", expected: line.declared_value, matches: true, difference: 0 },
        ];
        tip = "Identifique se é a 1ª ou 2ª parcela na descrição e verifique os descontos correspondentes.";
      }
      break;
    }

    // ── Outros créditos — detecta PLR/PPR, salário-família, abono férias e intervalo ─
    case "outros_creditos": {
      const PLR_RE = /\bplr\b|\bppr\b|participa[çc][aã]o.{0,10}(lucros|resultados)/i;
      const SAL_FAM_RE = /sal[aá]rio[\s-]*fam[ií]lia|sal\.?\s*fam\.?/i;
      const ABONO_FER_RE = /abono\s*(pec[uú]ni[aá]rio|de\s*f[eé]rias)|venda\s*de\s*f[eé]rias|convers[aã]o\s*de\s*f[eé]rias/i;
      const INTERVALO_RE = /intervalo|intrajornada|supressão\s*intervalo|intervalo\s*(n[aã]o\s*concedido|suprimido|reduzido)/i;

      if (PLR_RE.test(line.description)) {
        forceStatus = "manual_check";
        note = "PLR/PPR — Participação nos Lucros ou Resultados: não incide INSS nem FGTS (Lei 10.101/2000 Art. 3º). O IRRF é calculado pela tabela exclusiva de PLR, na fonte, de forma separada.";
        scenarios = [
          { label: "Sem INSS e sem FGTS sobre este valor (regra correta)", expected: line.declared_value, matches: true, difference: 0 },
        ];
        tip = "Verifique se há uma linha de IRRF com código de PLR separada no holerite.";

      } else if (SAL_FAM_RE.test(line.description)) {
        // Regra 5: salário-família deve ser múltiplo de R$ 62,04
        const VALOR_UNIT = 62.04;
        const nFilhos = Math.round(line.declared_value / VALOR_UNIT);
        const expectedMult = nFilhos > 0 ? round2(VALOR_UNIT * nFilhos) : VALOR_UNIT;
        if (nFilhos === 0 || diverge(line.declared_value, expectedMult)) {
          expectedValue = nFilhos > 0 ? expectedMult : VALOR_UNIT;
          note = `Salário-família deve ser R$ 62,04 por filho menor de 14 anos (Lei 4.749/65 + Portaria MPS). ` +
            `Valor declarado ${fmt(line.declared_value)} não corresponde a um número inteiro de filhos ` +
            `(múltiplos: ${fmt(VALOR_UNIT)}, ${fmt(round2(VALOR_UNIT * 2))}, ${fmt(round2(VALOR_UNIT * 3))}…).`;
        }

      } else if (ABONO_FER_RE.test(line.description)) {
        // Regra 9 — Abono pecuniário: ISENTO de INSS e IRRF (CLT Art. 144)
        // 10 dias = salário ÷ 3; + 1/3 constitucional sobre o abono
        forceStatus = "manual_check";
        legalCitation = "CLT Art. 143-144";
        const expectedAbono = round2(declarado.salarioBase / 3);
        const expectedAbonoComTerco = round2(expectedAbono * (4 / 3));
        note = `Abono pecuniário (venda de 10 dias de férias): é ISENTO de INSS e IRRF (CLT Art. 144). O valor correto do abono é (salário ÷ 30) × 10 = ${fmt(expectedAbono)}, mais 1/3 constitucional sobre o abono.`;
        scenarios = [
          {
            label: `Só o abono (sem 1/3): ${fmt(expectedAbono)} = salário ${fmt(declarado.salarioBase)} ÷ 3`,
            expected: expectedAbono,
            matches: Math.abs(line.declared_value - expectedAbono) <= TOLERANCE,
            difference: round2(line.declared_value - expectedAbono),
          },
          {
            label: `Abono + 1/3 constitucional incluso: ${fmt(expectedAbonoComTerco)} = ${fmt(expectedAbono)} × 4/3`,
            expected: expectedAbonoComTerco,
            matches: Math.abs(line.declared_value - expectedAbonoComTerco) <= TOLERANCE,
            difference: round2(line.declared_value - expectedAbonoComTerco),
          },
        ];
        tip = "Verifique se há desconto de INSS ou IRRF sobre o abono pecuniário neste holerite — esses descontos são ilegais (CLT Art. 144). O 1/3 constitucional deve incidir também sobre o abono.";

      } else if (INTERVALO_RE.test(line.description)) {
        // Regra 10 — Intervalo intrajornada suprimido (CLT Art. 71 §4º)
        legalCitation = "CLT Art. 71 §4º";
        if (line.basis !== null) {
          const expectedIntervalo = round2(valorHoraBase * 1.5 * line.basis);
          if (line.declared_value < expectedIntervalo - TOLERANCE) {
            forceStatus = "error";
            expectedValue = expectedIntervalo;
            note = legalNote(
              "Intervalo intrajornada suprimido ou reduzido: o período não concedido deve ser pago com acréscimo de 50% sobre o valor da hora normal (CLT Art. 71 §4º). Natureza indenizatória desde a Reforma Trabalhista de 2017.",
              fmt(line.declared_value),
              `${fmt(expectedIntervalo)} = ${line.basis}h × ${fmt(valorHoraBase)} × 1,5`
            );
          }
        } else {
          forceStatus = "manual_check";
          note = "Seu holerite mostra pagamento referente ao intervalo intrajornada. Se sua jornada é superior a 6 horas e o intervalo para refeição é inferior a 1 hora sem acordo coletivo autorizando, você tem direito ao pagamento do período suprimido com acréscimo de 50%.";
          scenarios = [0.5, 0.75, 1.0].map((h) => {
            const exp = round2(valorHoraBase * h * 1.5);
            return {
              label: `${h}h de intervalo suprimido × 150%: ${fmt(exp)}`,
              expected: exp,
              matches: Math.abs(line.declared_value - exp) <= TOLERANCE,
              difference: round2(line.declared_value - exp),
            };
          });
          tip = "Confira no espelho de ponto a duração real do seu intervalo. Jornadas acima de 6h exigem intervalo mínimo de 1h (ou mínimo de 30min por norma coletiva).";
        }

      // ── Regra 14: Adicional de transferência — CLT Art. 469 §3º ─────────
      } else if (/adicional[\s-]*(de\s*)?transfer[eê]ncia|adic\.?\s*transfer[eê]ncia|transf\.?\s*proviso?ria/i.test(line.description)) {
        legalCitation = "CLT Art. 469 §3º";
        const expectedAdic = round2(declarado.salarioBase * 0.25);
        if (line.declared_value < expectedAdic - TOLERANCE) {
          expectedValue = expectedAdic;
          note = legalNote(
            "Transferência provisória gera direito ao adicional de 25% sobre o salário enquanto durar a transferência (CLT Art. 469 §3º). Se a transferência é definitiva, o adicional não se aplica.",
            fmt(line.declared_value),
            `${fmt(expectedAdic)} = 25% × ${fmt(declarado.salarioBase)}`
          );
          forceStatus = "legal_violation";
        } else {
          expectedValue = expectedAdic;
        }

      // ── Regra 16: Sobreaviso / Prontidão — CLT Art. 244 + Súmula 428 TST ─
      } else if (/sobreaviso|sobre[\s-]aviso|stand[\s-]?by|\bplant[aã]o\b|prontid[aã]o/i.test(line.description)) {
        const valorHoraSobre = declarado.salarioBase / declarado.horasMensais;
        const isProntidao = /prontid[aã]o/i.test(line.description);
        const fator = isProntidao ? (2 / 3) : (1 / 3);
        legalCitation = isProntidao ? "CLT Art. 244 §3º" : "CLT Art. 244 §2º · Súmula 428 TST";
        if (line.basis !== null) {
          expectedValue = round2(valorHoraSobre * fator * line.basis);
          if (line.declared_value < expectedValue - TOLERANCE) {
            note = legalNote(
              isProntidao
                ? "Prontidão (empregado aguardando chamado): remuneração de 2/3 da hora normal (CLT Art. 244 §3º)."
                : "Sobreaviso (empregado em casa aguardando chamado): remuneração de 1/3 da hora normal (CLT Art. 244 §2º, Súmula 428 TST).",
              `${fmt(line.declared_value)} (${line.basis}h)`,
              `${fmt(expectedValue)} = ${line.basis}h × ${fmt(valorHoraSobre)} × ${isProntidao ? "2/3" : "1/3"}`
            );
            forceStatus = "legal_violation";
          }
        } else {
          forceStatus = "manual_check";
          const horasSobre = [10, 20, 40, 60, 80];
          const valorHoraFormatado = fmt(round2(valorHoraSobre));
          const valorSobreFormatado = fmt(round2(valorHoraSobre * fator));
          note = isProntidao
            ? `Prontidão detectada (CLT Art. 244 §3º). Remuneração = 2/3 da hora normal. Valor hora normal: ${valorHoraFormatado} · Prontidão (2/3): ${valorSobreFormatado}.`
            : `Sobreaviso detectado (CLT Art. 244 §2º). Remuneração = 1/3 da hora normal. Valor hora normal: ${valorHoraFormatado} · Sobreaviso (1/3): ${valorSobreFormatado}.`;
          scenarios = horasSobre.map((h) => {
            const exp = round2(valorHoraSobre * fator * h);
            return { label: `${h}h`, expected: exp, matches: Math.abs(line.declared_value - exp) <= TOLERANCE, difference: round2(line.declared_value - exp), hideComparison: true };
          });
          tip = `Confira no controle de ponto as horas de ${isProntidao ? "prontidão" : "sobreaviso"} registradas.`;
        }
      }
      break;
    }
  }

  const difference = round2(line.declared_value - expectedValue);
  const status: LineStatus = forceStatus ?? resolveStatus(line.type, difference, line.kind);

  return {
    description: line.description,
    type: line.type,
    kind: line.kind,
    declared_value: line.declared_value,
    expected_value: expectedValue,
    difference,
    status,
    note,
    legal_citation: legalCitation,
    scenarios,
    tip,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Conta os dias úteis reais e os dias de DSR (domingos + feriados nacionais)
 * do mês de competência, conforme a jornada semanal contratual.
 *
 * - 44h/sem (>= 220h/mês): dias úteis = seg–sáb; DSR = dom + feriados
 * - 40h/sem ou 36h/sem (< 220h/mês): dias úteis = seg–sex; sáb = folga contratual (NÃO é DSR)
 * - DSR = domingos + feriados nacionais — sábado NUNCA é DSR independente da jornada
 *
 * Feriados estaduais/municipais NÃO são considerados (sem dado de localidade).
 */
function calcularDiasDoMes(
  competencia: string,
  horasMensais: number
): { diasUteis: number; domingosFeriados: number } {
  const FALLBACK_44H = { diasUteis: 26, domingosFeriados: 4 };
  const FALLBACK_40H = { diasUteis: 22, domingosFeriados: 4 };

  const parts = competencia?.split("/");
  if (!parts || parts.length !== 2) return horasMensais >= 220 ? FALLBACK_44H : FALLBACK_40H;

  const mes = parseInt(parts[0], 10);
  const ano = parseInt(parts[1], 10);
  if (isNaN(mes) || isNaN(ano) || mes < 1 || mes > 12 || ano < 2000 || ano > 2100) {
    return horasMensais >= 220 ? FALLBACK_44H : FALLBACK_40H;
  }

  const feriados = feriadosNacionais(ano);
  // Total de dias no mês (dia 0 do mês seguinte = último dia do mês atual)
  const diasNoMes = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const jornada44h = horasMensais >= 220;

  let diasUteis = 0;
  let domingosFeriados = 0;

  for (let dia = 1; dia <= diasNoMes; dia++) {
    const dow = new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay(); // 0=dom, 6=sáb
    const isoDate = `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
    const isFeriado = feriados.has(isoDate);
    const isDomingo = dow === 0;
    const isSabado = dow === 6;

    if (isDomingo || isFeriado) {
      // DSR: domingos e feriados nacionais (qualquer dia da semana)
      domingosFeriados++;
    } else if (isSabado) {
      if (jornada44h) {
        diasUteis++; // sábado é dia útil para 44h/sem
      }
      // Para 40h/36h: sábado = folga contratual, NÃO conta como DSR nem como dia útil
    } else {
      diasUteis++; // seg–sex: dia útil (feriados já tratados acima)
    }
  }

  return { diasUteis, domingosFeriados };
}

/** Retorna um Set com as datas dos feriados nacionais do ano no formato "AAAA-MM-DD". */
function feriadosNacionais(ano: number): Set<string> {
  const f = new Set<string>([
    `${ano}-01-01`, // Confraternização Universal
    `${ano}-04-21`, // Tiradentes
    `${ano}-05-01`, // Dia do Trabalho
    `${ano}-09-07`, // Independência do Brasil
    `${ano}-10-12`, // Nossa Senhora Aparecida
    `${ano}-11-02`, // Finados
    `${ano}-11-15`, // Proclamação da República
    `${ano}-11-20`, // Consciência Negra (Lei 14.759/2023)
    `${ano}-12-25`, // Natal
  ]);

  // Feriados baseados na Páscoa
  const pascoa = calcularPascoa(ano);
  // Sexta-feira Santa: Páscoa − 2 dias
  f.add(isoDate(new Date(Date.UTC(pascoa.getUTCFullYear(), pascoa.getUTCMonth(), pascoa.getUTCDate() - 2))));
  // Corpus Christi: Páscoa + 60 dias (feriado nacional desde a CF/88)
  f.add(isoDate(new Date(Date.UTC(pascoa.getUTCFullYear(), pascoa.getUTCMonth(), pascoa.getUTCDate() + 60))));

  return f;
}

/** Algoritmo de Gauss para calcular a data da Páscoa de um ano. */
function calcularPascoa(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(ano, month - 1, day));
}

function isoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function encontrarGrauInsalubridade(
  valorDeclarado: number,
  graus: { minimo: number; medio: number; maximo: number }
): number {
  const opcoes = [graus.minimo, graus.medio, graus.maximo];
  if (valorDeclarado === 0) return 0;
  return opcoes.reduce((prev, curr) =>
    Math.abs(curr - valorDeclarado) < Math.abs(prev - valorDeclarado) ? curr : prev
  );
}

function buildSyntheticLine(
  description: string,
  type: import("@/lib/types").HoleriteLineType,
  kind: "credit" | "deduction" | "info",
  declared_value: number,
  expected_value: number,
  note: string,
  legal_citation?: string
): AuditLine {
  const difference = round2(declared_value - expected_value);
  const status: LineStatus = legal_citation
    ? "legal_violation"
    : resolveStatus(type, difference, kind);
  return {
    description,
    type,
    kind,
    declared_value,
    expected_value,
    difference,
    status,
    note,
    legal_citation: legal_citation ?? null,
    scenarios: null,
    tip: null,
  };
}

function resolveStatus(
  type: string,
  difference: number,
  kind: "credit" | "deduction" | "info"
): LineStatus {
  if (type === "fgts") return Math.abs(difference) <= TOLERANCE ? "ok" : "warning";
  if (kind === "info") return "info";
  if (Math.abs(difference) <= TOLERANCE) return "ok";

  // Prejudica o trabalhador: desconto cobrado a mais | crédito pago a menos
  const prejudicaWorker =
    (kind === "deduction" && difference > TOLERANCE) ||
    (kind === "credit" && difference < -TOLERANCE);
  return prejudicaWorker ? "error" : "warning";
}

/**
 * Formata uma nota de violação legal com três seções estruturadas.
 * Separadas por \n para renderização com whitespace-pre-wrap na UI.
 */
function legalNote(law: string, shown: string, correct: string): string {
  return `O que diz a lei: ${law}\nO que seu holerite mostra: ${shown}.\nO correto seria: ${correct}.`;
}

function diverge(a: number, b: number): boolean {
  return Math.abs(a - b) > TOLERANCE;
}

function fmt(n: number) {
  return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

// ── Perguntas condicionais ────────────────────────────────────────────────────

export interface MissingInfoQuestion {
  id: "dependentes" | "jornada" | "tipo_holerite" | "insalubridade_grau" | "tipo_rescisao" | "anos_servico" | "modalidade_aviso" | "ferias_vencidas";
  question: string;
  options: Array<{ label: string; value: string | number | null }>;
  defaultValue: string | number | null;
  impact: "high" | "medium" | "low";
  noteIfSkipped: string;
}

/**
 * Inspeciona o ParsedHolerite e retorna apenas as perguntas estritamente necessárias.
 * Retorna [] na maioria dos casos → resultado direto sem perguntas.
 */
// auditResult kept for API compatibility but unused — questions no longer depend on preliminary result
export function getMissingInfo(
  parsed: ParsedHolerite,
  _auditResult?: AuditResult
): MissingInfoQuestion[] {
  const questions: MissingInfoQuestion[] = [];

  const tipo = detectarTipoHolerite(parsed);

  // 0. Dependentes IRRF: pergunta quando a IA não extraiu e o holerite tem/deveria ter IRRF
  const tiposComIRRF: TipoHolerite[] = ["folha_mensal", "decimo_terceiro_2", "ferias"];
  const temLinhaIRRF = parsed.lines.some((l) => l.type === "irrf" && l.declared_value > 0);
  if (
    (parsed.dependents === null || parsed.dependents === undefined) &&
    (temLinhaIRRF || tiposComIRRF.includes(tipo))
  ) {
    questions.push({
      id: "dependentes",
      question: "Quantos dependentes você declarou no IRRF?",
      options: [
        { label: "Nenhum", value: 0 },
        { label: "1 dependente", value: 1 },
        { label: "2 dependentes", value: 2 },
        { label: "3 dependentes", value: 3 },
        { label: "4 ou mais", value: 4 },
        { label: "Não sei", value: null },
      ],
      defaultValue: 0,
      impact: "high",
      noteIfSkipped: "IRRF calculado sem dependentes. Se você tem dependentes declarados, o imposto pode estar maior do que deveria.",
    });
  }

  // 0b. Jornada: pergunta quando a IA não extraiu, é folha mensal e tem hora extra
  const temHoraExtra = parsed.lines.some(
    (l) => l.type === "hora_extra_50" || l.type === "hora_extra_100"
  );
  if (
    (parsed.horas_mensais_contrato === null || parsed.horas_mensais_contrato === undefined) &&
    tipo === "folha_mensal" &&
    temHoraExtra
  ) {
    questions.push({
      id: "jornada",
      question: "Qual é a sua jornada contratual?",
      options: [
        { label: "44h/sem · 220h/mês", value: 220 },
        { label: "40h/sem · 200h/mês", value: 200 },
        { label: "36h/sem · 180h/mês", value: 180 },
        { label: "Não sei", value: null },
      ],
      defaultValue: 220,
      impact: "medium",
      noteIfSkipped: "Jornada assumida como 220h/mês. Se sua jornada for diferente, os cálculos de hora extra podem variar.",
    });
  }

  // 1. Tipo de holerite: pergunta se a detecção automática não teve certeza
  if (tipo === "desconhecido") {
    questions.push({
      id: "tipo_holerite",
      question: "Esse holerite é de:",
      options: [
        { label: "Salário mensal", value: "folha_mensal" },
        { label: "Férias", value: "ferias" },
        { label: "13º salário", value: "decimo_terceiro_1" },
        { label: "PLR / PPR", value: "plr" },
        { label: "Rescisão", value: "rescisao" },
        { label: "Não sei", value: null },
      ],
      defaultValue: null,
      impact: "medium",
      noteIfSkipped: "Tipo de holerite não confirmado — algumas verificações podem não se aplicar",
    });
  }

  // Rescisão: 4 perguntas críticas — sempre mostrar todas as que faltam
  if (tipo === "rescisao") {
    // Pergunta 1 — Tipo de rescisão (sempre, mesmo que já exista — pode ser re-análise)
    questions.push({
      id: "tipo_rescisao",
      question: "Como foi sua saída?",
      options: [
        { label: "Demissão sem justa causa (empresa demitiu)", value: "sem_justa_causa" },
        { label: "Pedido de demissão (você pediu)", value: "pedido_demissao" },
        { label: "Acordo mútuo (CLT 484-A)", value: "acordo_mutuo" },
        { label: "Justa causa", value: "justa_causa" },
        { label: "Não sei", value: null },
      ],
      defaultValue: null,
      impact: "high",
      noteIfSkipped: "Sem essa informação não dá pra saber se aviso prévio, multa FGTS e seguro-desemprego são devidos. Cálculos serão marcados como 'verificar'.",
    });

    // Pergunta 2 — Anos de serviço (sempre, a menos que data_admissao esteja disponível)
    if (!parsed.data_admissao) {
      questions.push({
        id: "anos_servico",
        question: "Quantos anos completos você trabalhou nessa empresa?",
        options: [
          { label: "Menos de 1 ano", value: 0 },
          { label: "1 ano", value: 1 },
          { label: "2 anos", value: 2 },
          { label: "3 anos", value: 3 },
          { label: "4 anos", value: 4 },
          { label: "5 anos", value: 5 },
          { label: "6 a 9 anos", value: 7 },
          { label: "10 anos ou mais", value: 10 },
          { label: "Não sei", value: null },
        ],
        defaultValue: null,
        impact: "high",
        noteIfSkipped: "Sem o tempo de serviço o aviso prévio é assumido em 30 dias (mínimo legal). Se você trabalhou mais, o valor devido é maior.",
      });
    }

    // Pergunta 3 — Modalidade do aviso (não se aplica a justa causa ou pedido de demissão)
    const tipoR = parsed.tipo_rescisao;
    if (tipoR !== "justa_causa" && tipoR !== "pedido_demissao") {
      questions.push({
        id: "modalidade_aviso",
        question: "Como foi o aviso prévio?",
        options: [
          { label: "Trabalhei o aviso (continuei indo até a data final)", value: "trabalhado" },
          { label: "Recebi o aviso indenizado (parei de ir, recebi o valor)", value: "indenizado" },
          { label: "Não recebi aviso", value: "nenhum" },
          { label: "Não sei", value: null },
        ],
        defaultValue: null,
        impact: "high",
        noteIfSkipped: "Sem essa informação a tributação do aviso (INSS/IRRF) pode ficar imprecisa. Aviso indenizado é isento; trabalhado tem tributação normal.",
      });
    }

    // Pergunta 4 — Férias vencidas
    questions.push({
      id: "ferias_vencidas",
      question: "Você tinha férias vencidas (de período aquisitivo de mais de 1 ano que você ainda não tinha tirado)?",
      options: [
        { label: "Não, nenhuma vencida", value: 0 },
        { label: "Sim, 1 período", value: 1 },
        { label: "Sim, 2 ou mais períodos", value: 2 },
        { label: "Não sei", value: null },
      ],
      defaultValue: null,
      impact: "medium",
      noteIfSkipped: "Férias vencidas, se existirem, são devidas a parte (e em dobro se o período concessivo expirou).",
    });

    // Retorna todas as perguntas de rescisão sem limite
    return questions.sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.impact] - { high: 0, medium: 1, low: 2 }[b.impact]));
  }

  // 2. Grau de insalubridade: só pergunta se o valor não corresponde a nenhum dos 3 graus
  const insalLine = parsed.lines.find((l) => l.type === "insalubridade");
  if (insalLine) {
    const val = insalLine.declared_value;
    const smMissing = getSalarioMinimo(parsed.competencia ?? "01/2026");
    const matches10 = Math.abs(val - smMissing * 0.10) <= TOLERANCE;
    const matches20 = Math.abs(val - smMissing * 0.20) <= TOLERANCE;
    const matches40 = Math.abs(val - smMissing * 0.40) <= TOLERANCE;
    const grauNaDesc = /\b(m[íi]nimo|m[eé]dio|m[áa]ximo|grau\s*(i{1,3}|\d))\b/i.test(insalLine.description);
    if (!matches10 && !matches20 && !matches40 && !grauNaDesc) {
      questions.push({
        id: "insalubridade_grau",
        question: "Qual o grau de insalubridade?",
        options: [
          { label: "Mínimo (10%)", value: "minimo" },
          { label: "Médio (20%)", value: "medio" },
          { label: "Máximo (40%)", value: "maximo" },
          { label: "Não sei", value: null },
        ],
        defaultValue: null,
        impact: "low",
        noteIfSkipped: "Insalubridade verificada pelos 3 cenários possíveis",
      });
    }
  }

  // Ordena por impacto e limita a 3
  const sortOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  return questions
    .sort((a, b) => sortOrder[a.impact] - sortOrder[b.impact])
    .slice(0, 3);
}
