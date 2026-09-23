# FAEC SENAR CE — Documentação Municipal

Backend em Python (Vercel Serverless Functions) + Supabase (Postgres/Auth) +
Google Drive (armazenamento de arquivos).

## Estrutura

```
faec-documentacao/
├── api/
│   ├── municipios.py    GET  /api/municipios      -> lista municípios + progresso
│   ├── documentos.py    GET  /api/documentos      -> lista documentos (filtros: municipio_id, status)
│   │                    POST /api/documentos      -> cria documento (status = pendente)
│   ├── validar.py       POST /api/validar         -> aprova/rejeita documento (admin)
│   ├── upload.py        POST /api/upload          -> sobe arquivo pro Drive
│   └── escolas.py       GET  /api/escolas         -> lista escolas (filtro municipio_id)
│                        POST /api/escolas         -> cadastra escola (nome, tipo, endereço, lat/lng)
│                        DELETE /api/escolas?id=... -> remove escola
├── lib/
│   ├── supabase_client.py
│   └── drive_client.py
├── schema.sql            rode isso no SQL Editor do Supabase
├── vercel.json
├── requirements.txt
└── .env.example
```

## Passo a passo

### 1. Supabase
1. Crie um projeto em supabase.com (ou reutilize um existente — este
   sistema vive isolado no schema `trab_divulgados`, então não colide
   com tabelas de outros projetos que já estejam no mesmo banco).
2. **Município reaproveitado:** o schema assume que você já tem uma
   tabela `sindicatos.municipios` (com `id` do tipo `uuid`) e não cria
   uma nova — só uma tabela de extensão (`municipios_extra`) com os
   campos que faltam (`drive_folder_id`, `periodo`) e uma view
   (`trab_divulgados.municipios`) que junta as duas. Se o `id` de
   `sindicatos.municipios` for numérico em vez de `uuid`, ajuste os
   pontos marcados com `<-- ajuste se id for numérico` no `schema.sql`
   antes de rodar.
3. No **SQL Editor**, rode o conteúdo de `schema.sql` — cria o schema
   `trab_divulgados`, as tabelas, RLS e o catálogo de tipos de documento.
4. **Passo obrigatório:** vá em **Project Settings > API > Exposed
   schemas** e adicione `trab_divulgados` na lista (por padrão só
   `public` fica exposto — sem isso, a API responde erro dizendo que o
   schema não foi encontrado). Não precisa expor `sindicatos`, porque
   o acesso a ele acontece dentro da view, no próprio Postgres.
5. Em **Authentication**, crie os usuários (admin e um por município) ou
   habilite signup e crie via API.
6. Para cada usuário, insira uma linha em `trab_divulgados.perfis` com
   `role` = `admin` ou `municipio` (e `municipio_id` no caso de município).
7. Copie `Project URL` e `service_role key` em Project Settings > API.

### 2. Google Drive
1. No Google Cloud Console, ative a **Google Drive API**.
2. Crie uma **Service Account** e gere a chave em JSON.
3. Crie a pasta raiz no Drive e compartilhe com o e-mail da service
   account (papel Editor).
4. Para cada município, crie (ou deixe o sistema criar via
   `create_municipio_folder`) uma subpasta e salve o `id` dela em
   `municipios.drive_folder_id`.
5. Codifique o JSON da service account em base64:
   `base64 -w 0 service-account.json`

### 3. Variáveis de ambiente
Copie `.env.example` para `.env` localmente, e cadastre as mesmas
variáveis em Vercel (Project Settings > Environment Variables):
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_SERVICE_ACCOUNT_B64`
- `DRIVE_ROOT_FOLDER_ID`

### 4. Deploy
```bash
npm i -g vercel     # se ainda não tiver
cd faec-documentacao
vercel
```
O Vercel detecta os arquivos em `api/*.py` automaticamente como
funções serverless Python (runtime configurado em `vercel.json`).

## Fluxo de uso (frontend)

O frontend (a montar — pode ser Next.js, React puro ou o que preferir)
consome esses endpoints:

1. Login via **Supabase Auth** (client-side) → obtém o JWT.
2. Tela "Cadastro do Município" (ou uma aba dentro dela): lista/cadastra
   as escolas do município via `/api/escolas`, cada uma com nome, tipo
   e localização (endereço ou lat/lng — dá pra plotar num mapa depois).
3. Tela "Adicionar Documento": o campo "Ação/Evento" pode ganhar um
   seletor opcional de escola (`escola_id`), pra saber em qual unidade
   aquela ação aconteceu. Fluxo completo:
   - se o usuário escolher um arquivo → `POST /api/upload` (multipart)
     recebe `drive_file_id` e `drive_file_link`.
   - depois → `POST /api/documentos` com esses dados + os campos do
     formulário. Cria com `status = pendente`.
   - se o usuário colar um link (Drive/YouTube) → pula o `/api/upload`
     e manda direto `link_externo` pro `/api/documentos`.
4. Painel do admin:
   - `GET /api/documentos?status=pendente` → fila de validação.
   - `POST /api/validar` → aprova ou rejeita (com motivo).
5. Dashboard do município (tela inicial):
   - `GET /api/municipios` → progresso (%), total, aprovados, pendentes
     por município, pra montar os cards que você desenhou nos mockups.

### Testar sem login/Drive configurados ainda
Pra focar só no fluxo de inserir documentos, sem precisar configurar
Auth nem Google Drive primeiro:
1. No `.env`, deixe `DEV_SKIP_AUTH=true` (já vem assim no `.env.example`).
   Isso faz o backend aceitar as requisições sem exigir login — **não
   use isso quando publicar de verdade**.
2. Rode `seed_dev.sql` no SQL Editor do Supabase pra criar um município
   de teste (é preciso ter pelo menos um pra acessar a tela de novo
   documento).
3. No formulário "Adicionar Documento", use o campo **Link alternativo**
   em vez de anexar um arquivo — assim testa o fluxo inteiro (criação do
   documento com `status = pendente`, aparecendo em Pendências) sem
   precisar da conta de serviço do Google Drive ainda.

## Como rodar (dois modos possíveis)

Este projeto tem **dois backends equivalentes**, escolha um:

- **`app.py`** — Flask tradicional, um processo só (`python app.py`). Mais
  simples pra rodar e debugar local, no VS Code.
- **`api/*.py`** — funções serverless (formato que o Vercel entende). Só
  usadas se/quando for publicar lá (`vercel dev` / `vercel deploy`).

A lógica de negócio (Supabase, Google Drive) é a mesma nos dois — está
toda em `lib/`. `app.py` e `api/*.py` são só a "casca" HTTP.

### Rodando com um único comando (mais simples)
```bash
npm install               # já baixa o concurrently também
npm run dev:all
```
Isso sobe backend (Flask, porta 5000) e frontend (Next.js, porta 3000)
juntos, num terminal só — a saída de cada um aparece colorida e
identificada (`backend` / `frontend`). `Ctrl+C` uma vez encerra os dois.

Isso não substitui configurar o `.env` (backend) e o `.env.local`
(frontend) antes — só evita ter que abrir dois terminais manualmente.

### Modo Flask local (rodando cada um separado, se preferir)
```bash
pip install -r requirements.txt --break-system-packages
cp .env.example .env      # preencha com os dados do Supabase e do Drive
python app.py             # sobe em http://localhost:5000
```
Em outro terminal, o frontend:
```bash
npm install
cp .env.local.example .env.local
# garanta que NEXT_PUBLIC_API_BASE_URL=http://localhost:5000 está descomentado
npm run dev               # sobe em http://localhost:3000
```
Acesse `http://localhost:3000/login`.

### Modo Vercel (quando for publicar)
```bash
npm i -g vercel
vercel dev
```
Nesse modo, apague/comente `NEXT_PUBLIC_API_BASE_URL` no `.env.local`
(deixe vazio), porque frontend e API passam a ficar na mesma origem.



O frontend fica no mesmo projeto Vercel que as funções Python — sem CORS,
sem outro deploy. Estrutura:

```
app/
├── layout.tsx                          layout raiz (sidebar + fonte)
├── page.tsx                            Início: lista de municípios + progresso
├── login/page.tsx                      login (Supabase Auth, e-mail/senha)
├── municipios/[id]/page.tsx            documentos do município, agrupados por tipo
├── municipios/[id]/novo-documento/     formulário "Adicionar Documento"
└── admin/pendencias/page.tsx           fila de validação (aprovar/rejeitar)

src/
├── lib/api.ts                          chamadas aos endpoints /api/*.py (injeta o JWT)
├── lib/supabaseBrowserClient.ts        cliente Supabase só para login/logout
└── components/                        Sidebar, StatusBadge
```

### Rodando localmente
```bash
npm install
cp .env.local.example .env.local   # preencha com Project URL + anon key do Supabase
npm run dev
```

### Deploy
O mesmo `vercel deploy` já publica frontend (Next.js, detectado automaticamente)
e as funções Python juntos. Cadastre tanto as env vars do `.env.example`
(backend) quanto as do `.env.local.example` (frontend, prefixo `NEXT_PUBLIC_`)
no painel do Vercel.

### Pendências conhecidas deste scaffold
- Não há guarda de rota: se o usuário não estiver logado, as chamadas à
  API retornam 401 e a tela mostra o erro — ainda falta redirecionar
  automaticamente para `/login`.
- O cadastro de escolas (`/api/escolas`) tem endpoint pronto, mas ainda
  não tem tela própria no frontend — hoje só é consumido (dropdown) na
  tela de novo documento.
- Sem paginação nas listagens; ok para o volume atual, revisar se
  crescer muito.

- Endpoint `PATCH /api/municipios/:id` para o admin editar dados do
  município (o botão "Editar Município" do mockup).
- Notificações (o sininho com contador) — pode ser uma tabela
  `notificacoes` populada por trigger no Postgres quando um documento
  muda de status.
- Paginação em `/api/documentos` quando o volume crescer.
- Trocar `cgi.FieldStorage` em `upload.py` por `python-multipart` se
  migrar para Python 3.13+.
