-- ============================================================
-- Projeto Valores Humanos — escolas que participam do programa
-- Rode UMA VEZ no SQL Editor do Supabase (pode rodar de novo sem problema).
--
-- Nem todas as escolas participam. O administrador marca, ciclo a ciclo,
-- quais escolas fazem parte do programa (tela Admin → Escolas do programa).
-- Cada ano é um ciclo: no ciclo novo a lista recomeça vazia.
--
-- Ordem: 1) migration_valores_ciclos.sql  2) este arquivo
--        3) sql/painel_resumo.sql (de novo)
-- ============================================================

create table if not exists trab_divulgados.escolas_ciclos (
  escola_id uuid not null references trab_divulgados.escolas(id) on delete cascade,
  ciclo_id  uuid not null references trab_divulgados.ciclos(id)  on delete cascade,
  created_at timestamptz not null default now(),
  primary key (escola_id, ciclo_id)
);

create index if not exists idx_escolas_ciclos_ciclo on trab_divulgados.escolas_ciclos(ciclo_id);

alter table trab_divulgados.escolas_ciclos enable row level security;

drop policy if exists "select_escolas_ciclos" on trab_divulgados.escolas_ciclos;
create policy "select_escolas_ciclos" on trab_divulgados.escolas_ciclos
  for select using (true);

drop policy if exists "admin_write_escolas_ciclos" on trab_divulgados.escolas_ciclos;
create policy "admin_write_escolas_ciclos" on trab_divulgados.escolas_ciclos
  for all using ( trab_divulgados.is_admin() ) with check ( trab_divulgados.is_admin() );

-- Escolas que já têm documentos num ciclo entram na lista desse ciclo
-- (assim nada do que já foi enviado fica "fora do programa").
insert into trab_divulgados.escolas_ciclos (escola_id, ciclo_id)
select distinct d.escola_id, d.ciclo_id
from trab_divulgados.documentos d
where d.escola_id is not null and d.ciclo_id is not null
on conflict do nothing;

-- Quantas escolas do programa há em cada município, num ciclo (tela de seleção)
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
    group by e.municipio_id
  ) x;
$$;

revoke all on function trab_divulgados.escolas_programa_por_municipio(uuid) from public, anon, authenticated;
grant execute on function trab_divulgados.escolas_programa_por_municipio(uuid) to service_role;

notify pgrst, 'reload schema';
