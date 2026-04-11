"use client";

import Link from "next/link";

export function SaveAuditBanner() {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 mb-4 flex flex-col sm:flex-row sm:items-center gap-4">
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-amber-900 text-sm">
          💾 Salve este resultado no seu histórico
        </p>
        <p className="text-xs text-amber-700 mt-0.5">
          Entre na sua conta para guardar esta auditoria e comparar com meses anteriores.
          Sem cadastro — só seu email.
        </p>
      </div>
      <Link
        href="/login?next=/save-pending"
        className="flex-shrink-0 rounded-xl bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white
                   hover:bg-amber-700 active:bg-amber-800 transition-colors text-center"
      >
        Salvar resultado
      </Link>
    </div>
  );
}
