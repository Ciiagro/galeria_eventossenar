-- ============================================================
-- Publicação na galeria decidida pelo administrador
-- Rode UMA VEZ no SQL Editor do Supabase.
--
-- Antes: todo documento aprovado do tipo Imagens/Vídeos ia sozinho
-- para a galeria pública, com a descrição original de quem enviou.
-- Agora: ao aprovar, o admin escolhe se vai ou não para a galeria e
-- pode reescrever a descrição (descricao_galeria) antes de publicar.
-- ============================================================

alter table trab_divulgados.documentos
  add column if not exists na_galeria boolean not null default false,
  add column if not exists descricao_galeria text,
  add column if not exists publicado_galeria_em timestamptz;

-- Mantém na galeria o que já aparecia lá hoje (aprovados de Imagens/Vídeos)
update trab_divulgados.documentos d
set na_galeria = true,
    descricao_galeria = coalesce(d.descricao_galeria, d.descricao),
    publicado_galeria_em = coalesce(d.publicado_galeria_em, d.validado_em, now())
from trab_divulgados.tipos_documento t
where t.id = d.tipo_id
  and d.status = 'aprovado'
  and t.nome in ('Imagens', 'Vídeos')
  and d.na_galeria = false;

create index if not exists idx_documentos_galeria
  on trab_divulgados.documentos(municipio_id, data_realizacao desc)
  where na_galeria;

notify pgrst, 'reload schema';
