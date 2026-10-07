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
-- (o índice do ciclo é criado em sql/migration_valores_ciclos.sql — rode aquele arquivo antes)

-- ATUALIZADO (Projeto Valores Humanos): filtra por ciclo e por ação pedagógica
-- e devolve o total de cada ação pedagógica. (Os 5 valores humanos são só
-- informação do programa: não classificam documentos.)
-- Rode ANTES sql/migration_valores_ciclos.sql, sql/migration_acoes_pedagogicas.sql
-- e sql/migration_escolas_programa.sql.
-- As versões antigas são removidas para não haver duas funções com o mesmo nome.
drop function if exists trab_divulgados.painel_resumo(uuid, boolean, int, int);
drop function if exists trab_divulgados.painel_resumo(uuid, boolean, int, int, uuid);

create or replace function trab_divulgados.painel_resumo(
  p_acao_id uuid default null,        -- filtra uma ação pedagógica
  p_sem_acao boolean default false,   -- true = só documentos sem ação pedagógica
  p_ano int default null,             -- ano da data de realização (ignorado se houver ciclo)
  p_mes int default null,             -- mês (1-12) da data de realização
  p_ciclo_id uuid default null        -- ciclo (edição) do projeto
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
    d.acao_pedagogica_id,
    coalesce(t.nome, 'Outros') as tipo,
    coalesce(a.nome, 'Sem ação pedagógica') as programa  -- (chave "programas" no JSON = ações pedagógicas)
  from documentos d
  left join tipos_documento t on t.id = d.tipo_id
  left join acoes_pedagogicas a on a.id = d.acao_pedagogica_id
  where (not p_sem_acao or d.acao_pedagogica_id is null)
    and (p_acao_id is null or d.acao_pedagogica_id = p_acao_id)
    and (p_ciclo_id is null or d.ciclo_id = p_ciclo_id)
    and (p_ciclo_id is not null or p_ano is null or extract(year from d.data_realizacao) = p_ano)
    and (p_mes is null or extract(month from d.data_realizacao) = p_mes)
),
-- mesmos filtros de período, mas SEM o filtro de ação: alimenta o resumo por ação
docs_acoes as (
  select d.acao_pedagogica_id, d.status
  from documentos d
  where (p_ciclo_id is null or d.ciclo_id = p_ciclo_id)
    and (p_ciclo_id is not null or p_ano is null or extract(year from d.data_realizacao) = p_ano)
    and (p_mes is null or extract(month from d.data_realizacao) = p_mes)
),
-- escolas_total = escolas que PARTICIPAM do programa no ciclo (marcadas em
-- Admin → Escolas do programa). Sem ciclo escolhido, vale qualquer ciclo.
escolas_total as (
  select e.municipio_id, count(distinct ec.escola_id) as n
  from escolas_ciclos ec
  join escolas e on e.id = ec.escola_id
  where e.tipo = 'Municipal'
    and (p_ciclo_id is null or ec.ciclo_id = p_ciclo_id)
  group by e.municipio_id
),
escolas_part as (
  select
    e.id, e.nome, e.municipio_id, e.latitude, e.longitude,
    count(*) as documentos,
    array_agg(distinct d.programa order by d.programa) as programas
  from docs d
  join escolas e on e.id = d.escola_id
  where e.tipo = 'Municipal'
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

  -- total de documentos de cada ação pedagógica (ignora o filtro de ação)
  'por_acao',
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'nome', a.nome,
        'ordem', a.ordem,
        'total', coalesce(x.total, 0),
        'aprovados', coalesce(x.aprovados, 0)
      ) order by a.ordem nulls last, a.nome)
      from acoes_pedagogicas a
      left join (
        select acao_pedagogica_id,
               count(*) as total,
               count(*) filter (where status = 'aprovado') as aprovados
        from docs_acoes
        where acao_pedagogica_id is not null
        group by acao_pedagogica_id
      ) x on x.acao_pedagogica_id = a.id
      where a.ativo
    ), '[]'::jsonb),

  'sem_acao',
    coalesce((select count(*) from docs_acoes where acao_pedagogica_id is null), 0),

  -- anos que têm documentos (respeita a ação pedagógica, ignora o filtro de ano/mês)
  'anos_disponiveis',
    coalesce((
      select jsonb_agg(ano order by ano desc)
      from (
        select distinct extract(year from d.data_realizacao)::int as ano
        from documentos d
        where d.data_realizacao is not null
          and (not p_sem_acao or d.acao_pedagogica_id is null)
          and (p_acao_id is null or d.acao_pedagogica_id = p_acao_id)
      ) a
    ), '[]'::jsonb)
);
$$;

-- Só o backend (service role) pode chamar: o app.py confere se é admin antes.
revoke all on function trab_divulgados.painel_resumo(uuid, boolean, int, int, uuid) from public, anon, authenticated;
grant execute on function trab_divulgados.painel_resumo(uuid, boolean, int, int, uuid) to service_role;

-- Faz o PostgREST enxergar a função nova sem precisar reiniciar nada
notify pgrst, 'reload schema';
