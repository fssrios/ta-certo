"use client";

import { useEffect, useState } from "react";
import { getPendingAudit, type PendingAudit } from "@/lib/utils/audit-quota";
import { createClient } from "@/lib/supabase/client";
import { AuditResult } from "@/components/audit/AuditResult";
import { analisadoParaParsed } from "@/lib/converters/analyzed-to-parsed";
import { SaveAuditBanner } from "@/components/audit/SaveAuditBanner";
import Link from "next/link";

export default function ResultadoPage() {
  const [pending, setPending] = useState<PendingAudit | null | "loading">("loading");
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const data = getPendingAudit();
    setPending(data);
    if (!data) return;

    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsLoggedIn(!!session);
    });
  }, []);

  if (pending === "loading") {
    return (
      <div className="min-h-screen bg-tc-bg">
        <header className="bg-tc-paper border-b border-tc-line px-5 sm:px-10 py-4 flex items-center sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-tc-green text-tc-paper rounded-lg grid place-items-center font-display font-semibold text-base">tc</div>
            <span className="font-display text-lg font-medium tracking-tight">Tá Certo.</span>
          </div>
        </header>
        <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
          <div className="h-48 w-full rounded-3xl bg-tc-paper border border-tc-line animate-pulse" />
          <div className="h-32 w-full rounded-2xl bg-tc-paper border border-tc-line animate-pulse" />
          <div className="h-64 w-full rounded-2xl bg-tc-paper border border-tc-line animate-pulse" />
        </div>
      </div>
    );
  }

  if (!pending) {
    return (
      <div className="min-h-screen bg-tc-bg flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-tc-muted text-sm">Nenhuma auditoria encontrada.</p>
        <Link
          href="/audit/new"
          className="bg-tc-green text-tc-paper rounded-full px-6 py-3 text-sm font-semibold hover:bg-[#245038] transition-colors"
        >
          Auditar holerite →
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-tc-bg">
      <header className="bg-tc-paper border-b border-tc-line px-5 sm:px-10 py-4 flex items-center justify-between sticky top-0 z-10">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-8 h-8 bg-tc-green text-tc-paper rounded-lg grid place-items-center font-display font-semibold text-base">tc</div>
          <span className="font-display text-lg font-medium tracking-tight">Tá Certo.</span>
        </Link>
        {!isLoggedIn && (
          <Link
            href="/login"
            className="bg-tc-green text-tc-paper rounded-full px-4 py-2 text-xs font-semibold hover:bg-[#245038] transition-colors"
          >
            Salvar resultado
          </Link>
        )}
      </header>

      <div className="max-w-2xl mx-auto px-4 py-8">
        {!isLoggedIn && <SaveAuditBanner />}
        <AuditResult
          result={pending.result}
          createdAt={pending.savedAt}
          parsedData={analisadoParaParsed(pending.analisado)}
        />
      </div>
    </div>
  );
}
