# Projeto Valores Humanos — o que mudou

## Como colocar no ar (nesta ordem)

1. **Supabase → SQL Editor:** `sql/migration_valores_ciclos.sql` (ciclos; liga os documentos antigos ao ciclo do ano).
2. `sql/migration_acoes_pedagogicas.sql` (10 ações pedagógicas e tipos Vídeo/Imagem/PDF).
3. `sql/migration_escolas_programa.sql` (escolas que participam do programa, por ciclo).
4. `sql/migration_escolas_cadastro.sql` (responsável municipal pode cadastrar e editar escolas do seu município).
5. `sql/painel_resumo.sql` de novo — tem que ser DEPOIS dos quatro acima.
6. Reinicie o backend (`app.py`) e o frontend, ou faça o deploy normal (Vercel).

## Visual alegre
- Tela Escolas do programa: topo festivo, cores do programa, barra de progresso colorida e crianças no rodapé.
- Fundo de todas as telas (menos login e galeria, que já têm o próprio): creme liso e, só no pé da página, as crianças
  na grama em tamanho pequeno (`src/components/FundoSistema.tsx`). O arquivo `public/fundo-confete.svg` não é mais usado.
- Menu lateral alegre: fundo creme, logo do projeto com sol, cada item do menu com uma cor do programa, e as crianças
  na grama no pé (só em telas altas). A lateral agora acompanha a rolagem. A marca da FAEC fica no pé, sobre o bloco verde.
- Desenhos em `src/components/Desenhos.tsx` (crianças, escolinha, nuvem, estrela, coração, flor, árvore, grama).
  São decoração (`aria-hidden`) e podem ser usados em outras telas.

## Cadastrar e editar escolas
- Tela **Escolas**: botão **+ Nova escola** (só o nome é obrigatório; endereço e localização podem ficar para depois)
  e **Editar/Completar** em cada escola (nome, tipo, endereço, latitude e longitude).
- Admin: qualquer município. Responsável municipal: só o próprio (garantido pelo banco, não só pela tela).
- Escola nova entra sozinha no programa do ciclo ativo (o admin pode desmarcar em Escolas do programa).
- Nome repetido no mesmo município é recusado (ignora acento e maiúsculas).

## Escolas do programa
- Nem todas as escolas participam. Admin → **Escolas do programa**: escolha o ciclo e o município e marque ou desmarque
  cada escola (ou "Marcar/Desmarcar as N da lista", que respeita a busca e o filtro). Grava na hora.
- A lista é **por ciclo**: no ciclo novo ela começa vazia. Escolas que já tinham documentos num ciclo entram nele sozinhas.
- Formulário de envio: só aparecem as escolas do programa no ciclo ativo, e o backend recusa escola fora dele.
- Tela Escolas (endereços): mostra só as escolas do programa, com caixa para ver todas.
- Painel: "Escolas no programa" = marcadas no ciclo; abaixo, quantas já enviaram documentos.
- Se tirar do programa uma escola que já enviou, os documentos ficam salvos (a tela avisa).

## Ações pedagógicas e tipos de arquivo
- Ações: Acolhimento, Meditação, Prática Compartilhada, Círculo do Amor, Família na Escola, Hora do Conto,
  Momento Cívico, Momento da Refeição, Aniversariante do Mês e Relatório.
- **Relatório** é a única ação enviada em PDF e pede o tipo: Relatório, Ficha de presença ou Convite.
  As outras nove ações aceitam só Vídeo ou Imagem (o PDF some das opções e o backend também recusa).
- Tipos de arquivo: Vídeo, Imagem e PDF. Documentos antigos de "Relatório das Ações", "Lista de Presença"
  e "Outros" passam a ser PDF; "Imagens" e "Vídeos" apenas mudam de nome. Nada é apagado.
- O envio exige escolher a ação pedagógica. O antigo campo "Ação / Evento" virou "Título da atividade (opcional)".
- Painel: seção "Ações pedagógicas" com o total de cada uma. Galeria: filtro por ação pedagógica.
- Documentos antigos ligados a Agrinho/Programa Valores não aparecem em lugar nenhum como valor; sem ação pedagógica,
  contam como "sem ação pedagógica" no painel até serem reclassificados.

Se o passo 2 for esquecido, o painel continua funcionando pelo modo lento (mais devagar), sem os cartões de valor.

## Ações pedagógicas
- Os 5 valores humanos (Paz, Amor, Verdade, Ação correta, Não violência) são informação do programa e **não existem como tela,
  campo ou filtro** no sistema. Só aparecem nas cores da identidade visual (faixa colorida e sol).
- Quem classifica cada imagem, vídeo ou PDF é a **ação pedagógica** (obrigatória no envio): Acolhimento, Meditação,
  Prática Compartilhada, Círculo do Amor, Família na Escola, Hora do Conto, Momento Cívico, Momento da Refeição,
  Aniversariante do Mês e Relatório.
- Painel: filtro e cartões clicáveis por ação pedagógica. Galeria: botões por ação pedagógica.
- A tabela `projetos` e a coluna `projeto_id` continuam no banco, sem uso (não foi apagado nada).

## Ciclos
- Cada ano é um ciclo. Tela: Admin → Ciclos (criar, editar, tornar ativo, excluir se vazio).
- Só um ciclo fica ativo. Novos documentos entram sozinhos no ciclo ativo.
- Painel, pendências, página do município e galeria abrem no ciclo ativo; dá para trocar ou ver "Todos os ciclos".
- Escola participante = escola com documento no ciclo escolhido (recomeça a cada ciclo).
- O padrão do filtro de mês agora é "Todos os meses" (antes era o mês atual).

## Visual
- Login e topo da galeria: fundo creme com manchas pastel e o sol (raios nas cores dos valores) e a logo `public/logo-valores.png`.
- Telas de trabalho (listas, formulários): fundo liso, com a cor do valor só nas etiquetas e cartões.
- Componentes: `src/components/Sol.tsx`, `ValorBadge.tsx`, `SeletorCiclo.tsx`.

## Arquivos novos
`sql/migration_valores_ciclos.sql`, `src/lib/valores.ts`, `src/lib/ciclos.ts`,
`src/components/{Sol,ValorBadge,SeletorCiclo}.tsx`, `app/admin/valores/page.tsx`,
`app/admin/ciclos/page.tsx`, `public/logo-valores.png`.

## Arquivos alterados
`app.py` (rotas `/api/ciclos`, filtro `ciclo_id`, totais por valor), `sql/painel_resumo.sql`,
`app/page.tsx`, `app/login/page.tsx`, `app/layout.tsx`, `app/admin/pendencias/page.tsx`,
`app/admin/projetos/page.tsx` (agora só redireciona), `app/municipios/[id]/page.tsx`,
`app/municipios/[id]/novo-documento/page.tsx`, `app/galeria/GaleriaPublica.tsx`,
`src/components/{Sidebar,EscolasParticipantes,MapaMunicipios,icons}.tsx`, `src/lib/api.ts`, `tailwind.config.ts`.
