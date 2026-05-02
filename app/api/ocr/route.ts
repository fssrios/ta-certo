import { extractTextFromImage, extractTextFromPDF } from "@/lib/ocr/vision";
import { NextResponse } from "next/server";

// Aumenta o limite do body para 10 MB (PDFs e imagens de alta resolução)
export const maxDuration = 30;

export async function POST(request: Request) {
  let body: { base64?: string; mimeType?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const { base64, mimeType } = body;

  if (!base64 || !mimeType) {
    return NextResponse.json({ error: "base64 e mimeType são obrigatórios" }, { status: 400 });
  }

  try {
    let rawText: string;

    if (mimeType === "application/pdf") {
      rawText = await extractTextFromPDF(base64);
    } else {
      const supportedImages = ["image/jpeg", "image/png", "image/webp", "image/gif"];
      if (!supportedImages.includes(mimeType)) {
        return NextResponse.json(
          { error: `Formato não suportado: ${mimeType}. Use JPEG, PNG, WebP ou PDF.` },
          { status: 400 }
        );
      }
      rawText = await extractTextFromImage(base64, mimeType);
    }

    console.log("[DEBUG OCR] mimeType:", mimeType, "| chars extraídos:", rawText.length);
    console.log("[DEBUG OCR] primeiros 2000 chars:\n", rawText.substring(0, 2000));

    if (!rawText.trim()) {
      return NextResponse.json(
        { error: "Não foi possível extrair texto do arquivo. Verifique se o holerite está legível." },
        { status: 422 }
      );
    }

    return NextResponse.json({ rawText });
  } catch (err) {
    console.error("[OCR] erro:", err);
    const message = err instanceof Error ? err.message : "Erro no OCR";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
