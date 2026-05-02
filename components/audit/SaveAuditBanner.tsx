"use client";

import Link from "next/link";
import { trackSaveClicked } from "@/lib/analytics";

export function SaveAuditBanner() {
  return (
    <div className="bg-tc-paper border border-tc-line rounded-2xl p-5 mb-4 flex flex-col sm:flex-row sm:items-center gap-4">
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-tc-ink text-sm">
          Salve este resultado no seu histórico
        </p>
        <p className="text-xs text-tc-muted mt-0.5 leading-snug">
          Entre na sua conta para guardar esta auditoria e comparar com meses anteriores.
          Sem cadastro — só seu email.
        </p>
      </div>
      <Link
        href="/login?next=/save-pending"
        onClick={trackSaveClicked}
        className="flex-shrink-0 bg-tc-green text-tc-paper rounded-full px-5 py-2.5 text-sm font-semibold hover:bg-[#245038] transition-colors text-center"
      >
        Salvar resultado
      </Link>
    </div>
  );
}
