// Itens do menu lateral por perfil. Fica num arquivo só porque a barra lateral e os títulos das
// páginas usam a MESMA cor: cada página pega a cor do seu item no menu (veja TituloPagina).
import { HomeIcon, AlertIcon, UserIcon, CalendarIcon, CheckIcon, BuildingIcon, FileTextIcon, HeartIcon, ClipboardListIcon, BookOpenIcon, MegaphoneIcon } from "@/components/icons";
import type { Perfil } from "@/lib/api";

export type LinkMenu = { href: string; label: string; Icon: (p: { className?: string }) => JSX.Element; prefixo?: string };

const linksBase: LinkMenu[] = [
  { href: "/", label: "Início", Icon: HomeIcon },
  { href: "/escolas", label: "Escolas", Icon: BuildingIcon },
];

const linksAdmin: LinkMenu[] = [
  { href: "/admin/pendencias", label: "Relatórios/Ações", Icon: AlertIcon },
  { href: "/admin/entregas", label: "Entregas", Icon: CheckIcon },
  { href: "/admin/responsaveis", label: "Coordenadores", Icon: UserIcon },
  { href: "/admin/equipe", label: "Equipe de apoio", Icon: HeartIcon },
  { href: "/admin/escolas-programa", label: "Escolas do programa", Icon: CheckIcon },
  { href: "/admin/ciclos", label: "Edições", Icon: CalendarIcon },
];

// Material Pedagógico (apresentações, formações, cartilha...) — todos os perfis
const linkMaterial: LinkMenu = { href: "/material-instrucional", label: "Material Pedagógico", Icon: BookOpenIcon };

// Canal de Comunicação: o administrador envia comunicados; coordenadores e equipe de apoio leem (todos os perfis)
const linkComunicados: LinkMenu = { href: "/comunicados", label: "Comunicados", Icon: MegaphoneIcon };

// Termo de Adesão (documento para imprimir/assinar): só o administrador vê, logo depois do Início
const linkTermo: LinkMenu = { href: "/admin/termo-adesao", label: "Termo de Adesão", Icon: FileTextIcon, prefixo: "/admin/termo-adesao" };

// Coordenador do município: ficha de adesão ao programa
const linkAdesao: LinkMenu = { href: "/adesao/ficha", label: "Ficha de adesão", Icon: ClipboardListIcon };

// Coordenador do município: termo de compromisso (acompanhar as escolas e fazer a formação pedagógica)
const linkCompromisso: LinkMenu = { href: "/compromisso", label: "Termo de compromisso", Icon: FileTextIcon };

export function montarLinks(perfil: Perfil | null): LinkMenu[] {
  // Responsável municipal: "Documentos" leva à lista de documentos do próprio município
  // (o admin tem o "Documentos" do Painel de Aprovação, em linksAdmin).
  const linkDocumentosMunicipio: LinkMenu[] =
    perfil?.role === "municipio" && perfil.municipio_id
      ? [{ href: `/municipios/${perfil.municipio_id}`, label: "Relatórios/Ações", Icon: FileTextIcon, prefixo: "/municipios/" }]
      : [];
  // Apoiador de Relatórios: fila de análise dos documentos (o admin valida depois)
  const linkAnalise: LinkMenu[] =
    perfil?.role === "apoiador_relatorios"
      ? [{ href: "/analise", label: "Análise de documentos", Icon: ClipboardListIcon }]
      : [];
  // Coordenador que ainda aguarda a liberação do município não vê "Escolas": as escolas são escolhidas
  // e corrigidas na própria Ficha de adesão. Depois da aprovação o item aparece, para completar o cadastro.
  const aguardandoLiberacao = perfil?.role === "municipio" && !perfil.municipio_id;
  const linkEscolas: LinkMenu[] = aguardandoLiberacao ? [] : linksBase.slice(1);
  // "Início" também não aparece nesse caso: ele só levaria de volta para a Ficha de adesão.
  const linkInicio: LinkMenu[] = aguardandoLiberacao ? [] : [linksBase[0]];
  return perfil?.role === "admin"
    ? [linksBase[0], linkComunicados, linkTermo, ...linksBase.slice(1), ...linksAdmin, linkMaterial]
    
    : [...linkInicio, linkComunicados, ...(perfil?.role === "municipio" ? [linkAdesao, linkCompromisso] : []), ...linkDocumentosMunicipio, ...linkAnalise, ...linkEscolas, linkMaterial];
}

export function linkAtivo(link: LinkMenu, pathname: string | null) {
  return pathname === link.href || Boolean(link.prefixo && pathname?.startsWith(link.prefixo));
}

// Cor de cada item = posição dele no menu (a MESMA da barra lateral, para o título da página combinar com o item escolhido)
export const CORES_ICONES = ["#8E5BB5", "#E03A3E", "#2F9E62", "#C98A00", "#2678C4", "#D6458F", "#14909E", "#E0702B", "#4F5BD5", "#6B9E1A"];

export function corDoItem(indice: number) {
  const c = CORES_ICONES[indice % CORES_ICONES.length];
  return { barra: c, fundo: `${c}22`, texto: `color-mix(in srgb, ${c} 62%, #000)`, sobre: "#FFFFFF" };
}
