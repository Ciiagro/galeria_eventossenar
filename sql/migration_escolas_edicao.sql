-- ============================================================
-- Responsável municipal pode COMPLETAR os dados das escolas do seu município
-- (endereço, latitude e longitude). Rode inteiro no SQL Editor do Supabase.
--
-- Antes: o responsável só podia ver e cadastrar escolas — não havia policy de UPDATE.
-- Agora:
--   1) policy de UPDATE só para as escolas do próprio município;
--   2) um gatilho garante que o responsável NÃO consiga mexer em nada além de
--      endereço, latitude e longitude (nem chamando o banco direto, sem passar pelo app).
--      Admin, o SQL Editor e o backend com service key continuam podendo tudo.
-- ============================================================

-- 1) Policy: responsável atualiza apenas escolas do próprio município
drop policy if exists "municipio_update_own_escolas" on trab_divulgados.escolas;
create policy "municipio_update_own_escolas" on trab_divulgados.escolas
  for update
  using ( trab_divulgados.meu_municipio_id() = municipio_id )
  with check ( trab_divulgados.meu_municipio_id() = municipio_id );

grant update on trab_divulgados.escolas to authenticated;

-- 2) Gatilho: só endereco, latitude e longitude podem mudar para quem não é admin
create or replace function trab_divulgados.escolas_limita_edicao_municipio()
returns trigger
language plpgsql
set search_path = trab_divulgados, public
as $$
begin
  -- sem usuário logado (SQL Editor, service key) ou admin: liberado
  if auth.uid() is null or trab_divulgados.is_admin() then
    return new;
  end if;

  -- compara a linha inteira, ignorando os 3 campos liberados
  -- (funciona mesmo se a tabela ganhar colunas novas no futuro)
  if (to_jsonb(new) - array['endereco','latitude','longitude'])
     is distinct from
     (to_jsonb(old) - array['endereco','latitude','longitude']) then
    raise exception 'Você só pode alterar endereço, latitude e longitude da escola.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_escolas_limita_edicao_municipio on trab_divulgados.escolas;
create trigger trg_escolas_limita_edicao_municipio
  before update on trab_divulgados.escolas
  for each row execute function trab_divulgados.escolas_limita_edicao_municipio();
