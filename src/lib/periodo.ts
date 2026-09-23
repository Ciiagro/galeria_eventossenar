// Período padrão dos filtros (painel, página do município e Documentos):
// o ano e o mês ATUAIS. Vira sozinho a cada mês.
const hoje = new Date();
export const ANO_ATUAL = String(hoje.getFullYear());
export const MES_ATUAL = String(hoje.getMonth() + 1); // 1 = janeiro

export const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

// Anos válidos para os seletores (ignora anos impossíveis, ex.: 20206),
// sempre incluindo o ano atual e o ano escolhido.
export function anosParaSeletor(anos: (number | string | null | undefined)[], anoEscolhido = ""): string[] {
  const limite = hoje.getFullYear() + 1;
  const lista = new Set<string>([ANO_ATUAL]);
  anos.forEach((ano) => {
    const n = Number(String(ano ?? "").slice(0, 4));
    if (Number.isInteger(n) && n >= 2000 && n <= limite) lista.add(String(n));
  });
  if (anoEscolhido) lista.add(anoEscolhido);
  return Array.from(lista).sort((a, b) => Number(b) - Number(a));
}

// Documento está no ano/mês escolhidos? (vazio = qualquer)
export function noPeriodo(data: string | null | undefined, ano: string, mes: string) {
  if (!ano) return true;
  if ((data ?? "").slice(0, 4) !== ano) return false;
  return !mes || Number((data ?? "").slice(5, 7)) === Number(mes);
}
