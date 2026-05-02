/**
 * Converte HoleriteAnalisado (saída do Claude via /api/analyze)
 * para ParsedHolerite (entrada do motor CLT).
 *
 * Regra de inclusão de linhas:
 *   - Créditos: inclui apenas se valor não-nulo e > 0
 *   - Descontos obrigatórios (INSS, IRRF): inclui mesmo se 0 (ex: IRRF isento)
 *   - Outros descontos: inclui se valor não-nulo e > 0
 *   - FGTS (info): inclui se não-nulo
 */
import type { HoleriteAnalisado, ParsedHolerite, HoleriteLine, HoleriteLineType } from "@/lib/types";

/** Arredonda para a jornada padrão mais próxima (150/180/200/220) se estiver dentro de 15h. */
function inferirJornada(salarioBase: number, he: HoleriteAnalisado["horasExtras50"]): number | null {
  if (!he?.valor || !he.quantidade || !salarioBase || he.quantidade <= 0) return null;
  const additionalRate = 1 + (he.percentual ?? 50) / 100; // ex: 1.5 para 50%
  const valorHoraImplicito = he.valor / (he.quantidade * additionalRate);
  if (valorHoraImplicito <= 0) return null;
  const jornadaImplicita = salarioBase / valorHoraImplicito;
  const padroes = [150, 160, 180, 200, 220];
  const nearest = padroes.reduce((prev, curr) =>
    Math.abs(curr - jornadaImplicita) < Math.abs(prev - jornadaImplicita) ? curr : prev
  );
  return Math.abs(jornadaImplicita - nearest) <= 15 ? nearest : null;
}

export function analisadoParaParsed(a: HoleriteAnalisado): ParsedHolerite {
  const lines: HoleriteLine[] = [];

  function push(
    description: string,
    type: HoleriteLineType,
    kind: "credit" | "deduction" | "info",
    value: number | null | undefined,
    basis: number | null = null,
    rate: number | null = null
  ) {
    if (value == null) return;
    lines.push({ code: null, description, type, kind, declared_value: value, basis, rate });
  }

  // ── Créditos (apenas se valor presente e > 0) ─────────────────────────────
  if (a.salarioBase) push("Salário Base", "salario_base", "credit", a.salarioBase);

  if (a.horasExtras50?.valor) {
    const pct50 = a.horasExtras50.percentual ?? 50;
    push(
      `Hora Extra ${pct50}%`,
      "hora_extra_50",
      "credit",
      a.horasExtras50.valor,
      a.horasExtras50.quantidade ?? null,
      pct50 / 100
    );
  }

  if (a.horasExtras100?.valor) {
    const pct100 = a.horasExtras100.percentual ?? 100;
    push(
      `Hora Extra ${pct100}%`,
      "hora_extra_100",
      "credit",
      a.horasExtras100.valor,
      a.horasExtras100.quantidade ?? null,
      pct100 / 100
    );
  }

  if (a.adicionalNoturno?.valor) {
    push(
      "Adicional Noturno",
      "adicional_noturno",
      "credit",
      a.adicionalNoturno.valor,
      a.adicionalNoturno.quantidade ?? null,
      a.adicionalNoturno.percentual !== null ? a.adicionalNoturno.percentual / 100 : null
    );
  }

  if (a.insalubridade?.valor) {
    const grauLabel = a.insalubridade.grau ? ` (${a.insalubridade.grau})` : "";
    push(`Insalubridade${grauLabel}`, "insalubridade", "credit", a.insalubridade.valor);
  }

  if (a.periculosidade?.valor) {
    push("Adicional de Periculosidade", "periculosidade", "credit", a.periculosidade.valor);
  }

  if (a.dsrSobreVariaveis) {
    push(
      "DSR s/ Variáveis",
      "dsr_sobre_variaveis",
      "credit",
      a.dsrSobreVariaveis,
      a.dsrReferencia?.diasDsr ?? null,
      a.dsrReferencia?.diasUteis ?? null
    );
  }

  // Normaliza para comparação cross-list
  const normDesc = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const descontoDescs = new Set((a.outrosDescontos ?? []).map((d) => normDesc(d.descricao)));

  (a.outrosProventos ?? []).forEach((p) => {
    // Pular se a mesma descrição existe em outrosDescontos — é linha fantasma do OCR
    if (p.valor > 0 && !descontoDescs.has(normDesc(p.descricao))) {
      push(p.descricao, "outros_creditos", "credit", p.valor);
    }
  });

  // ── Descontos obrigatórios (inclui mesmo se 0) ────────────────────────────
  push("INSS", "inss", "deduction", a.descontoINSS ?? 0);
  push("IRRF", "irrf", "deduction", a.descontoIRRF ?? 0);

  if (a.descontoVT) push("Vale-Transporte", "vale_transporte", "deduction", a.descontoVT);

  (a.outrosDescontos ?? []).forEach((d) => {
    if (d.valor > 0) push(d.descricao, "outros_descontos", "deduction", d.valor);
  });

  // ── FGTS (informativo — depósito patronal) ────────────────────────────────
  if (a.valorFGTS) push("FGTS", "fgts", "info", a.valorFGTS);

  // ── Deduplicar linhas com mesma descrição normalizada — manter a de maior valor ──
  const seen = new Map<string, number>();
  const dedupedLines: HoleriteLine[] = [];
  for (const line of lines) {
    const key = line.description.toLowerCase().replace(/\s+/g, " ").trim() + "|" + line.kind;
    const existingIdx = seen.get(key);
    if (existingIdx !== undefined) {
      if (Math.abs(line.declared_value) > Math.abs(dedupedLines[existingIdx].declared_value)) {
        dedupedLines[existingIdx] = line;
      }
    } else {
      seen.set(key, dedupedLines.length);
      dedupedLines.push(line);
    }
  }

  // ── Forçar classificação por keywords na descrição ────────────────────────
  for (const line of dedupedLines) {
    if (line.kind === "deduction") {
      if (/\birrf\b|imposto\s*de\s*renda|ir\s*fonte|i\.r\.r\.f/i.test(line.description)) {
        line.type = "irrf";
      } else if (/\binss\b|previd[eê]ncia\s*social/i.test(line.description)) {
        line.type = "inss";
      } else if (/vale[\s-]*transporte|\bvt\b/i.test(line.description)) {
        line.type = "vale_transporte";
      }
    }
    if (/\bfgts\b/i.test(line.description)) {
      line.type = "fgts";
      line.kind = "info";
    }
  }

  // Se havia uma linha IRRF/INSS com valor 0 que foi superada por uma reclassificada,
  // remover o zero-placeholder (ex: a IA não extraiu descontoIRRF mas pôs em outrosDescontos)
  const finalLines = dedupedLines.filter((line) => {
    if ((line.type === "irrf" || line.type === "inss") && line.declared_value === 0) {
      const hasReal = dedupedLines.some((l) => l !== line && l.type === line.type && l.declared_value > 0);
      return !hasReal;
    }
    return true;
  });

  // gross_salary = salarioBruto declarado OU soma dos créditos
  const grossSalary =
    a.salarioBruto ??
    finalLines
      .filter((l) => l.kind === "credit")
      .reduce((s, l) => s + l.declared_value, 0);

  // Jornada: usa o que a IA extraiu, ou infere das HEs, ou usa 220h (padrão CLT)
  const jornadaExtraida = a.jornadaMensal ?? null;
  const jornadaInferida =
    jornadaExtraida == null && a.salarioBase
      ? (inferirJornada(a.salarioBase, a.horasExtras50) ??
         inferirJornada(a.salarioBase, a.horasExtras100))
      : null;
  const horasMensais = jornadaExtraida ?? jornadaInferida ?? undefined;

  // Dependentes: usa o que a IA extraiu (null = não encontrado no holerite → motor usa 0)
  const dependentes = a.dependentes ?? null;
  return {
    employee_name: "",
    employer_name: a.empregador ?? "",
    cpf: null,
    cnpj: null,
    competencia: a.mesReferencia ?? "",
    gross_salary: grossSalary,
    dependents: dependentes,
    horas_mensais_contrato: horasMensais,
    tipo_holerite_confirmado: a.tipoHolerite ?? null,
    // Campos de rescisão
    data_admissao: a.dataAdmissao ?? null,
    data_rescisao: a.dataRescisao ?? null,
    tipo_rescisao: a.tipoRescisao ?? null,
    saldo_fgts_acumulado: a.saldoFGTSAcumulado ?? null,
    lines: finalLines,
  };
}
