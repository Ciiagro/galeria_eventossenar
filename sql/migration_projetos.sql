-- Rode isso no SQL Editor do Supabase.
-- Adiciona um catálogo de "Projetos" (o programa/projeto maior, acima de
-- Ação/Evento) e vincula cada documento a um projeto — do mesmo jeito que
-- já existe para tipos_documento e escolas.

create table if not exists trab_divulgados.projetos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text,
  created_at timestamptz not null default now()
);

alter table trab_divulgados.documentos
  add column if not exists projeto_id uuid references trab_divulgados.projetos(id);

create index if not exists idx_documentos_projeto on trab_divulgados.documentos(projeto_id);

-- Leitura liberada pra todo mundo autenticado (é só um catálogo, tipo tipos_documento).
-- Escrita só pelo admin — se depois vocês quiserem deixar cada responsável
-- criar o próprio projeto (igual dá pra fazer com escola), é só adaptar
-- essa policy de insert.
alter table trab_divulgados.projetos enable row level security;

create policy "select_projetos" on trab_divulgados.projetos
  for select using (true);

create policy "admin_write_projetos" on trab_divulgados.projetos
  for insert with check ( trab_divulgados.is_admin() );

create policy "admin_update_projetos" on trab_divulgados.projetos
  for update using ( trab_divulgados.is_admin() );

-- ------------------------------------------------------------
-- Ajuste o nome dos projetos reais aqui antes de rodar (isso é só
-- exemplo — apague/edite as linhas conforme os projetos de verdade
-- da FAEC SENAR CE):
-- ------------------------------------------------------------
insert into trab_divulgados.projetos (nome, descricao) values
  ('Projeto Exemplo 1', null),
  ('Projeto Exemplo 2', null)
on conflict do nothing;
