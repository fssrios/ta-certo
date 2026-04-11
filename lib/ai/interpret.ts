import Anthropic from "@anthropic-ai/sdk";
import type { ParsedHolerite } from "@/lib/types";

const client = new Anthropic();

const SYSTEM_PROMPT = `Você é um especialista em folha de pagamento brasileira (CLT).
Extraia e estruture os dados de um holerite a partir de texto bruto de OCR.

Retorne APENAS um objeto JSON válido, sem markdown, sem comentários, sem explicações extras.

Schema esperado:
{
  "employee_name": string,
  "employer_name": string,
  "cpf": string | null,
  "cnpj": string | null,
  "competencia": string,           // "MM/AAAA"
  "gross_salary": number,          // soma dos proventos (créditos)
  "dependents": number,            // número de dependentes IRRF (default 0)
  "dias_uteis_no_mes": number,     // dias úteis no mês (default 22 se não informado)
  "domingos_feriados": number,     // domingos + feriados no mês (default 4 se não informado)
  "lines": [
    {
      "code": string | null,       // código da verba se houver
      "description": string,       // exatamente como aparece no holerite
      "type": string,              // ver tipos abaixo
      "kind": "credit" | "deduction" | "info",
      "declared_value": number,    // sempre positivo, em R$
      "basis": number | null,      // base: qtd horas para extras/noturno; valor base para DSR
      "rate": number | null        // fator: 1.5 para HE50%, 2.0 para HE100%, 0.2 para noturno
    }
  ]
}

TIPOS VÁLIDOS para "type":
  salario_base, hora_extra_50, hora_extra_100, adicional_noturno,
  dsr, dsr_sobre_variaveis, ferias, adicional_ferias, decimo_terceiro,
  insalubridade, periculosidade,
  inss, irrf, fgts,
  vale_transporte, vale_refeicao, vale_alimentacao, plano_saude,
  outros_creditos, outros_descontos

REGRAS de kind:
  - "credit": salario_base, hora_extra_*, adicional_noturno, dsr*, ferias,
              adicional_ferias, decimo_terceiro, insalubridade, periculosidade, outros_creditos
  - "deduction": inss, irrf, vale_transporte, vale_refeicao, vale_alimentacao,
                 plano_saude, outros_descontos
  - "info": fgts (depósito do empregador, não desconta do líquido)

REGRAS de basis:
  - hora_extra_50 / hora_extra_100 / adicional_noturno: basis = número de horas trabalhadas
  - dsr_sobre_variaveis: basis = valor total das verbas variáveis base do cálculo
  - outros: basis = null

Para IRRF isento: inclua a linha com declared_value: 0.
Para campos não encontrados no holerite: use null.`;

export async function interpretarHolerite(rawText: string): Promise<ParsedHolerite> {
  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Texto extraído do holerite:\n\n${rawText}`,
      },
    ],
  });

  const content = message.content[0];
  if (content.type !== "text") {
    throw new Error("Resposta inesperada da IA");
  }

  // Remove possível markdown se o modelo incluir
  const json = content.text.trim().replace(/^```json?\n?/, "").replace(/\n?```$/, "");
  const parsed = JSON.parse(json) as ParsedHolerite;

  if (!parsed.lines || !Array.isArray(parsed.lines)) {
    throw new Error("IA retornou estrutura inválida: campo 'lines' ausente");
  }

  return parsed;
}
