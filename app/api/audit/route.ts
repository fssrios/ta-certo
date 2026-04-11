import { auditarHolerite } from "@/lib/clt/rules";
import { NextResponse } from "next/server";
import type { ParsedHolerite } from "@/lib/types";

export async function POST(request: Request) {
  const { parsedData } = await request.json() as { parsedData: ParsedHolerite };

  if (!parsedData) {
    return NextResponse.json({ error: "parsedData é obrigatório" }, { status: 400 });
  }

  const auditResult = auditarHolerite(parsedData);
  return NextResponse.json({ auditResult });
}
