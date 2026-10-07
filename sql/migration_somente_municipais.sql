-- Contagem de escolas do programa por município: só escolas Municipais.
-- Rode este arquivo e depois rode sql/painel_resumo.sql (também atualizado) no SQL Editor do Supabase.
create or replace function trab_divulgados.escolas_programa_por_municipio(p_ciclo_id uuid)
returns jsonb
language sql
stable
set search_path = trab_divulgados, public
as $$
  select coalesce(jsonb_object_agg(municipio_id::text, n), '{}'::jsonb)
  from (
    select e.municipio_id, count(*) as n
    from escolas_ciclos ec
    join escolas e on e.id = ec.escola_id
    where ec.ciclo_id = p_ciclo_id
      and e.tipo = 'Municipal'
    group by e.municipio_id
  ) x;
$$;

revoke all on function trab_divulgados.escolas_programa_por_municipio(uuid) from public, anon, authenticated;
grant execute on function trab_divulgados.escolas_programa_por_municipio(uuid) to service_role;

notify pgrst, 'reload schema';
