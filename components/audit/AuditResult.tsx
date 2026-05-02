"use client";

import { useState } from "react";
import Link from "next/link";
import type { AuditResult as AuditResultType, AuditLine, HoleriteLineType, CenarioRescisao, ParsedHolerite } from "@/lib/types";
import type { MissingInfoQuestion } from "@/lib/clt/engine";
import { getMissingInfo } from "@/lib/clt/engine";
import { applyConditionalAnswers, type ConditionalAnswers } from "@/components/upload/ImageUpload";
import { formatarTipoRescisao, formatarAnosServico, formatarModalidadeAviso, formatarFeriasVencidas, gerarExemploDinamico } from "@/lib/clt/format";
import { generateResultImage } from "@/lib/share/generate-result-image";
import { trackShareClicked } from "@/lib/analytics";
import { cn } from "@/lib/utils";

// ── formatting helpers ────────────────────────────────────────────────────────

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDatetime(d: Date) {
  return (
    d.toLocaleDateString("pt-BR") +
    " às " +
    d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  );
}

function diffIsDamaging(line: AuditLine): boolean {
  if (line.status === "legal_violation") return true;
  if (line.kind === "deduction") return line.difference > 0.05;
  if (line.kind === "credit") return line.difference < -0.05;
  return false;
}

// ── Legal citation fallback map ───────────────────────────────────────────────

const BASE_LEGAL: Partial<Record<HoleriteLineType, string>> = {
  salario_base:         "CF Art. 7º IV · CLT Art. 76",
  inss:                 "Lei 8.212/91 Art. 20 · Portaria MPS",
  irrf:                 "RIR Art. 677 · MP 1.206/2024",
  fgts:                 "Lei 8.036/90 Art. 15",
  hora_extra_50:        "CLT Art. 59 §1º · CF Art. 7º XVI",
  hora_extra_100:       "CLT Art. 70 · Lei 605/49",
  adicional_noturno:    "CLT Art. 73",
  insalubridade:        "CLT Art. 192 · SV 4/STF",
  periculosidade:       "CLT Art. 193 §1º",
  dsr:                  "Lei 605/49 · Súmula 172 TST",
  dsr_sobre_variaveis:  "Lei 605/49 · Súmula 172 TST",
  vale_transporte:      "Lei 7.418/85 Art. 4º",
  ferias:               "CLT Art. 130 · CF Art. 7º XVII",
  adicional_ferias:     "CF Art. 7º XVII",
  decimo_terceiro:      "Lei 4.090/62",
  vale_refeicao:        "Lei 6.321/76 · PAT",
  vale_alimentacao:     "Lei 6.321/76 · PAT",
};

// ── CenarioBanner ─────────────────────────────────────────────────────────────

function CenarioBanner({ cenario, onReanalyze }: { cenario: CenarioRescisao; onReanalyze?: () => void }) {
  const premissas = [
    { label: "Tipo de saída",    valor: formatarTipoRescisao(cenario.tipo_rescisao) },
    { label: "Tempo de serviço", valor: formatarAnosServico(cenario.anos_servico) },
    { label: "Aviso prévio",     valor: formatarModalidadeAviso(cenario.modalidade_aviso) },
    { label: "Férias vencidas",  valor: formatarFeriasVencidas(cenario.ferias_vencidas_periodos) },
  ];

  const exemplo = gerarExemploDinamico(cenario.tipo_rescisao, cenario.anos_servico);
  const temAnomalia = cenario.anomalias.length > 0;

  return (
    <div className={cn(
      "rounded-2xl p-5 print:hidden",
      temAnomalia
        ? "border border-[#D97706]/40 bg-[#FFFBEB]"
        : "border border-[#1A4B8B]/20 bg-[#EEF4FF]"
    )}>
      {/* Header */}
      <div className="flex items-start gap-2 mb-3">
        <span className={cn("text-base leading-none mt-0.5", temAnomalia ? "text-[#D97706]" : "text-[#1A4B8B]")}>ⓘ</span>
        <p className={cn("text-sm font-semibold", temAnomalia ? "text-[#92400E]" : "text-[#1A4B8B]")}>
          Análise feita com cenário assumido
        </p>
      </div>

      <p className={cn("text-xs mb-3", temAnomalia ? "text-[#92400E]" : "text-[#1A4B8B]/80")}>
        Como você pulou as perguntas, fizemos a auditoria assumindo:
      </p>

      {/* Premissas */}
      <ul className="space-y-1.5 mb-4">
        {premissas.map((p) => (
          <li key={p.label} className="flex items-baseline gap-1.5 text-sm">
            <span className={cn("font-medium shrink-0", temAnomalia ? "text-[#78350F]" : "text-[#1E3A5F]")}>
              {p.label}:
            </span>
            <span className={cn(temAnomalia ? "text-[#92400E]" : "text-[#1A4B8B]")}>{p.valor}</span>
          </li>
        ))}
      </ul>

      {/* Anomalias (se houver) */}
      {temAnomalia && (
        <div className="mb-4 bg-[#FEF3C7] border border-[#D97706]/30 rounded-xl p-3">
          <p className="text-xs font-semibold text-[#92400E] mb-1.5">Inconsistências detectadas:</p>
          <ul className="space-y-1">
            {cenario.anomalias.map((a, i) => (
              <li key={i} className="text-xs text-[#92400E]">• {a}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Exemplo dinâmico */}
      <p className={cn("text-xs leading-relaxed mb-4", temAnomalia ? "text-[#78350F]" : "text-[#1A4B8B]/70")}>
        {exemplo}
      </p>

      {/* CTA */}
      <button
        type="button"
        onClick={onReanalyze}
        className={cn(
          "inline-flex items-center gap-1.5 text-sm font-semibold rounded-xl px-4 py-2 border transition-colors",
          temAnomalia
            ? "text-[#92400E] border-[#D97706]/50 hover:bg-[#D97706]/10"
            : "text-[#1A4B8B] border-[#1A4B8B]/30 hover:bg-[#1A4B8B]/8"
        )}
      >
        Responder as perguntas →
      </button>
    </div>
  );
}

// ── LineRow ───────────────────────────────────────────────────────────────────

function LineRow({ line }: { line: AuditLine }) {
  const [open, setOpen] = useState(false);

  const isErr = line.status === "error";
  const isWarn = line.status === "warning";
  const isLegal = line.status === "legal_violation";
  const isUnverifiable = line.status === "unverifiable";
  const isManualCheck = line.status === "manual_check";
  const isOk = line.status === "ok";
  const hasNote = isManualCheck
    ? !!(line.scenarios?.length)
    : !!line.note && (isErr || isWarn || isLegal || isUnverifiable);
  const baseLegal = isOk ? null : (line.legal_citation ?? BASE_LEGAL[line.type] ?? null);
  const hasExpand = !isOk && (hasNote || !!baseLegal);
  // Lines with problems get a visible "Entenda →" label; ok/info lines get a subtle chevron
  const showEntenda = hasExpand && (isErr || isWarn || isLegal || isManualCheck || isUnverifiable);

  // Status dot color
  const dotColor =
    isLegal || isErr ? "bg-tc-coral" :
    isWarn ? "bg-tc-accent" :
    isManualCheck ? "bg-[#3B82F6]" :
    isUnverifiable ? "bg-tc-muted" :
    line.status === "info" ? "bg-tc-muted" :
    "bg-tc-green";

  // Status pill
  const pillClass =
    isLegal
      ? "bg-tc-coral/15 text-tc-coral"
      : isErr
      ? "bg-tc-coral/15 text-tc-coral"
      : isWarn
      ? "bg-tc-accent/15 text-tc-accent"
      : isUnverifiable
      ? "bg-tc-muted/20 text-tc-muted"
      : isManualCheck
      ? "bg-[#3B82F6]/15 text-[#3B82F6]"
      : line.status === "info"
      ? "bg-tc-muted/20 text-tc-muted"
      : "bg-tc-green/15 text-tc-green";

  const statusLabel =
    isLegal ? "Violação Legal" :
    isErr ? "Erro" :
    isWarn ? "Atenção" :
    isUnverifiable ? "Não verificável" :
    isManualCheck ? "Verificar" :
    line.status === "info" ? "Info" : "OK";

  const kindLabel =
    line.kind === "credit" ? "Crédito" :
    line.kind === "deduction" ? "Desconto" : "Info";

  const absDiff = Math.abs(line.difference);
  const diffLabel =
    isUnverifiable || isManualCheck ? "—" :
    absDiff < 0.05 ? "—" :
    line.difference > 0 ? `+${brl(line.difference)}` : brl(line.difference);

  const diffCls =
    absDiff < 0.05 || isUnverifiable || isManualCheck
      ? "text-tc-muted"
      : diffIsDamaging(line)
      ? "text-tc-coral"
      : "text-tc-green";

  return (
    <div className={cn(
      "border-b border-tc-line last:border-0",
      (isErr || isLegal) && "bg-tc-coral/[0.03]",
    )}>
      <button
        type="button"
        disabled={!hasExpand}
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left"
        aria-expanded={open}
      >
        <div className="flex items-start gap-3 py-4 px-5">
          <div className={cn("w-2 h-2 rounded-full mt-1.5 flex-shrink-0", dotColor)} aria-hidden />
          <div className="flex-1 min-w-0">
            {/* name + badges */}
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className={cn(
                "text-sm font-medium truncate",
                isOk || line.status === "info" ? "text-tc-muted" : "text-tc-ink"
              )}>
                {line.description}
              </span>
              <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", pillClass)}>
                {statusLabel}
              </span>
            </div>

            {/* values — ok/info: só declarado; demais: 3 colunas */}
            {isOk || line.status === "info" ? (
              <div className="text-xs">
                <p className="text-tc-muted mb-0.5">No holerite</p>
                <p className="font-medium tabular text-tc-muted">{brl(line.declared_value)}</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-x-3 text-xs">
                <div>
                  <p className="text-tc-muted mb-0.5">No holerite</p>
                  <p className="font-medium tabular text-tc-ink">{brl(line.declared_value)}</p>
                </div>
                <div>
                  <p className="text-tc-muted mb-0.5">Correto</p>
                  <p className="font-medium tabular text-tc-ink">
                    {isUnverifiable || isManualCheck ? "?" : brl(line.expected_value)}
                  </p>
                </div>
                <div>
                  <p className="text-tc-muted mb-0.5">Diferença</p>
                  <p className={cn("font-semibold tabular", diffCls)}>{diffLabel}</p>
                </div>
              </div>
            )}
          </div>

          {/* Expand affordance: "Entenda →" for problems, subtle chevron for ok */}
          {showEntenda ? (
            <span className={cn(
              "flex-shrink-0 text-xs font-semibold mt-1 whitespace-nowrap flex items-center gap-0.5 transition-opacity",
              isLegal || isErr ? "text-tc-coral" :
              isManualCheck ? "text-[#3B82F6]" :
              "text-tc-accent",
              open && "opacity-60"
            )}>
              {open ? "Fechar" : "Entenda"}
              <span className={cn("transition-transform duration-150 inline-block", open && "rotate-180")}>›</span>
            </span>
          ) : hasExpand ? (
            <span
              className={cn("flex-shrink-0 text-tc-muted text-xs mt-1 transition-transform duration-150", open && "rotate-180")}
              aria-hidden
            >
              ▾
            </span>
          ) : null}
        </div>
      </button>

      {/* expanded — manual_check scenarios */}
      {open && isManualCheck && line.scenarios && (
        <div className="mx-5 mb-4 px-4 py-3 rounded-xl text-xs bg-[#EFF6FF] border border-[#3B82F6]/30">
          <p className="font-semibold text-[#1D4ED8] mb-1">Verifique você mesmo</p>
          {line.note && <p className="text-[#3B82F6] mb-2">{line.note}</p>}
          {line.scenarios.some((s) => s.hideComparison) && (
            <p className="text-[#3B82F6] mb-1 font-medium">Se você fez horas neste mês, confira:</p>
          )}
          <ul className="space-y-1.5">
            {line.scenarios.map((s, i) => (
              <li key={i} className="flex items-center justify-between gap-2">
                <span className="text-[#3B82F6]">{s.label} → <strong className="tabular">{brl(s.expected)}</strong></span>
                {!s.hideComparison && (
                  s.matches ? (
                    <span className="text-tc-green font-medium whitespace-nowrap">✓ Confere</span>
                  ) : (
                    <span className="text-tc-coral font-medium whitespace-nowrap">
                      {brl(Math.abs(s.difference))} a {s.difference < 0 ? "menos" : "mais"}
                    </span>
                  )
                )}
                {s.hideComparison && s.matches && (
                  <span className="text-tc-green font-medium whitespace-nowrap">✓ Confere</span>
                )}
              </li>
            ))}
          </ul>
          {line.tip && (
            <p className="mt-2 text-[#60A5FA] text-[11px] italic">{line.tip}</p>
          )}
          {baseLegal && (
            <p className="mt-2 pt-2 border-t border-[#BFDBFE] text-[10px] text-[#93C5FD]">Base legal: {baseLegal}</p>
          )}
        </div>
      )}

      {/* expanded — note */}
      {open && !isManualCheck && line.note && (
        <div
          className={cn(
            "mx-5 mb-4 px-4 py-3 rounded-xl text-xs leading-relaxed",
            isLegal || isErr
              ? "bg-tc-coral/8 border border-tc-coral/30 text-tc-coral"
              : "bg-tc-accent/8 border border-tc-accent/20 text-tc-accent"
          )}
        >
          {isLegal && line.legal_citation && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide bg-tc-coral/15 px-2 py-0.5 rounded-full mb-2 block w-fit">
              ⚖ {line.legal_citation}
            </span>
          )}
          <p className="whitespace-pre-wrap">{line.note}</p>
          {baseLegal && !(isLegal && line.legal_citation) && (
            <p className="mt-2 text-[10px] opacity-60">Base legal: {baseLegal}</p>
          )}
        </div>
      )}

      {/* expanded — base legal only (ok/info lines) */}
      {open && !isManualCheck && !line.note && baseLegal && (
        <div className="mx-5 mb-4 px-4 py-2.5 rounded-xl text-[10px] bg-tc-bg border border-tc-line text-tc-muted">
          Base legal: {baseLegal}
        </div>
      )}
    </div>
  );
}

// ── SummaryRow ────────────────────────────────────────────────────────────────

function SummaryRow({ label, declared, expected }: { label: string; declared: number; expected: number }) {
  const ok = Math.abs(declared - expected) < 0.05;
  return (
    <div className="flex items-center justify-between py-2.5 text-sm border-b border-tc-line last:border-0">
      <span className="text-[var(--tc-ink-soft)]">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-tc-muted tabular">{brl(declared)}</span>
        <span className="text-tc-muted text-xs">→</span>
        <span className={cn("font-semibold tabular", ok ? "text-tc-green" : "text-tc-coral")}>
          {brl(expected)}
        </span>
      </div>
    </div>
  );
}

// ── AuditResult ───────────────────────────────────────────────────────────────

export function AuditResult({
  result: initialResult,
  createdAt,
  parsedData: initialParsedData,
}: {
  result: AuditResultType;
  createdAt?: string;
  parsedData?: ParsedHolerite;
}) {
  const [result, setResult] = useState(initialResult);
  const [parsedData] = useState(initialParsedData);
  const [shareStatus, setShareStatus] = useState<"idle" | "loading" | "done">("idle");
  const [disclaimerOpen, setDisclaimerOpen] = useState(false);

  // ── Re-análise inline (rescisão com cenário inferido) ─────────────────────
  const [showReanalysis, setShowReanalysis] = useState(false);
  const [reanalysisAnswers, setReanalysisAnswers] = useState<ConditionalAnswers>({});
  const [isReanalyzing, setIsReanalyzing] = useState(false);

  const reanalysisQuestions: MissingInfoQuestion[] = parsedData
    ? getMissingInfo(parsedData)
    : [];

  async function handleSubmitReanalysis() {
    if (!parsedData || reanalysisQuestions.length === 0) return;
    setIsReanalyzing(true);
    const { updated } = applyConditionalAnswers(parsedData, reanalysisQuestions, reanalysisAnswers);
    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parsedData: updated }),
      });
      if (res.ok) {
        const { auditResult } = (await res.json()) as { auditResult: AuditResultType };
        setResult(auditResult);
      }
    } finally {
      setIsReanalyzing(false);
      setShowReanalysis(false);
    }
  }

  const calcErrors  = result.lines.filter((l) => l.status === "error").length;
  const legalErrors = result.lines.filter((l) => l.status === "legal_violation").length;
  const errorCount  = calcErrors + legalErrors;
  const hasErrors   = errorCount > 0;
  const manualCheckCount = result.lines.filter((l) => l.status === "manual_check").length;
  // Impacto real = diferença no líquido (único número usado em todo o componente)
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const impactoReal = r2(result.net_expected - result.net_declared);
  const deficit = impactoReal; // alias mantido para compatibilidade
  // FGTS é tratado separadamente — não afeta o líquido, vai à conta vinculada
  const fgtsGap = r2(Math.max(0, result.summary.fgts_expected - result.summary.fgts_declared));
  const impactoRecorrente = result.impactoRecorrente ?? 0;
  const impactoPontual = result.impactoPontual ?? 0;
  const projecaoAnual = result.projecaoAnual ?? null;
  const auditDate = createdAt ? new Date(createdAt) : new Date();

  async function handleShare() {
    if (shareStatus === "loading") return;
    setShareStatus("loading");
    try {
      const blob = await generateResultImage({
        hasErrors,
        errorCount,
        deficit,
        inss: { declared: result.summary.inss_declared, expected: result.summary.inss_expected },
        irrf: { declared: result.summary.irrf_declared, expected: result.summary.irrf_expected },
        net:  { declared: result.net_declared, expected: result.net_expected },
        appUrl: process.env.NEXT_PUBLIC_APP_URL?.replace(/^https?:\/\//, "") ?? "tacerto.com.br",
      });
      const file = new File([blob], "resultado-holerite.png", { type: "image/png" });
      const url  = window.location.href;
      const text = hasErrors
        ? `Encontrei ${errorCount} divergência(s) no meu holerite — deveria receber ${brl(deficit)} a mais!`
        : "Meu holerite está correto! Confira pelo Tá Certo?";
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: "Tá Certo? — Resultado", text, files: [file], url });
        trackShareClicked("native");
      } else if (navigator.share) {
        await navigator.share({ title: "Tá Certo?", text, url });
        trackShareClicked("native");
      } else {
        const objUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objUrl;
        a.download = "resultado-holerite.png";
        a.click();
        URL.revokeObjectURL(objUrl);
        trackShareClicked("download");
      }
      setShareStatus("done");
      setTimeout(() => setShareStatus("idle"), 3000);
    } catch {
      setShareStatus("idle");
    }
  }

  const orderedLines = [
    ...result.lines.filter((l) => l.kind === "credit"),
    ...result.lines.filter((l) => l.kind === "deduction"),
    ...result.lines.filter((l) => l.kind === "info"),
  ];

  // Classificação dos problemas
  const temDescontoIndevido = result.lines.some(l => l.status === "legal_violation" && /indevid|duplicad/i.test(l.description));
  const temINSSErro  = result.lines.some(l => l.type === "inss"  && (l.status === "error" || l.status === "legal_violation"));
  const temIRRFErro  = result.lines.some(l => l.type === "irrf"  && (l.status === "error" || l.status === "legal_violation"));
  const temFGTSErro  = result.lines.some(l => l.type === "fgts"  && (l.status === "error" || l.status === "legal_violation"));

  // Badge label — "1 violação legal — desconto duplicado de adiantamento"
  let badgeLabel: string;
  if (legalErrors === 1) {
    const violacao = result.lines.find(l => l.status === "legal_violation");
    let labelCurto = "";
    if (violacao) {
      if (/adiantamento.*indevid|2[aª°].*baixa|duplicad.*adiantamento/i.test(violacao.description)) {
        labelCurto = "desconto duplicado de adiantamento";
      } else if (/indevid|duplicad/i.test(violacao.description)) {
        labelCurto = "desconto indevido";
      } else if (/paternidade|maternidade/i.test(violacao.description)) {
        labelCurto = "desconto em licença remunerada";
      } else if (/sal[aá]rio.*m[ií]nimo/i.test(violacao.description)) {
        labelCurto = "salário abaixo do mínimo legal";
      } else if (/\bfgts\b/i.test(violacao.description)) {
        labelCurto = "FGTS depositado a menor";
      } else if (/vale.*transporte/i.test(violacao.description)) {
        labelCurto = "vale-transporte acima do limite";
      }
    }
    badgeLabel = labelCurto ? `1 violação legal — ${labelCurto}` : "1 violação legal";
  } else if (legalErrors > 1) {
    badgeLabel = `${legalErrors} violações legais`;
  } else if (calcErrors === 1) {
    badgeLabel = "1 erro de cálculo";
  } else if (calcErrors > 1) {
    badgeLabel = `${calcErrors} erros de cálculo`;
  } else if (manualCheckCount === 1) {
    badgeLabel = "1 item para verificar";
  } else if (manualCheckCount > 1) {
    badgeLabel = `${manualCheckCount} itens para verificar`;
  } else {
    badgeLabel = "Tudo conferido";
  }

  // Texto do impacto no resumo
  let textoImpacto = "descontados indevidamente do seu salário";
  if (temDescontoIndevido) {
    textoImpacto = "descontados indevidamente — você pode pedir a devolução";
  } else if (temFGTSErro && !temINSSErro && !temIRRFErro) {
    textoImpacto = "de FGTS não depositados na sua conta";
  } else if (temINSSErro && temIRRFErro) {
    textoImpacto = "em impostos calculados incorretamente";
  } else if (temINSSErro) {
    textoImpacto = "de INSS cobrado a mais";
  } else if (temIRRFErro) {
    textoImpacto = "de imposto de renda retido incorretamente";
  }

  // Explicação em linguagem simples
  const explicacoes: string[] = [];
  if (temDescontoIndevido) {
    const linhaIndevida = result.lines.find(l => l.status === "legal_violation" && /indevid|duplicad/i.test(l.description));
    if (linhaIndevida) {
      const isAdiantamento = /adiantamento/i.test(linhaIndevida.description);
      const isDuplicado = /2[aª°]\s*baixa|duplicad|indevid/i.test(linhaIndevida.description);
      if (isAdiantamento && isDuplicado) {
        explicacoes.push(`Foi identificado um desconto duplicado de adiantamento salarial no valor de ${brl(linhaIndevida.declared_value)}.`);
      } else {
        explicacoes.push(`Foi identificado um desconto indevido: "${linhaIndevida.description}" no valor de ${brl(linhaIndevida.declared_value)}.`);
      }
    } else {
      explicacoes.push("Seu empregador aplicou um desconto que parece indevido.");
    }
  }
  if (temINSSErro) explicacoes.push("O desconto de INSS está diferente do que a lei determina.");
  if (temIRRFErro) explicacoes.push("O imposto de renda retido não bate com a tabela oficial.");
  if (temFGTSErro) explicacoes.push("O FGTS depositado está abaixo do que deveria.");
  const explicacao = explicacoes.length > 0
    ? explicacoes.join(" ") + " Expanda os itens vermelhos abaixo para ver os detalhes."
    : "Expanda os itens vermelhos abaixo para ver os detalhes.";

  const modoInferencia = result.usou_inferencia === true;

  // Hero card colors — em modo inferência, azul em vez de vermelho
  const heroBg =
    modoInferencia && hasErrors ? "bg-[#1A4B8B]" :
    legalErrors > 0 ? "bg-[#8B1A1A]" :
    calcErrors  > 0 ? "bg-[#8B1A1A]" :
    manualCheckCount > 0 ? "bg-[#1A4B8B]" :
    "bg-[#1B4332]";

  return (
    <>
      <div className="hidden print:block mb-6">
        <p className="text-lg font-bold">Relatório de Auditoria — Tá Certo?</p>
        <p className="text-sm text-tc-muted">{fmtDatetime(auditDate)}</p>
      </div>

      <div className="space-y-4 pb-10">

        {/* ── TIPO DE HOLERITE ─────────────────────────────────────────────── */}
        {result.tipo_holerite && result.tipo_holerite !== "desconhecido" && (
          <div className="flex items-center gap-2 px-1">
            <span className="text-xs text-tc-muted">Tipo detectado:</span>
            <span className={cn(
              "text-xs font-semibold px-2.5 py-0.5 rounded-full",
              result.tipo_holerite === "rescisao"          ? "bg-[#1A4B8B]/12 text-[#1A4B8B]" :
              result.tipo_holerite === "plr"               ? "bg-[#7C3AED]/12 text-[#7C3AED]" :
              result.tipo_holerite === "ferias"            ? "bg-[#0C4A6E]/12 text-[#0C4A6E]" :
              result.tipo_holerite === "decimo_terceiro_1" ||
              result.tipo_holerite === "decimo_terceiro_2" ? "bg-[#1A4B8B]/12 text-[#1A4B8B]" :
              "bg-[#155724]/12 text-[#155724]"
            )}>
              {result.tipo_holerite === "folha_mensal" ? "Folha Mensal" :
               result.tipo_holerite === "ferias" ? "Férias" :
               result.tipo_holerite === "decimo_terceiro_1" ? "13º — 1ª Parcela" :
               result.tipo_holerite === "decimo_terceiro_2" ? "13º — 2ª Parcela" :
               result.tipo_holerite === "plr" ? "PLR / PPR" :
               result.tipo_holerite === "rescisao" ? "Rescisão" :
               result.tipo_holerite}
            </span>
          </div>
        )}

        {/* ── CENÁRIO INFERIDO (rescisão) ──────────────────────────────────── */}
        {result.usou_inferencia && result.cenario_inferido && !showReanalysis && (
          <CenarioBanner
            cenario={result.cenario_inferido}
            onReanalyze={parsedData ? () => setShowReanalysis(true) : undefined}
          />
        )}

        {/* ── PAINEL DE RE-ANÁLISE INLINE ──────────────────────────────────── */}
        {showReanalysis && reanalysisQuestions.length > 0 && (
          <div className="rounded-2xl border border-tc-line bg-tc-paper p-5 space-y-4 print:hidden">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-semibold text-tc-ink text-sm mb-0.5">Confirme os detalhes da rescisão</p>
                <p className="text-xs text-tc-muted">Suas respostas atualizam o resultado imediatamente.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowReanalysis(false)}
                className="text-tc-muted hover:text-tc-ink transition-colors text-xs flex-shrink-0 mt-0.5"
              >
                Cancelar
              </button>
            </div>
            {reanalysisQuestions.map((q) => (
              <div key={q.id} className="space-y-2">
                <p className="text-sm font-medium text-tc-ink">{q.question}</p>
                <div className="flex flex-wrap gap-2">
                  {q.options.map((opt) => {
                    const active = reanalysisAnswers[q.id] === opt.value ||
                      (opt.value === null && reanalysisAnswers[q.id] === null && q.id in reanalysisAnswers);
                    return (
                      <button
                        key={String(opt.value)}
                        type="button"
                        onClick={() => setReanalysisAnswers((prev) => ({ ...prev, [q.id]: opt.value }))}
                        className={cn(
                          "px-3.5 py-2 rounded-xl text-sm font-medium border transition-all",
                          active && opt.value !== null
                            ? "bg-tc-green text-tc-paper border-tc-green"
                            : active && opt.value === null
                            ? "border-tc-line text-tc-muted bg-tc-bg-alt"
                            : opt.value === null
                            ? "border-dashed border-tc-line text-tc-muted hover:border-tc-muted"
                            : "bg-tc-bg text-tc-ink border-tc-line hover:border-tc-green/50 hover:bg-tc-green/5"
                        )}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={handleSubmitReanalysis}
              disabled={isReanalyzing}
              className="w-full bg-tc-green text-tc-paper rounded-full py-3.5 text-sm font-semibold hover:bg-[#245038] transition-colors disabled:opacity-60"
            >
              {isReanalyzing ? "Recalculando…" : "Ver resultado atualizado →"}
            </button>
          </div>
        )}

        {/* ── HERO + SUMMARY ───────────────────────────────────────────────── */}
        {(() => {
          // ── Título e subtítulo do hero ──────────────────────────────────────
          let heroTitulo: string;
          let heroSubtitulo: string;

          if (hasErrors) {
            // Em modo inferência: "pontos para verificar" em vez de "erros"
            if (modoInferencia) {
              const total = errorCount;
              heroTitulo = total === 1 ? "1 ponto para verificar" : `${total} pontos para verificar`;
            } else if (legalErrors > 0) {
              heroTitulo = legalErrors === 1 ? "1 violação legal" : `${legalErrors} violações legais`;
            } else {
              heroTitulo = calcErrors === 1 ? "1 erro de cálculo" : `${calcErrors} erros de cálculo`;
            }

            // Subtítulo: descrição curta da irregularidade principal
            const principalLine = result.lines.find(
              l => l.status === "legal_violation" || l.status === "error"
            );
            let descCurta = "";
            if (principalLine) {
              const d = principalLine.description;
              if (/adiantamento.*indevid|2[aª°].*baixa|duplicad.*adiantamento/i.test(d)) {
                descCurta = "desconto duplicado de adiantamento";
              } else if (/indevid|duplicad/i.test(d)) {
                descCurta = "desconto indevido";
              } else if (/paternidade|maternidade/i.test(d)) {
                descCurta = "desconto em licença remunerada";
              } else if (/sal[aá]rio.*m[ií]nimo/i.test(d)) {
                descCurta = "salário abaixo do mínimo legal";
              } else if (/\bfgts\b/i.test(d)) {
                descCurta = "FGTS depositado a menor";
              } else if (/vale.*transporte/i.test(d)) {
                descCurta = "vale-transporte acima do limite";
              } else if (/\binss\b/i.test(d)) {
                descCurta = "INSS cobrado a mais";
              } else if (/\birrf\b/i.test(d)) {
                descCurta = "imposto de renda retido incorretamente";
              } else {
                descCurta = d.toLowerCase();
              }
            }
            const extras = errorCount - 1;
            if (modoInferencia) {
              heroSubtitulo = "podem ser corretos no seu cenário — responda as perguntas para confirmar.";
            } else {
              heroSubtitulo = descCurta
                ? extras > 0
                  ? `${descCurta} e mais ${extras} irregularidade${extras > 1 ? "s" : ""}`
                  : descCurta
                : "Expanda os itens vermelhos abaixo para ver os detalhes.";
            }

          } else if (manualCheckCount > 0) {
            heroTitulo = manualCheckCount === 1 ? "1 item para verificar" : `${manualCheckCount} itens para verificar`;
            heroSubtitulo = "Encontramos pontos que valem uma conferência, mas nenhuma violação clara.";
          } else {
            heroTitulo = "Tá certo ✓";
            heroSubtitulo = "Nenhuma irregularidade encontrada no seu holerite.";
          }

          return (
            <div
              id="hero-card"
              className={cn(
                "gap-4 items-stretch",
                hasErrors ? "grid sm:grid-cols-[1.3fr_1fr]" : "flex"
              )}
            >

              {/* ── Hero ─────────────────────────────────────────────────────── */}
              <div className={cn(
                "relative overflow-hidden rounded-3xl px-6 py-8 text-white min-w-0",
                hasErrors ? "" : "w-full",
                heroBg
              )}>
                <p className="font-display text-3xl font-normal mb-3">{heroTitulo}</p>
                <p className="text-sm text-white/80 leading-relaxed">{heroSubtitulo}</p>

                {hasErrors && impactoReal > 0.05 && (
                  <div className="mt-6 min-w-0">
                    <p className="text-xs text-white/60 mb-1">Valor a ser devolvido</p>
                    <p
                      className="font-display font-semibold leading-tight whitespace-nowrap"
                      style={{ fontSize: "clamp(1.75rem, 5vw, 3rem)", color: "#fff" }}
                    >
                      {brl(impactoReal)}
                    </p>
                  </div>
                )}

                {!hasErrors && manualCheckCount > 0 && (
                  <p className="mt-3 text-xs text-white/60">
                    Expanda os itens azuis abaixo para ver os detalhes.
                  </p>
                )}
              </div>

              {/* ── Resumo "Impacto no seu bolso" — só no cenário vermelho ──── */}
              {hasErrors && (
                <div className="bg-tc-paper border border-tc-line rounded-3xl p-6 flex flex-col justify-center gap-1 min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-tc-muted mb-3">Impacto no seu bolso</p>

                  <div className="flex justify-between items-center gap-3 py-2 border-b border-tc-line">
                    <span className="text-sm text-tc-muted shrink-0">Líquido no holerite</span>
                    <span className="text-sm tabular text-tc-muted whitespace-nowrap">{brl(result.net_declared)}</span>
                  </div>

                  <div className="flex justify-between items-center gap-3 py-2 border-b border-tc-line">
                    <span className="text-sm font-semibold text-tc-ink shrink-0">Valor a ser devolvido</span>
                    <span className="text-sm font-bold tabular whitespace-nowrap" style={{ color: "#8B1A1A" }}>
                      {impactoReal > 0.05 ? `+ ${brl(impactoReal)}` : brl(0)}
                    </span>
                  </div>

                  <div className="flex justify-between items-center gap-3 py-2">
                    <span className="text-sm font-semibold text-tc-ink shrink-0">Líquido corrigido</span>
                    <span className="text-sm font-bold tabular whitespace-nowrap" style={{ color: "#1B4332" }}>
                      {brl(result.net_expected)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── IMPACTO ESTIMADO ─────────────────────────────────────────────── */}
        {hasErrors && (impactoReal > 0.05 || fgtsGap >= 1) && (
          <div className="bg-tc-paper border border-tc-line rounded-2xl p-6 print:hidden">
            <p className="text-[11px] font-bold uppercase tracking-wider text-tc-muted mb-4">Impacto estimado</p>
            <div className="space-y-3">
              {impactoReal > 0.05 && (() => {
                const soRecorrente = impactoRecorrente > 0.05 && impactoPontual <= 0.05;
                const soPontual = impactoPontual > 0.05 && impactoRecorrente <= 0.05;
                const misto = impactoRecorrente > 0.05 && impactoPontual > 0.05;

                if (soRecorrente) {
                  // CASO 1 — só recorrentes: mostra impacto mensal + projeção anual
                  return (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-[var(--tc-ink-soft)]">Valor a ser devolvido (mensal)</span>
                        <span className="font-semibold text-tc-coral tabular">{brl(impactoRecorrente)} a seu favor</span>
                      </div>
                      {projecaoAnual != null && (
                        <div className="flex items-center justify-between pb-3 border-b border-tc-line">
                          <span className="text-sm text-[var(--tc-ink-soft)]">Projeção anual</span>
                          <span className="font-bold text-tc-coral tabular text-lg">{brl(projecaoAnual)}<span className="text-xs font-normal text-tc-muted"> / ano</span></span>
                        </div>
                      )}
                    </>
                  );
                }

                if (soPontual) {
                  // CASO 2 — só pontuais: mostra o valor sem projeção anual
                  return (
                    <div className="flex items-center justify-between pb-3 border-b border-tc-line">
                      <span className="text-sm text-[var(--tc-ink-soft)]">Valor a ser devolvido</span>
                      <span className="font-semibold text-tc-coral tabular">{brl(impactoPontual)} a seu favor</span>
                    </div>
                  );
                }

                if (misto) {
                  // CASO 3 — misto: discrimina recorrente e pontual, projeta só o recorrente
                  return (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-[var(--tc-ink-soft)]">Cobranças indevidas recorrentes</span>
                        <span className="font-semibold text-tc-coral tabular">{brl(impactoRecorrente)}/mês</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-[var(--tc-ink-soft)]">Cobranças pontuais (1x)</span>
                        <span className="font-semibold text-tc-coral tabular">{brl(impactoPontual)}</span>
                      </div>
                      {projecaoAnual != null && (
                        <div className="flex items-center justify-between pb-3 border-b border-tc-line">
                          <span className="text-sm text-[var(--tc-ink-soft)]">Projeção anual (só recorrentes)</span>
                          <span className="font-bold text-tc-coral tabular text-lg">{brl(projecaoAnual)}<span className="text-xs font-normal text-tc-muted"> / ano</span></span>
                        </div>
                      )}
                    </>
                  );
                }

                // fallback (unknown only)
                return (
                  <div className="flex items-center justify-between pb-3 border-b border-tc-line">
                    <span className="text-sm text-[var(--tc-ink-soft)]">Valor a ser devolvido</span>
                    <span className="font-semibold text-tc-coral tabular">{brl(Math.abs(impactoReal))} a seu favor</span>
                  </div>
                );
              })()}
              {fgtsGap >= 1 && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[var(--tc-ink-soft)]">FGTS não depositado</span>
                  <span className="font-semibold text-tc-coral tabular">{brl(fgtsGap)}</span>
                </div>
              )}
            </div>
            <p className="text-[10px] text-tc-muted mt-3 leading-relaxed">
              {impactoRecorrente > 0.05
                ? "Projeção anual considera apenas erros que se repetem todo mês. Valores podem variar."
                : "Estimativa baseada nos dados deste holerite. Valores podem variar mês a mês."}
            </p>
          </div>
        )}

        {/* ── LINES ────────────────────────────────────────────────────────── */}
        <div>
          <h3 className="font-display text-3xl font-normal tracking-tight mb-4">
            Detalhamento <em className="text-tc-ink">linha por linha</em>
          </h3>
        <div className="bg-tc-paper border border-tc-line rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-tc-line">
            <p className="text-[11px] font-semibold text-tc-muted uppercase tracking-wider">Linhas do holerite</p>
          </div>
          {orderedLines.map((line, i) => (
            <LineRow key={i} line={line} />
          ))}
        </div>
        </div>

        {/* ── CAMPOS PULADOS (não-rescisão, sem cenário inferido) ──────────── */}
        {result.campos_pulados && result.campos_pulados.length > 0 && !result.usou_inferencia && (
          <>
            <div className="rounded-2xl bg-tc-accent/8 border border-tc-accent/30 p-5 print:hidden">
              <p className="font-semibold text-tc-accent text-sm mb-2">
                Análise com informações incompletas
              </p>
              <p className="text-sm text-[var(--tc-ink-soft)] leading-relaxed mb-4">
                Alguns campos não foram informados. Usamos os valores padrão da CLT. O resultado pode divergir se sua situação for diferente.
              </p>
              <Link
                href="/audit/new"
                className="inline-flex items-center text-sm font-semibold text-tc-accent border border-tc-accent/40 rounded-xl px-4 py-2 hover:bg-tc-accent/10 transition-colors"
              >
                Refazer com mais detalhes
              </Link>
            </div>
            <div className="hidden print:block mt-4 p-3 border border-tc-line rounded text-xs text-tc-muted">
              Análise com campos não informados — valores padrão CLT utilizados.
            </div>
          </>
        )}

        {/* ── PRÓXIMOS PASSOS ──────────────────────────────────────────────── */}
        {hasErrors && (
          <div className="bg-tc-paper border border-tc-line rounded-2xl p-7 print:hidden">
            <div className="text-xs tracking-widest text-tc-accent font-bold mb-3">O QUE FAZER AGORA</div>
            <h3 className="font-display text-2xl font-normal tracking-tight mb-5">
              Três caminhos, <em className="not-italic text-tc-accent">do mais simples ao formal.</em>
            </h3>
            <div className="grid sm:grid-cols-3 gap-4">
              {[
                { n: "01", t: "Conversar com o RH", d: "Baixe o PDF do relatório e leve ao setor de pessoal. A maioria dos casos se resolve no mês seguinte." },
                { n: "02", t: "Acionar o sindicato", d: "Se o RH não responder, seu sindicato representa você juridicamente e gratuitamente." },
                { n: "03", t: "Procurar advogado", d: "Para casos maiores, procure um advogado trabalhista. Muitos atendem sem custo inicial." },
              ].map((s) => (
                <div key={s.n} className="bg-tc-bg border border-tc-line rounded-xl p-5">
                  <div className="font-mono-tc text-xs text-tc-accent tracking-widest mb-2">{s.n}</div>
                  <div className="font-display text-lg font-medium tracking-tight mb-1">{s.t}</div>
                  <p className="text-xs text-[var(--tc-ink-soft)] leading-relaxed">{s.d}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── ACTIONS ──────────────────────────────────────────────────────── */}
        <div className="space-y-3 print:hidden">
          <button
            type="button"
            onClick={handleShare}
            disabled={shareStatus === "loading"}
            className={cn(
              "w-full py-4 rounded-2xl font-semibold text-sm text-white transition-colors disabled:opacity-50",
              hasErrors ? "bg-tc-coral hover:bg-[#c45a4e]" : "bg-tc-green hover:bg-[#245038]"
            )}
          >
            {shareStatus === "loading" ? "Gerando imagem…" :
             shareStatus === "done" ? "Compartilhado! ✓" :
             "Compartilhar resultado"}
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="w-full py-4 rounded-2xl font-semibold text-sm border-2 border-tc-line text-tc-ink hover:border-tc-green/40 hover:bg-tc-paper transition-colors bg-transparent"
          >
            Gerar relatório para o RH
          </button>

          <p className="text-center text-xs text-tc-muted pt-1 pb-2">
            Auditoria feita em {fmtDatetime(auditDate)}
          </p>

          {/* disclaimer — colapsável na tela, completo no print */}
          <div className="rounded-2xl bg-tc-bg border border-tc-line p-4 print:hidden">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] text-tc-muted leading-relaxed flex-1">
                Esta análise é baseada nas regras gerais da CLT e{" "}
                <strong className="font-medium text-[var(--tc-ink-soft)]">não substitui consultoria jurídica ou contábil.</strong>
              </p>
              <button
                type="button"
                onClick={() => setDisclaimerOpen((o) => !o)}
                className="text-[10px] text-tc-accent whitespace-nowrap underline underline-offset-2 flex-shrink-0"
              >
                {disclaimerOpen ? "Recolher" : "Ver completo"}
              </button>
            </div>
            {disclaimerOpen && (
              <p className="text-[11px] text-tc-muted leading-relaxed mt-3 pt-3 border-t border-tc-line">
                Esta análise é baseada nas regras gerais da CLT, tabelas oficiais de INSS e IRRF, e legislação
                trabalhista federal. Não substitui consultoria jurídica ou contábil. Convenções coletivas da sua
                categoria podem estabelecer condições diferentes (pisos salariais, percentuais de hora extra,
                benefícios adicionais). Em caso de dúvida ou divergência, consulte o sindicato da sua categoria
                ou um advogado trabalhista.{" "}
                <strong className="font-medium text-[var(--tc-ink-soft)]">
                  Este aplicativo não armazena seu holerite nem seus dados pessoais após a análise.
                </strong>
              </p>
            )}
          </div>

          {/* disclaimer completo — apenas no print */}
          <div className="hidden print:block mt-4 p-4 border border-tc-line rounded-xl text-[10px] text-tc-muted leading-relaxed">
            <strong className="block mb-1">Aviso Legal</strong>
            Esta análise é baseada nas regras gerais da CLT, tabelas oficiais de INSS e IRRF, e legislação
            trabalhista federal. Não substitui consultoria jurídica ou contábil. Convenções coletivas da sua
            categoria podem estabelecer condições diferentes. Em caso de dúvida, consulte o sindicato da sua
            categoria ou um advogado trabalhista. Este aplicativo não armazena seu holerite nem seus dados
            pessoais após a análise.
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          body { background: white; }
          #hero-card { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </>
  );
}
