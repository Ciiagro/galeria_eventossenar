-- ============================================================
-- Índices para a lista de escolas abrir mais rápido
-- Rode UMA VEZ no SQL Editor do Supabase (pode rodar de novo sem problema).
--
-- A tela de Escolas busca ~10 mil escolas ordenadas por nome, em páginas de 1000.
-- Sem estes índices o banco reordena a tabela inteira a cada página.
-- ============================================================
create index if not exists idx_escolas_nome_id
  on trab_divulgados.escolas (nome, id);

create index if not exists idx_escolas_municipio_nome_id
  on trab_divulgados.escolas (municipio_id, nome, id);

analyze trab_divulgados.escolas;
