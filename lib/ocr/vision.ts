export async function extractTextFromImage(base64Image: string, mimeType: string): Promise<string> {
  const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_CLOUD_VISION_API_KEY not set");

  const body = {
    requests: [
      {
        image: { content: base64Image },
        features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
      },
    ],
  };

  const res = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Vision API error: ${err}`);
  }

  const data = await res.json();
  const fullText: string =
    data.responses?.[0]?.fullTextAnnotation?.text ?? "";

  return fullText;
}

export async function extractTextFromPDF(base64PDF: string): Promise<string> {
  // Para PDFs, usa o mesmo endpoint com inputConfig
  const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_CLOUD_VISION_API_KEY not set");

  // Vision API não aceita PDF diretamente via base64 no endpoint síncrono.
  // Solução: enviar como imagem JPEG/PNG. Para PDFs, o cliente deve converter
  // a primeira página ou usar o endpoint assíncrono (GCS).
  // Aqui assumimos que o frontend converte PDF para imagem antes do envio.
  throw new Error(
    "PDF deve ser convertido para imagem no cliente antes do envio"
  );
}
