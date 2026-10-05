// Vídeos profissionais de divulgação do projeto (aparecem na página "O projeto").
// Para incluir ou trocar um vídeo, edite esta lista.
//
// capa: imagem de capa do vídeo, guardada em public/videos-projeto/ (ex.: um quadro do vídeo, 1280x720).
//       Com a capa, o cartão sempre aparece bonito, mesmo que o Google Drive não gere a miniatura.
//       Sem o arquivo da capa, o sistema tenta a miniatura do Drive e, se não houver, mostra um cartão colorido.
//
// Para ASSISTIR no site, cada arquivo do Drive precisa estar compartilhado como "Qualquer pessoa com o link".

export type VideoProjeto = { titulo: string; rotulo: string; link: string; capa?: string };

export const VIDEOS_PROJETO: VideoProjeto[] = [
  { titulo: "Quixadá", rotulo: "Município", capa: "/videos-projeto/quixada.jpg", link: "https://drive.google.com/file/d/1jHMwOMX_UlYbloVgzhlcNR-8GcwlSsW2/view" },
  { titulo: "Russas", rotulo: "Município", capa: "/videos-projeto/russas.jpg", link: "https://drive.google.com/file/d/1FaP6DR3nl9x4frkYf5gehAuFtWkRS63K/view" },
  { titulo: "Ubajara", rotulo: "Município", capa: "/videos-projeto/ubajara.jpg", link: "https://drive.google.com/file/d/1jU0WqyiEE5gvuo8_-Cb_N-SaW0AZBKKX/view" },
  { titulo: "Visita técnica", rotulo: "Acompanhamento", capa: "/videos-projeto/visita-tecnica.jpg", link: "https://drive.google.com/file/d/1FaDvnq_BrrY8PvIHiXCuJ96Cw6iCVBfO/view" },
  { titulo: "Capacitação", rotulo: "Formação", capa: "/videos-projeto/capacitacao.jpg", link: "https://drive.google.com/file/d/191onjzFeDUvM9dcxKP6Srun7AZL_fIH_/view" },
];
