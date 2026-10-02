-- ============================================================
-- Fim da rejeição de documentos + "Arquivar"
-- Rode UMA VEZ no SQL Editor do Supabase.
--
-- Agora todo documento enviado é aceito. A equipe só decide:
--   * Aprovado (fica na lista para consulta)
--   * Na galeria (aprovado + publicado, coluna na_galeria)
--   * Arquivado (guardado, fora da lista do dia a dia; dá para desarquivar)
-- ============================================================

alter table trab_divulgados.documentos
  add column if not exists arquivado boolean not null default false,
  add column if not exists arquivado_em timestamptz;

-- O que já estava rejeitado passa a ficar aprovado e arquivado
-- (guardado, fora da galeria e fora da lista principal).
update trab_divulgados.documentos
set status = 'aprovado',
    arquivado = true,
    arquivado_em = coalesce(arquivado_em, now()),
    na_galeria = false,
    motivo_rejeicao = null
where status = 'rejeitado';

create index if not exists idx_documentos_arquivado
  on trab_divulgados.documentos(municipio_id)
  where arquivado;

notify pgrst, 'reload schema';
