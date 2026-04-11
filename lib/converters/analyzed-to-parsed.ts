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
    push(
      "Hora Extra 50%",
      "hora_extra_50",
      "credit",
      a.horasExtras50.valor,
      a.horasExtras50.quantidade ?? null,
      1.5
    );
  }

  if (a.horasExtras100?.valor) {
    push(
      "Hora Extra 100%",
      "hora_extra_100",
      "credit",
      a.horasExtras100.valor,
      a.horasExtras100.quantidade ?? null,
      2.0
    );
  }

  if (a.adicionalNoturno?.valor) {
    push(
      "Adicional Noturno",
      "adicional_noturno",
      "credit",
      a.adicionalNoturno.valor,
      null,
      (a.adicionalNoturno.percentual ?? 20) / 100
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
    push("DSR s/ Variáveis", "dsr_sobre_variaveis", "credit", a.dsrSobreVariaveis);
  }

  (a.outrosProventos ?? []).forEach((p) => {
    if (p.valor > 0) push(p.descricao, "outros_creditos", "credit", p.valor);
  });

  // ── Descontos obrigatórios (inclui mesmo se 0) ────────────────────────────
  // INSS e IRRF devem sempre estar presentes para a auditoria funcionar
  push("INSS", "inss", "deduction", a.descontoINSS ?? 0);
  push("IRRF", "irrf", "deduction", a.descontoIRRF ?? 0);

  if (a.descontoVT) push("Vale-Transporte", "vale_transporte", "deduction", a.descontoVT);

  (a.outrosDescontos ?? []).forEach((d) => {
    if (d.valor > 0) push(d.descricao, "outros_descontos", "deduction", d.valor);
  });

  // ── FGTS (informativo — depósito patronal) ────────────────────────────────
  if (a.valorFGTS) push("FGTS", "fgts", "info", a.valorFGTS);

  // gross_salary = salarioBruto declarado OU soma dos créditos
  const grossSalary =
    a.salarioBruto ??
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
    dependents: 0,
    lines,
  };
}
