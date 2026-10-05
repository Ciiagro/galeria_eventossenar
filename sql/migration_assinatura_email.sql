-- ============================================================
-- Projeto Valores Humanos — ASSINATURA DO TERMO POR E-MAIL
-- Rode UMA VEZ no SQL Editor do Supabase (pode rodar de novo sem problema).
--
-- Fluxo: o coordenador clica em "Enviar para assinatura"; prefeito(a), presidente do
-- sindicato e coordenador(a) recebem um link único por e-mail, confirmam com um código
-- (também por e-mail) e assinam. Com as 3 assinaturas, o sistema gera o PDF final,
-- guarda no Drive e preenche os campos termo_assinado_* da adesão (como se o coordenador
-- tivesse anexado o PDF).
--
-- Pré-requisito: já ter rodado migration_adesoes.sql e migration_termo_assinado.sql.
-- ============================================================

-- Um "pedido" = uma rodada de assinaturas sobre uma versão da ficha
create table if not exists trab_divulgados.assinatura_pedidos (
  id uuid primary key default gen_random_uuid(),
  adesao_id uuid not null references trab_divulgados.adesoes(id) on delete cascade,
  hash_termo text not null,            -- mesmo hash de _hash_conteudo_adesao: identifica a versão assinada
  snapshot jsonb not null,             -- cópia do termo no momento do envio (é isto que as pessoas assinam)
  status text not null default 'pendente'
    check (status in ('pendente', 'concluido', 'cancelado')),
  pdf_drive_id text,
  concluido_em timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_assinatura_pedidos_adesao
  on trab_divulgados.assinatura_pedidos (adesao_id, created_at desc);

-- Cada pessoa que precisa assinar
create table if not exists trab_divulgados.assinatura_signatarios (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references trab_divulgados.assinatura_pedidos(id) on delete cascade,
  papel text not null check (papel in ('prefeito', 'secretario', 'sindicato', 'coordenador')),
  nome text not null,
  email text not null,
  token_hash text not null unique,     -- só o hash do link fica guardado
  codigo_hash text,                    -- hash do código de 6 dígitos enviado ao e-mail
  codigo_expira_em timestamptz,
  codigo_tentativas int not null default 0,
  codigo_enviado_em timestamptz,
  convite_enviado_em timestamptz,
  assinado_em timestamptz,
  assinado_nome_digitado text,         -- nome que a pessoa digitou ao assinar
  ip text,
  user_agent text,
  created_at timestamptz not null default now(),
  unique (pedido_id, papel)
);

-- Segurança: só o backend (service key) mexe nestas tabelas; ninguém lê direto do navegador.
alter table trab_divulgados.assinatura_pedidos enable row level security;
alter table trab_divulgados.assinatura_signatarios enable row level security;

grant all on trab_divulgados.assinatura_pedidos to service_role;
grant all on trab_divulgados.assinatura_signatarios to service_role;

notify pgrst, 'reload schema';

-- Quem já rodou a versão anterior (sem o secretário de educação): libera o novo papel
alter table trab_divulgados.assinatura_signatarios drop constraint if exists assinatura_signatarios_papel_check;
alter table trab_divulgados.assinatura_signatarios
  add constraint assinatura_signatarios_papel_check
  check (papel in ('prefeito', 'secretario', 'sindicato', 'coordenador'));

notify pgrst, 'reload schema';
