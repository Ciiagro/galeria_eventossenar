-- ============================================================
-- Painel geral: resumo agregado direto no banco (rápido)
-- Rode isso UMA VEZ no SQL Editor do Supabase.
--
-- Antes, o backend baixava todas as escolas (~10 mil linhas, de 1000 em
-- 1000) e todos os documentos a cada abertura do painel e somava em Python.
-- Agora o Postgres faz as contas e devolve só o resultado, numa chamada.
--
-- Se esta função não existir, o app.py continua funcionando no modo
-- antigo (mais lento) — então pode rodar isso quando quiser.
-- ============================================================

-- Índices que as consultas do painel usam
create index if not exists idx_documentos_escola on trab_divulgados.documentos(escola_id);
create index if not exists idx_documentos_municipio on trab_divulgados.documentos(municipio_id);
create index if not exists idx_documentos_data on trab_divulgados.documentos(data_realizacao);

create or replace function trab_divulgados.painel_resumo(
  p_projeto_id uuid default null,     -- filtra um programa
  p_sem_projeto boolean default false, -- true = só documentos sem programa
  p_ano int default null,             -- ano da data de realização
  p_mes int default null              -- mês (1-12) da data de realização
)
returns jsonb
language sql
stable
set search_path = trab_divulgados, public
as $$
with docs as (
  select
    d.municipio_id,
    d.escola_id,
    d.status,
    coalesce(t.nome, 'Outros') as tipo,
    coalesce(p.nome, 'Sem programa') as programa
  from documentos d
  left join tipos_documento t on t.id = d.tipo_id
  left join projetos p on p.id = d.projeto_id
  where (not p_sem_projeto or d.projeto_id is null)
    and (p_projeto_id is null or d.projeto_id = p_projeto_id)
    and (p_ano is null or extract(year from d.data_realizacao) = p_ano)
    and (p_mes is null or extract(month from d.data_realizacao) = p_mes)
),
escolas_total as (
  select municipio_id, count(*) as n
  from escolas
  group by municipio_id
),
escolas_part as (
  select
    e.id, e.nome, e.municipio_id, e.latitude, e.longitude,
    count(*) as documentos,
    array_agg(distinct d.programa order by d.programa) as programas
  from docs d
  join escolas e on e.id = d.escola_id
  group by e.id
),
docs_mun as (
  select
    municipio_id,
    count(*) as total,
    count(*) filter (where status = 'aprovado') as aprovados,
    count(*) filter (where status = 'pendente') as pendentes,
    count(*) filter (where status = 'rejeitado') as rejeitados
  from docs
  group by municipio_id
),
escolas_part_mun as (
  select municipio_id, count(*) as n
  from escolas_part
  group by municipio_id
),
mun as (
  select
    m.id, m.nome, m.periodo,
    coalesce(dm.total, 0) as total_documentos,
    coalesce(dm.aprovados, 0) as aprovados,
    coalesce(dm.pendentes, 0) as pendentes,
    coalesce(dm.rejeitados, 0) as rejeitados,
    coalesce(et.n, 0) as escolas_total,
    coalesce(ep.n, 0) as escolas_participantes
  from municipios m
  left join docs_mun dm on dm.municipio_id = m.id
  left join escolas_total et on et.municipio_id = m.id
  left join escolas_part_mun ep on ep.municipio_id = m.id
),
tipos_mun as (
  select municipio_id, tipo, count(*) as n
  from docs
  group by municipio_id, tipo
),
tipos as (
  select tipo, count(*) as n
  from docs
  group by tipo
)
select jsonb_build_object(
  'municipios',
    coalesce((select jsonb_agg(to_jsonb(mun) order by mun.nome) from mun), '[]'::jsonb),

  'ranking_tipos',
    coalesce((select jsonb_agg(jsonb_build_object('nome', tipo, 'total', n) order by n desc) from tipos), '[]'::jsonb),

  'tipos_por_municipio',
    coalesce((
      select jsonb_object_agg(municipio_id::text, por_tipo)
      from (
        select municipio_id, jsonb_object_agg(tipo, n) as por_tipo
        from tipos_mun
        group by municipio_id
      ) x
    ), '{}'::jsonb),

  'escolas_participantes_lista',
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ep.id,
        'nome', ep.nome,
        'municipio_id', ep.municipio_id,
        'municipio_nome', m.nome,
        'programas', to_jsonb(ep.programas),
        'latitude', ep.latitude,
        'longitude', ep.longitude,
        'documentos', ep.documentos
      ) order by ep.documentos desc, ep.nome)
      from escolas_part ep
      left join mun m on m.id = ep.municipio_id
    ), '[]'::jsonb),

  -- anos que têm documentos (respeita o programa, ignora o filtro de ano/mês)
  'anos_disponiveis',
    coalesce((
      select jsonb_agg(ano order by ano desc)
      from (
        select distinct extract(year from d.data_realizacao)::int as ano
        from documentos d
        where d.data_realizacao is not null
          and (not p_sem_projeto or d.projeto_id is null)
          and (p_projeto_id is null or d.projeto_id = p_projeto_id)
      ) a
    ), '[]'::jsonb)
);
$$;

-- Só o backend (service role) pode chamar: o app.py confere se é admin antes.
revoke all on function trab_divulgados.painel_resumo(uuid, boolean, int, int) from public, anon, authenticated;
grant execute on function trab_divulgados.painel_resumo(uuid, boolean, int, int) to service_role;

-- Faz o PostgREST enxergar a função nova sem precisar reiniciar nada
notify pgrst, 'reload schema';
