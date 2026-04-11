import { createClient } from "@/lib/supabase/server";
import type { HoleriteAnalisado, AuditResult } from "@/lib/types";

export async function salvarAuditoria(params: {
  userId: string;
  analisado: HoleriteAnalisado;
  result: AuditResult;
  imagemUrl?: string;
}): Promise<string> {
  const { userId, analisado, result, imagemUrl } = params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("auditorias")
    .insert({
      user_id: userId,
      mes_referencia: analisado.mesReferencia,
      empregador: analisado.empregador,
      cargo: analisado.cargo,
      imagem_url: imagemUrl ?? null,
      dados_extraidos: analisado,
      dados_calculados: result,
      diferenca_total: result.total_difference,
      qtd_erros: result.summary.total_errors,
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id as string;
}
