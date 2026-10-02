import { PencilIcon, TrashIcon } from "@/components/icons";

// Botões de ação das listas (editar / excluir): só o ícone, para ocupar pouco espaço.
// O texto aparece ao passar o mouse (title) e fica disponível para leitores de tela (aria-label).
// Use sempre estes dois para manter o mesmo padrão em todas as telas.
type Props = {
  onClick: () => void;
  /** Ex.: "Editar Claudia". Se vazio, usa só "Editar". */
  rotulo?: string;
  disabled?: boolean;
};

const BASE =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors focus:outline-none focus-visible:ring-2 disabled:opacity-50";

export function BotaoEditar({ onClick, rotulo, disabled }: Props) {
  const texto = rotulo ? `Editar ${rotulo}` : "Editar";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={texto}
      aria-label={texto}
      className={`${BASE} border-brand-light/25 bg-white text-brand-light hover:bg-brand-light hover:text-white focus-visible:ring-brand-light/40`}
    >
      <PencilIcon className="h-[18px] w-[18px]" />
    </button>
  );
}

export function BotaoExcluir({ onClick, rotulo, disabled }: Props) {
  const texto = rotulo ? `Excluir ${rotulo}` : "Excluir";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={texto}
      aria-label={texto}
      className={`${BASE} border-status-pendente/25 bg-white text-status-pendente hover:bg-status-pendente hover:text-white focus-visible:ring-status-pendente/40`}
    >
      <TrashIcon className="h-[18px] w-[18px]" />
    </button>
  );
}

// "Completar": para itens com dados faltando (ex.: escola sem endereço ou localização).
// Fica em laranja para chamar a atenção, mas do mesmo tamanho dos outros botões de ícone.
export function BotaoCompletar({ onClick, rotulo, disabled }: Props) {
  const texto = rotulo ? `Completar ${rotulo}` : "Completar cadastro";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={texto}
      aria-label={texto}
      className={`${BASE} border-[#F26122]/40 bg-[#FFF1E4] text-[#E0661A] hover:bg-[#F26122] hover:text-white focus-visible:ring-[#F26122]/40`}
    >
      {/* pino de mapa com um "+" : falta preencher a localização */}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 1116 0z" />
        <path d="M12 7.5v5M9.5 10h5" />
      </svg>
    </button>
  );
}
