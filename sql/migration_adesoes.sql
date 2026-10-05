-- ============================================================
-- Projeto Valores Humanos — ADESÃO AO PROGRAMA
-- Rode UMA VEZ no SQL Editor do Supabase (pode rodar de novo sem problema).
--
-- Fluxo: o coordenador se cadastra pelo link público, entra, escolhe o
-- município e as escolas que vão participar e envia a ficha de adesão.
-- O administrador confere e aprova (menu Termo de Adesão).
--
-- Pré-requisito: já ter rodado migration_valores_ciclos.sql e
-- migration_escolas_programa.sql.
-- ============================================================

-- Dados do coordenador (o login em si fica no Supabase Auth)
create table if not exists trab_divulgados.coordenadores_cadastro (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  cpf text not null,
  rg text,
  telefone1 text,
  telefone2 text,
  email text,
  created_at timestamptz not null default now()
);
-- Município em que o coordenador vai atuar (escolhido já no cadastro)
alter table trab_divulgados.coordenadores_cadastro
  add column if not exists municipio_id bigint references sindicatos.municipios(cod_ibge);

create unique index if not exists uq_coordenadores_cadastro_cpf
  on trab_divulgados.coordenadores_cadastro (cpf);

-- Uma adesão por coordenador em cada ciclo
create table if not exists trab_divulgados.adesoes (
  id uuid primary key default gen_random_uuid(),
  ciclo_id uuid not null references trab_divulgados.ciclos(id) on delete cascade,
  coordenador_id uuid not null references auth.users(id) on delete cascade,
  municipio_id bigint references sindicatos.municipios(cod_ibge),
  status text not null default 'rascunho'
    check (status in ('rascunho', 'enviada', 'aprovada')),

  prefeito_nome text,
  prefeito_rg text,
  prefeito_cpf text,
  prefeitura_endereco text,
  prefeitura_cep text,
  prefeitura_telefone text,
  prefeitura_email text,

  secretario_nome text,
  secretario_cpf text,
  secretaria_endereco text,
  secretaria_telefone text,
  secretaria_email text,

  responsavel_preenchimento text,
  total_escolas_informado int,
  total_professores_informado int,

  observacao_admin text,           -- recado do admin ao devolver para correção
  enviada_em timestamptz,
  aprovada_em timestamptz,
  aprovada_por uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (ciclo_id, coordenador_id)
);

create index if not exists idx_adesoes_ciclo_municipio
  on trab_divulgados.adesoes (ciclo_id, municipio_id);

-- Escolas escolhidas em cada adesão (com professores e matrículas do Infantil 3, 4 e 5)
create table if not exists trab_divulgados.adesao_escolas (
  adesao_id uuid not null references trab_divulgados.adesoes(id) on delete cascade,
  escola_id uuid not null references trab_divulgados.escolas(id) on delete cascade,
  quantidade_professores int not null default 0,
  matricula_infantil_3 int not null default 0,
  matricula_infantil_4 int not null default 0,
  matricula_infantil_5 int not null default 0,
  primary key (adesao_id, escola_id)
);

-- Segurança: o backend usa a service key; ninguém mais lê estas tabelas direto.
alter table trab_divulgados.coordenadores_cadastro enable row level security;
alter table trab_divulgados.adesoes enable row level security;
alter table trab_divulgados.adesao_escolas enable row level security;

drop policy if exists "admin_select_coordenadores_cadastro" on trab_divulgados.coordenadores_cadastro;
create policy "admin_select_coordenadores_cadastro" on trab_divulgados.coordenadores_cadastro
  for select using ( trab_divulgados.is_admin() );

drop policy if exists "admin_select_adesoes" on trab_divulgados.adesoes;
create policy "admin_select_adesoes" on trab_divulgados.adesoes
  for select using ( trab_divulgados.is_admin() );

drop policy if exists "admin_select_adesao_escolas" on trab_divulgados.adesao_escolas;
create policy "admin_select_adesao_escolas" on trab_divulgados.adesao_escolas
  for select using ( trab_divulgados.is_admin() );

grant all on trab_divulgados.coordenadores_cadastro to service_role;
grant all on trab_divulgados.adesoes to service_role;
grant all on trab_divulgados.adesao_escolas to service_role;

notify pgrst, 'reload schema';
