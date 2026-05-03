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
  // ── Branch dedicado para rescisão: usa schema verbasRescisao ──────────────
  if (a.tipoHolerite === "rescisao" && a.verbasRescisao) {
    return analisadoRescisaoParaParsed(a);
  }

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

/**
 * Branch dedicado para rescisão.
 * Gera linhas com `description` padronizada que o engine reconhece pelos regex
 * RSC_* em lib/clt/engine.ts. Cada campo de verbasRescisao vira uma linha
 * tipada — não passa por outrosProventos / outrosDescontos.
 */
function analisadoRescisaoParaParsed(a: HoleriteAnalisado): ParsedHolerite {
  const v = a.verbasRescisao!;
  const lines: HoleriteLine[] = [];

  function add(
    description: string,
    type: HoleriteLineType,
    kind: "credit" | "deduction" | "info",
    value: number | null | undefined,
    basis: number | null = null
  ) {
    if (value == null) return;
    lines.push({ code: null, description, type, kind, declared_value: value, basis, rate: null });
  }

  // ── Saldo de salário (já inclui adicionais habituais somados pela IA) ────
  add("Saldo de Salário", "salario_base", "credit",
      v.saldo_salario?.valor, v.saldo_salario?.dias ?? null);

  // ── Aviso prévio ──────────────────────────────────────────────────────────
  add("Aviso Prévio Indenizado", "outros_creditos", "credit",
      v.aviso_previo_indenizado?.valor, v.aviso_previo_indenizado?.dias ?? null);
  add("Aviso Prévio Trabalhado", "outros_creditos", "credit",
      v.aviso_previo_trabalhado?.valor, v.aviso_previo_trabalhado?.dias ?? null);

  // ── 13º (engine acumula tudo que bate em RSC_D13_RE) ─────────────────────
  add("13º Salário Proporcional", "decimo_terceiro", "credit",
      v.decimo_terceiro_proporcional?.valor, v.decimo_terceiro_proporcional?.avos ?? null);
  add("13º Salário Proporcional Adicionais", "decimo_terceiro", "credit",
      v.decimo_terceiro_adicionais);
  add("13º Salário Proporcional Indenizado (1/12)", "decimo_terceiro", "credit",
      v.decimo_terceiro_indenizado);

  // ── Férias proporcionais ──────────────────────────────────────────────────
  add("Férias Proporcionais", "ferias", "credit",
      v.ferias_proporcionais?.valor, v.ferias_proporcionais?.avos ?? null);
  add("1/3 Férias Proporcionais", "adicional_ferias", "credit",
      v.terco_ferias_proporcionais);

  // ── Férias vencidas (período completo não gozado, dentro do concessivo) ──
  add("Férias Vencidas", "ferias", "credit", v.ferias_vencidas);
  add("1/3 Férias Vencidas", "adicional_ferias", "credit", v.terco_ferias_vencidas);

  // ── Férias indenizadas (período completo aquisitivo após concessivo) ─────
  add("Férias Indenizadas", "ferias", "credit", v.ferias_indenizadas);
  add("1/3 Férias Indenizadas", "adicional_ferias", "credit", v.terco_ferias_indenizadas);

  // ── Adicionais habituais sobre férias (insal proporcional, etc.) ─────────
  add("Férias Adicionais", "outros_creditos", "credit", v.ferias_adicionais);

  // ── Multa rescisória (40% FGTS sem justa causa, 20% acordo) ──────────────
  add("Multa Rescisória 40% FGTS", "outros_creditos", "credit", v.multa_rescisoria);

  // ── INSS — duas linhas separadas (engine soma para o total) ──────────────
  add("INSS Rescisão", "inss", "deduction", v.inss_rescisao);
  add("INSS 13º Salário", "inss", "deduction", v.inss_13);

  // ── IRRF ──────────────────────────────────────────────────────────────────
  add("IRRF", "irrf", "deduction", v.irrf);

  // ── Outras verbas (pass-through preservando descrição original do TRCT) ──
  (v.outras_verbas ?? []).forEach((o) => {
    if (o.tipo === "credito") {
      add(o.descricao, "outros_creditos", "credit", o.valor);
    } else {
      add(o.descricao, "outros_descontos", "deduction", o.valor);
    }
  });

  // ── Adicionais habituais — informativos (já estão somados no saldo) ──────
  // Marcamos como "info" para não duplicar no total de vencimentos.
  (a.adicionais_habituais ?? []).forEach((adic) => {
    lines.push({
      code: null,
      description: `${adic.descricao} (referência — já incluso no saldo)`,
      type: "outros_creditos",
      kind: "info",
      declared_value: adic.valor,
      basis: null,
      rate: null,
    });
  });

  // ── FGTS depósito do mês (informativo, não desconta do líquido) ──────────
  add("FGTS", "fgts", "info", a.fgts?.deposito_mes ?? a.valorFGTS);

  // ── Gross salary: prefere o total declarado pelo rodapé do TRCT ──────────
  const grossSalary =
    a.totais?.total_vencimentos ??
    lines
      .filter((l) => l.kind === "credit")
      .reduce((s, l) => s + l.declared_value, 0);

  return {
    employee_name: "",
    employer_name: a.empregador ?? "",
    cpf: null,
    cnpj: null,
    competencia: a.mesReferencia ?? "",
    gross_salary: grossSalary,
    dependents: a.dependentes ?? null,
    horas_mensais_contrato: a.jornadaMensal ?? undefined,
    tipo_holerite_confirmado: "rescisao",
    data_admissao: a.dataAdmissao ?? null,
    data_rescisao: a.dataRescisao ?? null,
    tipo_rescisao: a.tipoRescisao ?? null,
    saldo_fgts_acumulado: a.fgts?.saldo_acumulado ?? a.saldoFGTSAcumulado ?? null,
    lines,
  };
}
