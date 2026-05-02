import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { AuditDetailClient } from "@/components/audit/AuditDetailClient";
import type { Auditoria } from "@/lib/types";
import Link from "next/link";

export default async function AuditDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data } = await supabase
    .from("auditorias")
    .select("*")
    .eq("id", id)
    .eq("user_id", user!.id)
    .single();

  if (!data || !data.dados_calculados) notFound();

  const auditoria = data as Auditoria;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-normal tracking-tight truncate">
            {auditoria.mes_referencia
              ? `Competência ${auditoria.mes_referencia}`
              : "Resultado da auditoria"}
          </h1>
          {(auditoria.empregador || auditoria.cargo) && (
            <p className="text-sm text-tc-muted mt-0.5 truncate">
              {[auditoria.empregador, auditoria.cargo].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <Link href="/dashboard" className="text-sm text-tc-muted hover:text-tc-ink transition-colors ml-4 flex-shrink-0">
          ← Voltar
        </Link>
      </div>

      <AuditDetailClient auditoria={auditoria} />
    </div>
  );
}
