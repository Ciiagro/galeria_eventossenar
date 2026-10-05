// Os 5 valores humanos do projeto e as cores dos slides da apresentação.
// Textos conforme o slide "Valores humanos" (Paz, Amor, Verdade, Ação correta, Não violência).

export type ValorProjeto = { nome: string; cor: string; dimensao?: string; frase: string };

export const VALORES: ValorProjeto[] = [
  { nome: "Paz", cor: "#9870B0", dimensao: "Sentimento", frase: "O que deve preencher nossa mente." },
  { nome: "Amor", cor: "#F00000", frase: "O que devemos expandir dentro de nós." },
  { nome: "Verdade", cor: "#088060", dimensao: "Pensamento", frase: "O que deve atender a consciência." },
  { nome: "Ação correta", cor: "#F8E000", dimensao: "Ação", frase: "O que deve ser praticado." },
  { nome: "Não violência", cor: "#005098", dimensao: "Comportamento", frase: "O que devemos ser plenamente." },
];

// Cores de fundo dos slides (verde, azul-petróleo, rosa e laranja)
export const FAIXAS = {
  verde: "#81B61E",
  azul: "#01A3B8",
  rosa: "#EA74CA",
  laranja: "#E19F00",
};
