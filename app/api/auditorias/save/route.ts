import { createClient } from "@/lib/supabase/server";
import { auditarHolerite } from "@/lib/clt/rules";
import { analisadoParaParsed } from "@/lib/converters/analyzed-to-parsed";
import { salvarAuditoria } from "@/lib/db/auditorias";
import { NextResponse } from "next/server";
import type { HoleriteAnalisado, AuditResult } from "@/lib/types";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as {
    analisado: HoleriteAnalisado;
    // result can come pre-calculated (save-pending flow) or be recalculated here
    result?: AuditResult;
  };

  if (!body.analisado) {
    return NextResponse.json({ error: "analisado é obrigatório" }, { status: 400 });
  }

  const result = body.result ?? auditarHolerite(analisadoParaParsed(body.analisado));

  const id = await salvarAuditoria({
    userId: user.id,
    analisado: body.analisado,
    result,
  });

  return NextResponse.json({ id });
}
