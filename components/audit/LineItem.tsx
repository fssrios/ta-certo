"use client";

import { useState } from "react";
import type { AuditLine, LineStatus } from "@/lib/types";

const STATUS_DOT: Record<LineStatus, { color: string; label: string }> = {
  ok:              { color: "bg-[#155724]",  label: "Correto" },
  error:           { color: "bg-[#DC3545]",  label: "Erro de Cálculo" },
  warning:         { color: "bg-[#DC3545]",  label: "Atenção" },
  info:            { color: "bg-gray-300",   label: "Informativo" },
  legal_violation: { color: "bg-[#8B1A1A]",  label: "Violação Legal" },
  unverifiable:    { color: "bg-[#1A4B8B]",  label: "Não verificável" },
  manual_check:    { color: "bg-[#1A4B8B]",  label: "Verificação manual" },
};

export function LineItem({ line }: { line: AuditLine }) {
  const [open, setOpen] = useState(false);
  const dot = STATUS_DOT[line.status];
  const isOk = line.status === "ok" || line.status === "info";
  const isManualCheck = line.status === "manual_check";
  const hasDivergence =
    line.status === "error" ||
    line.status === "warning" ||
    line.status === "legal_violation" ||
    line.status === "unverifiable" ||
    isManualCheck;

  return (
    <li>
      <button
        onClick={() => hasDivergence && setOpen((o) => !o)}
        className={`w-full text-left px-5 py-3.5 items-center ${
          isOk
            ? "grid grid-cols-[1fr_auto] gap-4"
            : "grid grid-cols-[1fr_auto_auto_auto] gap-4"
        } ${hasDivergence ? "hover:bg-gray-50 cursor-pointer" : "cursor-default"}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dot.color}`}
            title={dot.label}
          />
          <span className="text-sm text-gray-800 truncate">{line.description}</span>
          {line.kind === "deduction" && (
            <span className="text-xs text-gray-400 flex-shrink-0">(desc.)</span>
          )}
        </div>

        <span className="text-sm text-gray-700 text-right tabular-nums whitespace-nowrap">
          {fmt(line.declared_value)}
        </span>

        {!isOk && (
          <span
            className={`text-sm text-right tabular-nums whitespace-nowrap ${
              hasDivergence ? "text-gray-500" : "text-gray-400"
            }`}
          >
            {isManualCheck ? "?" : hasDivergence ? fmt(line.expected_value) : "—"}
          </span>
        )}

        {!isOk && (
          <span className="w-5 text-gray-300 text-sm">
            {hasDivergence ? (open ? "▲" : "▼") : ""}
          </span>
        )}
      </button>

      {open && (
        <div className="mx-5 mb-3">
          {isManualCheck && line.scenarios ? (
            <div className="rounded-lg px-4 py-3 text-xs bg-blue-50 border border-blue-200 text-blue-900">
              <p className="font-medium mb-2">Verifique você mesmo</p>
              {line.note && <p className="mb-2 text-blue-700">{line.note}</p>}
              <ul className="space-y-1.5">
                {line.scenarios.map((s, i) => (
                  <li key={i} className="flex items-center justify-between gap-2">
                    <span className="text-blue-700">{s.label} → <strong>{fmt(s.expected)}</strong></span>
                    {s.matches ? (
                      <span className="text-[#155724] font-medium whitespace-nowrap">✅ Confere</span>
                    ) : (
                      <span className="text-[#DC3545] font-medium whitespace-nowrap">
                        ❌ {fmt(Math.abs(s.difference))} a {s.difference < 0 ? "menos" : "mais"}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              {line.tip && (
                <p className="mt-2 text-blue-500 italic">💡 {line.tip}</p>
              )}
            </div>
          ) : line.note ? (
            <div
              className={`rounded-lg px-4 py-3 text-xs ${
                line.status === "legal_violation"
                  ? "bg-[#FFF5F5] text-[#721C24] border border-[#DC3545]"
                  : line.status === "error" || line.status === "warning"
                  ? "bg-[#FFF5F5] text-[#721C24] border border-[#F5C6CB]"
                  : "bg-[#EFF6FF] text-[#0C4A6E] border border-[#B8DAFF]"
              }`}
            >
              <p className="font-medium mb-0.5">
                {line.status === "legal_violation"
                  ? `Violação Legal${line.legal_citation ? ` — ${line.legal_citation}` : ""}`
                  : line.status === "error"
                  ? "Erro de cálculo detectado"
                  : line.status === "warning"
                  ? "Atenção"
                  : "Verifique você mesmo"}
              </p>
              <p className="whitespace-pre-wrap">{line.note}</p>
              <p className="mt-1 font-medium">
                Diferença: {line.difference >= 0 ? "+" : ""}
                {fmt(line.difference)}
              </p>
            </div>
          ) : null}
        </div>
      )}
    </li>
  );
}

function fmt(n: number) {
  return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
