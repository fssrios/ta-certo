-- Tabela principal de auditorias
create table public.audits (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamptz default now() not null,
  file_url text,
  raw_text text,
  parsed_data jsonb,
  audit_result jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'done', 'error')),
  error_message text
);

-- RLS: usuário só vê os próprios registros
alter table public.audits enable row level security;

create policy "Users can manage their own audits"
  on public.audits
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Storage bucket para imagens dos holerites
insert into storage.buckets (id, name, public)
values ('holerites', 'holerites', false);

create policy "Users can upload their own holerites"
  on storage.objects for insert
  with check (
    bucket_id = 'holerites' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can read their own holerites"
  on storage.objects for select
  using (
    bucket_id = 'holerites' and
    auth.uid()::text = (storage.foldername(name))[1]
  );
