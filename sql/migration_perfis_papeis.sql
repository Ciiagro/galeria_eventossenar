-- ============================================================
-- NOVOS PERFIS DE ACESSO
--   municipio          = Coordenador Geral por Município (já existia)
--   apoiador_visitas   = Apoiador de Visitas  (atua em municípios definidos pelo admin)
--   apoiador_relatorios= Apoiador de Relatórios (insere relatórios e faz a análise
--                        prévia dos documentos; o admin valida depois)
--   admin              = Administrador
--
-- Rode este script inteiro no SQL Editor do Supabase (pode rodar mais de uma vez).
-- ============================================================

-- 1) Aceitar os novos valores em perfis.role
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'trab_divulgados.perfis'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table trab_divulgados.perfis drop constraint %I', c.conname);
  end loop;
end $$;

alter table trab_divulgados.perfis
  add constraint perfis_role_check
  check (role in ('admin', 'municipio', 'apoiador_visitas', 'apoiador_relatorios'));

-- 2) Municípios em que cada Apoiador de Visitas atua
create table if not exists trab_divulgados.perfil_municipios (
  perfil_id    uuid   not null references trab_divulgados.perfis(id) on delete cascade,
  municipio_id bigint not null references sindicatos.municipios(cod_ibge) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (perfil_id, municipio_id)
);

create index if not exists idx_perfil_municipios_municipio
  on trab_divulgados.perfil_municipios(municipio_id);

alter table trab_divulgados.perfil_municipios enable row level security;
grant all on trab_divulgados.perfil_municipios to anon, authenticated, service_role;

drop policy if exists "ver_proprios_municipios" on trab_divulgados.perfil_municipios;
create policy "ver_proprios_municipios" on trab_divulgados.perfil_municipios
  for select using ( perfil_id = auth.uid() or trab_divulgados.is_admin() );

drop policy if exists "admin_gerencia_perfil_municipios" on trab_divulgados.perfil_municipios;
create policy "admin_gerencia_perfil_municipios" on trab_divulgados.perfil_municipios
  for all using ( trab_divulgados.is_admin() ) with check ( trab_divulgados.is_admin() );

-- 3) Documentos: origem do envio + análise prévia (Apoiador de Relatórios)
alter table trab_divulgados.documentos
  add column if not exists origem text,
  add column if not exists analise_status text,
  add column if not exists analise_obs text,
  add column if not exists analise_por uuid references auth.users(id),
  add column if not exists analise_em timestamptz;

alter table trab_divulgados.documentos drop constraint if exists documentos_origem_check;
alter table trab_divulgados.documentos
  add constraint documentos_origem_check
  check (origem is null or origem in ('municipio', 'visita', 'apoio_relatorios', 'admin'));

alter table trab_divulgados.documentos drop constraint if exists documentos_analise_status_check;
alter table trab_divulgados.documentos
  add constraint documentos_analise_status_check
  check (analise_status is null or analise_status in ('recomendado', 'ajustes'));

create index if not exists idx_documentos_analise on trab_divulgados.documentos(analise_status);

-- 4) Funções auxiliares (SECURITY DEFINER: leem perfis sem cair na recursão da RLS)
create or replace function trab_divulgados.meu_role()
returns text
language sql
security definer
set search_path = trab_divulgados, public
stable
as $$
  select p.role from trab_divulgados.perfis p where p.id = auth.uid() limit 1;
$$;

-- Municípios em que o usuário atua: o próprio (Coordenador) + os atribuídos (Apoiador de Visitas)
create or replace function trab_divulgados.meus_municipios()
returns setof bigint
language sql
security definer
set search_path = trab_divulgados, public
stable
as $$
  select p.municipio_id from trab_divulgados.perfis p
   where p.id = auth.uid() and p.municipio_id is not null
  union
  select pm.municipio_id from trab_divulgados.perfil_municipios pm
   where pm.perfil_id = auth.uid();
$$;

-- Pode ver/enviar para o município? Admin e Apoiador de Relatórios: todos.
create or replace function trab_divulgados.pode_acessar_municipio(mun bigint)
returns boolean
language sql
security definer
set search_path = trab_divulgados, public
stable
as $$
  select trab_divulgados.is_admin()
      or trab_divulgados.meu_role() = 'apoiador_relatorios'
      or exists (select 1 from trab_divulgados.meus_municipios() m where m = mun);
$$;

revoke all on function trab_divulgados.meu_role() from public;
revoke all on function trab_divulgados.meus_municipios() from public;
revoke all on function trab_divulgados.pode_acessar_municipio(bigint) from public;
grant execute on function trab_divulgados.meu_role() to anon, authenticated, service_role;
grant execute on function trab_divulgados.meus_municipios() to anon, authenticated, service_role;
grant execute on function trab_divulgados.pode_acessar_municipio(bigint) to anon, authenticated, service_role;

-- 5) Policies de documentos e escolas passam a considerar os novos perfis
drop policy if exists "municipio_select_own_docs" on trab_divulgados.documentos;
drop policy if exists "municipio_insert_own_docs" on trab_divulgados.documentos;
drop policy if exists "acesso_select_docs" on trab_divulgados.documentos;
drop policy if exists "acesso_insert_docs" on trab_divulgados.documentos;

create policy "acesso_select_docs" on trab_divulgados.documentos
  for select using ( trab_divulgados.pode_acessar_municipio(documentos.municipio_id) );

create policy "acesso_insert_docs" on trab_divulgados.documentos
  for insert with check ( trab_divulgados.pode_acessar_municipio(documentos.municipio_id) );

drop policy if exists "municipio_select_own_escolas" on trab_divulgados.escolas;
drop policy if exists "municipio_insert_own_escolas" on trab_divulgados.escolas;
drop policy if exists "acesso_select_escolas" on trab_divulgados.escolas;
drop policy if exists "acesso_insert_escolas" on trab_divulgados.escolas;

create policy "acesso_select_escolas" on trab_divulgados.escolas
  for select using ( trab_divulgados.pode_acessar_municipio(escolas.municipio_id) );

-- cadastrar escola nova: só quem atua naquele município (Coordenador / Apoiador de Visitas)
create policy "acesso_insert_escolas" on trab_divulgados.escolas
  for insert with check (
    exists (select 1 from trab_divulgados.meus_municipios() m where m = escolas.municipio_id)
  );

-- ============================================================
-- Fim.
-- ============================================================
