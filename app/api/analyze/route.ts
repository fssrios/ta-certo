import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import type { HoleriteAnalisado } from "@/lib/types";

const anthropic = new Anthropic();

export const maxDuration = 60;

const SYSTEM_PROMPT = `Você é um especialista em folha de pagamento brasileira. Receba o texto extraído por OCR de um holerite e retorne um único objeto JSON com os campos abaixo.

════════════════════════════════════════════════════════
PASSO 1 — CLASSIFICAÇÃO OBRIGATÓRIA (faça ANTES de tudo)
════════════════════════════════════════════════════════

Analise o documento inteiro e preencha "tipoHolerite" com EXATAMENTE um destes valores:

  "folha_mensal"      → salário mensal normal (tem Salário Base, INSS mensal, IRRF mensal)
  "ferias"            → recibo de férias (tem rubrica Férias + 1/3 constitucional)
  "decimo_terceiro_1" → 1ª parcela do 13º salário (paga até novembro; SEM desconto de INSS, SEM IRRF)
  "decimo_terceiro_2" → 2ª parcela do 13º salário (paga em dezembro; TEM INSS e IRRF sobre o total do 13º; geralmente tem desconto "Adiantamento 1ª Parcela" ou "Baixa Adiantamento")
  "plr"               → participação nos lucros/resultados (sem INSS, sem FGTS, IRRF por tabela exclusiva)
  "rescisao"          → rescisão de contrato / TRCT (tem aviso prévio, multa 40%, férias proporcionais)

REGRAS DE CLASSIFICAÇÃO:
- Tem "13º Salário" ou "Décimo Terceiro" + desconto de "Adiantamento" ou "1ª Parcela" → "decimo_terceiro_2"
- Tem "13º Salário" ou "Décimo Terceiro" SEM desconto de adiantamento, competência até novembro → "decimo_terceiro_1"
- Tem "Férias" e "1/3 Constitucional" ou "Adicional de Férias" → "ferias"
- Tem "PLR" ou "Participação nos Lucros" → "plr"
- Tem "Aviso Prévio", "Multa 40%", "TRCT", "Rescisão" → "rescisao"
- Nenhum dos anteriores → "folha_mensal"

════════════════════════════════════════════════════════
PASSO 2 — CAMPOS DE CABEÇALHO (procure no topo do doc)
════════════════════════════════════════════════════════

"dependentes": número de dependentes IRRF declarados.
  Procure: "Dependentes IRRF", "Dep. IRRF", "Nº Dependentes", "DEP", "DEPENDENTES".
  Exemplos: "DEPENDENTES IRRF 1" → 1 | "Dep: 0" → 0 | "Dependentes: 2" → 2
  O número pode estar separado por espaço, dois-pontos ou tabulação.
  IMPORTANTE: 0 é valor válido — retorne 0, NÃO null. Se não encontrar menção: retorne null.

"jornadaMensal": horas mensais contratuais.
  Procure: "Jornada: 220h", "C.H. Mensal: 220,00", "Hrs/Mês: 220", "Jornada Semanal: 44h".
  Conversões: 44h/sem → 220 | 40h/sem → 200 | 36h/sem → 180 | 30h/sem → 150 | 12x36 → 180.
  Também aceito na coluna REFERÊNCIA da linha de Salário Base ("220,00 H" = jornada 220).
  Também aceito no campo Ref./Grau no formato "X/NNN" onde NNN são as horas mensais
    (ex: "01/200" = 200h/mês, "01/220" = 220h/mês, "02/180" = 180h/mês).
    O número após a barra é a jornada mensal; o número antes é irrelevante (grau/nível).
  Se não encontrar: retorne null.

════════════════════════════════════════════════════════
PASSO 3 — CAMPOS DE RESCISÃO (apenas se tipoHolerite === "rescisao")
════════════════════════════════════════════════════════

"dataAdmissao": data de admissão no formato DD/MM/AAAA.
  Procure: "Data de Admissão", "Adm:", "Admissão:", "DT ADM", "Data Admissão", "Início do contrato".
  Formato exigido: DD/MM/AAAA. Se encontrar apenas o ano: null.

"dataRescisao": data de rescisão / afastamento no formato DD/MM/AAAA.
  Procure: "Data de Afastamento", "Data de Rescisão", "Dt. Rescisão", "Rescisão:", "Data de Saída", "Data Demissão".
  Formato exigido: DD/MM/AAAA. Se não encontrar explicitamente, use a data da competência (último dia do mês).

"tipoRescisao": classificar com EXATAMENTE um destes valores:
  "sem_justa_causa"  → demissão pelo empregador sem justa causa (aviso prévio + multa 40% FGTS)
  "pedido_demissao"  → empregado pede demissão (sem multa FGTS, sem seguro-desemprego)
  "acordo_mutuo"     → acordo entre as partes (CLT Art. 484-A) — aviso 50%, multa 20%
  "justa_causa"      → empregado demitido por justa causa (CLT Art. 482) — sem aviso, sem multa, sem 13º prop.
  null               → não foi possível determinar
  Pistas: "Iniciativa: Empregador" ou "Sem Justa Causa" → sem_justa_causa
           "Iniciativa: Empregado" ou "Pedido de Demissão" → pedido_demissao
           "Acordo" ou "Art. 484-A" → acordo_mutuo
           "Justa Causa" ou "Art. 482" → justa_causa

"saldoFGTSAcumulado": saldo total do FGTS acumulado na conta do trabalhador, se declarado no documento.
  Procure: "Saldo FGTS", "Saldo Conta FGTS", "Saldo Fundo de Garantia", "Total FGTS".
  Este campo é o SALDO ACUMULADO (não os depósitos do mês). Normalmente na tabela de FGTS do TRCT.
  Se não encontrar: null.

════════════════════════════════════════════════════════
SCHEMA JSON COMPLETO A RETORNAR
════════════════════════════════════════════════════════

{
  "tipoHolerite": string,
  "dependentes": number | null,
  "jornadaMensal": number | null,
  "dataAdmissao": string | null,
  "dataRescisao": string | null,
  "tipoRescisao": string | null,
  "saldoFGTSAcumulado": number | null,
  "salarioBase": number | null,
  "horasExtras50": { "percentual": number, "quantidade": number, "valor": number } | null,
  "horasExtras100": { "percentual": number, "quantidade": number, "valor": number } | null,
  "adicionalNoturno": { "percentual": number, "quantidade": number, "valor": number } | null,
  "insalubridade": { "grau": string, "valor": number } | null,
  "periculosidade": { "valor": number } | null,
  "dsrSobreVariaveis": number | null,
  "dsrReferencia": { "diasDsr": number, "diasUteis": number } | null,
  "outrosProventos": [{ "descricao": string, "valor": number }],
  "descontoINSS": number | null,
  "descontoIRRF": number | null,
  "descontoVT": number | null,
  "outrosDescontos": [{ "descricao": string, "valor": number }],
  "salarioBruto": number | null,
  "salarioLiquido": number | null,
  "baseFGTS": number | null,
  "valorFGTS": number | null,
  "mesReferencia": string | null,
  "empregador": string | null,
  "cargo": string | null
}

════════════════════════════════════════════════════════
DEMAIS REGRAS
════════════════════════════════════════════════════════

"salarioBase": rubrica principal de remuneração — pode aparecer como "Salário", "Salário Base", "Salário Contratual", "Salário Mensal", "Vencimento", "Remuneração", "Ordenado". NÃO confunda com "13º Salário" — esses são tipos diferentes.
"descontoIRRF": pode aparecer como "IRRF", "Imposto de Renda", "IR Fonte", "IRF", "IRRF 1 dependente", "IRRF 2 dependentes", "IRRF s/ salário", "IR s/ Rendimentos". Se a descrição contém o número de dependentes (ex: "IRRF 1 dependente" → 1 dep., "IRRF 2 dep." → 2 dep.), extraia esse número para o campo "dependentes". ATENÇÃO OCR: quando o texto estiver com colunas embaralhadas, o código 910 ou a palavra "IRRF" seguidos de "1 dependente" identificam a rubrica de IRRF. O valor do IRRF pode aparecer DEPOIS da linha "Totais do empregado" se a tabela do OCR ficou embaralhada — nesse caso, o valor que NÃO for igual ao Total Proventos nem ao Total Descontos é o valor do IRRF. Exemplo: se aparecer "Totais do empregado / R$ 15.000,00 / R$ 15.866,79 / R$ 2.915,16", então R$2.915,16 é o descontoIRRF (os outros dois são os totais). NÃO deixe descontoIRRF como null se houver um valor numérico isolado próximo da rubrica IRRF.
"dependentes": procure "DEPENDENTES IRRF", "DEP. IRRF", "DEPENDENTES IRRE" (OCR pode trocar F por E). O número pode estar na mesma linha ou na linha seguinte.
"adicionalNoturno.quantidade": horas noturnas quando visível (ex: "60,00 h eq" → 60). Sem info: null.
"horasExtras50": use para QUALQUER hora extra abaixo de 100%. Percentual EXATO — NÃO assuma 50%.
"horasExtras100": apenas para hora extra explicitamente a 100% (domingos/feriados).
"dsrReferencia": fração "4/24" → diasDsr: 4, diasUteis: 24. Sem fração: null.
ORDEM DAS RUBRICAS: respeite EXATAMENTE a ordem do holerite. NÃO reorganize.
CLASSIFICAÇÃO crédito/desconto: observe a coluna (Proventos vs Descontos). Descontos incluem: plano saúde, coparticipação dental, seguro de vida, desconto VR/VA, adiantamento/antecipação salarial, baixa adiantamento.
Campos ausentes: retorne null. Não invente valores.
OCR ilegível: indique com "camposIncertos": ["nome do campo"].
NUNCA crie rubricas a partir da linha de LÍQUIDO, NET PAY ou TOTAIS do holerite. O líquido é um resultado, não uma rubrica. Se o líquido for negativo, NÃO o trate como desconto. Extraia APENAS as linhas listadas na tabela de proventos/descontos, entre os cabeçalhos (Código/Descrição/Referência/Proventos/Descontos) e a linha de Totais.
TABELA DE RODAPÉ DO TRCT: Documentos de rescisão frequentemente têm uma tabela de rodapé ou bloco de resumo com campos como "SAL.BASE", "FGTS MÊS", "FGTS ACUM.", "BASE CALC. IRRF", "VALOR LÍQUIDO", "INSS MÊS". Esses campos são INFORMATIVOS/REFERÊNCIA — NÃO os trate como rubricas de proventos ou descontos. NÃO preencha "salarioBase" a partir desse rodapé. O campo "salarioBase" deve vir SOMENTE de uma rubrica explícita na tabela de proventos (ex: "Salário Base", "Salário Mensal"). Atenção: datas de admissão e rescisão costumam aparecer nesse mesmo bloco de rodapé — extraia-as para "dataAdmissao" e "dataRescisao" normalmente.

Retorne APENAS o objeto JSON, sem markdown, sem explicações, sem texto antes ou depois. A primeira linha da sua resposta deve ser "{" e a última deve ser "}".`;

export async function POST(request: Request) {
  const body = await request.json() as { rawText: string };
  if (!body.rawText?.trim()) {
    return NextResponse.json({ error: "rawText é obrigatório" }, { status: 400 });
  }

  console.log("[DEBUG ANALYZE] rawText length:", body.rawText.length);

  let message;
  try {
    message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Texto extraído do holerite por OCR:\n\n${body.rawText}`,
        },
      ],
    });
  } catch (err) {
    console.error("[DEBUG ANALYZE] Erro na chamada Claude API:", err);
    return NextResponse.json({ error: "Erro ao chamar IA" }, { status: 502 });
  }

  const content = message.content[0];
  console.log("[DEBUG ANALYZE] content.type:", content.type, "| stop_reason:", message.stop_reason);

  if (message.stop_reason === "max_tokens") {
    console.error("[DEBUG ANALYZE] Resposta truncada — max_tokens atingido. Tokens usados:", message.usage);
    return NextResponse.json({ error: "Holerite muito complexo para processar. Tente uma versão simplificada." }, { status: 502 });
  }

  if (content.type !== "text") {
    return NextResponse.json({ error: "Resposta inesperada da IA" }, { status: 502 });
  }

  console.log("[DEBUG ANALYZE] IA raw response (primeiros 1000):\n", content.text.substring(0, 1000));

  // Extrai o bloco JSON mesmo que a IA adicione texto antes/depois
  const jsonMatch = content.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error("[DEBUG ANALYZE] Nenhum JSON encontrado na resposta. Texto completo:\n", content.text.substring(0, 1000));
    return NextResponse.json({ error: "IA não retornou JSON válido" }, { status: 502 });
  }
  const json = jsonMatch[0];

  let analisado: HoleriteAnalisado;
  try {
    analisado = JSON.parse(json) as HoleriteAnalisado;
  } catch (err) {
    console.error("[DEBUG ANALYZE] JSON.parse falhou. Texto recebido:\n", json.substring(0, 500));
    console.error("[DEBUG ANALYZE] Erro:", err);
    return NextResponse.json({ error: "IA retornou resposta inválida (não é JSON)" }, { status: 502 });
  }

  console.log("[DEBUG ANALYZE] tipoHolerite:", analisado.tipoHolerite, "| salarioBase:", analisado.salarioBase, "| lines:", (analisado as unknown as Record<string, unknown[]>).lines?.length ?? "n/a");

  return NextResponse.json({ analisado });
}
