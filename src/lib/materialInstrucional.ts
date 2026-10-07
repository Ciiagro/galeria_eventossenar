// Links do "Material Pedagógico" (Google Drive), organizados por categoria.
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
    descricao: "Apresentação para conhecer o projeto.",
    links: [
      { titulo: "Apresentação do Projeto", url: "https://drive.google.com/file/d/1JymI9-wqgYOLJa3FYXagC5M3u2zmhwFU/view" },
    ],
  },
  {
    id: "formacao",
    titulo: "Formação de Professores",
    descricao: "Materiais das quatro formações.",
    links: [
      { titulo: "1ª Formação", url: "https://drive.google.com/file/d/1VpCxrMHweQJ-Rx1uqH-Xuzifld5pBhjQ/view" },
      { titulo: "2ª Formação", url: "https://drive.google.com/file/d/12ndPEJwfBz23LGBrtzmKMcJEj55mJj3m/view" },
      { titulo: "3ª Formação", url: "https://drive.google.com/file/d/1Nr67XAikiUaSu_zLP2GZTnsuYc0dxVAW/view" },
      { titulo: "4ª Formação", url: "https://drive.google.com/file/d/1MRTphsMX9E6xQfXlZWuL_OhVUtS_wudD/view" },
    ],
  },
  {
    id: "cartilha",
    titulo: "Guia do Professor",
    descricao: "Material de apoio ao professor.",
    links: [
      { titulo: "Guia do Professor", url: "https://drive.google.com/file/d/1fE-8dWxLWLb_Far9bP3-WOrHqQGoLe8i/view" },
    ],
  },
  {
    id: "norteador",
    titulo: "Documento Norteador",
    descricao: "Documento de referência do projeto.",
    links: [
      { titulo: "Documento Norteador", url: "https://drive.google.com/file/d/1XrxAEeqPx2qXt9E450W7r3tHHpkgY6Qw/view" },
    ],
  },
];
