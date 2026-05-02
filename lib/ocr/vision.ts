export async function extractTextFromImage(base64Image: string, mimeType: string): Promise<string> {
  const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_CLOUD_VISION_API_KEY not set");

  const res = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            image: { content: base64Image },
            features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
          },
        ],
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    console.error("[Vision] images:annotate error:", err);
    throw new Error(`Vision API error: ${err}`);
  }

  const data = await res.json();
  const fullText: string = data.responses?.[0]?.fullTextAnnotation?.text ?? "";
  return fullText;
}

/**
 * Extrai texto de PDF via Vision API files:annotate (endpoint síncrono nativo para PDF).
 * Suporta até ~20 MB de base64. Extrai as primeiras 5 páginas.
 */
export async function extractTextFromPDF(base64PDF: string): Promise<string> {
  const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_CLOUD_VISION_API_KEY not set");

  const res = await fetch(
    `https://vision.googleapis.com/v1/files:annotate?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            inputConfig: {
              content: base64PDF,
              mimeType: "application/pdf",
            },
            features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
            pages: [1, 2, 3, 4, 5],
          },
        ],
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    console.error("[Vision] files:annotate error:", err);
    throw new Error(`Vision PDF error: ${err}`);
  }

  const data = await res.json();

  // files:annotate tem resposta aninhada: responses[0].responses[n]
  const pageResponses: Array<{ fullTextAnnotation?: { text: string } }> =
    data.responses?.[0]?.responses ?? [];

  const fullText = pageResponses
    .map((r) => r.fullTextAnnotation?.text ?? "")
    .join("\n\n")
    .trim();

  return fullText;
}
