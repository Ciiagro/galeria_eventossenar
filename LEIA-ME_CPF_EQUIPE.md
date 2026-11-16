# CPF da equipe (apoiadores e administradores)

Para guardar o CPF na tela **Equipe**, crie a coluna uma vez no Supabase (SQL Editor):

```sql
alter table public.perfis add column if not exists cpf text;
```

Sem essa coluna, a tela continua funcionando; só o CPF não é guardado (aparece um aviso ao salvar).
