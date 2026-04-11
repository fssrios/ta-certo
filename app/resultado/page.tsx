"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getPendingAudit, type PendingAudit } from "@/lib/utils/audit-quota";
import { createClient } from "@/lib/supabase/client";
import { AuditResult } from "@/components/audit/AuditResult";
import { SaveAuditBanner } from "@/components/audit/SaveAuditBanner";
import Link from "next/link";

export default function ResultadoPage() {
  const router = useRouter();
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
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
        <div className="animate-spin text-3xl">⏳</div>
      </div>
    );
  }

  if (!pending) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-gray-500 text-sm">Nenhuma auditoria encontrada.</p>
        <Link
          href="/audit/new"
          className="rounded-xl bg-green-600 px-6 py-3 text-sm font-semibold text-white hover:bg-green-700"
        >
          Auditar holerite
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      {/* minimal header */}
      <header className="bg-white border-b px-5 py-3 flex items-center justify-between sticky top-0 z-10">
        <Link href="/" className="font-bold text-green-700 text-lg tracking-tight">
          Tá Certo?
        </Link>
        {!isLoggedIn && (
          <Link
            href="/login"
            className="rounded-lg bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-700 transition-colors"
          >
            Entrar
          </Link>
        )}
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {!isLoggedIn && <SaveAuditBanner />}
        <AuditResult result={pending.result} createdAt={pending.savedAt} />
      </div>
    </div>
  );
}
