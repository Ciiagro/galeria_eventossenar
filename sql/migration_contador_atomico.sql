-- Contador atômico de visualizações/curtidas da galeria.
-- Antes o backend lia o valor e gravava +1 (duas visitas ao mesmo tempo contavam como uma só).
-- Esta função soma direto no banco, numa única operação, e devolve o novo total.
create or replace function trab_divulgados.incrementar_contador_documento(p_id text, p_campo text)
returns integer
language plpgsql
set search_path = trab_divulgados, public
as $$
declare
  novo integer;
begin
  if p_campo = 'visualizacoes' then
    update documentos set visualizacoes = coalesce(visualizacoes, 0) + 1
    where id::text = p_id and na_galeria = true
    returning visualizacoes into novo;
  elsif p_campo = 'curtidas' then
    update documentos set curtidas = coalesce(curtidas, 0) + 1
    where id::text = p_id and na_galeria = true
    returning curtidas into novo;
  else
    raise exception 'Campo inválido: %', p_campo;
  end if;
  return novo;
end;
$$;

revoke all on function trab_divulgados.incrementar_contador_documento(text, text) from public, anon, authenticated;
grant execute on function trab_divulgados.incrementar_contador_documento(text, text) to service_role;

notify pgrst, 'reload schema';
