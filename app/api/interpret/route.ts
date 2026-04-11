import { createClient } from "@/lib/supabase/server";
import { interpretarHolerite } from "@/lib/ai/interpret";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { rawText } = await request.json() as { rawText: string };
  if (!rawText?.trim()) {
    return NextResponse.json({ error: "rawText é obrigatório" }, { status: 400 });
  }

  const parsedData = await interpretarHolerite(rawText);
  return NextResponse.json({ parsedData });
}
