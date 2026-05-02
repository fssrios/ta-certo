# ESTADO ATUAL — Tá Certo? · Briefing para próxima sessão
> Gerado em: 21/04/2026

---

## 1. ARQUIVOS ALTERADOS NESTA SESSÃO

| Arquivo | O que mudou |
|---------|-------------|
| `lib/clt/inss.ts` | Reescrito completamente: tabelas temporais 2025/2026, `getSalarioMinimo`, `getSalarioFamilia`, `getINSSTeto` |
| `lib/clt/irrf.ts` | Adicionada Lei 15.270/2025 (isenção ≤ R$5.000, desconto progressivo R$5k–R$7,35k para jan/2026+) |
| `lib/clt/engine.ts` | (1) Todas as chamadas `calcularINSS`/`calcularIRRF`/`getSalarioMinimo`/`getINSSTeto` passam `competencia`. (2) Removido Regra 18 (liquid negativo). (3) Regra 19 com `INDEVIDO_RE_DUP` para evitar duplicar alertas. (4) **NOVO**: cálculo de `descontosIndevidos + creditosFaltantes` antes do `return`, resultando em `netExpectedFinal` correto. |
| `lib/converters/analyzed-to-parsed.ts` | Deduplicação de linhas, detecção de rubricas fantasma (outrosProventos com descrição igual a outrosDescontos), reclassificação forçada por keyword (irrf/inss/vale_transporte), remoção de zero-placeholders |
| `app/api/analyze/route.ts` | Instrução para nunca criar rubrica do LÍQUIDO/NET PAY/TOTAIS; guia específico para extração de IRRF em tabelas OCR-scrambled; extração de dependentes com OCR artifact "DEPENDENTES IRRE" |
| `lib/ai/interpret.ts` | MAPEAMENTO OBRIGATÓRIO: descrições comuns → tipos canônicos; "IRRF 1 dependente" → type irrf |
| `components/audit/AuditResult.tsx` | (1) Cores unificadas (verde/vermelho/azul). (2) Badge label específico. (3) Resumo condicional INSS/IRRF. (4) `impactoReal = r2(net_expected - net_declared)`. (5) Hero + resumo reescritos com 3 cenários explícitos. |
| `components/audit/LineItem.tsx` | Cores atualizadas: ok→`#155724`, error/warning→`#DC3545`, legal_violation→`#8B1A1A`, unverifiable/manual_check→`#1A4B8B` |
| `app/globals.css` | `--tc-coral: #DC3545`, `--tc-accent: #DC3545`, `--tc-green: #155724` — laranja eliminado |

---

## 2. REGRAS CLT IMPLEMENTADAS NO MOTOR (`lib/clt/engine.ts`)

### Regras globais (aplicadas a todos os tipos de holerite via `auditarLinha`)

| # | Nome | Base Legal | O que verifica |
|---|------|-----------|----------------|
| 1 | Salário base | CF Art. 7º IV | Verifica se salário base = declarado (sem recálculo — sem dados de convenção coletiva) |
| 2 | Hora extra domingos/feriados | CLT Art. 70 · Lei 605/49 | Mínimo 100% (vs 50% em dia útil) |
| 3 | Contribuição sindical | Lei 13.467/2017 Art. 578-579 | Exige autorização prévia expressa → `manual_check` com 2 cenários |
| 4 | Desconto de faltas | CLT Art. 58 + OJ 358 SDI-1 | Proporcionalidade: (salário ÷ dias_úteis) × faltas; verifica excesso |
| 5 | Salário-família | Lei 4.266/63 · Portaria MPS | Verifica elegibilidade por faixa salarial; alerta se não está recebendo ou recebendo indevidamente |
| 6 | Empréstimo consignado | Lei 10.820/2003 | Limite 35% da remuneração bruta (40% com cartão) |
| 7 | Desconto de equipamento/material | CLT Art. 462 | Proibido descontar custo de material salvo dano doloso com previsão em contrato |
| 8 | Desconto por atraso | CLT Art. 58 §1º | Tolerância de 5 min (antes e depois); atrasos até 10 min/dia não descontáveis |
| 9 | Terço constitucional ausente | CF Art. 7º XVII | Se há rubrica de férias mas não há 1/3 → cria linha sintética de erro |
| 10 | Intervalo intrajornada suprimido | CLT Art. 71 §4º | Jornada >6h sem intervalo de 1h → hora extra indenizatória |
| 11 | Hora extra noturna | CLT Art. 73 §1º · OJ 97 SDI-1 | Hora noturna + extra: base = valorHora × 1,20 × adicional |
| 12 | Limite de 2h extras/dia | CLT Art. 59 | Avisa quando horas extras excedem o limite (exceto acordo coletivo) |
| 13 | VA/VR — desconto PAT | Lei 6.321/76 · Decreto 5/91 | Desconto máximo 20% do valor do benefício |
| 14 | Adicional de transferência | CLT Art. 469 §3º | 25% do salário quando há transferência provisória |
| 15 | Gratificação de função + jornada | CLT Art. 62 | Gratificação ≥ 40% isenta de controle de jornada |
| 16 | Sobreaviso / prontidão | CLT Art. 244 · Súmula 428 TST | Sobreaviso = 1/3 da hora; prontidão = 2/3; celular sozinho não caracteriza |
| 17 | Banco de horas | CLT Art. 59 §§2º e 5º | Validade máxima 6 meses (individual) ou 1 ano (coletivo) |
| 18 (removida) | Líquido negativo | — | **REMOVIDA** — causava falso positivo no caso 49 |
| 19 | Descontos duplicados | CLT Art. 462 | Detecta dois descontos com mesma descrição normalizada e mesmo valor → `legal_violation` com 2 cenários |

### Regras especiais por tipo de holerite (early returns)

| Tipo | Regras aplicadas |
|------|-----------------|
| `rescisao` | Early return com 1 linha informativa — auditoria completa pendente |
| `decimo_terceiro_1` | INSS = 0 (proibido na 1ª parcela), IRRF = 0, FGTS 8% |
| `decimo_terceiro_2` | INSS sobre total do 13º, IRRF sobre total − INSS, subtrai adiantamento da 1ª parcela |
| `plr` | IRRF pela tabela PLR exclusiva (Lei 10.101/2000); sem INSS, sem FGTS |
| `ferias` | Verifica 1/3 constitucional, verifica INSS/IRRF sobre férias |

### Cálculo corrigido de `net_expected` (adicionado nesta sessão)

```typescript
// Antes do return final no fluxo folha_mensal:
const descontosIndevidos = auditLines
  .filter(l => l.kind === "deduction" &&
    (l.status === "legal_violation" || l.status === "error") &&
    l.declared_value > l.expected_value + 0.05)
  .reduce((sum, l) => sum + round2(l.declared_value - l.expected_value), 0);

const creditosFaltantes = auditLines
  .filter(l => l.kind === "credit" &&
    (l.status === "legal_violation" || l.status === "error") &&
    l.expected_value > l.declared_value + 0.05)
  .reduce((sum, l) => sum + round2(l.expected_value - l.declared_value), 0);

const netExpectedFinal = round2(esperado.salarioLiquido + descontosIndevidos + creditosFaltantes);
```

**Por que é necessário:** `esperado.salarioLiquido` é o líquido calculado pelo motor CLT puro (bruto − INSS − IRRF). Mas se há um desconto indevido de R$6.000 que o motor classifica como `legal_violation` com `expected_value = 0`, esse desconto existe no `net_declared` mas NÃO no cálculo CLT. O `netExpectedFinal` corrige isso somando de volta o que foi descontado indevidamente.

---

## 3. BUGS CORRIGIDOS (casos 40–49)

| Caso | Funcionário | Problema | Status |
|------|-------------|----------|--------|
| 40 | — | INSS calculado com tabela 2025 errada (limite da 3ª faixa) | ✅ Corrigido — `FAIXAS_2025[2].limite = 4190.83` (não 5839.45) |
| 41 | — | IRRF não aplicava desconto progressivo Lei 15.270/2025 para jan/2026 | ✅ Corrigido — `irrf.ts` com bloco `if (ano >= 2026)` |
| 46 | — | Motor reportando mesma irregularidade 3×: Regra 18 + INDEVIDO_RE + Regra 19 | ✅ Corrigido — Regra 18 removida, `INDEVIDO_RE_DUP` em Regra 19 |
| 48 | — | Typo "violação**is** legalis" no badge | ✅ Corrigido — ternário completo no `badgeLabel` |
| 49 | Marina Rezende | Linha fantasma R$866,79 (OCR colocou líquido negativo como provento) | ✅ Corrigido — `analyzed-to-parsed.ts` filtra `outrosProventos` cuja descrição normalizada coincide com `outrosDescontos` |
| 49 | Marina Rezende | IRRF não extraído (OCR scramble: "Totais do empregado" entre rubrica e valor) | ✅ Corrigido — prompt do `/api/analyze` com guia específico |
| 49 | Marina Rezende | `impactoReal = 0` mesmo com R$6.000 de desconto indevido | ✅ Corrigido — `netExpectedFinal` com `descontosIndevidos + creditosFaltantes` |
| 49 | Marina Rezende | Resumo vazio (líquido só aparecia se `impactoReal > 0.05`) | ✅ Corrigido — bloco líquido sempre visível quando `hasErrors` |

---

## 4. BUGS / MELHORIAS PENDENTES

### Alta prioridade

- [ ] **Auditoria de rescisão (TRCT):** Motor retorna early com 1 linha informativa. Falta implementar: saldo de salário proporcional, férias proporcionais + 1/3, 13º proporcional, multa 40% FGTS, aviso prévio (trabalhado ou indenizado). Base: CLT Art. 477 + Lei 8.036/90 Art. 18.
- [ ] **Holerites com competência antiga sem data:** Se `parsed.competencia` for null, motor usa `"01/2026"` por default. Pode calcular INSS/IRRF errado para holerites de 2024/2025 sem competência explícita.
- [ ] **Salário base vs. convenção coletiva:** Motor aceita o salário base declarado como correto. Não tem acesso a pisos por categoria/sindicato. Seria necessário banco de dados de CCTs ou API de sindicatos.

### Média prioridade

- [ ] **Horas extras: base de cálculo com adicionais integrados:** Súmula 139/191 TST determina que insalubridade/periculosidade integram a base da hora extra. Motor já implementa isso (`valorHoraParaHE`), mas não verifica DSR sobre variáveis com a mesma regra.
- [ ] **DSR sobre variáveis:** Motor calcula DSR esperado mas não sempre compara corretamente quando holerite não tem rubrica explícita de DSR.
- [ ] **Vale-transporte:** Verifica desconto máximo de 6% do salário base, mas não verifica se o benefício recebido é proporcional ao trajeto real (por falta de dados de distância).
- [ ] **Adicional noturno integrado na base HE:** OJ 97 SDI-1 TST: hora extra noturna usa `valorHora × 1,20`. Implementado no motor, mas não há caso de teste cobrindo isso.
- [ ] **Pensão alimentícia:** Regra 18 verifica base de cálculo da pensão, mas não tem acesso ao percentual judicial. Retorna `manual_check`.

### Baixa prioridade / UI

- [ ] **Exportar PDF do resultado:** Atualmente só há compartilhamento de imagem PNG. Falta geração de PDF para trabalhador levar ao sindicato.
- [ ] **Histórico comparativo:** Dashboard mostra lista de holerites mas sem comparação mês a mês.
- [ ] **Casos com múltiplas páginas de PDF:** OCR processa só a 1ª página. Holerites de rescisão geralmente têm 2+ páginas.
- [ ] **Console.logs de debug:** Foram adicionados em `analyzed-to-parsed.ts` e `analyze/route.ts` para rastrear casos. Remover antes do deploy em produção.

---

## 5. FLUXO ATUAL: upload → resultado

```
[Usuário faz upload de imagem/PDF]
         │
         ▼
POST /api/ocr
  → lib/ocr/vision.ts
  → Google Cloud Vision (DOCUMENT_TEXT_DETECTION)
  → rawText: string
         │
         ▼
POST /api/analyze
  → app/api/analyze/route.ts
  → Claude API (claude-sonnet-4-6) com SYSTEM_PROMPT extenso
  → Retorna: HoleriteAnalisado (JSON estruturado com todos os campos nomeados)
    Campos: tipoHolerite, dependentes, jornadaMensal, salarioBase,
            horasExtras50/100, adicionalNoturno, insalubridade, periculosidade,
            dsrSobreVariaveis, descontoINSS, descontoIRRF, valorFGTS,
            outrosProventos[], outrosDescontos[], salarioLiquido, competencia
         │
         ▼
lib/converters/analyzed-to-parsed.ts  (analisadoParaParsed)
  → Deduplicação de linhas (same description + same value → keep highest)
  → Detecção de rubricas fantasma (proventos com descrição igual a descontos)
  → Reclassificação forçada por keyword (irrf, inss, vale_transporte)
  → Remoção de zero-placeholders quando há linha real do mesmo tipo
  → Inferência de jornada mensal quando não declarada
  → Retorna: ParsedHolerite (lines[], gross_salary, competencia, dependentes, etc.)
         │
         ▼
POST /api/audit
  → lib/clt/engine.ts  (auditarHolerite)
  → detectarTipoHolerite(parsed) → "folha_mensal" | "rescisao" | "decimo_terceiro_1" | ...
  → Early return para tipos especiais (rescisao, decimo_terceiro_1/2, plr)
  → construirHoleriteDeclarado(parsed) → campos nomeados do holerite declarado
  → calcularHoleriteEsperado(declarado, parsed) → recalcula tudo pela lei:
      calcularINSS(bruto, competencia)
      calcularIRRF(bruto, inss, dependentes, competencia)
      calcularFGTS(bruto)
      HE50/100, adicional noturno, DSR, insalubridade, periculosidade
  → auditLines = parsed.lines.map(auditarLinha) + linhas sintéticas
  → Regra 9 (terço constitucional ausente)
  → Regra 19 (descontos duplicados)
  → descontosIndevidos + creditosFaltantes → netExpectedFinal
  → Retorna: AuditResult { lines, summary, net_declared, net_expected, total_difference }
         │
         ▼
POST /api/auditorias/save
  → lib/db/auditorias.ts
  → Salva no Supabase: tabela audits { parsed_data, audit_result, status: "done" }
         │
         ▼
/audit/[id]
  → components/audit/AuditResult.tsx
  → Hero card (esquerda) + Summary card (direita) + LineRow por linha + Impacto estimado
```

---

## 6. TABELAS VIGENTES

### INSS — Tabela Progressiva

#### 2025 (Portaria MPS/MF nº 6/2025) · competencia ≤ 12/2025

| Faixa | Até (R$) | Alíquota |
|-------|----------|----------|
| 1ª | 1.518,00 | 7,5% |
| 2ª | 2.793,88 | 9,0% |
| 3ª | 4.190,83 | 12,0% |
| 4ª | 8.157,41 | 14,0% |

- Teto máximo: **R$ 951,63**
- Salário mínimo: **R$ 1.518,00**
- Salário-família: limite **R$ 1.819,26** → benefício **R$ 62,04/filho**

#### 2026 (Portaria MPS/MF nº 13/2026) · competencia ≥ 01/2026

| Faixa | Até (R$) | Alíquota |
|-------|----------|----------|
| 1ª | 1.621,00 | 7,5% |
| 2ª | 2.902,84 | 9,0% |
| 3ª | 4.354,27 | 12,0% |
| 4ª | 8.475,55 | 14,0% |

- Teto máximo: **~R$ 988,09** (calculado progressivo)
- Salário mínimo: **R$ 1.621,00**
- Salário-família: limite **R$ 1.944,40** → benefício **R$ 67,54/filho**

---

### IRRF — Tabela Progressiva Mensal

#### Faixas base (vigentes desde Fev/2024)

| Faixa | Até (R$) | Alíquota | Parcela a deduzir |
|-------|----------|----------|-------------------|
| 1ª | 2.259,20 | 0% | — |
| 2ª | 2.826,65 | 7,5% | R$ 169,44 |
| 3ª | 3.751,05 | 15,0% | R$ 381,44 |
| 4ª | 4.664,68 | 22,5% | R$ 662,77 |
| 5ª (até Abr/2025) | ∞ | 27,5% | R$ 896,00 |
| 5ª (Mai/2025+) | ∞ | 27,5% | R$ 908,73 |

- Dedução por dependente: **R$ 189,59/dependente**
- Base de cálculo: **Bruto − INSS − (dependentes × R$ 189,59)**

#### Lei 15.270/2025 — Desconto progressivo (jan/2026+)

Aplicado APÓS o cálculo pela tabela progressiva (sobre `salarioBruto`):

| Faixa bruto | Desconto adicional |
|-------------|-------------------|
| ≤ R$ 5.000,00 | IRRF = **0** (isenção total) |
| R$ 5.000,01 – R$ 7.350,00 | desconto = R$ 978,62 − (0,133145 × bruto) |
| > R$ 7.350,00 | sem desconto adicional |

---

### IRRF sobre PLR — Tabela Exclusiva (Lei 10.101/2000 · IN RFB 2.174/2024)

| Faixa PLR | Até (R$) | Alíquota | Parcela a deduzir |
|-----------|----------|----------|-------------------|
| 1ª | 7.640,80 | 0% | — |
| 2ª | 9.922,28 | 7,5% | R$ 573,06 |
| 3ª | 13.167,00 | 15,0% | R$ 1.317,23 |
| 4ª | 16.380,38 | 22,5% | R$ 2.304,76 |
| 5ª | ∞ | 27,5% | R$ 3.123,78 |

- PLR não tem INSS, não tem FGTS
- IRRF incide separadamente do salário mensal
- Tabela vigente para 2024/2025 (atualizar quando houver nova IN RFB)

---

## 7. UI DOS DOIS BLOCOS DE RESULTADO — ESPECIFICAÇÃO ATUAL

### Arquivo: `components/audit/AuditResult.tsx` · Linhas ~461–600

### Variáveis base (calculadas na função `AuditResult`)

```typescript
const r2 = (n: number) => Math.round(n * 100) / 100;
const calcErrors  = result.lines.filter(l => l.status === "error").length;
const legalErrors = result.lines.filter(l => l.status === "legal_violation").length;
const hasErrors   = calcErrors + legalErrors > 0;
const manualCheckCount = result.lines.filter(l => l.status === "manual_check").length;
const impactoReal = r2(result.net_expected - result.net_declared);
const deficit = impactoReal; // alias para handleShare
const fgtsGap = r2(Math.max(0, result.summary.fgts_expected - result.summary.fgts_declared));
// Dentro do IIFE que envolve hero+resumo:
const inssDiv = Math.abs(result.summary.inss_declared - result.summary.inss_expected) > 0.05;
const irrfDiv = Math.abs(result.summary.irrf_declared - result.summary.irrf_expected) > 0.05;
```

### Cor do hero (`heroBg`)

```typescript
const heroBg =
  legalErrors > 0 ? "bg-[#8B1A1A]" :
  calcErrors  > 0 ? "bg-[#8B1A1A]" :
  manualCheckCount > 0 ? "bg-[#1A4B8B]" :
  "bg-[#1B4332]";
```

---

### CENÁRIO 1: Tudo certo (`!hasErrors && manualCheckCount === 0`)

**Hero (esquerda, verde `#1B4332`):**
- Badge: `"✓ Tudo conferido"`
- Título: `"Seu holerite está correto!"`
- Subtítulo: `"Todas as [N] linhas conferem com a legislação CLT."`

**Resumo (direita):**
- Título: `"RESUMO"`
- Só uma linha: `"Salário líquido"` → `brl(net_declared)` em negrito verde
- SEM INSS, IRRF, FGTS

---

### CENÁRIO 2: Problemas (`hasErrors === true`)

**Hero (esquerda, vermelho `#8B1A1A`):**
- Badge: `badgeLabel` (ex: `"⚖ 1 violação legal — desconto duplicado de adiantamento"`)
- **SE `impactoReal > 0.05`:**
  - `"Seu holerite tem"` (pequeno)
  - `"valores a recuperar"` (maior)
  - Número grande: `brl(impactoReal)` em vermelho `#DC3545`
  - Subtítulo: `"Você deveria ter recebido [net_expected], mas recebeu [net_declared]."`
- **SE `impactoReal <= 0.05`:**
  - Título: `"Irregularidades encontradas"`
  - Subtítulo: `explicacao` (texto contextual gerado pelas flags `temDescontoIndevido`, `temINSSErro`, etc.)
- Se `manualCheckCount > 0`: rodapé `"+ N itens precisam da sua verificação — expanda os azuis"`

**Resumo (direita):**
- Título: `"RESUMO"`
- **SÓ se `inssDiv`:** linha INSS com valor declarado riscado cinza (`#999 line-through`) → valor esperado vermelho (`#DC3545`)
- **SÓ se `irrfDiv`:** linha IRRF idem
- Separador (`border-t border-tc-line`)
- **SEMPRE:** `"Líquido no holerite"` → `brl(net_declared)` cinza pequeno
- **SÓ se `impactoReal > 0.05`:**
  - `"Valor a ser devolvido"` → `"+ brl(impactoReal)"` vermelho negrito
  - `"Líquido corrigido"` → `brl(net_expected)` negrito (preto se positivo, vermelho se negativo)
- **SE `impactoReal <= 0.05`:** só `"Líquido"` → `brl(net_declared)`
- **SÓ se `fgtsGap >= 1`:** `"FGTS não depositado"` → `brl(fgtsGap)` vermelho pequeno (nota: vai à conta vinculada, não ao líquido)

---

### CENÁRIO 3: Verificação manual (`!hasErrors && manualCheckCount > 0`)

**Hero (esquerda, azul `#1A4B8B`):**
- Badge: `"△ [N] item(ns) para verificar"`
- Título: `"Verifique alguns itens"`
- Subtítulo: `"Os cálculos automáticos estão corretos, mas há itens que dependem de informações que só você tem. Expanda os itens azuis abaixo."`

**Resumo (direita):**
- Título: `"RESUMO"`
- Só uma linha: `"Salário líquido"` → `brl(net_declared)` em negrito verde
- SEM INSS, IRRF, FGTS (igual ao cenário 1)

---

### Bloco "Impacto estimado" (abaixo dos dois cards, só quando `hasErrors && (impactoReal > 0.05 || fgtsGap >= 1)`)

```
Valor a ser devolvido    R$ X a seu favor
Projeção anual           R$ Y / ano         ← X × 12
─────────────────────────────────────────
FGTS não depositado      R$ Z               ← só se fgtsGap >= 1
```

Rodapé: `"Estimativa baseada nos dados deste holerite. Valores podem variar mês a mês."`

---

### Paleta de cores oficial

| Token | Hex | Uso |
|-------|-----|-----|
| `--tc-green` / `text-tc-green` | `#155724` | OK, correto, valores recebidos corretamente |
| `--tc-coral` / `text-tc-coral` | `#DC3545` | Erro, violação, valor a devolver |
| Hero verde | `#1B4332` | Fundo hero cenário 1 |
| Hero vermelho | `#8B1A1A` | Fundo hero cenários 2 e 2+legal |
| Hero azul | `#1A4B8B` | Fundo hero cenário 3 |
| Número grande | `#DC3545` | `impactoReal` no hero |
| Riscado antigo | `#999` + `line-through` | Valor divergente declarado |
| `--tc-muted` | (cinza) | Labels, valores neutros |

---

## NOTAS PARA A PRÓXIMA SESSÃO

1. **Testar caso 49 (Marina)** após o fix de `netExpectedFinal`: confirmar que resumo mostra `-R$866,79 / +R$6.000 / R$5.133,21`.
2. **Console.logs de debug** em `analyzed-to-parsed.ts` e `analyze/route.ts` devem ser removidos antes de ir para produção.
3. **Próximo grande feature:** auditoria de rescisão (TRCT) — é o tipo mais pedido e atualmente retorna só uma linha informativa.
4. **Verificar `net_declared` para casos com líquido negativo:** Supabase salva `salarioLiquido` como extraído pela IA. Se a IA errar esse valor, `impactoReal` fica errado. Considerar recalcular `net_declared = gross_salary - Σdescontos` no motor em vez de confiar no valor declarado.
5. **Banco de dados de pisos salariais por categoria** seria necessário para auditar o salário base com precisão — atualmente motor só verifica se não está abaixo do salário mínimo nacional.
