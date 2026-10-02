// Links do "Material Instrucional" (Google Drive), organizados por categoria.
// Para incluir/trocar um material, é só editar esta lista.

export type MaterialLink = { titulo: string; url: string };

export type CategoriaMaterial = {
  id: string;
  titulo: string;
  descricao: string;
  links: MaterialLink[];
};

export const MATERIAL_INSTRUCIONAL: CategoriaMaterial[] = [
  {
    id: "apresentacao",
    titulo: "Apresentação do Projeto",
    descricao: "Apresentações para conhecer o projeto.",
    links: [
      { titulo: "Apresentação 01", url: "https://drive.google.com/file/d/1XW_C340NNtRNOpHIxYe9nrxCUZkiO0Ou/view" },
      { titulo: "Apresentação 02", url: "https://drive.google.com/file/d/1MM5qtoOkgqag2yP7BW5B_Rr_QlDg3o_s/view" },
    ],
  },
  {
    id: "formacao",
    titulo: "Formação de Professores",
    descricao: "Materiais das quatro formações.",
    links: [
      { titulo: "1ª Formação", url: "https://drive.google.com/file/d/1dT2qkfsSEjvfl6LQAAtdlc9icWPv-0xf/view" },
      { titulo: "2ª Formação", url: "https://drive.google.com/file/d/1X_We8Z70JCyd6OOzyuoBCf3jB6bnuekX/view" },
      { titulo: "3ª Formação", url: "https://drive.google.com/file/d/1EGe4wX4O9iGMXrB-G6Pa6z6LR8qsKYh-/view" },
      { titulo: "4ª Formação", url: "https://drive.google.com/file/d/1qadf-HstCsbrt24uoUwNT2cR6W5iBVp3/view" },
    ],
  },
  {
    id: "cartilha",
    titulo: "Cartilha",
    descricao: "Material de apoio ao professor.",
    links: [
      { titulo: "Caderno do Professor", url: "https://drive.google.com/file/d/1qadf-HstCsbrt24uoUwNT2cR6W5iBVp3/view" },
    ],
  },
  {
    id: "norteador",
    titulo: "Documento Norteador",
    descricao: "Documento de referência do projeto.",
    links: [
      { titulo: "Documento Norteador", url: "https://drive.google.com/file/d/1ddvl3Vu2rBpAUZO0LU0V-ZYmHGDe8LUv/view" },
    ],
  },
];
