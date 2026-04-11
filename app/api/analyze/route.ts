import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import type { HoleriteAnalisado } from "@/lib/types";

const anthropic = new Anthropic();

const SYSTEM_PROMPT = `Você é um especialista em folha de pagamento brasileira. Receba o texto extraído por OCR de um holerite e extraia os seguintes campos em JSON:

{
  "salarioBase": number,
  "horasExtras50": { "quantidade": number, "valor": number },
  "horasExtras100": { "quantidade": number, "valor": number },
  "adicionalNoturno": { "percentual": number, "valor": number },
  "insalubridade": { "grau": string, "valor": number },
  "periculosidade": { "valor": number },
  "dsrSobreVariaveis": number,
  "outrosProventos": [{ "descricao": string, "valor": number }],
  "descontoINSS": number,
  "descontoIRRF": number,
  "descontoVT": number,
  "outrosDescontos": [{ "descricao": string, "valor": number }],
  "salarioBruto": number,
  "salarioLiquido": number,
  "baseFGTS": number,
  "valorFGTS": number,
  "mesReferencia": string,
  "empregador": string,
  "cargo": string
}

Se algum campo não estiver presente no holerite, retorne null para esse campo. Não invente valores. Se o OCR estiver ilegível em algum trecho, indique com o campo "camposIncertos": ["nome do campo"].

Retorne APENAS o objeto JSON, sem markdown, sem explicações.`;

export async function POST(request: Request) {
  const body = await request.json() as { rawText: string };
  if (!body.rawText?.trim()) {
    return NextResponse.json({ error: "rawText é obrigatório" }, { status: 400 });
  }

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Texto extraído do holerite por OCR:\n\n${body.rawText}`,
      },
    ],
  });

  const content = message.content[0];
  if (content.type !== "text") {
    return NextResponse.json({ error: "Resposta inesperada da IA" }, { status: 502 });
  }

  // Remove possível markdown do modelo
  const json = content.text
    .trim()
    .replace(/^```json?\s*/i, "")
    .replace(/\s*```$/, "");

  const analisado = JSON.parse(json) as HoleriteAnalisado;

  return NextResponse.json({ analisado });
}
