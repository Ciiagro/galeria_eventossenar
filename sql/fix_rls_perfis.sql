-- ============================================================
-- FIX: recursão infinita nas policies que consultam trab_divulgados.perfis
-- ============================================================
-- Causa: a policy "select_own_perfil" (e outras) fazem
--   exists (select 1 from perfis p where p.id = auth.uid() and p.role = 'admin')
-- Essa consulta a "perfis" também é filtrada pela RLS de "perfis",
-- que reavalia a mesma policy -> loop infinito.
--
-- Solução: função SECURITY DEFINER que lê perfis ignorando a RLS,
-- usada em todas as policies no lugar do "exists (select ... from perfis)".
-- ============================================================

-- 1) Função auxiliar (bypassa RLS porque é SECURITY DEFINER)
create or replace function trab_divulgados.is_admin()
returns boolean
language sql
security definer
set search_path = trab_divulgados, public
stable
as $$
  select exists (
    select 1 from trab_divulgados.perfis p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

create or replace function trab_divulgados.meu_municipio_id()
returns bigint
language sql
security definer
set search_path = trab_divulgados, public
stable
as $$
  select p.municipio_id from trab_divulgados.perfis p
  where p.id = auth.uid()
  limit 1;
$$;

revoke all on function trab_divulgados.is_admin() from public;
revoke all on function trab_divulgados.meu_municipio_id() from public;
grant execute on function trab_divulgados.is_admin() to anon, authenticated;
grant execute on function trab_divulgados.meu_municipio_id() to anon, authenticated;

-- 2) Derrubar as policies antigas que causam a recursão
drop policy if exists "admin_write_municipios_extra" on trab_divulgados.municipios_extra;
drop policy if exists "admin_update_municipios_extra" on trab_divulgados.municipios_extra;
drop policy if exists "admin_full_access_escolas" on trab_divulgados.escolas;
drop policy if exists "municipio_select_own_escolas" on trab_divulgados.escolas;
drop policy if exists "municipio_insert_own_escolas" on trab_divulgados.escolas;
drop policy if exists "admin_full_access_documentos" on trab_divulgados.documentos;
drop policy if exists "municipio_select_own_docs" on trab_divulgados.documentos;
drop policy if exists "municipio_insert_own_docs" on trab_divulgados.documentos;
drop policy if exists "select_own_perfil" on trab_divulgados.perfis;

-- 3) Recriar usando as funções (sem sub-select direto em perfis)

create policy "admin_write_municipios_extra" on trab_divulgados.municipios_extra
  for insert with check ( trab_divulgados.is_admin() );

create policy "admin_update_municipios_extra" on trab_divulgados.municipios_extra
  for update using ( trab_divulgados.is_admin() );

create policy "admin_full_access_escolas" on trab_divulgados.escolas
  for all using ( trab_divulgados.is_admin() );

create policy "municipio_select_own_escolas" on trab_divulgados.escolas
  for select using (
    trab_divulgados.meu_municipio_id() = escolas.municipio_id
  );

create policy "municipio_insert_own_escolas" on trab_divulgados.escolas
  for insert with check (
    trab_divulgados.meu_municipio_id() = escolas.municipio_id
  );

create policy "admin_full_access_documentos" on trab_divulgados.documentos
  for all using ( trab_divulgados.is_admin() );

create policy "municipio_select_own_docs" on trab_divulgados.documentos
  for select using (
    trab_divulgados.meu_municipio_id() = documentos.municipio_id
  );

create policy "municipio_insert_own_docs" on trab_divulgados.documentos
  for insert with check (
    trab_divulgados.meu_municipio_id() = documentos.municipio_id
  );

-- Policy da própria perfis: agora usa a função, sem se auto-referenciar
create policy "select_own_perfil" on trab_divulgados.perfis
  for select using (
    id = auth.uid()
    or trab_divulgados.is_admin()
  );

-- ============================================================
-- Fim. Rode este script inteiro no SQL Editor do Supabase.
-- ============================================================
