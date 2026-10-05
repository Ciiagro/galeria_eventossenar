// Itens do menu lateral por perfil. Fica num arquivo só porque a barra lateral e os títulos das
// páginas usam a MESMA cor: cada página pega a cor do seu item no menu (veja TituloPagina).
import { HomeIcon, AlertIcon, UserIcon, CalendarIcon, CheckIcon, BuildingIcon, FileTextIcon, HeartIcon, ClipboardListIcon, BookOpenIcon } from "@/components/icons";
import { CORES_ALEGRES } from "@/components/Desenhos";
import type { Perfil } from "@/lib/api";

export type LinkMenu = { href: string; label: string; Icon: (p: { className?: string }) => JSX.Element; prefixo?: string };

const linksBase: LinkMenu[] = [
  { href: "/", label: "Início", Icon: HomeIcon },
  { href: "/escolas", label: "Escolas", Icon: BuildingIcon },
];

const linksAdmin: LinkMenu[] = [
  { href: "/admin/pendencias", label: "Documentos", Icon: AlertIcon },
  { href: "/admin/responsaveis", label: "Coordenadores", Icon: UserIcon },
  { href: "/admin/equipe", label: "Equipe de apoio", Icon: HeartIcon },
  { href: "/admin/escolas-programa", label: "Escolas do programa", Icon: CheckIcon },
  { href: "/admin/ciclos", label: "Ciclos", Icon: CalendarIcon },
];

// Material Instrucional (apresentações, formações, cartilha...) — todos os perfis
const linkMaterial: LinkMenu = { href: "/material-instrucional", label: "Material Instrucional", Icon: BookOpenIcon };

// Termo de Adesão (documento para imprimir/assinar): só o administrador vê, logo depois do Início
const linkTermo: LinkMenu = { href: "/admin/termo-adesao", label: "Termo de Adesão", Icon: FileTextIcon, prefixo: "/admin/termo-adesao" };

// Coordenador do município: ficha de adesão ao programa
const linkAdesao: LinkMenu = { href: "/adesao/ficha", label: "Ficha de adesão", Icon: ClipboardListIcon };

export function montarLinks(perfil: Perfil | null): LinkMenu[] {
  // Responsável municipal: "Documentos" leva à lista de documentos do próprio município
  // (o admin tem o "Documentos" do Painel de Aprovação, em linksAdmin).
  const linkDocumentosMunicipio: LinkMenu[] =
    perfil?.role === "municipio" && perfil.municipio_id
      ? [{ href: `/municipios/${perfil.municipio_id}`, label: "Documentos", Icon: FileTextIcon, prefixo: "/municipios/" }]
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
    ? [linksBase[0], linkTermo, ...linksBase.slice(1), ...linksAdmin, linkMaterial]
    : [...linkInicio, ...(perfil?.role === "municipio" ? [linkAdesao] : []), ...linkDocumentosMunicipio, ...linkAnalise, ...linkEscolas, linkMaterial];
}

export function linkAtivo(link: LinkMenu, pathname: string | null) {
  return pathname === link.href || Boolean(link.prefixo && pathname?.startsWith(link.prefixo));
}

// Cor de cada item = posição dele no menu (igual à barra lateral)
export function corDoItem(indice: number) {
  return CORES_ALEGRES[indice % CORES_ALEGRES.length];
}
