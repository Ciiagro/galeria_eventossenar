-- ============================================================
-- CANAL DE COMUNICAÇÃO
-- O administrador envia comunicados (avisos) para um ou mais públicos:
--   * Coordenadores e Equipe de apoio: recebem DENTRO do sistema (com "Novo" e controle de quem leu)
--     e TAMBÉM por e-mail.
--   * Secretários de educação: não têm login (são contatos da ficha de adesão), então recebem SÓ por e-mail.
--
-- Rode este script inteiro no SQL Editor do Supabase (pode rodar mais de uma vez).
-- Se você já tinha rodado a versão anterior (coluna "publico"), ele converte o que já existe.
-- ============================================================

-- 1) Os comunicados
create table if not exists trab_divulgados.comunicados (
  id                 uuid primary key default gen_random_uuid(),
  titulo             text not null check (char_length(titulo) between 1 and 150),
  mensagem           text not null check (char_length(mensagem) between 1 and 5000),
  link               text,                                  -- endereço opcional (ex.: pasta do Drive)
  para_coordenadores boolean not null default true,
  para_apoiadores    boolean not null default false,
  para_secretarios   boolean not null default false,        -- recebem só por e-mail
  fixado             boolean not null default false,        -- aparece sempre no topo
  arquivado          boolean not null default false,
  criado_por         uuid references auth.users(id) on delete set null,
  criado_por_nome    text,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz
);

-- 1b) Quem já tinha a versão anterior: acrescenta as colunas novas e converte o antigo "publico"
alter table trab_divulgados.comunicados add column if not exists para_coordenadores boolean not null default true;
alter table trab_divulgados.comunicados add column if not exists para_apoiadores    boolean not null default false;
alter table trab_divulgados.comunicados add column if not exists para_secretarios   boolean not null default false;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'trab_divulgados' and table_name = 'comunicados' and column_name = 'publico'
  ) then
    update trab_divulgados.comunicados set
      para_coordenadores = publico in ('coordenadores', 'todos'),
      para_apoiadores    = publico in ('apoiadores', 'todos'),
      para_secretarios   = false;
    alter table trab_divulgados.comunicados drop column publico;
  end if;
end $$;

alter table trab_divulgados.comunicados drop constraint if exists comunicados_tem_destinatario;
alter table trab_divulgados.comunicados
  add constraint comunicados_tem_destinatario
  check (para_coordenadores or para_apoiadores or para_secretarios);

create index if not exists idx_comunicados_lista
  on trab_divulgados.comunicados (arquivado, fixado desc, criado_em desc);

-- 2) Quem já leu cada comunicado (dentro do sistema)
create table if not exists trab_divulgados.comunicados_leituras (
  comunicado_id uuid not null references trab_divulgados.comunicados(id) on delete cascade,
  usuario_id    uuid not null references auth.users(id) on delete cascade,
  lido_em       timestamptz not null default now(),
  primary key (comunicado_id, usuario_id)
);

create index if not exists idx_comunicados_leituras_usuario
  on trab_divulgados.comunicados_leituras (usuario_id);

-- 3) Envio por e-mail: um registro por pessoa (evita mandar duas vezes e permite retomar ou
--    reenviar só os que falharam)
create table if not exists trab_divulgados.comunicados_envios (
  id            bigint generated always as identity primary key,
  comunicado_id uuid not null references trab_divulgados.comunicados(id) on delete cascade,
  tipo          text not null default 'secretario' check (tipo in ('coordenador', 'apoiador', 'secretario')),
  usuario_id    uuid,                                      -- coordenador/apoiador (quem tem login)
  municipio_id  bigint,
  nome          text,
  email         text not null,
  status        text not null default 'pendente' check (status in ('pendente', 'enviado', 'erro')),
  erro          text,
  enviado_em    timestamptz,
  unique (comunicado_id, email)
);

-- 3b) Quem já tinha a versão anterior (só secretários): acrescenta as colunas novas
alter table trab_divulgados.comunicados_envios add column if not exists tipo text not null default 'secretario';
alter table trab_divulgados.comunicados_envios add column if not exists usuario_id uuid;
alter table trab_divulgados.comunicados_envios drop constraint if exists comunicados_envios_tipo_check;
alter table trab_divulgados.comunicados_envios
  add constraint comunicados_envios_tipo_check check (tipo in ('coordenador', 'apoiador', 'secretario'));

create index if not exists idx_comunicados_envios_status
  on trab_divulgados.comunicados_envios (comunicado_id, status);

-- 4) Contagens (o painel do administrador usa)
create or replace view trab_divulgados.comunicados_leituras_contagem as
  select comunicado_id, count(*)::int as lidos
  from trab_divulgados.comunicados_leituras
  group by comunicado_id;

create or replace view trab_divulgados.comunicados_envios_contagem as
  select comunicado_id, status, count(*)::int as qtd
  from trab_divulgados.comunicados_envios
  group by comunicado_id, status;

-- 5) Segurança: só o servidor do sistema (service_role) lê e grava essas tabelas.
--    Com a RLS ligada e SEM política, o navegador não consegue acessar direto:
--    todo acesso passa pelo servidor, que confere o perfil de quem está logado.
alter table trab_divulgados.comunicados          enable row level security;
alter table trab_divulgados.comunicados_leituras enable row level security;
alter table trab_divulgados.comunicados_envios   enable row level security;

grant all on trab_divulgados.comunicados          to service_role;
grant all on trab_divulgados.comunicados_leituras to service_role;
grant all on trab_divulgados.comunicados_envios   to service_role;
grant select on trab_divulgados.comunicados_leituras_contagem to service_role;
grant select on trab_divulgados.comunicados_envios_contagem   to service_role;
