-- ============================================================
-- Corrige datas de realização digitadas errado (ex.: ano 20206)
-- Rode no SQL Editor do Supabase, UMA PARTE DE CADA VEZ.
-- ============================================================

-- 1) VER quais documentos estão com data impossível
select id, acao_evento, data_realizacao, status
from trab_divulgados.documentos
where extract(year from data_realizacao) < 2000
   or extract(year from data_realizacao) > extract(year from now()) + 1;

-- 2) CORRIGIR o caso do ano 20206 -> 2026 (mantém mês e dia)
update trab_divulgados.documentos
set data_realizacao = make_date(
      2026,
      extract(month from data_realizacao)::int,
      extract(day from data_realizacao)::int
    )
where extract(year from data_realizacao) = 20206;

-- 3) Rodar o passo 1 de novo: não deve aparecer mais nada.
