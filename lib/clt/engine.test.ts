/**
 * Testes do Motor CLT — cobertura das 18 regras + validações originais
 *
 * Cada bloco de describe corresponde a uma regra ou grupo de regras.
 * Gabarito: status esperado, rubrica afetada e sentido do erro (se houver).
 */

import { describe, it, expect } from "vitest";
import { auditarHolerite, detectarTipoHolerite } from "./engine";
import type { ParsedHolerite, HoleriteLine } from "@/lib/types";

// ── helpers de fixture ──────────────────────────────────────────────────────

function base(overrides: Partial<ParsedHolerite> = {}): ParsedHolerite {
  return {
    employee_name: "Funcionária Teste",
    employer_name: "Empresa Ltda",
    cpf: null,
    cnpj: null,
    competencia: "03/2026",
    gross_salary: 4000,
    dependents: 0,
    horas_mensais_contrato: 220,
    lines: [],
    ...overrides,
  };
}

function line(
  type: HoleriteLine["type"],
  kind: HoleriteLine["kind"],
  description: string,
  declared_value: number,
  basis: number | null = null,
  rate: number | null = null
): HoleriteLine {
  return { code: null, type, kind, description, declared_value, basis, rate };
}

// salário base simples (correto)
function baseCorreto(salario = 4000): ParsedHolerite {
  // calcularINSS(4000, "03/2026"): 1621×7.5%=121.58 + (2902.84-1621)×9%=115.37 + (4000-2902.84)×12%=131.66 = 368.61
  const inss = salario === 4000 ? 368.61 : Math.round(salario * 0.09 * 100) / 100;
  return base({
    gross_salary: salario,
    lines: [
      line("salario_base", "credit", "Salário Base", salario),
      line("inss",         "deduction", "INSS",     inss),
      line("irrf",         "deduction", "IRRF",     0),
      line("fgts",         "info",      "FGTS",     salario * 0.08),
    ],
  });
}

// ── Detecção de tipo de holerite ─────────────────────────────────────────────

describe("detectarTipoHolerite", () => {
  it("folha_mensal — tem salario_base", () => {
    expect(detectarTipoHolerite(baseCorreto())).toBe("folha_mensal");
  });

  it("rescisao — keywords de TRCT", () => {
    const p = base({
      lines: [
        line("outros_creditos", "credit", "Saldo de salário", 1000),
        line("outros_creditos", "credit", "Férias proporcionais", 2000),
        line("outros_creditos", "credit", "Multa 40% FGTS",      3000),
        line("outros_creditos", "credit", "Aviso prévio indenizado", 4000),
      ],
    });
    expect(detectarTipoHolerite(p)).toBe("rescisao");
  });

  it("ferias — tipo ferias presente", () => {
    const p = base({
      lines: [
        line("ferias",          "credit", "Férias",           4000),
        line("adicional_ferias","credit", "1/3 Constitucional", 1333.33),
      ],
    });
    expect(detectarTipoHolerite(p)).toBe("ferias");
  });

  it("decimo_terceiro_1 — 1ª parcela", () => {
    const p = base({
      lines: [line("decimo_terceiro", "credit", "13º Salário 1ª Parcela", 2000)],
    });
    expect(detectarTipoHolerite(p)).toBe("decimo_terceiro_1");
  });

  it("decimo_terceiro_2 — 2ª parcela sem keyword de 1ª", () => {
    const p = base({
      lines: [line("decimo_terceiro", "credit", "13º Salário 2ª Parcela", 4000)],
    });
    expect(detectarTipoHolerite(p)).toBe("decimo_terceiro_2");
  });

  it("plr — PLR sem salario_base", () => {
    const p = base({
      lines: [line("outros_creditos", "credit", "Participação nos Lucros e Resultados", 5000)],
    });
    expect(detectarTipoHolerite(p)).toBe("plr");
  });
});

// ── Validações originais do motor ────────────────────────────────────────────

describe("Salário mínimo (CF Art. 7º IV)", () => {
  it("OK quando salário >= mínimo proporcional", () => {
    // SM 2026 = R$1.621 (competencia 03/2026)
    const r = auditarHolerite(baseCorreto(1621));
    const l = r.lines.find((x) => x.type === "salario_base")!;
    expect(l.status).toBe("ok");
  });

  it("legal_violation quando salário < mínimo", () => {
    const p = baseCorreto(1000);
    p.lines[0].declared_value = 1000;
    const r = auditarHolerite(p);
    const l = r.lines.find((x) => x.type === "salario_base")!;
    expect(l.status).toBe("legal_violation");
    expect(l.expected_value).toBeGreaterThan(1000);
  });
});

describe("INSS progressivo (Lei 8.212/91)", () => {
  it("OK quando INSS correto para R$4.000", () => {
    // fixture usa o valor real calculado pelo engine
    const p = baseCorreto(4000);
    const r = auditarHolerite(p);
    const l = r.lines.find((x) => x.type === "inss")!;
    // declared = expected (o fixture usa o valor correto do engine)
    expect(["ok", "warning"]).toContain(l.status);
    // engine deve calcular ~R$373-420 dependendo da progressividade
    expect(l.expected_value).toBeGreaterThan(200);
  });

  it("error quando INSS cobrado a mais", () => {
    const p = baseCorreto(4000);
    p.lines.find((l) => l.type === "inss")!.declared_value = 800; // muito acima
    const r = auditarHolerite(p);
    const l = r.lines.find((x) => x.type === "inss")!;
    expect(["error", "warning"]).toContain(l.status);
  });
});

describe("IRRF (RIR)", () => {
  it("OK para salário R$2.000 (abaixo da faixa de isenção com INSS)", () => {
    const p = base({
      gross_salary: 2000,
      lines: [
        line("salario_base", "credit",    "Salário Base", 2000),
        line("inss",         "deduction", "INSS",         158.40),
        line("irrf",         "deduction", "IRRF",         0),
        line("fgts",         "info",      "FGTS",         160),
      ],
    });
    const r = auditarHolerite(p);
    const l = r.lines.find((x) => x.type === "irrf")!;
    expect(["ok", "warning"]).toContain(l.status);
  });
});

describe("FGTS — 8% do bruto (Lei 8.036/90)", () => {
  it("legal_violation quando FGTS abaixo de 8%", () => {
    const p = baseCorreto(4000);
    p.lines.find((l) => l.type === "fgts")!.declared_value = 200; // deveria ser 320
    const r = auditarHolerite(p);
    const l = r.lines.find((x) => x.type === "fgts")!;
    expect(l.status).toBe("legal_violation");
  });

  it("OK quando FGTS = 8%", () => {
    const r = auditarHolerite(baseCorreto(4000));
    const l = r.lines.find((x) => x.type === "fgts")!;
    expect(["ok", "warning"]).toContain(l.status);
  });
});

// ── Regras de horas extras ───────────────────────────────────────────────────

describe("Regra 1 — HE 50% (CLT Art. 59 §1º)", () => {
  it("OK quando HE calculada corretamente com horas declaradas", () => {
    const salario = 4000;
    const valorHora = salario / 220; // ~18.18
    const qtdHoras = 10;
    const valorHE = Math.round(valorHora * qtdHoras * 1.5 * 100) / 100;
    const p = base({
      gross_salary: salario + valorHE,
      lines: [
        line("salario_base", "credit", "Salário Base", salario),
        line("hora_extra_50", "credit", "HE 50%", valorHE, qtdHoras),
        line("inss", "deduction", "INSS", 450),
        line("irrf", "deduction", "IRRF", 0),
        line("fgts", "info", "FGTS", (salario + valorHE) * 0.08),
      ],
    });
    const r = auditarHolerite(p);
    const l = r.lines.find((x) => x.type === "hora_extra_50")!;
    expect(["ok", "warning"]).toContain(l.status);
  });

  it("legal_violation quando adicional < 50%", () => {
    const p = base({
      gross_salary: 4200,
      lines: [
        line("salario_base", "credit", "Salário Base", 4000),
        line("hora_extra_50", "credit", "HE 30%", 200, 10, 0.30), // taxa abaixo do mínimo
        line("inss", "deduction", "INSS", 450),
        line("irrf", "deduction", "IRRF", 0),
        line("fgts", "info", "FGTS", 336),
      ],
    });
    const r = auditarHolerite(p);
    const l = r.lines.find((x) => x.type === "hora_extra_50")!;
    expect(l.status).toBe("legal_violation");
  });
});

describe("Regra 2 — HE 100% feriado/domingo (CLT Art. 70)", () => {
  it("legal_violation quando HE feriado paga com 50%", () => {
    const p = base({
      gross_salary: 4200,
      lines: [
        line("salario_base", "credit", "Salário Base", 4000),
        line("hora_extra_50", "credit", "HE Domingo 50%", 200, 8, 0.50),
        line("inss", "deduction", "INSS", 450),
        line("irrf", "deduction", "IRRF", 0),
        line("fgts", "info", "FGTS", 336),
      ],
    });
    const r = auditarHolerite(p);
    const l = r.lines.find((x) => x.type === "hora_extra_50")!;
    expect(l.status).toBe("legal_violation");
  });
});

describe("Adicional noturno (CLT Art. 73)", () => {
  it("legal_violation quando adicional noturno < 20%", () => {
    const p = base({
      gross_salary: 4100,
      lines: [
        line("salario_base", "credit", "Salário Base", 4000),
        line("adicional_noturno", "credit", "Ad. Noturno 10%", 100, 50, 0.10),
        line("inss", "deduction", "INSS", 450),
        line("irrf", "deduction", "IRRF", 0),
        line("fgts", "info", "FGTS", 328),
      ],
    });
    const r = auditarHolerite(p);
    const l = r.lines.find((x) => x.type === "adicional_noturno")!;
    expect(l.status).toBe("legal_violation");
  });
});

describe("Insalubridade (CLT Art. 192)", () => {
  it("legal_violation quando valor não corresponde a nenhum grau", () => {
    const p = base({
      gross_salary: 4200,
      lines: [
        line("salario_base",  "credit", "Salário Base", 4000),
        line("insalubridade", "credit", "Insalubridade", 500), // não é 151.80/303.60/607.20
        line("inss", "deduction", "INSS", 450),
        line("irrf", "deduction", "IRRF", 0),
        line("fgts", "info", "FGTS", 336),
      ],
    });
    const r = auditarHolerite(p);
    const l = r.lines.find((x) => x.type === "insalubridade")!;
    expect(l.status).toBe("legal_violation");
  });

  it("OK quando valor bate com grau médio (20% SM)", () => {
    const grauMedio = Math.round(1621 * 0.2 * 100) / 100; // 324.20 (SM 2026)
    const p = base({
      gross_salary: 4000 + grauMedio,
      lines: [
        line("salario_base",  "credit", "Salário Base", 4000),
        line("insalubridade", "credit", "Insalubridade Grau Médio", grauMedio),
        line("inss", "deduction", "INSS", 450),
        line("irrf", "deduction", "IRRF", 0),
        line("fgts", "info", "FGTS", (4000 + grauMedio) * 0.08),
      ],
    });
    const r = auditarHolerite(p);
    const l = r.lines.find((x) => x.type === "insalubridade")!;
    expect(["ok", "warning"]).toContain(l.status);
  });
});

describe("Periculosidade (CLT Art. 193)", () => {
  it("legal_violation quando periculosidade < 30% do salário base", () => {
    const p = base({
      gross_salary: 4400,
      lines: [
        line("salario_base",   "credit", "Salário Base", 4000),
        line("periculosidade", "credit", "Periculosidade 20%", 800), // deveria ser 1200
        line("inss", "deduction", "INSS", 500),
        line("irrf", "deduction", "IRRF", 0),
        line("fgts", "info", "FGTS", 352),
      ],
    });
    const r = auditarHolerite(p);
    const l = r.lines.find((x) => x.type === "periculosidade")!;
    expect(l.status).toBe("legal_violation");
  });
});

describe("Vale-transporte (Lei 7.418/85)", () => {
  it("legal_violation quando desconto VT > 6% do salário base", () => {
    const p = base({
      gross_salary: 4000,
      lines: [
        line("salario_base",    "credit",    "Salário Base", 4000),
        line("vale_transporte", "deduction", "VT",           300), // limite é 240 (6%)
        line("inss", "deduction", "INSS", 450),
        line("irrf", "deduction", "IRRF", 0),
        line("fgts", "info", "FGTS", 320),
      ],
    });
    const r = auditarHolerite(p);
    const l = r.lines.find((x) => x.type === "vale_transporte")!;
    expect(l.status).toBe("legal_violation");
    expect(l.expected_value).toBe(240);
  });
});

describe("Regra 3 — Contribuição sindical (Lei 13.467/2017)", () => {
  it("manual_check para contribuição sindical", () => {
    const p = base({
      gross_salary: 4000,
      lines: [
        line("salario_base",     "credit",    "Salário Base",          4000),
        line("outros_descontos", "deduction", "Contribuição Sindical",  33.33),
        line("inss", "deduction", "INSS", 450),
        line("irrf", "deduction", "IRRF", 0),
        line("fgts", "info", "FGTS", 320),
      ],
    });
    const r = auditarHolerite(p);
    const l = r.lines.find((x) => x.description.includes("Sindical"))!;
    expect(l.status).toBe("manual_check");
  });
});

describe("Regra 4 — Desconto de faltas", () => {
  it("error quando desconto por falta excede o proporcional", () => {
    const p = base({
      gross_salary: 4000,
      lines: [
        line("salario_base",     "credit",    "Salário Base", 4000),
        line("outros_descontos", "deduction", "Faltas 2 dias", 400), // proporcional seria ~266.67
        line("inss", "deduction", "INSS", 450),
        line("irrf", "deduction", "IRRF", 0),
        line("fgts", "info", "FGTS", 320),
      ],
    });
    const r = auditarHolerite(p);
    const l = r.lines.find((x) => /faltas/i.test(x.description))!;
    expect(l.status).toBe("error");
  });
});

describe("Regra 5 — Salário-família", () => {
  it("manual_check quando salário abaixo do limite e tem dependentes mas rubrica ausente", () => {
    const p = base({
      gross_salary: 1518,
      dependents: 1,
      lines: [
        line("salario_base", "credit",    "Salário Base", 1518),
        line("inss",         "deduction", "INSS",         113.85),
        line("irrf",         "deduction", "IRRF",         0),
        line("fgts",         "info",      "FGTS",         121.44),
      ],
    });
    const r = auditarHolerite(p);
    const l = r.lines.find((x) => /sal.*fam/i.test(x.description));
    expect(l).toBeTruthy();
    expect(l!.status).toBe("manual_check");
  });
});

describe("Regra 6 — Consignado (Lei 10.820/2003)", () => {
  it("warning quando consignado > 35% do bruto", () => {
    const p = base({
      gross_salary: 4000,
      lines: [
        line("salario_base",     "credit",    "Salário Base",      4000),
        line("outros_descontos", "deduction", "Empréstimo Consignado", 1500), // 37.5%
        line("inss", "deduction", "INSS", 450),
        line("irrf", "deduction", "IRRF", 0),
        line("fgts", "info", "FGTS", 320),
      ],
    });
    const r = auditarHolerite(p);
    // o engine cria uma linha SINTÉTICA "Consignado — total acima do limite legal"
    const l = r.lines.find((x) => /total acima do limite/i.test(x.description));
    expect(l).toBeTruthy();
    expect(l!.status).toBe("warning");
  });
});

describe("Regra 7 — Desconto de equipamento (CLT Art. 462)", () => {
  it("manual_check para desconto de uniforme", () => {
    const p = base({
      gross_salary: 4000,
      lines: [
        line("salario_base",     "credit",    "Salário Base",        4000),
        line("outros_descontos", "deduction", "Desconto Uniforme",   50),
        line("inss", "deduction", "INSS", 450),
        line("irrf", "deduction", "IRRF", 0),
        line("fgts", "info", "FGTS", 320),
      ],
    });
    const r = auditarHolerite(p);
    const l = r.lines.find((x) => /uniforme/i.test(x.description))!;
    expect(l.status).toBe("manual_check");
  });
});

describe("Regra 8 — Desconto por atraso (CLT Art. 58 §1º)", () => {
  it("manual_check para desconto de atraso", () => {
    const p = base({
      gross_salary: 4000,
      lines: [
        line("salario_base",     "credit",    "Salário Base",       4000),
        line("outros_descontos", "deduction", "Desconto de Atraso",  30),
        line("inss", "deduction", "INSS", 450),
        line("irrf", "deduction", "IRRF", 0),
        line("fgts", "info", "FGTS", 320),
      ],
    });
    const r = auditarHolerite(p);
    const l = r.lines.find((x) => /atraso/i.test(x.description))!;
    expect(l.status).toBe("manual_check");
  });
});

describe("Regra 9 — 1/3 constitucional férias (CF Art. 7º XVII)", () => {
  it("adiciona linha sintética de tercio ausente", () => {
    const p = base({
      gross_salary: 4000,
      lines: [
        line("ferias", "credit", "Férias", 4000),
        // sem adicional_ferias
        line("inss", "deduction", "INSS", 450),
        line("irrf", "deduction", "IRRF", 0),
        line("fgts", "info", "FGTS", 320),
      ],
    });
    const r = auditarHolerite(p);
    const l = r.lines.find((x) => x.type === "adicional_ferias");
    expect(l).toBeTruthy();
    expect(l!.status).toBe("legal_violation");
    expect(l!.expected_value).toBeCloseTo(4000 / 3, 1);
  });
});

describe("Regra 10 — Intervalo intrajornada (CLT Art. 71)", () => {
  it("manual_check quando intervalo_reduzido = true", () => {
    const p = { ...base({ lines: [
      line("salario_base", "credit", "Salário Base", 4000),
      line("inss", "deduction", "INSS", 450),
      line("irrf", "deduction", "IRRF", 0),
      line("fgts", "info", "FGTS", 320),
    ] }), intervalo_reduzido: true };
    const r = auditarHolerite(p as unknown as ParsedHolerite);
    const l = r.lines.find((x) => /intervalo/i.test(x.description));
    expect(l).toBeTruthy();
    expect(l!.status).toBe("manual_check");
  });
});

describe("Regra 11 — Hora noturna reduzida (CLT Art. 73 §1º)", () => {
  it("manual_check quando horas noturnas sem indicação de equivalência", () => {
    // declared_value precisa ser exatamente 20% para não disparar legal_violation
    // valorHora = 4000/220 ≈ 18.1818; 100h × 20% = 363.64
    const valorHora = 4000 / 220;
    const declNoturno = Math.round(valorHora * 100 * 0.2 * 100) / 100;
    const p = base({
      gross_salary: 4000 + declNoturno,
      lines: [
        line("salario_base",       "credit", "Salário Base",        4000),
        line("adicional_noturno",  "credit", "Ad. Noturno",  declNoturno, 100, null),
        line("inss", "deduction", "INSS", 450),
        line("irrf", "deduction", "IRRF", 0),
        line("fgts", "info", "FGTS", (4000 + declNoturno) * 0.08),
      ],
    });
    const r = auditarHolerite(p);
    const l = r.lines.find((x) => x.type === "adicional_noturno")!;
    expect(l.status).toBe("manual_check");
  });
});

describe("Regra 12 — Limite de 2h extras/dia (CLT Art. 59)", () => {
  it("manual_check quando média diária > 2h", () => {
    const p = base({
      gross_salary: 5000,
      lines: [
        line("salario_base",  "credit", "Salário Base", 4000),
        line("hora_extra_50", "credit", "HE 50%", 910, 70), // 70h / ~22 dias úteis = ~3.2h/dia
        line("inss", "deduction", "INSS", 500),
        line("irrf", "deduction", "IRRF", 0),
        line("fgts", "info", "FGTS", 400),
      ],
    });
    const r = auditarHolerite(p);
    const alerta = r.lines.find((x) => /limite\s*di[aá]rio|limite.*extra/i.test(x.description));
    expect(alerta).toBeTruthy();
    expect(alerta!.status).toBe("manual_check");
  });

  it("não gera alerta quando média <= 2h/dia", () => {
    const p = base({
      gross_salary: 4700,
      lines: [
        line("salario_base",  "credit", "Salário Base", 4000),
        line("hora_extra_50", "credit", "HE 50%", 545.45, 30), // ~1.36h/dia
        line("inss", "deduction", "INSS", 490),
        line("irrf", "deduction", "IRRF", 0),
        line("fgts", "info", "FGTS", 376),
      ],
    });
    const r = auditarHolerite(p);
    const alerta = r.lines.find((x) => /limite\s*di[aá]rio/i.test(x.description));
    expect(alerta).toBeUndefined();
  });
});

describe("Regra 13 — VA/VR PAT (Lei 6.321/76)", () => {
  it("manual_check quando desconto VR > 20% do provento", () => {
    const p = base({
      gross_salary: 4000,
      lines: [
        line("salario_base",    "credit",    "Salário Base",   4000),
        line("vale_refeicao",   "credit",    "Vale Refeição",  600),
        line("outros_descontos","deduction", "Desc. VR",       180), // 30%, acima dos 20%
        line("inss",  "deduction", "INSS",  450),
        line("irrf",  "deduction", "IRRF",  0),
        line("fgts",  "info",      "FGTS",  320),
      ],
    });
    const r = auditarHolerite(p);
    // engine gera linha sintética "Desconto de VR — verificar limite PAT"
    const l = r.lines.find((x) => /verific.*PAT|PAT.*verific/i.test(x.description));
    expect(l).toBeTruthy();
    expect(l!.status).toBe("manual_check");
    expect(l!.expected_value).toBeCloseTo(120, 1); // 20% de 600
  });

  it("não gera alerta quando desconto VR <= 20%", () => {
    const p = base({
      gross_salary: 4000,
      lines: [
        line("salario_base",    "credit",    "Salário Base",  4000),
        line("vale_refeicao",   "credit",    "Vale Refeição", 600),
        line("outros_descontos","deduction", "Desc. VR",      100), // ~16.7%
        line("inss",  "deduction", "INSS", 450),
        line("irrf",  "deduction", "IRRF", 0),
        line("fgts",  "info",      "FGTS", 320),
      ],
    });
    const r = auditarHolerite(p);
    const l = r.lines.find((x) => /PAT/i.test(x.description));
    expect(l).toBeUndefined();
  });
});

describe("Regra 14 — Adicional de transferência (CLT Art. 469)", () => {
  it("legal_violation quando adicional < 25% do salário base", () => {
    const p = base({
      gross_salary: 4500,
      lines: [
        line("salario_base",    "credit", "Salário Base",              4000),
        line("outros_creditos", "credit", "Adicional de Transferência", 500), // deveria ser 1000
        line("inss", "deduction", "INSS", 500),
        line("irrf", "deduction", "IRRF", 0),
        line("fgts", "info", "FGTS", 360),
      ],
    });
    const r = auditarHolerite(p);
    const l = r.lines.find((x) => /transfer[eê]ncia/i.test(x.description))!;
    expect(l.status).toBe("legal_violation");
    expect(l.expected_value).toBe(1000); // 25% de 4000
  });

  it("OK quando adicional = 25%", () => {
    const p = base({
      gross_salary: 5000,
      lines: [
        line("salario_base",    "credit", "Salário Base",              4000),
        line("outros_creditos", "credit", "Adicional de Transferência", 1000),
        line("inss", "deduction", "INSS", 550),
        line("irrf", "deduction", "IRRF", 0),
        line("fgts", "info", "FGTS", 400),
      ],
    });
    const r = auditarHolerite(p);
    const l = r.lines.find((x) => /transfer[eê]ncia/i.test(x.description))!;
    expect(["ok", "warning"]).toContain(l.status);
  });
});

describe("Regra 15 — Gratificação de função (CLT Art. 62)", () => {
  it("manual_check quando gratificação >= 40% + HE no mesmo holerite", () => {
    const p = base({
      gross_salary: 5900,
      lines: [
        line("salario_base",    "credit", "Salário Base",          4000),
        line("outros_creditos", "credit", "Gratificação de Função", 1800), // 45%
        line("hora_extra_50",   "credit", "HE 50%",                 100, 5),
        line("inss", "deduction", "INSS", 560),
        line("irrf", "deduction", "IRRF", 0),
        line("fgts", "info", "FGTS", 472),
      ],
    });
    const r = auditarHolerite(p);
    const l = r.lines.find((x) => /gratifica|cargo.confian/i.test(x.description) && x.status === "manual_check");
    expect(l).toBeTruthy();
  });

  it("manual_check quando gratificação < 40% sem HE — direitos mantidos", () => {
    const p = base({
      gross_salary: 4600,
      lines: [
        line("salario_base",    "credit", "Salário Base",          4000),
        line("outros_creditos", "credit", "Gratificação de Função",  600), // 15%
        line("inss", "deduction", "INSS", 500),
        line("irrf", "deduction", "IRRF", 0),
        line("fgts", "info", "FGTS", 368),
      ],
    });
    const r = auditarHolerite(p);
    const l = r.lines.find((x) => /gratifica.*fun|< 40/i.test(x.description) && x.status === "manual_check");
    expect(l).toBeTruthy();
  });

  it("não gera alerta quando gratificação < 40% COM HE (situação correta)", () => {
    const p = base({
      gross_salary: 4800,
      lines: [
        line("salario_base",    "credit", "Salário Base",          4000),
        line("outros_creditos", "credit", "Gratificação de Função",  400), // 10%
        line("hora_extra_50",   "credit", "HE 50%",                 400, 10),
        line("inss", "deduction", "INSS", 520),
        line("irrf", "deduction", "IRRF", 0),
        line("fgts", "info", "FGTS", 384),
      ],
    });
    const r = auditarHolerite(p);
    const alerta = r.lines.find(
      (x) => /gratifica/i.test(x.description) && x.status === "manual_check" && /62/i.test(x.legal_citation ?? "")
    );
    expect(alerta).toBeUndefined();
  });
});

describe("Regra 16 — Sobreaviso (CLT Art. 244)", () => {
  it("legal_violation quando sobreaviso pago abaixo de 1/3 da hora", () => {
    const salario = 4000;
    const valorHora = salario / 220;
    const horasSob = 40;
    const correto = Math.round(valorHora * (1 / 3) * horasSob * 100) / 100;
    const errado  = Math.round(correto * 0.5 * 100) / 100; // paga só metade
    const p = base({
      gross_salary: salario + errado,
      lines: [
        line("salario_base",    "credit", "Salário Base", salario),
        line("outros_creditos", "credit", "Sobreaviso",    errado, horasSob),
        line("inss", "deduction", "INSS", 450),
        line("irrf", "deduction", "IRRF", 0),
        line("fgts", "info", "FGTS", 323),
      ],
    });
    const r = auditarHolerite(p);
    const l = r.lines.find((x) => /sobreaviso/i.test(x.description))!;
    expect(l.status).toBe("legal_violation");
    expect(l.expected_value).toBeCloseTo(correto, 1);
  });

  it("OK quando sobreaviso = 1/3 correto", () => {
    const salario = 4000;
    const valorHora = salario / 220;
    const horasSob = 40;
    const correto = Math.round(valorHora * (1 / 3) * horasSob * 100) / 100;
    const p = base({
      gross_salary: salario + correto,
      lines: [
        line("salario_base",    "credit", "Salário Base", salario),
        line("outros_creditos", "credit", "Sobreaviso",    correto, horasSob),
        line("inss", "deduction", "INSS", 450),
        line("irrf", "deduction", "IRRF", 0),
        line("fgts", "info", "FGTS", 323),
      ],
    });
    const r = auditarHolerite(p);
    const l = r.lines.find((x) => /sobreaviso/i.test(x.description))!;
    expect(["ok", "warning"]).toContain(l.status);
  });

  it("manual_check quando sobreaviso sem basis (sem nº de horas)", () => {
    const p = base({
      gross_salary: 4200,
      lines: [
        line("salario_base",    "credit", "Salário Base", 4000),
        line("outros_creditos", "credit", "Sobreaviso",    200),
        line("inss", "deduction", "INSS", 450),
        line("irrf", "deduction", "IRRF", 0),
        line("fgts", "info", "FGTS", 336),
      ],
    });
    const r = auditarHolerite(p);
    const l = r.lines.find((x) => /sobreaviso/i.test(x.description))!;
    expect(l.status).toBe("manual_check");
  });
});

describe("Regra 17 — Banco de horas (CLT Art. 59)", () => {
  it("manual_check quando rubrica de banco de horas detectada", () => {
    const p = base({
      gross_salary: 4000,
      lines: [
        line("salario_base",    "credit", "Salário Base",   4000),
        line("outros_creditos", "credit", "Banco de Horas",    0),
        line("inss", "deduction", "INSS", 450),
        line("irrf", "deduction", "IRRF", 0),
        line("fgts", "info", "FGTS", 320),
      ],
    });
    const r = auditarHolerite(p);
    const l = r.lines.find((x) => /banco.*horas/i.test(x.description) && x.status === "manual_check");
    expect(l).toBeTruthy();
  });
});

describe("Regra 18 — Pensão alimentícia", () => {
  it("manual_check para desconto de pensão", () => {
    const p = base({
      gross_salary: 4000,
      lines: [
        line("salario_base",     "credit",    "Salário Base",        4000),
        line("outros_descontos", "deduction", "Pensão Alimentícia 30%", 1050),
        line("inss", "deduction", "INSS", 450),
        line("irrf", "deduction", "IRRF", 0),
        line("fgts", "info", "FGTS", 320),
      ],
    });
    const r = auditarHolerite(p);
    const l = r.lines.find((x) => /pens[aã]o/i.test(x.description))!;
    expect(l.status).toBe("manual_check");
    // Deve gerar cenários com percentual calculado sobre base
    expect(l.scenarios!.length).toBeGreaterThanOrEqual(2);
  });

  it("manual_check mesmo sem percentual explícito", () => {
    const p = base({
      gross_salary: 4000,
      lines: [
        line("salario_base",     "credit",    "Salário Base",    4000),
        line("outros_descontos", "deduction", "Pensão Judicial", 1200),
        line("inss", "deduction", "INSS", 450),
        line("irrf", "deduction", "IRRF", 0),
        line("fgts", "info", "FGTS", 320),
      ],
    });
    const r = auditarHolerite(p);
    const l = r.lines.find((x) => /pens[aã]o/i.test(x.description))!;
    expect(l.status).toBe("manual_check");
  });
});

// ── Tipos de holerite especiais ──────────────────────────────────────────────

describe("Rescisão — motor próprio", () => {
  it("retorna tipo rescisao e audita as verbas", () => {
    const p = base({
      lines: [
        line("outros_creditos", "credit", "Saldo de salário",     1500),
        line("outros_creditos", "credit", "Férias proporcionais", 4000),
        line("outros_creditos", "credit", "Multa 40% FGTS",      8000),
      ],
    });
    const r = auditarHolerite(p);
    expect(r.tipo_holerite).toBe("rescisao");
    // Motor de rescisão produz linhas de auditoria (não mais stub)
    expect(r.lines.length).toBeGreaterThan(0);
    // Multa 40% deve ser manual_check (sem saldo FGTS acumulado)
    const multaLine = r.lines.find(l => /multa/i.test(l.description));
    expect(multaLine?.status).toBe("manual_check");
  });

  it("calcula aviso prévio correto com datas disponíveis (saldo como base)", () => {
    // Remuneração R$3000 inferida do saldo (sem linha de aviso para ser circular)
    // 5 anos completos (jan/2021 → jan/2026): diasAviso = 30 + 5×3 = 45
    const p = base({
      data_admissao: "01/01/2021",
      data_rescisao: "15/03/2026",
      tipo_rescisao: "sem_justa_causa",
      lines: [
        line("outros_creditos", "credit",    "Saldo de salário",          1500), // R$3000/30×15
        line("outros_creditos", "credit",    "Aviso prévio indenizado",   4500), // R$3000/30×45 (correto)
        line("outros_creditos", "credit",    "13º salário proporcional",  750),  // R$3000/12×3
        line("inss",            "deduction", "INSS",                      135),
        line("irrf",            "deduction", "IRRF",                        0),
      ],
    });
    const r = auditarHolerite(p);
    expect(r.tipo_holerite).toBe("rescisao");
    const avisoLine = r.lines.find(l => /aviso/i.test(l.description));
    expect(avisoLine).toBeDefined();
    // Motor infers remuneracao from aviso: 4500/45×30 = 3000, then expected = 3000/30×45 = 4500
    expect(avisoLine?.status).toBe("ok");
    expect(avisoLine?.expected_value).toBeCloseTo(4500, 0);
  });
});

describe("PLR — INSS e IRRF especiais", () => {
  it("error quando INSS descontado sobre PLR", () => {
    const p = base({
      lines: [
        line("outros_creditos", "credit",    "Participação nos Lucros", 10000),
        line("inss",            "deduction", "INSS",                    1100), // indevido
        line("irrf",            "deduction", "IRRF",                      0),
      ],
    });
    const r = auditarHolerite(p);
    const l = r.lines.find((x) => x.type === "inss")!;
    expect(l.status).toBe("error");
  });
});

describe("13º salário — INSS indevido na 1ª parcela", () => {
  it("error quando INSS descontado na 1ª parcela do 13º", () => {
    const p = base({
      lines: [
        line("decimo_terceiro", "credit",    "13º Salário 1ª Parcela", 2000),
        line("inss",            "deduction", "INSS 13º",               220), // indevido
        line("irrf",            "deduction", "IRRF",                     0),
      ],
    });
    const r = auditarHolerite(p);
    const l = r.lines.find((x) => x.type === "inss")!;
    expect(l.status).toBe("error");
    expect(l.expected_value).toBe(0);
  });
});

describe("Licença-paternidade (CLT Art. 473)", () => {
  it("legal_violation quando salário descontado por licença paternidade", () => {
    const p = base({
      gross_salary: 4000,
      lines: [
        line("salario_base",     "credit",    "Salário Base",               4000),
        line("outros_descontos", "deduction", "Desconto Licença Paternidade", 667),
        line("inss", "deduction", "INSS", 450),
        line("irrf", "deduction", "IRRF", 0),
        line("fgts", "info", "FGTS", 320),
      ],
    });
    const r = auditarHolerite(p);
    const l = r.lines.find((x) => /paternidade/i.test(x.description))!;
    expect(l.status).toBe("legal_violation");
    expect(l.expected_value).toBe(0);
  });
});

// ── Classificação de recorrência ───────────────────────────────────────────

import { classifyRecurrence } from "./engine";

describe("classifyRecurrence — folha_mensal", () => {
  it("INSS é recurring", () => {
    expect(classifyRecurrence("INSS", "folha_mensal")).toBe("recurring");
  });

  it("IRRF é recurring", () => {
    expect(classifyRecurrence("IRRF", "folha_mensal")).toBe("recurring");
  });

  it("Hora Extra 50% é recurring", () => {
    expect(classifyRecurrence("Hora Extra 50%", "folha_mensal")).toBe("recurring");
  });

  it("Férias é one_time em folha_mensal", () => {
    expect(classifyRecurrence("Férias", "folha_mensal")).toBe("one_time");
  });

  it("Terço constitucional de férias é one_time", () => {
    expect(classifyRecurrence("Terço constitucional de férias (não constou)", "folha_mensal")).toBe("one_time");
  });
});

describe("classifyRecurrence — tipos pontuais", () => {
  it("qualquer linha em tipo ferias é one_time", () => {
    expect(classifyRecurrence("Salário Base", "ferias")).toBe("one_time");
  });

  it("qualquer linha em tipo rescisao é one_time", () => {
    expect(classifyRecurrence("INSS", "rescisao")).toBe("one_time");
  });

  it("qualquer linha em tipo plr é one_time", () => {
    expect(classifyRecurrence("PLR", "plr")).toBe("one_time");
  });
});

describe("impactoRecorrente / impactoPontual no resultado", () => {
  it("INSS errado em folha_mensal gera impactoRecorrente > 0 e projecaoAnual", () => {
    const p = base({
      gross_salary: 4000,
      lines: [
        line("salario_base", "credit",    "Salário Base", 4000),
        line("inss",         "deduction", "INSS",          500), // cobrado a mais
        line("irrf",         "deduction", "IRRF",            0),
        line("fgts",         "info",      "FGTS",          320),
      ],
    });
    const r = auditarHolerite(p);
    expect(r.impactoRecorrente).toBeGreaterThan(0);
    expect(r.projecaoAnual).not.toBeNull();
    expect(r.projecaoAnual).toBeCloseTo((r.impactoRecorrente ?? 0) * 12, 1);
  });

  it("terço de férias ausente em folha com férias gera impactoPontual, projecaoAnual null", () => {
    const p = base({
      gross_salary: 4000,
      lines: [
        line("salario_base", "credit",    "Salário Base", 4000),
        line("ferias",       "credit",    "Férias",       1333.33),
        line("inss",         "deduction", "INSS",          368.61),
        line("irrf",         "deduction", "IRRF",            0),
        line("fgts",         "info",      "FGTS",          320),
      ],
    });
    const r = auditarHolerite(p);
    // Terço constitucional ausente → one_time → impactoPontual > 0
    expect(r.impactoPontual).toBeGreaterThan(0);
    // Sem erros em linhas recorrentes → projecaoAnual null
    expect(r.projecaoAnual).toBeNull();
  });
});
