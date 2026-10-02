-- ============================================================
-- Projeto Valores Humanos — valores e ciclos
-- Rode UMA VEZ no SQL Editor do Supabase (pode rodar de novo sem problema).
--
-- 1) Os cinco valores humanos passam a ser o catálogo de "projetos"
--    (a tabela continua se chamando "projetos" para não quebrar nada;
--    na tela ela aparece como "Valores"). Cada valor tem uma cor.
-- 2) Cada ano é um ciclo: a tabela "ciclos" guarda as edições do projeto
--    e cada documento fica ligado ao ciclo em que foi enviado.
--
-- Depois de rodar este arquivo, rode também sql/painel_resumo.sql
-- (a função do painel foi atualizada para entender ciclos e valores).
-- ============================================================

-- ------------------------------------------------------------
-- 1) VALORES
-- ------------------------------------------------------------
alter table trab_divulgados.projetos
  add column if not exists cor text,
  add column if not exists ordem int;

create unique index if not exists uq_projetos_nome on trab_divulgados.projetos (lower(nome));

insert into trab_divulgados.projetos (nome, descricao, cor, ordem) values
  ('Paz',           'Sentimento: o que deve preencher nossa mente.',     '#8E5BB5', 1),
  ('Amor',          'O que devemos expandir dentro de nós.',             '#E03A3E', 2),
  ('Verdade',       'Pensamento: o que deve atender à consciência.',     '#2F9E62', 3),
  ('Ação correta',  'Ação: o que deve ser praticado.',                   '#F2B705', 4),
  ('Não violência', 'Comportamento: o que devemos ser plenamente.',      '#2678C4', 5)
on conflict (lower(nome)) do update
  set cor = excluded.cor,
      ordem = excluded.ordem,
      descricao = coalesce(trab_divulgados.projetos.descricao, excluded.descricao);

-- Remove os projetos de exemplo da migração antiga, se ninguém os usa
delete from trab_divulgados.projetos p
where p.nome like 'Projeto Exemplo%'
  and not exists (select 1 from trab_divulgados.documentos d where d.projeto_id = p.id);

-- ------------------------------------------------------------
-- 2) CICLOS
-- ------------------------------------------------------------
create table if not exists trab_divulgados.ciclos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  data_inicio date not null,
  data_fim date not null,
  ativo boolean not null default false,
  created_at timestamptz not null default now(),
  check (data_fim >= data_inicio)
);

-- Só um ciclo pode estar ativo por vez
create unique index if not exists uq_ciclos_um_ativo
  on trab_divulgados.ciclos (ativo) where ativo;

alter table trab_divulgados.ciclos enable row level security;

drop policy if exists "select_ciclos" on trab_divulgados.ciclos;
create policy "select_ciclos" on trab_divulgados.ciclos
  for select using (true);

drop policy if exists "admin_write_ciclos" on trab_divulgados.ciclos;
create policy "admin_write_ciclos" on trab_divulgados.ciclos
  for insert with check ( trab_divulgados.is_admin() );

drop policy if exists "admin_update_ciclos" on trab_divulgados.ciclos;
create policy "admin_update_ciclos" on trab_divulgados.ciclos
  for update using ( trab_divulgados.is_admin() );

alter table trab_divulgados.documentos
  add column if not exists ciclo_id uuid references trab_divulgados.ciclos(id);

create index if not exists idx_documentos_ciclo on trab_divulgados.documentos(ciclo_id);

-- Um ciclo para cada ano que já tem documento (1º de janeiro a 31 de dezembro).
-- Datas absurdas (ex.: ano 20206) são ignoradas.
insert into trab_divulgados.ciclos (nome, data_inicio, data_fim)
select
  'Ciclo ' || ano,
  make_date(ano, 1, 1),
  make_date(ano, 12, 31)
from (
  select distinct extract(year from data_realizacao)::int as ano
  from trab_divulgados.documentos
  where data_realizacao is not null
    and extract(year from data_realizacao) between 2000 and 2100
) anos
where not exists (
  select 1 from trab_divulgados.ciclos c where c.nome = 'Ciclo ' || anos.ano
);

-- Garante o ciclo do ano atual (mesmo que ainda não tenha documentos)
insert into trab_divulgados.ciclos (nome, data_inicio, data_fim)
select
  'Ciclo ' || extract(year from current_date)::int,
  make_date(extract(year from current_date)::int, 1, 1),
  make_date(extract(year from current_date)::int, 12, 31)
where not exists (
  select 1 from trab_divulgados.ciclos c
  where current_date between c.data_inicio and c.data_fim
);

-- Ativa o ciclo que contém a data de hoje (se nenhum estiver ativo)
update trab_divulgados.ciclos
set ativo = true
where id = (
  select id from trab_divulgados.ciclos
  where current_date between data_inicio and data_fim
  order by data_inicio desc
  limit 1
)
and not exists (select 1 from trab_divulgados.ciclos where ativo);

-- Liga os documentos que já existem ao ciclo da data de realização
update trab_divulgados.documentos d
set ciclo_id = c.id
from trab_divulgados.ciclos c
where d.ciclo_id is null
  and d.data_realizacao between c.data_inicio and c.data_fim;

-- Documentos novos entram sozinhos no ciclo ativo, se o app não informar outro.
create or replace function trab_divulgados.definir_ciclo_documento()
returns trigger
language plpgsql
as $$
begin
  if new.ciclo_id is null then
    select id into new.ciclo_id
    from trab_divulgados.ciclos
    where ativo
    limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_documentos_ciclo on trab_divulgados.documentos;
create trigger trg_documentos_ciclo
  before insert on trab_divulgados.documentos
  for each row execute function trab_divulgados.definir_ciclo_documento();

notify pgrst, 'reload schema';
