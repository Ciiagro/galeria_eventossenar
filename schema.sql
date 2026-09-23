-- ============================================================
-- FAEC SENAR CE - Documentação Municipal
-- Schema Supabase (Postgres) — isolado em schema próprio
-- para não colidir com outros projetos na mesma organização/projeto
-- ============================================================

-- Extensão para UUID
create extension if not exists "pgcrypto";

-- Schema isolado para este sistema.
-- ATENÇÃO: isso apaga e recria o schema inteiro (só o trab_divulgados —
-- não toca em nada de sindicatos nem de outros schemas). É proposital
-- enquanto estamos testando: garante que não sobra estrutura antiga
-- misturada quando você roda esse script de novo. Se já tiver dados
-- importantes aqui, faça backup antes.
drop schema if exists trab_divulgados cascade;
create schema trab_divulgados;

-- Faz as tabelas serem criadas nesse schema por padrão nesta sessão
set search_path to trab_divulgados, public;

-- ------------------------------------------------------------
-- MUNICÍPIOS
-- Reaproveita a tabela já existente em sindicatos.municipios (não é
-- criada nem alterada aqui). Guardamos só os campos que esse sistema
-- precisa e que a tabela original não tem, numa tabela de extensão.
--
-- A chave primária de sindicatos.municipios é cod_ibge (bigint).
-- ------------------------------------------------------------
create table if not exists trab_divulgados.municipios_extra (
  municipio_id bigint primary key references sindicatos.municipios(cod_ibge) on delete cascade,
  periodo int,
  responsavel_id uuid references auth.users(id),
  responsavel_nome text,
  responsavel_email text,
  drive_folder_id text,              -- ID da pasta raiz do município no Google Drive
  created_at timestamptz not null default now()
);

-- View que junta os dois, pra o resto do sistema continuar consultando
-- "municipios" normalmente (nome, uf, ... vindos da tabela original,
-- + periodo/responsavel_id/drive_folder_id vindos da extensão).
-- "id" aqui é um alias de cod_ibge — assim o resto do código (app.py,
-- frontend) usa m["id"]/m.id sem precisar saber que a chave real
-- chama cod_ibge.
create or replace view trab_divulgados.municipios as
select
  m.cod_ibge as id,
  m.*,
  me.periodo,
  me.responsavel_id,
  me.responsavel_nome,
  me.responsavel_email,
  me.drive_folder_id
from sindicatos.municipios m
left join trab_divulgados.municipios_extra me on me.municipio_id = m.cod_ibge;

-- ------------------------------------------------------------
-- ESCOLAS (vinculadas a um município, com localização)
-- ------------------------------------------------------------
create table if not exists trab_divulgados.escolas (
  id uuid primary key default gen_random_uuid(),
  municipio_id bigint not null references sindicatos.municipios(cod_ibge) on delete cascade,
  nome text not null,
  tipo text,                          -- ex: EEEP, Colégio Agrícola, Escola Família Agrícola
  endereco text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  drive_folder_id text,               -- opcional: subpasta própria no Drive, se precisar segmentar por escola
  created_at timestamptz not null default now()
);

create index if not exists idx_escolas_municipio on trab_divulgados.escolas(municipio_id);

-- ------------------------------------------------------------
-- PERFIS (estende auth.users do Supabase)
-- role: 'admin' ou 'municipio'
-- ------------------------------------------------------------
create table if not exists trab_divulgados.perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  role text not null check (role in ('admin', 'municipio')),
  municipio_id bigint references sindicatos.municipios(cod_ibge),
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- TIPOS DE DOCUMENTO (catálogo fixo, editável pelo admin)
-- ------------------------------------------------------------
create table if not exists trab_divulgados.tipos_documento (
  id uuid primary key default gen_random_uuid(),
  nome text not null,                -- Fotos, Relatórios, Fichas de presença, Vídeos, Certidões, Convite, Outros
  finalidade_padrao text,
  icone text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- DOCUMENTOS
-- ------------------------------------------------------------
create table if not exists trab_divulgados.documentos (
  id uuid primary key default gen_random_uuid(),
  municipio_id bigint not null references sindicatos.municipios(cod_ibge),
  tipo_id uuid not null references trab_divulgados.tipos_documento(id),
  finalidade text,
  acao_evento text,
  escola_id uuid references trab_divulgados.escolas(id),   -- opcional: a ação ocorreu numa escola específica
  descricao text,
  data_realizacao date not null,
  responsavel_envio_id uuid references auth.users(id),
  responsavel_nome text,   -- nome de quem executou/comprova a ação no município (não precisa ter login no sistema)
  responsavel_email text,

  -- arquivo: OU está no Drive (upload feito pelo sistema) OU é um link externo
  drive_file_id text,
  drive_file_link text,
  link_externo text,

  status text not null default 'pendente'
    check (status in ('pendente', 'aprovado', 'rejeitado')),
  motivo_rejeicao text,
  validado_por uuid references auth.users(id),
  validado_em timestamptz,

  created_at timestamptz not null default now()
);

create index if not exists idx_documentos_municipio on trab_divulgados.documentos(municipio_id);
create index if not exists idx_documentos_status on trab_divulgados.documentos(status);

-- ------------------------------------------------------------
-- PERMISSÕES
-- Schema novo não recebe acesso automático das roles que a API usa
-- (anon, authenticated, service_role) — sem isso, dá "permission denied"
-- mesmo com o schema já exposto em Data API > Exposed schemas.
-- ------------------------------------------------------------
grant usage on schema trab_divulgados to anon, authenticated, service_role;
grant all on all tables in schema trab_divulgados to anon, authenticated, service_role;
grant all on all sequences in schema trab_divulgados to anon, authenticated, service_role;

-- Garante que tabelas criadas no futuro (fora deste script) também já
-- nasçam com essas permissões, sem precisar rodar grant de novo.
alter default privileges in schema trab_divulgados
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema trab_divulgados
  grant all on sequences to anon, authenticated, service_role;

-- ------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ------------------------------------------------------------
alter table trab_divulgados.perfis enable row level security;
alter table trab_divulgados.documentos enable row level security;
alter table trab_divulgados.escolas enable row level security;
alter table trab_divulgados.municipios_extra enable row level security;

-- municipios_extra: leitura liberada (só tem periodo/responsavel/drive_folder_id,
-- nada sensível); escrita só pelo admin.
create policy "select_municipios_extra" on trab_divulgados.municipios_extra
  for select using (true);

create policy "admin_write_municipios_extra" on trab_divulgados.municipios_extra
  for insert with check (
    exists (select 1 from perfis p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "admin_update_municipios_extra" on trab_divulgados.municipios_extra
  for update using (
    exists (select 1 from perfis p where p.id = auth.uid() and p.role = 'admin')
  );

-- Admin vê e edita tudo

create policy "admin_full_access_escolas" on trab_divulgados.escolas
  for all using (
    exists (select 1 from perfis p where p.id = auth.uid() and p.role = 'admin')
  );

-- Responsável do município vê e cadastra as escolas do seu município
create policy "municipio_select_own_escolas" on trab_divulgados.escolas
  for select using (
    exists (
      select 1 from perfis p
      where p.id = auth.uid()
        and p.role = 'municipio'
        and p.municipio_id = escolas.municipio_id
    )
  );

create policy "municipio_insert_own_escolas" on trab_divulgados.escolas
  for insert with check (
    exists (
      select 1 from perfis p
      where p.id = auth.uid()
        and p.role = 'municipio'
        and p.municipio_id = escolas.municipio_id
    )
  );

create policy "admin_full_access_documentos" on trab_divulgados.documentos
  for all using (
    exists (select 1 from perfis p where p.id = auth.uid() and p.role = 'admin')
  );

-- Responsável do município só vê/edita os documentos do seu município
create policy "municipio_select_own_docs" on trab_divulgados.documentos
  for select using (
    exists (
      select 1 from perfis p
      where p.id = auth.uid()
        and p.role = 'municipio'
        and p.municipio_id = documentos.municipio_id
    )
  );

create policy "municipio_insert_own_docs" on trab_divulgados.documentos
  for insert with check (
    exists (
      select 1 from perfis p
      where p.id = auth.uid()
        and p.role = 'municipio'
        and p.municipio_id = documentos.municipio_id
    )
  );

-- Cada usuário lê o próprio perfil; admin lê todos
create policy "select_own_perfil" on trab_divulgados.perfis
  for select using (
    id = auth.uid()
    or exists (select 1 from perfis p2 where p2.id = auth.uid() and p2.role = 'admin')
  );

-- ------------------------------------------------------------
-- SEED tipos_documento
-- ------------------------------------------------------------
insert into trab_divulgados.tipos_documento (nome, finalidade_padrao, icone) values
  ('Relatório das Ações', 'Comprovar a execução das ações.', 'file-text'),
  ('Lista de Presença', 'Comprovar a participação dos beneficiários nas ações.', 'clipboard-list'),
  ('Imagens', 'Comprovação visual das ações realizadas.', 'image'),
  ('Vídeos', 'Comprovação audiovisual da realização da ação.', 'video'),
  ('Outros', 'Apoio e complementação das informações (laudos, ofícios, etc).', 'folder')
on conflict do nothing;
