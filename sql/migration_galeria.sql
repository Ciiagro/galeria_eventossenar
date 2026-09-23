-- Adiciona contadores de visualização e curtida aos documentos, usados
-- pela galeria pública (só fotos/vídeos aprovados).
alter table trab_divulgados.documentos
  add column if not exists visualizacoes integer not null default 0,
  add column if not exists curtidas integer not null default 0;
