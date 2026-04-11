-- ── Tabela principal de auditorias ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS auditorias (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          UUID        REFERENCES auth.users(id) NOT NULL,
  mes_referencia   TEXT,
  empregador       TEXT,
  cargo            TEXT,
  imagem_url       TEXT,
  dados_extraidos  JSONB,      -- HoleriteAnalisado (saída do Claude)
  dados_calculados JSONB,      -- AuditResult (saída do motor CLT)
  diferenca_total  DECIMAL(10, 2),
  qtd_erros        INTEGER,
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- ── Row Level Security ────────────────────────────────────────────────────────
ALTER TABLE auditorias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own audits"
  ON auditorias FOR ALL
  USING (auth.uid() = user_id);

-- ── Storage bucket para imagens ───────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('holerites', 'holerites', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users manage own images"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'holerites'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
