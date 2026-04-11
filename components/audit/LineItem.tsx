"use client";

import { useState } from "react";
import type { AuditLine, LineStatus } from "@/lib/types";

const STATUS_DOT: Record<LineStatus, { color: string; label: string }> = {
  ok: { color: "bg-green-500", label: "Correto" },
  error: { color: "bg-red-500", label: "Divergência" },
  warning: { color: "bg-yellow-400", label: "Atenção" },
  info: { color: "bg-gray-300", label: "Informativo" },
};

export function LineItem({ line }: { line: AuditLine }) {
  const [open, setOpen] = useState(false);
  const dot = STATUS_DOT[line.status];
  const hasDivergence = line.status === "error" || line.status === "warning";

  return (
    <li>
      <button
        onClick={() => hasDivergence && setOpen((o) => !o)}
        className={`w-full text-left px-5 py-3.5 grid grid-cols-[1fr_auto_auto_auto] gap-4 items-center ${
          hasDivergence ? "hover:bg-gray-50 cursor-pointer" : "cursor-default"
        }`}
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

        <span
          className={`text-sm text-right tabular-nums whitespace-nowrap ${
            hasDivergence ? "text-gray-500" : "text-gray-400"
          }`}
        >
          {hasDivergence ? fmt(line.expected_value) : "—"}
        </span>

        <span className="w-5 text-gray-300 text-sm">
          {hasDivergence ? (open ? "▲" : "▼") : ""}
        </span>
      </button>

      {open && line.note && (
        <div
          className={`mx-5 mb-3 rounded-lg px-4 py-3 text-xs ${
            line.status === "error"
              ? "bg-red-50 text-red-700 border border-red-100"
              : "bg-yellow-50 text-yellow-800 border border-yellow-100"
          }`}
        >
          <p className="font-medium mb-0.5">
            {line.status === "error" ? "Divergência detectada" : "Atenção"}
          </p>
          <p>{line.note}</p>
          <p className="mt-1 font-medium">
            Diferença: {line.difference >= 0 ? "+" : ""}
            {fmt(line.difference)}
          </p>
        </div>
      )}
    </li>
  );
}

function fmt(n: number) {
  return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
