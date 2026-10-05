// Ícones das ações pedagógicas (dashboard e galeria). O ícone é escolhido pelo nome da ação,
// então ações novas sem ícone próprio usam a pasta como padrão.
type Props = { nome: string; className?: string; tileClassName?: string };

// fundo/cor: ladrilho do ícone (tom claro + traço). solido/texto: a cor "de verdade" da ação, como nas etiquetas da
// apresentação do projeto (use em chips, cartões e destaques da galeria).
type Estilo = { fundo: string; cor: string; desenho: React.ReactNode; solido?: string; texto?: string };

const normalizar = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function estiloDaAcao(nome: string): Estilo {
  const n = normalizar(nome);
  if (n.includes("acolhimento") || n.includes("acolhida"))
    return { fundo: "#FEE3E3", cor: "#C62F31", solido: "#FB5556", texto: "#1A1A1A", desenho: <path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 00-7.8 7.8l1 1.1L12 21.3l7.8-7.8 1-1.1a5.5 5.5 0 000-7.8z" /> };
  if (n.includes("meditacao"))
    return {
      fundo: "#F1E7F7",
      cor: "#7C4A96",
      solido: "#B886CC",
      texto: "#1A1A1A",
      desenho: (
        <>
          <circle cx="12" cy="5.5" r="2.2" />
          <path d="M12 8.5v4.5M7 11.5l5 1.5 5-1.5M4 19c3-3.2 13-3.2 16 0" />
        </>
      ),
    };
  if (n.includes("pratica") || n.includes("compartilhada"))
    return {
      fundo: "#E6F1FD",
      cor: "#2D6FB0",
      solido: "#B7D7F9",
      texto: "#1A1A1A",
      desenho: (
        <>
          <circle cx="9" cy="12" r="5.5" />
          <circle cx="15" cy="12" r="5.5" />
        </>
      ),
    };
  if (n.includes("circulo") || n.includes("amor"))
    return {
      fundo: "#FFE2E3",
      cor: "#C41F26",
      solido: "#FC4348",
      texto: "#1A1A1A",
      desenho: (
        <>
          <circle cx="12" cy="12" r="9.5" />
          <path d="M12 16.6l-3.6-3.5a2.4 2.4 0 013.4-3.4l.2.2.2-.2a2.4 2.4 0 013.4 3.4z" />
        </>
      ),
    };
  if (n.includes("familia"))
    return {
      fundo: "#FFF9CC",
      cor: "#9A7D00",
      solido: "#FCEA09",
      texto: "#1A1A1A",
      desenho: (
        <>
          <circle cx="7.5" cy="6.5" r="2.2" />
          <circle cx="16.5" cy="6.5" r="2.2" />
          <circle cx="12" cy="13" r="1.8" />
          <path d="M3.5 13v-1.5a3 3 0 013-3h2a3 3 0 013 3V13M12.5 13v-1.5a3 3 0 013-3h2a3 3 0 013 3V13M8.5 21v-3.5a3.5 3.5 0 017 0V21" />
        </>
      ),
    };
  if (n.includes("conto"))
    return {
      fundo: "#F0E6F7",
      cor: "#7A4B99",
      solido: "#B587D1",
      texto: "#1A1A1A",
      desenho: (
        <>
          <path d="M12 6.5C10.3 5 7.5 4.5 4 4.5V18c3.5 0 6.3.5 8 2 1.7-1.5 4.5-2 8-2V4.5c-3.5 0-6.3.5-8 2z" />
          <path d="M12 6.5V20" />
        </>
      ),
    };
  if (n.includes("civico"))
    return {
      fundo: "#DDF1E8",
      cor: "#116549",
      solido: "#116549",
      texto: "#FFFFFF",
      desenho: (
        <>
          <path d="M5 21V3" />
          <path d="M5 4h13l-2.5 4 2.5 4H5" />
        </>
      ),
    };
  if (n.includes("cultura") || n.includes("meio ambiente"))
    return {
      fundo: "#DCF3EA",
      cor: "#0E7857",
      solido: "#0E7857",
      texto: "#FFFFFF",
      desenho: (
        <>
          <path d="M12 21v-9" />
          <path d="M12 12c0-3.5-2.5-6-6.5-6 0 3.8 2.6 6 6.5 6z" />
          <path d="M12 14c0-3 2.2-5.2 6-5.2 0 3.4-2.4 5.2-6 5.2z" />
        </>
      ),
    };
  if (n.includes("refeicao"))
    return {
      fundo: "#FCE4EE",
      cor: "#D6366F",
      desenho: (
        <>
          <path d="M6 3v6a2 2 0 004 0V3M8 3v18" />
          <path d="M17 21V3c-2.5 1.5-3.5 4.5-3.5 8H17" />
        </>
      ),
    };
  if (n.includes("aniversari"))
    return {
      fundo: "#E3F4EA",
      cor: "#2F9E62",
      desenho: (
        <>
          <path d="M4 21h16M5 21v-7h14v7M5 17.5c2 1.5 4.5 1.5 7 0s5-1.5 7 0" />
          <path d="M12 14v-4M12 7.5c-1-1.2 0-3 0-3s1 1.8 0 3z" />
        </>
      ),
    };
  if (n.includes("relatorio"))
    return {
      fundo: "#FFE9D6",
      cor: "#E0661A",
      desenho: (
        <>
          <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" />
          <path d="M14 3v5h5M9 13h6M9 17h6" />
        </>
      ),
    };
  return { fundo: "#EAF3EE", cor: "#2F6B4F", desenho: <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z" /> };
}

// Cor de uma ação como na apresentação do projeto: { fundo: cor da etiqueta, texto: cor da letra sobre ela }
export function corDaAcao(nome: string): { fundo: string; texto: string; escuro: string } {
  const e = estiloDaAcao(nome);
  // escuro: tom mais fechado da mesma cor, para texto e traços sobre fundo claro
  return { fundo: e.solido ?? e.cor, texto: e.texto ?? "#FFFFFF", escuro: e.cor };
}

// Só o desenho da ação (sem ladrilho), na cor do texto atual: para etiquetas e cabeçalhos coloridos
export function SimboloAcao({ nome, className = "h-5 w-5" }: { nome: string; className?: string }) {
  const e = estiloDaAcao(nome);
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {e.desenho}
    </svg>
  );
}

export function IconeAcao({ nome, className = "h-5 w-5", tileClassName = "h-9 w-9 rounded-lg" }: Props) {
  const e = estiloDaAcao(nome);
  return (
    <span className={`flex shrink-0 items-center justify-center ${tileClassName}`} style={{ background: e.fundo, color: e.cor }} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
        {e.desenho}
      </svg>
    </span>
  );
}
