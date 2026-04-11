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
} from "@/lib/types";
import type { Holerite, HoleriteDeclarado, HoleriteEsperado } from "@/types/holerite";
import { calcularINSS } from "./inss";
import { calcularIRRF } from "./irrf";
import { calcularFGTS } from "./fgts";

// ── Constantes ──────────────────────────────────────────────────────────────

/** Tolerância de arredondamento bancário (R$ 0,05) */
const TOLERANCE = 0.05;

/** Jornada mensal CLT: 44h/sem × 30 dias ÷ 7 dias = ~220h */
const HORAS_MES = 220;

/**
 * Salário mínimo nacional 2026.
 * Atualizar quando Portaria MPS for publicada.
 */
const SALARIO_MINIMO = 1518.0;

/** Defaults para meses sem informação explícita no holerite */
const DEFAULT_DIAS_UTEIS = 22;
const DEFAULT_DOMINGOS_FERIADOS = 4;

// ── Funções de construção do Holerite ────────────────────────────────────────

/**
 * Extrai os valores DECLARADOS pelo empregador do ParsedHolerite e os
 * organiza no tipo Holerite estruturado.
 */
export function construirHoleriteDeclarado(parsed: ParsedHolerite): HoleriteDeclarado {
  const get = (type: string) =>
    parsed.lines.find((l) => l.type === type)?.declared_value ?? 0;

  const salarioBase = get("salario_base") || parsed.gross_salary;
  const horasExtras50 = get("hora_extra_50");
  const horasExtras100 = get("hora_extra_100");
  const adicionalNoturno = get("adicional_noturno");
  const insalubridade = get("insalubridade");
  const periculosidade = get("periculosidade");
  const dsrSobreVariaveis = get("dsr_sobre_variaveis") || get("dsr");

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
        ].includes(l.type)
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
    dependentes: parsed.dependents,
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
 *
 * Usa as linhas originais do ParsedHolerite para obter bases de cálculo
 * (ex.: horas trabalhadas via `line.basis`).
 */
export function calcularHoleriteEsperado(
  declarado: HoleriteDeclarado,
  parsed: ParsedHolerite
): HoleriteEsperado {
  const valorHora = declarado.salarioBase / HORAS_MES;

  // ── Hora extra 50% (dias úteis) ─────────────────────────────────────────
  const he50Line = parsed.lines.find((l) => l.type === "hora_extra_50");
  const qtdHE50 = he50Line?.basis ?? null;
  const horasExtras50 = qtdHE50 !== null
    ? round2(valorHora * qtdHE50 * 1.5)
    : declarado.horasExtras50; // sem basis → mantém declarado (não pode recalcular)

  // ── Hora extra 100% (domingos / feriados) ───────────────────────────────
  const he100Line = parsed.lines.find((l) => l.type === "hora_extra_100");
  const qtdHE100 = he100Line?.basis ?? null;
  const horasExtras100 = qtdHE100 !== null
    ? round2(valorHora * qtdHE100 * 2.0)
    : declarado.horasExtras100;

  // ── Adicional noturno 20% (22h–5h) ──────────────────────────────────────
  const noturnoLine = parsed.lines.find((l) => l.type === "adicional_noturno");
  const qtdHorasNoturnas = noturnoLine?.basis ?? null;
  const adicionalNoturno = qtdHorasNoturnas !== null
    ? round2(valorHora * qtdHorasNoturnas * 0.2)
    : declarado.adicionalNoturno;

  // ── Insalubridade (10/20/40% do SM — CLT art. 192) ──────────────────────
  // Tenta identificar a alíquota pelo valor declarado; verifica contra todas
  const insalubridadeGraus = {
    minimo: round2(SALARIO_MINIMO * 0.1),
    medio: round2(SALARIO_MINIMO * 0.2),
    maximo: round2(SALARIO_MINIMO * 0.4),
  };
  const insalubridadeEsperada = encontrarGrauInsalubridade(
    declarado.insalubridade,
    insalubridadeGraus
  );
  const insalubridade = declarado.insalubridade > 0
    ? insalubridadeEsperada
    : 0;

  // ── Periculosidade (30% do salário base — CLT art. 193) ─────────────────
  const periculosidade = declarado.periculosidade > 0
    ? round2(declarado.salarioBase * 0.3)
    : 0;

  // ── DSR sobre verbas variáveis ───────────────────────────────────────────
  const verbasVariaveis = horasExtras50 + horasExtras100 + adicionalNoturno;
  const dsrSobreVariaveis = verbasVariaveis > 0
    ? round2((verbasVariaveis / declarado.diasUteisNoMes) * declarado.domingosFeriados)
    : 0;

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

  // ── Descontos esperados ──────────────────────────────────────────────────
  const descontoINSS = calcularINSS(salarioBruto);
  const descontoIRRF = calcularIRRF(salarioBruto, descontoINSS, declarado.dependentes);

  // VT: máximo legal = 6% do salário base (Lei 7.418/1985 art. 9º)
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

// ── Função principal exportada ───────────────────────────────────────────────

/**
 * Audita um holerite: compara valores declarados × valores esperados (CLT 2026).
 * Retorna AuditResult com status semáforo por linha e totais de diferença.
 */
export function auditarHolerite(parsed: ParsedHolerite): AuditResult {
  const declarado = construirHoleriteDeclarado(parsed);
  const esperado = calcularHoleriteEsperado(declarado, parsed);

  const auditLines: AuditLine[] = parsed.lines.map((line) =>
    auditarLinha(line, declarado, esperado)
  );

  // Linhas internas que não vieram do holerite mas o engine calculou
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

  const inssLine = auditLines.find((l) => l.type === "inss");
  const irrfLine = auditLines.find((l) => l.type === "irrf");
  const fgtsLine = auditLines.find((l) => l.type === "fgts");

  const summary: AuditSummary = {
    total_errors: auditLines.filter((l) => l.status === "error").length,
    total_warnings: auditLines.filter((l) => l.status === "warning").length,
    inss_declared: inssLine?.declared_value ?? 0,
    inss_expected: esperado.descontoINSS,
    irrf_declared: irrfLine?.declared_value ?? 0,
    irrf_expected: esperado.descontoIRRF,
    fgts_declared: fgtsLine?.declared_value ?? 0,
    fgts_expected: esperado.valorFGTS,
  };

  return {
    gross_salary: declarado.salarioBruto,
    net_declared: declarado.salarioLiquido,
    net_expected: esperado.salarioLiquido,
    total_difference: round2(esperado.salarioLiquido - declarado.salarioLiquido),
    lines: auditLines,
    summary,
  };
}

// ── Lógica de auditoria por linha ────────────────────────────────────────────

function auditarLinha(
  line: HoleriteLine,
  declarado: HoleriteDeclarado,
  esperado: HoleriteEsperado
): AuditLine {
  const valorHora = declarado.salarioBase / HORAS_MES;
  let expectedValue = line.declared_value;
  let note: string | null = null;

  switch (line.type) {
    // ── Descontos principais ──────────────────────────────────────────────
    case "inss":
      expectedValue = esperado.descontoINSS;
      if (diverge(line.declared_value, expectedValue)) {
        note =
          `INSS esperado pela tabela progressiva 2026: ${fmt(expectedValue)}. ` +
          `Base: ${fmt(declarado.salarioBruto)}`;
      }
      break;

    case "irrf":
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

    case "fgts":
      expectedValue = esperado.valorFGTS;
      if (diverge(line.declared_value, expectedValue)) {
        note = `FGTS esperado = 8% × ${fmt(declarado.salarioBruto)}: ${fmt(expectedValue)}`;
      }
      break;

    // ── Hora extra ────────────────────────────────────────────────────────
    case "hora_extra_50":
      if (line.basis !== null) {
        expectedValue = round2(valorHora * line.basis * 1.5);
        if (diverge(line.declared_value, expectedValue)) {
          note =
            `HE 50%: (${fmt(declarado.salarioBase)} ÷ ${HORAS_MES}h) × ${line.basis}h × 1,5 = ${fmt(expectedValue)}`;
        }
      }
      break;

    case "hora_extra_100":
      if (line.basis !== null) {
        expectedValue = round2(valorHora * line.basis * 2.0);
        if (diverge(line.declared_value, expectedValue)) {
          note =
            `HE 100%: (${fmt(declarado.salarioBase)} ÷ ${HORAS_MES}h) × ${line.basis}h × 2 = ${fmt(expectedValue)}`;
        }
      }
      break;

    // ── Adicional noturno ─────────────────────────────────────────────────
    case "adicional_noturno":
      if (line.basis !== null) {
        expectedValue = round2(valorHora * line.basis * 0.2);
        if (diverge(line.declared_value, expectedValue)) {
          note =
            `Adicional noturno: (${fmt(declarado.salarioBase)} ÷ ${HORAS_MES}h) × ${line.basis}h × 20% = ${fmt(expectedValue)}`;
        }
      }
      break;

    // ── Insalubridade ─────────────────────────────────────────────────────
    case "insalubridade": {
      const graus = {
        "Mínimo (10%)": round2(SALARIO_MINIMO * 0.1),
        "Médio (20%)": round2(SALARIO_MINIMO * 0.2),
        "Máximo (40%)": round2(SALARIO_MINIMO * 0.4),
      };
      const grauCorreto = encontrarGrauInsalubridade(line.declared_value, {
        minimo: graus["Mínimo (10%)"],
        medio: graus["Médio (20%)"],
        maximo: graus["Máximo (40%)"],
      });
      expectedValue = grauCorreto;
      if (diverge(line.declared_value, expectedValue)) {
        const opcoesStr = Object.entries(graus)
          .map(([g, v]) => `${g}: ${fmt(v)}`)
          .join(" | ");
        note = `Insalubridade não bate com nenhum grau sobre SM ${fmt(SALARIO_MINIMO)}: ${opcoesStr}`;
      }
      break;
    }

    // ── Periculosidade ────────────────────────────────────────────────────
    case "periculosidade":
      expectedValue = round2(declarado.salarioBase * 0.3);
      if (diverge(line.declared_value, expectedValue)) {
        note = `Periculosidade esperada = 30% × ${fmt(declarado.salarioBase)} = ${fmt(expectedValue)}`;
      }
      break;

    // ── DSR sobre variáveis ───────────────────────────────────────────────
    case "dsr_sobre_variaveis":
    case "dsr": {
      const verbasVar = esperado.horasExtras50 + esperado.horasExtras100 + esperado.adicionalNoturno;
      if (verbasVar > 0) {
        expectedValue = round2((verbasVar / declarado.diasUteisNoMes) * declarado.domingosFeriados);
        if (diverge(line.declared_value, expectedValue)) {
          note =
            `DSR = (${fmt(verbasVar)} ÷ ${declarado.diasUteisNoMes} dias úteis) × ${declarado.domingosFeriados} dom/feriados = ${fmt(expectedValue)}`;
        }
      }
      break;
    }

    // ── Vale-transporte ───────────────────────────────────────────────────
    case "vale_transporte": {
      const limiteVT = round2(declarado.salarioBase * 0.06);
      if (line.declared_value > limiteVT + TOLERANCE) {
        expectedValue = limiteVT;
        note = `Desconto VT não pode superar 6% do salário base (máx. ${fmt(limiteVT)})`;
      }
      break;
    }

    // ── Férias + 1/3 ─────────────────────────────────────────────────────
    case "adicional_ferias":
      if (line.basis) {
        expectedValue = round2(line.basis / 3);
        if (diverge(line.declared_value, expectedValue)) {
          note = `1/3 de férias = ${fmt(line.basis)} ÷ 3 = ${fmt(expectedValue)}`;
        }
      }
      break;
  }

  const difference = round2(line.declared_value - expectedValue);
  const status = resolveStatus(line.type, difference, line.kind);

  return {
    description: line.description,
    type: line.type,
    kind: line.kind,
    declared_value: line.declared_value,
    expected_value: expectedValue,
    difference,
    status,
    note,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function encontrarGrauInsalubridade(
  valorDeclarado: number,
  graus: { minimo: number; medio: number; maximo: number }
): number {
  // Retorna o grau mais próximo do valor declarado
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
  note: string
): AuditLine {
  return {
    description,
    type,
    kind,
    declared_value,
    expected_value,
    difference: round2(declared_value - expected_value),
    status: "warning",
    note,
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

function diverge(a: number, b: number): boolean {
  return Math.abs(a - b) > TOLERANCE;
}

function fmt(n: number) {
  return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
