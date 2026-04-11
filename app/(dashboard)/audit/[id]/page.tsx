import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { AuditResult } from "@/components/audit/AuditResult";
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
          <h1 className="text-lg font-bold text-gray-900 truncate">
            {auditoria.mes_referencia
              ? `Competência ${auditoria.mes_referencia}`
              : "Resultado da auditoria"}
          </h1>
          {(auditoria.empregador || auditoria.cargo) && (
            <p className="text-sm text-gray-400 mt-0.5 truncate">
              {[auditoria.empregador, auditoria.cargo].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <Link href="/dashboard" className="text-sm text-gray-400 hover:text-gray-600 ml-4 flex-shrink-0">
          ← Voltar
        </Link>
      </div>

      <AuditResult
        result={auditoria.dados_calculados!}
        createdAt={auditoria.created_at}
      />
    </div>
  );
}
