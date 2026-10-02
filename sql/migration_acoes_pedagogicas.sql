-- ============================================================
-- Projeto Valores Humanos — ações pedagógicas e tipos de arquivo
-- Rode UMA VEZ no SQL Editor do Supabase (pode rodar de novo sem problema).
--
-- Ordem: 1) este arquivo  2) sql/painel_resumo.sql (de novo)
-- (o painel_resumo agora usa a tabela criada aqui; se rodar na ordem
--  contrária, o Supabase reclama que a tabela não existe)
-- ============================================================

-- ------------------------------------------------------------
-- 1) AÇÕES PEDAGÓGICAS
-- Cada documento enviado diz qual ação pedagógica foi realizada.
-- "Relatório" é a única ação cujo arquivo é PDF e ela tem 3 tipos:
-- Relatório, Ficha de presença e Convite. As outras ações usam só Vídeo e Imagem.
-- ------------------------------------------------------------
create table if not exists trab_divulgados.acoes_pedagogicas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  ordem int,
  exige_pdf boolean not null default false,
  subtipos text[],
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_acoes_pedagogicas_nome
  on trab_divulgados.acoes_pedagogicas (lower(nome));

alter table trab_divulgados.acoes_pedagogicas enable row level security;

drop policy if exists "select_acoes_pedagogicas" on trab_divulgados.acoes_pedagogicas;
create policy "select_acoes_pedagogicas" on trab_divulgados.acoes_pedagogicas
  for select using (true);

drop policy if exists "admin_write_acoes_pedagogicas" on trab_divulgados.acoes_pedagogicas;
create policy "admin_write_acoes_pedagogicas" on trab_divulgados.acoes_pedagogicas
  for insert with check ( trab_divulgados.is_admin() );

drop policy if exists "admin_update_acoes_pedagogicas" on trab_divulgados.acoes_pedagogicas;
create policy "admin_update_acoes_pedagogicas" on trab_divulgados.acoes_pedagogicas
  for update using ( trab_divulgados.is_admin() );

insert into trab_divulgados.acoes_pedagogicas (nome, ordem, exige_pdf, subtipos) values
  ('Acolhimento',            1, false, null),
  ('Meditação',              2, false, null),
  ('Prática Compartilhada',  3, false, null),
  ('Círculo do Amor',        4, false, null),
  ('Família na Escola',      5, false, null),
  ('Hora do Conto',          6, false, null),
  ('Momento Cívico',         7, false, null),
  ('Momento da Refeição',    8, false, null),
  ('Aniversariante do Mês',  9, false, null),
  ('Relatório',             10, true,  array['Relatório', 'Ficha de presença', 'Convite'])
on conflict (lower(nome)) do update
  set ordem = excluded.ordem,
      exige_pdf = excluded.exige_pdf,
      subtipos = excluded.subtipos;

alter table trab_divulgados.documentos
  add column if not exists acao_pedagogica_id uuid references trab_divulgados.acoes_pedagogicas(id),
  add column if not exists subtipo text;

create index if not exists idx_documentos_acao_pedagogica
  on trab_divulgados.documentos(acao_pedagogica_id);

-- (se você já tinha rodado este arquivo com "Ficha de frequência", o nome é corrigido aqui)
update trab_divulgados.documentos set subtipo = 'Ficha de presença' where subtipo = 'Ficha de frequência';

-- Documentos antigos cujo texto de "Ação / Evento" é exatamente o nome de uma
-- ação pedagógica já ficam ligados a ela.
update trab_divulgados.documentos d
set acao_pedagogica_id = a.id
from trab_divulgados.acoes_pedagogicas a
where d.acao_pedagogica_id is null
  and d.acao_evento is not null
  and lower(trim(d.acao_evento)) = lower(a.nome);

-- ------------------------------------------------------------
-- 2) TIPOS DE ARQUIVO: só Vídeo, Imagem e PDF
-- Relatório das Ações, Lista de Presença e Outros eram todos PDF/documentos:
-- os documentos desses tipos passam a ser "PDF" (nada é apagado).
-- ------------------------------------------------------------
update trab_divulgados.tipos_documento
set nome = 'Imagem', finalidade_padrao = 'Comprovação visual das ações realizadas.'
where nome = 'Imagens'
  and not exists (select 1 from trab_divulgados.tipos_documento t2 where t2.nome = 'Imagem');

update trab_divulgados.tipos_documento
set nome = 'Vídeo', finalidade_padrao = 'Comprovação audiovisual da realização da ação.'
where nome = 'Vídeos'
  and not exists (select 1 from trab_divulgados.tipos_documento t2 where t2.nome = 'Vídeo');

insert into trab_divulgados.tipos_documento (nome, finalidade_padrao, icone)
select 'PDF', 'Relatórios, fichas de presença e convites em PDF.', 'file-text'
where not exists (select 1 from trab_divulgados.tipos_documento where nome = 'PDF');

update trab_divulgados.documentos
set tipo_id = (select id from trab_divulgados.tipos_documento where nome = 'PDF' limit 1)
where tipo_id in (
  select id from trab_divulgados.tipos_documento
  where nome in ('Relatório das Ações', 'Lista de Presença', 'Outros')
);

delete from trab_divulgados.tipos_documento t
where t.nome in ('Relatório das Ações', 'Lista de Presença', 'Outros')
  and not exists (select 1 from trab_divulgados.documentos d where d.tipo_id = t.id);

-- ------------------------------------------------------------
-- 3) VALORES ANTIGOS (Agrinho e Programa Valores)
-- O sistema agora trabalha só os 5 valores. Os dois registros antigos deixam
-- de aparecer nas listas e nos cartões, mas NADA é apagado: os documentos
-- ligados a eles continuam existindo e aparecem como "sem valor".
-- ------------------------------------------------------------
alter table trab_divulgados.projetos
  add column if not exists ativo boolean not null default true;

update trab_divulgados.projetos
set ativo = false
where lower(nome) in ('agrinho', 'programa valores');

-- Para reclassificar os documentos antigos em um dos 5 valores, use (exemplo):
--   update trab_divulgados.documentos
--   set projeto_id = (select id from trab_divulgados.projetos where nome = 'Amor')
--   where projeto_id in (select id from trab_divulgados.projetos where lower(nome) = 'agrinho');

notify pgrst, 'reload schema';
