-- Comunicado para pessoas específicas (opcional).
-- Vazio/nulo = vai para o grupo inteiro (como era antes). Preenchido = só essas pessoas (ids de auth.users).
-- Rode uma vez no SQL Editor do Supabase.
alter table trab_divulgados.comunicados add column if not exists destinatarios_ids uuid[];
