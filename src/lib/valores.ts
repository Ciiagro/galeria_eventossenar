// Os cinco valores humanos universais do Projeto Valores Humanos (PUH).
// São INFORMAÇÃO do programa (identidade e cores): não classificam documentos.
// Quem classifica cada imagem, vídeo ou PDF é a AÇÃO PEDAGÓGICA.

export type ValorInfo = {
  chave: "paz" | "amor" | "verdade" | "acaocorreta" | "naoviolencia";
  nome: string;
  dimensao: string; // o que o valor representa no projeto
  descricao: string;
  cor: { barra: string; fundo: string; texto: string };
};

export const VALORES: ValorInfo[] = [
  { chave: "paz", nome: "Paz", dimensao: "sentimento", descricao: "O que deve preencher nossa mente.", cor: { barra: "#8E5BB5", fundo: "#EFE8F8", texto: "#5B3485" } },
  { chave: "amor", nome: "Amor", dimensao: "o que devemos expandir", descricao: "O que devemos expandir dentro de nós.", cor: { barra: "#E03A3E", fundo: "#FDE8E8", texto: "#A11F25" } },
  { chave: "verdade", nome: "Verdade", dimensao: "pensamento", descricao: "O que deve atender à consciência.", cor: { barra: "#2F9E62", fundo: "#E3F4EA", texto: "#17613B" } },
  { chave: "acaocorreta", nome: "Ação correta", dimensao: "ação", descricao: "O que deve ser praticado.", cor: { barra: "#F2B705", fundo: "#FFF3CC", texto: "#6E4B00" } },
  { chave: "naoviolencia", nome: "Não violência", dimensao: "comportamento", descricao: "O que devemos ser plenamente.", cor: { barra: "#2678C4", fundo: "#E2EFFB", texto: "#0F4C85" } },
];
