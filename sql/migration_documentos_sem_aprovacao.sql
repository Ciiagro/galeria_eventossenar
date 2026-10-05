-- Documentos (PDF: relatórios, ficha de frequência, portfólio) não passam por aprovação do administrador:
-- só as ações pedagógicas (vídeo/imagem) são aprovadas, porque algumas vão para a galeria pública.
-- Os documentos que estavam "pendentes" passam a "aprovado" (= recebido), saindo das filas de revisão.
-- Rode DEPOIS de sql/migration_documentos_categoria.sql. Pode rodar de novo sem problema.
update trab_divulgados.documentos d
set status = 'aprovado',
    validado_em = coalesce(d.validado_em, now())
from trab_divulgados.acoes_pedagogicas a
where d.acao_pedagogica_id = a.id
  and a.exige_pdf = true
  and d.status = 'pendente';
