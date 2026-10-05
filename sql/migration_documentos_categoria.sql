-- "Relatório" deixa de ser uma ação pedagógica: vira o grupo "Documentos" (sempre PDF),
-- com os 4 tipos abaixo. Ações pedagógicas passam a ser só as que se comprovam com vídeo/imagem.
-- Rode UMA VEZ no SQL Editor do Supabase (pode rodar de novo sem problema).
-- ATENÇÃO: não rode de novo o sql/migration_acoes_pedagogicas.sql depois deste: ele recria a ação "Relatório".

update trab_divulgados.acoes_pedagogicas
set nome = 'Documentos',
    ordem = 99,
    exige_pdf = true,
    subtipos = array['Relatório de Formação', 'Relatório de Visita', 'Ficha de Frequência', 'Portfólio']
where lower(nome) in ('relatório', 'relatorio', 'documentos');

-- o nome antigo da ficha passa para o novo
update trab_divulgados.documentos
set subtipo = 'Ficha de Frequência'
where subtipo in ('Ficha de presença', 'Ficha de frequência');

-- Obs.: documentos antigos com subtipo "Relatório" ou "Convite" continuam existindo com o nome antigo
-- (não dá para saber se eram de Formação ou de Visita). O administrador pode ajustar caso a caso.

notify pgrst, 'reload schema';
