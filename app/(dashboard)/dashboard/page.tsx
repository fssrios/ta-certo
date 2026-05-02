import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import type { Auditoria } from "@/lib/types";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: auditorias } = await supabase
    .from("auditorias")
    .select("id, created_at, mes_referencia, empregador, cargo, diferenca_total, qtd_erros")
    .eq("user_id", user!.id)
    .order("created_at", { ascending: false })
    .limit(30);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl font-normal tracking-tight">Meus holerites</h1>
          <p className="text-sm text-tc-muted mt-1">Histórico de auditorias</p>
        </div>
      </div>

      {!auditorias || auditorias.length === 0 ? (
        <div className="bg-tc-paper border border-tc-line rounded-2xl py-20 px-8 text-center">
          <div className="text-4xl mb-4">📄</div>
          <div className="font-display text-2xl font-normal mb-2">Nenhum holerite ainda</div>
          <p className="text-sm text-tc-muted max-w-xs mx-auto leading-relaxed">
            Faça upload do seu primeiro holerite para conferir se os cálculos estão corretos.
          </p>
          <Link
            href="/audit/new"
            className="mt-7 inline-flex items-center gap-2 bg-tc-green text-tc-paper rounded-full px-7 py-3.5 text-sm font-semibold hover:bg-[#245038] transition-colors"
          >
            Verificar meu holerite →
          </Link>
        </div>
      ) : (
        <ul className="space-y-2">
          {(auditorias as Auditoria[]).map((a) => (
            <li key={a.id}>
              <Link href={`/audit/${a.id}`}>
                <div className="bg-tc-paper border border-tc-line rounded-xl px-5 py-4 flex items-center justify-between gap-4 hover:border-tc-green/40 hover:shadow-sm transition-all cursor-pointer group">
                  <div className="flex items-center gap-4 min-w-0 flex-1">
                    <StatusDot qtdErros={a.qtd_erros} />
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-tc-ink truncate group-hover:text-tc-green transition-colors">
                        {a.mes_referencia ? `Competência ${a.mes_referencia}` : "Holerite"}
                        {a.empregador && (
                          <span className="font-normal text-tc-muted"> · {a.empregador}</span>
                        )}
                      </p>
                      <p className="text-xs text-tc-muted mt-0.5">
                        {new Date(a.created_at).toLocaleDateString("pt-BR")}
                        {a.cargo && ` · ${a.cargo}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <StatusChip qtdErros={a.qtd_erros} diferencaTotal={a.diferenca_total} />
                    <span className="text-tc-muted group-hover:text-tc-green transition-colors text-sm">›</span>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusDot({ qtdErros }: { qtdErros: number | null }) {
  if (qtdErros === null) return <div className="w-2.5 h-2.5 rounded-full bg-tc-muted flex-shrink-0" />;
  if (qtdErros === 0) return <div className="w-2.5 h-2.5 rounded-full bg-tc-green flex-shrink-0" />;
  return <div className="w-2.5 h-2.5 rounded-full bg-tc-coral flex-shrink-0" />;
}

function StatusChip({
  qtdErros,
  diferencaTotal,
}: {
  qtdErros: number | null;
  diferencaTotal: number | null;
}) {
  if (qtdErros === null) return null;

  if (qtdErros === 0) {
    return (
      <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-tc-green/10 text-tc-green">
        Tudo certo ✓
      </span>
    );
  }

  const deficit =
    diferencaTotal !== null
      ? Math.abs(diferencaTotal).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
      : null;

  return (
    <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-tc-coral/10 text-tc-coral">
      {deficit ? `-${deficit}` : `${qtdErros} erro${qtdErros > 1 ? "s" : ""}`}
    </span>
  );
}
