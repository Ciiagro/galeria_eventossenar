-- ============================================================
-- Apoiador de Relatórios passa a atuar só nos municípios definidos pelo admin
-- (tabela perfil_municipios), igual ao Apoiador de Visitas.
-- Rode uma vez no SQL Editor do Supabase.
-- ============================================================

create or replace function trab_divulgados.pode_acessar_municipio(mun bigint)
returns boolean
language sql
security definer
set search_path = trab_divulgados, public
stable
as $$
  select trab_divulgados.is_admin()
      or exists (select 1 from trab_divulgados.meus_municipios() m where m = mun);
$$;

-- ============================================================
-- Fim.
-- ============================================================
