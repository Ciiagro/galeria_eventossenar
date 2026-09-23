-- Rode isso no SQL Editor do Supabase se você já tinha rodado o schema.sql
-- antes desta atualização (evita ter que apagar tudo de novo).

alter table trab_divulgados.documentos
  add column if not exists responsavel_nome text,
  add column if not exists responsavel_email text;

alter table trab_divulgados.municipios_extra
  add column if not exists responsavel_nome text,
  add column if not exists responsavel_email text;

drop view if exists trab_divulgados.municipios;

create view trab_divulgados.municipios as
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

insert into trab_divulgados.tipos_documento (nome, finalidade_padrao, icone) values
  ('Outros', 'Apoio e complementação das informações (laudos, ofícios, etc).', 'folder')
on conflict do nothing;
