-- Corrige: excluir um responsável falhava com "Database error deleting user"
-- porque documentos.responsavel_envio_id e documentos.validado_por apontavam
-- pro usuário sem dizer o que fazer ao excluí-lo. Agora, ao excluir o login,
-- esses campos só ficam nulos — o documento em si (e o nome/e-mail digitados
-- no envio) continua intacto, só perde a referência ao login que não existe mais.

alter table trab_divulgados.documentos
  drop constraint if exists documentos_responsavel_envio_id_fkey,
  add constraint documentos_responsavel_envio_id_fkey
    foreign key (responsavel_envio_id) references auth.users(id) on delete set null;

alter table trab_divulgados.documentos
  drop constraint if exists documentos_validado_por_fkey,
  add constraint documentos_validado_por_fkey
    foreign key (validado_por) references auth.users(id) on delete set null;
