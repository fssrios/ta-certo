"use client";

import { useState } from "react";
import type { AuditResult as AuditResultType, AuditLine } from "@/lib/types";
import { generateResultImage } from "@/lib/share/generate-result-image";

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

/** A positive difference on a deduction means overcharged (bad).
 *  A negative difference on a credit means underpaid (bad). */
function diffIsDamaging(line: AuditLine): boolean {
  if (line.kind === "deduction") return line.difference > 0.05;
  if (line.kind === "credit") return line.difference < -0.05;
  return false;
}

// ── LineRow ───────────────────────────────────────────────────────────────────

function LineRow({ line }: { line: AuditLine }) {
  const [open, setOpen] = useState(false);

  const isErr = line.status === "error";
  const isWarn = line.status === "warning";
  const hasNote = !!line.note && (isErr || isWarn);

  const iconCls =
    isErr
      ? "bg-red-100 text-red-600"
      : isWarn
      ? "bg-amber-100 text-amber-600"
      : line.status === "info"
      ? "bg-blue-100 text-blue-500"
      : "bg-green-100 text-green-600";

  const iconChar = isErr ? "✕" : isWarn ? "!" : line.status === "info" ? "i" : "✓";

  const kindCls =
    line.kind === "credit"
      ? "bg-green-50 text-green-700"
      : line.kind === "deduction"
      ? "bg-red-50 text-red-700"
      : "bg-gray-100 text-gray-500";

  const kindLabel =
    line.kind === "credit"
      ? "Crédito"
      : line.kind === "deduction"
      ? "Desconto"
      : "Info";

  const absDiff = Math.abs(line.difference);
  const diffLabel =
    absDiff < 0.05
      ? "—"
      : line.difference > 0
      ? `+${brl(line.difference)}`
      : brl(line.difference);

  const diffCls =
    absDiff < 0.05
      ? "text-gray-400"
      : diffIsDamaging(line)
      ? "text-red-600"
      : "text-green-600";

  return (
    <div className="border-b border-gray-100 last:border-0">
      <button
        type="button"
        disabled={!hasNote}
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left"
        aria-expanded={open}
      >
        <div className="flex items-start gap-3 py-4 px-4">
          {/* status circle */}
          <span
            className={`mt-0.5 flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center
                        text-[11px] font-bold select-none ${iconCls}`}
          >
            {iconChar}
          </span>

          <div className="flex-1 min-w-0">
            {/* name + kind pill */}
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-medium text-gray-900 truncate">
                {line.description}
              </span>
              <span
                className={`flex-shrink-0 text-[11px] px-1.5 py-0.5 rounded-full font-medium ${kindCls}`}
              >
                {kindLabel}
              </span>
            </div>

            {/* three-column values */}
            <div className="grid grid-cols-3 gap-x-2 text-xs">
              <div>
                <p className="text-gray-400 mb-0.5">No holerite</p>
                <p className="font-medium text-gray-700 tabular-nums">
                  {brl(line.declared_value)}
                </p>
              </div>
              <div>
                <p className="text-gray-400 mb-0.5">Correto</p>
                <p className="font-medium text-gray-700 tabular-nums">
                  {brl(line.expected_value)}
                </p>
              </div>
              <div>
                <p className="text-gray-400 mb-0.5">Diferença</p>
                <p className={`font-semibold tabular-nums ${diffCls}`}>{diffLabel}</p>
              </div>
            </div>
          </div>

          {hasNote && (
            <span
              className={`flex-shrink-0 text-gray-400 text-xs mt-1 transition-transform duration-150
                          ${open ? "rotate-180" : ""}`}
              aria-hidden
            >
              ▾
            </span>
          )}
        </div>
      </button>

      {/* expanded explanation */}
      {open && line.note && (
        <div
          className={`mx-4 mb-3 px-3 py-2.5 rounded-xl text-xs leading-relaxed
            ${isErr
              ? "bg-red-50 text-red-700 border border-red-100"
              : "bg-amber-50 text-amber-700 border border-amber-100"}`}
        >
          {line.note}
        </div>
      )}
    </div>
  );
}

// ── SummaryRow ────────────────────────────────────────────────────────────────

function SummaryRow({
  label,
  declared,
  expected,
}: {
  label: string;
  declared: number;
  expected: number;
}) {
  const ok = Math.abs(declared - expected) < 0.05;
  return (
    <div className="flex items-center justify-between py-2 text-sm">
      <span className="text-gray-600">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-gray-400 tabular-nums">{brl(declared)}</span>
        <span className="text-gray-300 text-xs">→</span>
        <span className={`font-semibold tabular-nums ${ok ? "text-green-600" : "text-red-600"}`}>
          {brl(expected)}
        </span>
      </div>
    </div>
  );
}

// ── AuditResult ───────────────────────────────────────────────────────────────

export function AuditResult({
  result,
  createdAt,
}: {
  result: AuditResultType;
  createdAt?: string;
}) {
  const [shareStatus, setShareStatus] = useState<"idle" | "loading" | "done">("idle");

  const hasErrors = result.summary.total_errors > 0;
  // positive → worker should have received more
  const deficit = result.net_expected - result.net_declared;
  const auditDate = createdAt ? new Date(createdAt) : new Date();

  async function handleShare() {
    if (shareStatus === "loading") return;
    setShareStatus("loading");

    try {
      const blob = await generateResultImage({
        hasErrors,
        errorCount: result.summary.total_errors,
        deficit,
        inss: { declared: result.summary.inss_declared, expected: result.summary.inss_expected },
        irrf: { declared: result.summary.irrf_declared, expected: result.summary.irrf_expected },
        net:  { declared: result.net_declared,          expected: result.net_expected          },
        appUrl: process.env.NEXT_PUBLIC_APP_URL?.replace(/^https?:\/\//, "") ?? "tacerto.com.br",
      });

      const file = new File([blob], "resultado-holerite.png", { type: "image/png" });
      const url  = window.location.href;
      const text = hasErrors
        ? `Encontrei ${result.summary.total_errors} erro(s) no meu holerite — deveria receber ${brl(deficit)} a mais!`
        : "Meu holerite está correto! Confira pelo Tá Certo?";

      if (navigator.canShare?.({ files: [file] })) {
        // native share sheet with image (WhatsApp, etc.)
        await navigator.share({ title: "Tá Certo? — Resultado", text, files: [file], url });
      } else if (navigator.share) {
        // native share without file (URL only)
        await navigator.share({ title: "Tá Certo?", text, url });
      } else {
        // desktop fallback: download the image
        const objUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objUrl;
        a.download = "resultado-holerite.png";
        a.click();
        URL.revokeObjectURL(objUrl);
      }

      setShareStatus("done");
      setTimeout(() => setShareStatus("idle"), 3000);
    } catch {
      // user cancelled or generation error — reset silently
      setShareStatus("idle");
    }
  }

  // credits first, deductions second, info last
  const orderedLines = [
    ...result.lines.filter((l) => l.kind === "credit"),
    ...result.lines.filter((l) => l.kind === "deduction"),
    ...result.lines.filter((l) => l.kind === "info"),
  ];

  return (
    <>
      {/* print header (hidden on screen) */}
      <div className="hidden print:block mb-6">
        <p className="text-lg font-bold">Relatório de Auditoria — Tá Certo?</p>
        <p className="text-sm text-gray-500">{fmtDatetime(auditDate)}</p>
      </div>

      <div className="space-y-4 pb-10">

        {/* ── HERO CARD ────────────────────────────────────────────────────── */}
        <div
          id="hero-card"
          className={`relative overflow-hidden rounded-3xl p-6 text-white shadow-lg
            ${hasErrors ? "bg-[#DC2626]" : "bg-[#16A34A]"}`}
        >
          {/* decorative rings */}
          <div
            className="absolute -right-10 -top-10 w-44 h-44 rounded-full bg-white/10 pointer-events-none"
            aria-hidden
          />
          <div
            className="absolute -left-6 -bottom-6 w-28 h-28 rounded-full bg-white/10 pointer-events-none"
            aria-hidden
          />

          <div className="relative">
            {hasErrors ? (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xl" aria-hidden>⚠️</span>
                  <span className="text-sm font-semibold uppercase tracking-widest text-white/80">
                    {result.summary.total_errors === 1
                      ? "1 erro encontrado"
                      : `${result.summary.total_errors} erros encontrados`}
                  </span>
                </div>

                {deficit > 0.05 && (
                  <>
                    <p className="text-base font-medium text-red-100 mb-1">
                      Você deveria receber
                    </p>
                    <p className="text-5xl font-extrabold tracking-tight leading-none mb-1 tabular-nums">
                      {brl(deficit)}
                    </p>
                    <p className="text-base font-medium text-red-100 mb-5">
                      a mais este mês
                    </p>
                  </>
                )}

                <div className="border-t border-white/20 pt-4 flex items-center justify-between">
                  <p className="text-xs text-red-200 leading-snug max-w-[75%]">
                    Mostre este relatório ao RH ou ao seu sindicato.
                  </p>
                  <p className="text-xs font-bold text-white/40 tracking-widest">
                    Tá Certo?
                  </p>
                </div>
              </>
            ) : (
              <>
                <span className="text-4xl mb-4 block" aria-hidden>✅</span>
                <p className="text-2xl font-bold mb-1">Seu holerite está correto!</p>
                <p className="text-green-100 text-sm mb-5">
                  Todos os cálculos conferem com as regras da CLT 2026.
                </p>
                <div className="border-t border-white/20 pt-4 flex items-center justify-between">
                  <p className="text-xs text-green-200">
                    Líquido: {brl(result.net_declared)} · Bruto: {brl(result.gross_salary)}
                  </p>
                  <p className="text-xs font-bold text-white/40 tracking-widest">
                    Tá Certo?
                  </p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── SUMMARY (errors only) ─────────────────────────────────────────── */}
        {hasErrors && (
          <div className="bg-white rounded-2xl shadow-sm px-4 pt-3 pb-1">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
              Resumo dos cálculos
            </p>
            <SummaryRow
              label="INSS"
              declared={result.summary.inss_declared}
              expected={result.summary.inss_expected}
            />
            <SummaryRow
              label="IRRF"
              declared={result.summary.irrf_declared}
              expected={result.summary.irrf_expected}
            />
            <SummaryRow
              label="FGTS (depósito patronal)"
              declared={result.summary.fgts_declared}
              expected={result.summary.fgts_expected}
            />
            <div className="border-t border-gray-100 mt-2 pt-2 pb-3 flex items-center justify-between text-sm">
              <span className="font-semibold text-gray-700">Salário líquido</span>
              <div className="flex items-center gap-2">
                <span className="text-gray-400 tabular-nums line-through">
                  {brl(result.net_declared)}
                </span>
                <span className="text-gray-300 text-xs">→</span>
                <span className="font-bold text-green-600 tabular-nums">
                  {brl(result.net_expected)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ── LINES ─────────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 pt-4 pb-1">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              Linhas do holerite
            </p>
          </div>
          {orderedLines.map((line, i) => (
            <LineRow key={i} line={line} />
          ))}
        </div>

        {/* ── FOOTER ─────────────────────────────────────────────────────────── */}
        <div className="space-y-3 print:hidden">
          <button
            type="button"
            onClick={handleShare}
            disabled={shareStatus === "loading"}
            className={`w-full py-4 rounded-2xl font-semibold text-sm transition-opacity
              disabled:opacity-70 active:opacity-80
              ${hasErrors ? "bg-[#DC2626] text-white" : "bg-[#16A34A] text-white"}`}
          >
            {shareStatus === "loading"
              ? "Gerando imagem…"
              : shareStatus === "done"
              ? "Compartilhado! ✓"
              : "Compartilhar resultado"}
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="w-full py-4 rounded-2xl font-semibold text-sm border-2 border-gray-200
                       text-gray-700 bg-white transition-colors active:bg-gray-50"
          >
            Gerar relatório para o RH
          </button>

          <p className="text-center text-xs text-gray-400 pt-1 pb-2">
            Auditoria feita em {fmtDatetime(auditDate)}
          </p>
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
