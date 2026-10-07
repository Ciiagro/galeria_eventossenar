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
      { titulo: "Apresentação do Projeto", url: "https://drive.google.com/file/d/1JymI9-wqgYOLJa3FYXagC5M3u2zmhwFU/view?usp=drive_link" },
    ],
  },
  {
    id: "formacao",
    titulo: "Formação de Professores",
    descricao: "Materiais das quatro formações.",
    links: [
      { titulo: "1ª Formação", url: "https://docs.google.com/presentation/d/1h27YzGEv6Tn6Vada6VoiasUgU7O-VX-Q/edit?usp=drive_link&ouid=106898825372128667270&rtpof=true&sd=true" },
      { titulo: "2ª Formação", url: "https://docs.google.com/presentation/d/1bISal7HTK_1VIdfDxSKf7CyZsatiE2l3/edit?usp=drive_link&ouid=106898825372128667270&rtpof=true&sd=true" },
      { titulo: "3ª Formação", url: "https://docs.google.com/presentation/d/1c_NpF_Fnl51S-pmo_KkTUxqaexRDrxGA/edit?usp=drive_link&ouid=106898825372128667270&rtpof=true&sd=true" },
      { titulo: "4ª Formação", url: "https://docs.google.com/presentation/d/1Ry7qJgwoNHIjUnMSmk-EvUVMq7DRB095/edit?usp=drive_link&ouid=106898825372128667270&rtpof=true&sd=true" },
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
