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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">Meus holerites</h1>
        <Link
          href="/audit/new"
          className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 transition-colors"
        >
          Novo holerite
        </Link>
      </div>

      {!auditorias || auditorias.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">📄</p>
          <p className="font-medium text-gray-600">Nenhum holerite ainda</p>
          <p className="text-sm mt-1">Faça upload do seu primeiro holerite para começar</p>
          <Link
            href="/audit/new"
            className="mt-6 inline-block rounded-lg bg-green-600 px-6 py-2 text-sm font-medium text-white hover:bg-green-700"
          >
            Verificar holerite
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {(auditorias as Auditoria[]).map((a) => (
            <li key={a.id}>
              <Link
                href={`/audit/${a.id}`}
                className="flex items-center justify-between bg-white rounded-xl border px-5 py-4 hover:border-green-300 transition-colors group"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900 group-hover:text-green-700 truncate">
                    {a.mes_referencia
                      ? `Competência ${a.mes_referencia}`
                      : "Holerite"}
                    {a.empregador && (
                      <span className="font-normal text-gray-500"> · {a.empregador}</span>
                    )}
                  </p>
                  <p className="text-sm text-gray-400 mt-0.5">
                    {new Date(a.created_at).toLocaleDateString("pt-BR")}
                    {a.cargo && ` · ${a.cargo}`}
                  </p>
                </div>
                <div className="flex items-center gap-3 ml-3 flex-shrink-0">
                  <StatusBadge qtdErros={a.qtd_erros} diferencaTotal={a.diferenca_total} />
                  <span className="text-gray-300 group-hover:text-green-400">›</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusBadge({
  qtdErros,
  diferencaTotal,
}: {
  qtdErros: number | null;
  diferencaTotal: number | null;
}) {
  if (qtdErros === null) return null;

  if (qtdErros === 0) {
    return (
      <span className="text-xs bg-green-100 text-green-700 rounded-full px-2.5 py-0.5">
        Tudo certo
      </span>
    );
  }

  const deficit =
    diferencaTotal !== null
      ? Math.abs(diferencaTotal).toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        })
      : null;

  return (
    <span className="text-xs bg-red-100 text-red-700 rounded-full px-2.5 py-0.5">
      {deficit ? `-${deficit}` : `${qtdErros} erro${qtdErros > 1 ? "s" : ""}`}
    </span>
  );
}
