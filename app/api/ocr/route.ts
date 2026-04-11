import { extractTextFromImage } from "@/lib/ocr/vision";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.json();
  const { base64, mimeType } = body as { base64: string; mimeType: string };

  if (!base64 || !mimeType) {
    return NextResponse.json({ error: "base64 e mimeType são obrigatórios" }, { status: 400 });
  }

  const supportedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!supportedTypes.includes(mimeType)) {
    return NextResponse.json(
      { error: "Formato não suportado. Use JPEG, PNG ou WebP." },
      { status: 400 }
    );
  }

  const rawText = await extractTextFromImage(base64, mimeType);
  return NextResponse.json({ rawText });
}
