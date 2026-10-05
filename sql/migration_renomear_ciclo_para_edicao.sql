-- ============================================================
-- Renomeia, no banco, as edições que ainda começam com "Ciclo".
-- Ex.: "Ciclo 2026" vira "Edição 2026".
--
-- Rode UMA VEZ no SQL Editor do Supabase (pode rodar de novo sem problema:
-- só mexe em nomes que ainda começam com "Ciclo").
-- Só muda o NOME mostrado nas telas; documentos, datas e vínculos continuam iguais.
-- ============================================================

update trab_divulgados.ciclos
   set nome = regexp_replace(nome, '^\s*ciclo', 'Edição', 'i')
 where nome ~* '^\s*ciclo(\s|$)';

-- confere o resultado
select id, nome, data_inicio, data_fim, ativo
  from trab_divulgados.ciclos
 order by data_inicio desc;
