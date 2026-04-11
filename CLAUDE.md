# Tá Certo? — Auditor de Holerite CLT

## O que é o projeto

App web que audita contracheques CLT brasileiros. O usuário fotografa ou faz upload
do holerite; o app extrai os dados via OCR, interpreta com IA e compara cada linha
com os valores calculados pela legislação vigente (tabelas 2026).

Resultado: semáforo verde/vermelho por linha + total da diferença líquida.

## Stack

- **Framework**: Next.js 15 com App Router, TypeScript strict
- **Estilo**: Tailwind CSS
- **Auth + DB**: Supabase (magic link por email, PostgreSQL, Storage)
- **OCR**: Google Cloud Vision API (DOCUMENT_TEXT_DETECTION)
- **IA**: Anthropic Claude API (claude-sonnet-4-6) — interpreta OCR → JSON estruturado
- **Deploy**: Vercel

## Fluxo de dados

```
Foto/imagem
  → POST /api/ocr        → Google Vision → rawText
  → POST /api/interpret  → Claude API   → ParsedHolerite (JSON)
  → POST /api/audit      → CLT Engine   → AuditResult
  → Supabase DB          → salvo na tabela audits
  → /audit/[id]          → exibido com semáforo por linha
```

## Estrutura de pastas

```
app/
  (auth)/login/          página de login (magic link)
  (dashboard)/
    dashboard/           lista de holerites do usuário
    audit/new/           upload + processamento
    audit/[id]/          resultado da auditoria
  api/
    auth/callback/       callback Supabase auth
    ocr/                 POST { base64, mimeType } → { rawText }
    interpret/           POST { rawText } → { parsedData: ParsedHolerite }
    audit/               POST { auditId, parsedData } → { auditResult }
  actions/auth.ts        Server Action de signOut

components/
  auth/LoginForm.tsx     formulário de magic link
  upload/FileUpload.tsx  upload com progresso por etapas (usa FileReader, não Buffer)
  audit/
    AuditResult.tsx      exibe resultado completo
    LineItem.tsx         linha individual com semáforo (expandível)
    SummaryCard.tsx      cards INSS / IRRF / FGTS / Diferença líquida

lib/
  clt/
    engine.ts            MOTOR PRINCIPAL — toda a lógica CLT 2026
    inss.ts              tabela progressiva INSS 2026
    irrf.ts              tabela progressiva IRRF 2026
    fgts.ts              8% sobre bruto
    rules.ts             re-exporta de engine.ts (manter para retrocompat)
  ai/interpret.ts        prompt + chamada Claude API
  ocr/vision.ts          chamada Google Vision API
  supabase/
    client.ts            browser client
    server.ts            server client (usa cookies)
  types.ts               tipos base: Audit, ParsedHolerite, AuditResult, etc.

types/
  holerite.ts            tipo Holerite estruturado (declarado e esperado)

middleware.ts            protege rotas /dashboard e /audit com Supabase session
supabase/migrations/     SQL inicial: tabela audits, RLS, bucket holerites
```

## Tipos principais

- `ParsedHolerite` (`lib/types.ts`): saída do Claude — array de linhas com tipo, kind, valor, basis
- `Holerite` (`types/holerite.ts`): struct tipado com todos os campos nomeados (salarioBase, horasExtras50, etc.)
- `AuditResult` (`lib/types.ts`): resultado final — linhas com status semáforo + summary

## CLT Engine (lib/clt/engine.ts)

Funções exportadas:
- `auditarHolerite(parsed: ParsedHolerite): AuditResult` — entrada principal do motor
- `construirHoleriteDeclarado(parsed)` — extrai valores declarados → Holerite
- `calcularHoleriteEsperado(declarado, parsed)` — recalcula tudo pela legislação

Cálculos implementados (tabelas 2026):
- INSS progressivo (faixas: 7,5% / 9% / 12% / 14%, teto R$ 8.157,41)
- IRRF com dedução por dependente (R$ 189,59 cada)
- FGTS 8% da remuneração bruta
- HE 50% (dias úteis): valorHora × qtdHoras × 1,5
- HE 100% (domingos/feriados): valorHora × qtdHoras × 2,0
- Adicional noturno 20% (22h–5h): valorHora × qtdHorasNoturnas × 0,2
- Insalubridade: 10/20/40% do SM (R$ 1.518,00)
- Periculosidade: 30% do salário base
- DSR sobre variáveis: (totalVariáveis / diasÚteis) × domingosFeriados
- Vale-transporte: desconto máximo 6% do salário base

## Banco de dados (Supabase)

Tabela `audits`:
- id, user_id, created_at, file_url, raw_text
- parsed_data (jsonb: ParsedHolerite)
- audit_result (jsonb: AuditResult)
- status: pending | processing | done | error
- error_message

RLS habilitado: usuário só acessa os próprios registros.
Storage bucket `holerites` com paths `{auditId}/original`.

## Variáveis de ambiente necessárias

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
GOOGLE_CLOUD_VISION_API_KEY
ANTHROPIC_API_KEY
NEXT_PUBLIC_APP_URL
```

## Comandos

```bash
npm run dev      # dev server em localhost:3000
npm run build    # build de produção
npm run lint     # ESLint
npm run db:migrate  # aplica migrations no Supabase
```

## Decisões de design importantes

- O cliente (FileUpload.tsx) usa `FileReader` para base64, não `Buffer` (que não existe no browser)
- O signout é feito via Server Action (`app/actions/auth.ts`), não rota de API
- O motor CLT compara linhas pelo campo `type` da ParsedHolerite, não pela descrição textual
- Linhas sem `basis` (horas) não são recalculadas para HE/noturno — mantém declarado
- Tolerância de R$ 0,05 para divergências (arredondamento bancário)
- FGTS é exibido como "info" — não desconta do líquido, mas é auditado
