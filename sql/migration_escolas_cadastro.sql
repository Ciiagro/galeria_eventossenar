-- ============================================================
-- Responsável municipal pode CADASTRAR escolas novas e EDITAR os dados das
-- escolas do seu município (nome, tipo, endereço, latitude e longitude),
-- porque às vezes o cadastro vem incompleto.
-- Rode UMA VEZ no SQL Editor do Supabase (pode rodar de novo sem problema).
--
-- Continua valendo: o responsável só mexe em escolas do PRÓPRIO município
-- e não consegue mudar uma escola de município. Admin pode tudo.
-- ============================================================

-- 1) Cadastrar: só em escolas do próprio município
drop policy if exists "municipio_insert_own_escolas" on trab_divulgados.escolas;
create policy "municipio_insert_own_escolas" on trab_divulgados.escolas
  for insert
  with check ( trab_divulgados.meu_municipio_id() = municipio_id );

grant insert on trab_divulgados.escolas to authenticated;

-- 2) Editar: só no próprio município (a policy de UPDATE já existe em migration_escolas_edicao.sql)
drop policy if exists "municipio_update_own_escolas" on trab_divulgados.escolas;
create policy "municipio_update_own_escolas" on trab_divulgados.escolas
  for update
  using ( trab_divulgados.meu_municipio_id() = municipio_id )
  with check ( trab_divulgados.meu_municipio_id() = municipio_id );

grant update on trab_divulgados.escolas to authenticated;

-- 3) Gatilho: quem não é admin altera só nome, tipo, endereço, latitude e longitude
--    (nem o município, nem o código INEP, nem nada além disso).
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

  if (to_jsonb(new) - array['nome','tipo','endereco','latitude','longitude'])
     is distinct from
     (to_jsonb(old) - array['nome','tipo','endereco','latitude','longitude']) then
    raise exception 'Você só pode alterar nome, tipo, endereço, latitude e longitude da escola.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_escolas_limita_edicao_municipio on trab_divulgados.escolas;
create trigger trg_escolas_limita_edicao_municipio
  before update on trab_divulgados.escolas
  for each row execute function trab_divulgados.escolas_limita_edicao_municipio();

notify pgrst, 'reload schema';
