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
  IMPORTANTE: 0 é valor válido — retorne 0, NÃO null. Se não encontrar menção: retorne null.

"jornadaMensal": horas mensais contratuais.
  Procure: "Jornada: 220h", "C.H. Mensal: 220,00", "Hrs/Mês: 220", "Jornada Semanal: 44h".
  Conversões: 44h/sem → 220 | 40h/sem → 200 | 36h/sem → 180 | 30h/sem → 150.
  Também aceito no campo Ref./Grau no formato "X/NNN" onde NNN são as horas mensais.
  Se não encontrar: retorne null.

════════════════════════════════════════════════════════
PASSO 3 — CAMPOS DE RESCISÃO (apenas se tipoHolerite === "rescisao")
════════════════════════════════════════════════════════

"dataAdmissao": data de admissão no formato DD/MM/AAAA.
"dataRescisao": data de rescisão / afastamento no formato DD/MM/AAAA.
"tipoRescisao": "sem_justa_causa" | "pedido_demissao" | "acordo_mutuo" | "justa_causa" | null
  - "Iniciativa: Empregador" / "Sem Justa Causa" → "sem_justa_causa"
  - "Iniciativa: Empregado" / "Pedido de Demissão" → "pedido_demissao"
  - "Acordo" / "Art. 484-A" → "acordo_mutuo"
  - "Justa Causa" / "Art. 482" → "justa_causa"

════════════════════════════════════════════════════════
PASSO 4 — SCHEMA ESPECÍFICO DE RESCISÃO (apenas se tipoHolerite === "rescisao")
════════════════════════════════════════════════════════

═══════════════════════════════════════════════════════════════
REGRA CRÍTICA — PRESERVAR CADA LINHA DO TRCT SEPARADA
═══════════════════════════════════════════════════════════════

NUNCA some, consolide ou agrupe linhas distintas do TRCT, mesmo que pareçam redundantes ou tenham descrições similares. Cada linha do recibo é uma rubrica contábil distinta com tratamento legal diferente (tributação, FGTS, projeção do aviso).

Exemplos do que NUNCA fazer:
❌ Somar "Rescisão Férias Adicionais" (R$ 270,17) + "Rescisão Férias Ind. Adicionais" (R$ 27,02) em uma única "ferias_adicionais": 297.19
❌ Somar "Rescisão 13° Salário 1/12 Indenizado" + "Rescisão 13° Salário 1/12 Ind. Adic." em um único campo
❌ Consolidar duas linhas com descrições parecidas porque "parecem ser a mesma coisa"

O que SEMPRE fazer:
✓ Criar UMA entrada na lista "lines" para CADA linha do TRCT, com sua descrição EXATA e valor EXATO
✓ Manter "Rescisão Férias Adicionais" (R$ 270,17) e "Rescisão Férias Ind. Adicionais" (R$ 27,02) como DUAS linhas separadas
✓ Se uma linha tem "Ind." ou "Indenizado" ou "Indenizadas" no nome, ela é DIFERENTE da linha sem essa palavra — preservar a distinção
✓ Para os campos numéricos do schema verbasRescisao (ferias_adicionais, decimo_terceiro_adicionais, etc.), use APENAS a linha que casa exatamente com o nome do campo, sem somar variantes "Indenizadas" ou "Ind."

ATENÇÃO ESPECIAL — verbas indenizatórias (1/12 e Ind.):
Linhas com "1/12 Indenizado", "Ind. Adic.", "Ind. Adicionais", "Indenizado" ou "Indenizadas" são REFLEXOS DO AVISO PRÉVIO INDENIZADO (Súmula 371 TST). Elas NÃO sofrem INSS nem IRRF (Tema 478 STJ, Súmula 215/386 STJ). Por isso PRECISAM aparecer como linhas separadas no JSON, com a descrição original preservada (incluindo "Ind." ou "Indenizad*"), pra que o motor de auditoria as identifique e exclua das bases tributárias.

═══════════════════════════════════════════════════════════════

QUANDO tipoHolerite === "rescisao", você DEVE preencher os seguintes campos ADICIONAIS no JSON,
ao invés de tentar encaixar as verbas rescisórias em "outrosProventos" ou "outrosDescontos".

Estes campos têm regras DIFERENTES de holerite mensal — leia com atenção.

────────────────────────────────────────────────────────
"salarioBaseContratual": number | null
────────────────────────────────────────────────────────
Salário base do contrato (NÃO confundir com saldo de salário).
Vem SOMENTE de uma rubrica explícita "Salário Base", "Salário Mensal", "Salário Contratual"
NA TABELA DE PROVENTOS, OU do rodapé/resumo do TRCT em campo identificado como "SAL.BASE",
"Salário Base", "Sal. Base Contrat.".
NÃO confundir com "Saldo Salário Rescisão" (que é o pago pelos dias trabalhados no mês).
Se não encontrar: null.

────────────────────────────────────────────────────────
"adicionais_habituais": Array<{ descricao: string, valor: number }> | null
────────────────────────────────────────────────────────
Adicionais que integravam a remuneração mensal e são pagos PROPORCIONAL aos dias trabalhados
no mês da rescisão. Aparecem no TRCT na tabela de proventos, geralmente próximos ao saldo de salário.
Exemplos: "Insalubridade", "Periculosidade", "Adicional Tempo de Serviço", "Gratificação de Função",
"Adicional Noturno Habitual", "Quebra de Caixa".
NÃO incluir aqui as rubricas de "férias adicionais" ou "13º adicionais" (essas vão em "outras_verbas").
Se não houver: null ou array vazio.

────────────────────────────────────────────────────────
"verbasRescisao": objeto com TODOS os campos abaixo (use null para os ausentes)
────────────────────────────────────────────────────────

{
  "saldo_salario": { "valor": number, "dias": number } | null,
  "aviso_previo_indenizado": { "valor": number, "dias": number | null } | null,
  "aviso_previo_trabalhado": { "valor": number, "dias": number | null } | null,
  "decimo_terceiro_proporcional": { "valor": number, "avos": number | null } | null,
  "decimo_terceiro_adicionais": number | null,
  "decimo_terceiro_indenizado": number | null,
  "ferias_proporcionais": { "valor": number, "avos": number | null } | null,
  "terco_ferias_proporcionais": number | null,
  "ferias_vencidas": number | null,
  "terco_ferias_vencidas": number | null,
  "ferias_indenizadas": number | null,
  "terco_ferias_indenizadas": number | null,
  "ferias_adicionais": number | null,
  "multa_rescisoria": number | null,
  "inss_rescisao": number | null,
  "inss_13": number | null,
  "irrf": number | null,
  "outras_verbas": Array<{ "descricao": string, "valor": number, "tipo": "credito" | "desconto" }>
}

REGRAS DE PREENCHIMENTO — leia COM ATENÇÃO:

▸ REGRA CRÍTICA DAS COLUNAS DO TRCT: Cada linha de rubrica do TRCT tipicamente tem TRÊS COLUNAS NUMÉRICAS: (1) referência/quantidade (ex: "30,00" para 30 dias, ou "12,00" para 12 meses), (2) base de cálculo (ex: "4.517,00" salário base usado pra calcular), (3) valor efetivamente pago (ex: "4.841,20" o que entra no líquido). O VALOR QUE VAI EM CADA CAMPO DE verbasRescisao É SEMPRE A ÚLTIMA COLUNA NUMÉRICA DA LINHA — o valor pago, NÃO a base de cálculo do meio. Exemplo concreto extraído de TRCT real: "60 Saldo Salário Rescisão | 30,00 | 4.517,00 | 4.841,20" → saldo_salario.valor = 4841.20 (NÃO 4517.00). "62 Rescisão Férias Indenizadas | 4.517,00 | 376,42" → ferias_indenizadas = 376.42 (a última coluna). Quando há AMBIGUIDADE entre dois números na mesma linha, prefira o ÚLTIMO valor da direita.

▸ "saldo_salario": rubrica que contém "saldo" + "salário" + ("rescisão" ou "do mês" ou similar).
  É o valor pago pelos dias trabalhados no mês da rescisão. NORMALMENTE inclui adicionais
  habituais já somados (ex: salário base 4.517 + insalubridade 324 = saldo 4.841 para 30 dias).
  NÃO confundir com "Salário Base" (esse vai em "salarioBaseContratual").
  "dias": número de dias trabalhados no mês — geralmente vai em coluna de referência (ex: "30,00", "15").

▸ "aviso_previo_indenizado": rubrica que contém "aviso prévio" + ("indenizado" / "a pagar" / "não cumprido").
  É indenização — NÃO é salário. Empresa demite e paga o aviso ao invés do empregado trabalhar.
  "dias": dias de aviso quando explícito (30, 33, 36, 39, ..., 90).

▸ "aviso_previo_trabalhado": rubrica "aviso prévio trabalhado" ou "aviso prévio cumprido".
  É quando o empregado cumpriu o aviso. Geralmente APARECE no holerite do mês de aviso, não no TRCT.

▸ "decimo_terceiro_proporcional": rubrica "13º proporcional", "Décimo Terceiro Proporcional",
  "13º Salário Proporcional". É a fração do 13º do ano corrente até a rescisão.
  "avos": número de avos quando visível (ex: "3,00", "11" — meses trabalhados no ano).

▸ "decimo_terceiro_adicionais": rubrica que contém "13º" + "adicionais" / "adicional".
  São adicionais (insalubridade, etc.) proporcionais SOBRE o 13º proporcional.
  Ex: "13º Adicionais", "Rescisão 13º Salário Adicionais".

▸ "decimo_terceiro_indenizado": rubrica "13º 1/12 indenizado", "13º proporcional indenizado",
  "13º Salário Aviso Prévio". É 1/12 do 13º referente ao período do aviso indenizado.

▸ "ferias_proporcionais": "férias proporcionais", fração do período aquisitivo INCOMPLETO.
  "avos": meses trabalhados no período aquisitivo atual (ex: "10/12").

▸ "terco_ferias_proporcionais": rubrica "1/3 férias proporcionais" / "1/3 sobre férias proporcionais"
  / "Terço Constitucional Férias Proporcionais". Geralmente = ferias_proporcionais / 3.

▸ "ferias_vencidas": rubrica "férias vencidas" — período aquisitivo COMPLETO já adquirido
  mas NÃO gozado pelo empregado (passou do período concessivo).

▸ "terco_ferias_vencidas": "1/3 férias vencidas" / "Terço Constitucional Férias Vencidas".

▸ "ferias_indenizadas": rubrica "férias indenizadas". É período aquisitivo COMPLETO não gozado
  pago como indenização na rescisão. NÃO confundir com "férias adicionais"
  (que são adicionais sobre férias, ex: insalubridade proporcional sobre férias).

▸ "terco_ferias_indenizadas": "1/3 férias indenizadas" / "Terço Constitucional Férias Indenizadas".

▸ "ferias_adicionais": rubrica "férias adicionais" / "Rescisão Férias Adicionais".
  São adicionais (insalubridade, etc.) proporcionais SOBRE as férias. NÃO é o 1/3 constitucional.
  Se houver dois (um sobre prop e um sobre indenizadas), some os dois aqui.

▸ "multa_rescisoria": rubrica "multa rescisória", "multa 40%", "multa FGTS", "indenização FGTS",
  "indenização 40%". É a multa que a empresa paga sobre o saldo total do FGTS.

▸ "inss_rescisao": valor de INSS calculado SOBRE O SALDO DE SALÁRIO (e adicionais habituais).
  PROCURE A RUBRICA "INSS" na coluna de descontos — é UM VALOR ESPECÍFICO, NÃO o total de descontos.
  Pode aparecer como "INSS Rescisão", "INSS s/ Saldo", "INSS Mensal" (no contexto do TRCT).
  Se houver duas linhas de INSS (uma do saldo, uma do 13º), esta é a do SALDO.
  ATENÇÃO: NÃO some todos os descontos. Pegue APENAS o INSS sobre o saldo de salário.

▸ "inss_13": valor de INSS calculado SOBRE O 13º PROPORCIONAL, separadamente.
  Aparece como "INSS 13º", "INSS s/ 13º", "INSS Décimo Terceiro" — uma linha SEPARADA do INSS do saldo.
  Se não houver linha separada para INSS do 13º: null (provavelmente foi calculado com saldo).

▸ "irrf": valor de IRRF total da rescisão. SEMPRE retorne um número, NUNCA null. Em 2026 a faixa de isenção é R$ 3.036/mês — se a "Base IRRF" no rodapé do TRCT for menor que 3.036 e não houver linha de desconto IRRF visível, retorne 0 (zero). Só retorne null se você não tiver CERTEZA se houve IRRF ou não.

▸ "outras_verbas": qualquer rubrica que NÃO se encaixa nos campos acima vai aqui.
  Use a descrição EXATA do TRCT. Marque "tipo": "credito" para proventos, "desconto" para descontos.
  Exemplos comuns: contribuição sindical, plano de saúde, adiantamento já recebido, vale-transporte,
  desconto de aviso (se empregado pediu demissão), pensão alimentícia, etc.

REGRA DE OURO: Se um campo NÃO existir explicitamente no documento → retorne null.
NÃO INVENTE. NÃO derive valores por cálculo. NÃO some campos para preencher outro.
Cada campo vem de UMA rubrica específica do TRCT.

────────────────────────────────────────────────────────
"totais": objeto com totais informados no rodapé do TRCT
────────────────────────────────────────────────────────

{
  "total_vencimentos": number | null,
  "total_descontos": number | null,
  "liquido": number | null
}

Procure: "Total Vencimentos", "Total Proventos", "Total Créditos", "Total Descontos",
"Líquido a Receber", "Valor Líquido", "Total Líquido". Esses são valores INFORMATIVOS do rodapé.

────────────────────────────────────────────────────────
"fgts": informações do FGTS no TRCT
────────────────────────────────────────────────────────

{
  "deposito_mes": number | null,
  "saldo_acumulado": number | null
}

"deposito_mes": valor do FGTS depositado na competência da rescisão (ex: "FGTS Mês", "Depósito FGTS").
"saldo_acumulado": SALDO TOTAL acumulado na conta FGTS do trabalhador
(ex: "FGTS Acumulado", "Saldo FGTS", "Total FGTS"). Usado para calcular a multa 40%.

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
  "salarioBaseContratual": number | null,
  "adicionais_habituais": Array<{ "descricao": string, "valor": number }> | null,
  "verbasRescisao": { ... } | null,
  "totais": { ... } | null,
  "fgts": { ... } | null,
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

QUANDO tipoHolerite === "rescisao":
  - PREENCHA verbasRescisao, salarioBaseContratual, adicionais_habituais, totais, fgts.
  - DEIXE outrosProventos e outrosDescontos VAZIOS (use [] ou null) — as verbas rescisórias
    devem ir SOMENTE em verbasRescisao para evitar duplicação. Use outras_verbas (dentro
    de verbasRescisao) para coisas que não cabem no schema estruturado.
  - NÃO preencha salarioBase a partir do "Saldo Salário" — use null se só houver saldo.
  - descontoINSS, descontoIRRF: pode preencher com inss_rescisao+inss_13 e irrf, ou deixar null
    (o motor usa preferencialmente os valores em verbasRescisao).

QUANDO tipoHolerite !== "rescisao":
  - Mantenha o comportamento antigo. NÃO preencha verbasRescisao / salarioBaseContratual /
    adicionais_habituais / totais / fgts (use null).

════════════════════════════════════════════════════════
DEMAIS REGRAS (válidas para todos os tipos)
════════════════════════════════════════════════════════

"salarioBase": rubrica principal de remuneração mensal — "Salário", "Salário Base", "Salário Contratual",
"Salário Mensal", "Vencimento", "Remuneração", "Ordenado". NÃO confunda com "13º Salário" ou
"Saldo Salário Rescisão". EM RESCISÃO: deixe null e use salarioBaseContratual.

"descontoIRRF": "IRRF", "Imposto de Renda", "IR Fonte", "IRF". Se a descrição contém o número
de dependentes (ex: "IRRF 1 dependente"), extraia esse número para "dependentes".

"adicionalNoturno.quantidade": horas noturnas quando visível.

"horasExtras50": use para QUALQUER hora extra abaixo de 100%. Percentual EXATO — NÃO assuma 50%.

"horasExtras100": apenas para hora extra explicitamente a 100% (domingos/feriados).

"dsrReferencia": fração "4/24" → diasDsr: 4, diasUteis: 24. Sem fração: null.

ORDEM DAS RUBRICAS: respeite EXATAMENTE a ordem do holerite. NÃO reorganize.

CLASSIFICAÇÃO crédito/desconto: observe a coluna (Proventos vs Descontos).

Campos ausentes: retorne null. Não invente valores.

OCR ilegível: indique com "camposIncertos": ["nome do campo"].

NUNCA crie rubricas a partir da linha de LÍQUIDO, NET PAY ou TOTAIS.

TABELA DE RODAPÉ DO TRCT: campos como "SAL.BASE", "FGTS MÊS", "FGTS ACUM.", "BASE CALC. IRRF",
"VALOR LÍQUIDO", "INSS MÊS" são INFORMATIVOS. Use:
  - "SAL.BASE" → salarioBaseContratual
  - "FGTS MÊS" → fgts.deposito_mes
  - "FGTS ACUM." → fgts.saldo_acumulado E saldoFGTSAcumulado
  - "VALOR LÍQUIDO" → totais.liquido
NÃO os trate como rubricas de proventos/descontos.

ATENÇÃO ESPECIAL — saldoFGTSAcumulado:
O campo "FGTS" ou "BASE FGTS" no rodapé do holerite/TRCT é a BASE DE CÁLCULO do FGTS do mês
(saldo de salário + aviso indenizado), NÃO o saldo total acumulado na conta vinculada do trabalhador.
NÃO preencha saldoFGTSAcumulado com esse valor.
Só preencha saldoFGTSAcumulado se o documento mostrar claramente "Saldo Acumulado FGTS",
"Saldo Total FGTS", "FGTS Acumulado" identificado como saldo da conta — o que é raro em holerites comuns.
Quando em dúvida: deixe null.

Retorne APENAS o objeto JSON, sem markdown, sem explicações, sem texto antes ou depois.
A primeira linha da sua resposta deve ser "{" e a última deve ser "}".`;

export async function POST(request: Request) {
  const body = await request.json() as { rawText: string };
  if (!body.rawText?.trim()) {
    return NextResponse.json({ error: "rawText é obrigatório" }, { status: 400 });
  }

  console.log("[DEBUG ANALYZE] rawText length:", body.rawText.length);
  console.log("[DEBUG ANALYZE] rawText FULL:\n" + body.rawText);

  let message;
  try {
    message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
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

  console.log("[DEBUG ANALYZE] IA raw response COMPLETA:\n" + content.text);

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
