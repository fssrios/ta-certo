import { auditarHolerite } from "@/lib/clt/rules";
import { NextResponse } from "next/server";
import type { ParsedHolerite } from "@/lib/types";

export async function POST(request: Request) {
  const { parsedData } = await request.json() as { parsedData: ParsedHolerite };

  if (!parsedData) {
    return NextResponse.json({ error: "parsedData é obrigatório" }, { status: 400 });
  }

  console.log("[ANALYZE] tipo_holerite:", parsedData.tipo_holerite_confirmado);
  console.log("[ANALYZE] data_admissao:", parsedData.data_admissao, "data_rescisao:", parsedData.data_rescisao);
  console.log("[ANALYZE] tipo_rescisao:", parsedData.tipo_rescisao);
  console.log("[ANALYZE] linhas extraídas:");
  parsedData.lines.forEach((l, i) => console.log(`  [${i}] ${l.kind} ${l.type} | ${l.description} = ${l.declared_value}`));

  const auditResult = auditarHolerite(parsedData);
  return NextResponse.json({ auditResult });
}
