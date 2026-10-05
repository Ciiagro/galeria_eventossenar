"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowserClient";
import { apiGet, apiPost } from "@/lib/api";
import { FaixaValores } from "@/components/Sol";
import { Arvore, CORES_ALEGRES, CriancasPulando, Escolinha, Estrela, Flor, Grama, Nuvem } from "@/components/Desenhos";
import { FundoLogin } from "@/components/FundoLogin";
import { mascaraCpf, mascaraTelefone } from "@/lib/mascaras";
import { esquecerPerfilSalvo } from "@/lib/usePerfil";

const CAMPO =
  "w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-brand-dark placeholder:text-brand-dark/40 transition focus:outline-none focus:border-brand-light focus:ring-4 focus:ring-brand-light/15";
const ROTULO = "block text-[13px] font-semibold text-brand-dark mb-1";

const PASSOS = [
  { titulo: "Cadastre-se", texto: "Escolha o município e crie o acesso.", cor: CORES_ALEGRES[0] },
  { titulo: "Preencha a ficha", texto: "Dados da prefeitura e escolas participantes.", cor: CORES_ALEGRES[2] },
  { titulo: "Aguarde a aprovação", texto: "Aprovada, o município é liberado.", cor: CORES_ALEGRES[4] },
];

// Título de cada bloco do formulário (número colorido + nome)
function Bloco({ n, titulo, cor, children }: { n: number; titulo: string; cor: (typeof CORES_ALEGRES)[number]; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-black/5 p-3 sm:p-3.5" style={{ background: `${cor.fundo}66` }}>
      <h2 className="mb-2 flex items-center gap-2 text-sm font-bold" style={{ color: cor.texto }}>
        <span className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold" style={{ background: cor.barra, color: cor.sobre }}>{n}</span>
        {titulo}
      </h2>
      {children}
    </section>
  );
}

// Página PÚBLICA (o link é enviado às pessoas): o coordenador cria o próprio acesso
// e, em seguida, preenche a ficha de adesão do município.
export default function AdesaoPublicaPage() {
  const router = useRouter();
  const [municipios, setMunicipios] = useState<{ id: number; nome: string; ocupado?: boolean }[]>([]);
  const [form, setForm] = useState({
    municipio_id: "", nome: "", cpf: "", rg: "", telefone1: "", telefone2: "", email: "", senha: "", confirmar: "", website: "",
  });
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Quem já está logado como coordenador(a) vai direto para a ficha.
  // Outros perfis (ex.: administrador testando o link) continuam vendo esta página,
  // com um aviso — antes eram mandados para a ficha, que só serve para coordenadores.
  const [contaLogada, setContaLogada] = useState<string | null>(null);
  useEffect(() => {
    supabaseBrowser.auth.getSession().then(async ({ data }) => {
      if (!data.session) return;
      try {
        const perfil = await apiGet("/api/perfil");
        if (perfil?.role === "municipio") {
          router.replace("/adesao/ficha");
          return;
        }
      } catch {
        // sem perfil: trata como visitante logado e mostra a página
      }
      setContaLogada(data.session.user.email ?? "outra conta");
    });
  }, [router]);

  async function sairDaConta() {
    await supabaseBrowser.auth.signOut();
    setContaLogada(null);
  }

  // o município vem primeiro: a lista é pública (a pessoa ainda não tem login)
  useEffect(() => {
    apiGet("/api/cadastro/municipios").then(setMunicipios).catch(() => setErro("Não foi possível carregar a lista de municípios. Atualize a página."));
  }, []);

  function campo<K extends keyof typeof form>(chave: K, valor: string) {
    setForm((f) => ({ ...f, [chave]: valor }));
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!form.municipio_id) return setErro("Escolha o município em que você vai atuar.");
    if (form.senha.length < 6) return setErro("A senha deve ter pelo menos 6 caracteres.");
    if (form.senha !== form.confirmar) return setErro("As senhas não são iguais.");

    setEnviando(true);
    try {
      await apiPost("/api/cadastro-coordenador", {
        municipio_id: Number(form.municipio_id), nome: form.nome, cpf: form.cpf, rg: form.rg, telefone1: form.telefone1,
        telefone2: form.telefone2, email: form.email, senha: form.senha, website: form.website,
      });
      // já entra com a conta recém-criada e segue para a ficha de adesão
    esquecerPerfilSalvo();
      const { error } = await supabaseBrowser.auth.signInWithPassword({ email: form.email.trim().toLowerCase(), password: form.senha });
      if (error) {
        router.push("/login");
        return;
      }
      router.push("/adesao/ficha");
    } catch (e: any) {
      setErro(e.message ?? "Não foi possível concluir o cadastro.");
      setEnviando(false);
    }
  }

  return (
    <FundoLogin className="min-h-screen">
      <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col items-center gap-2.5 px-4 py-3 sm:px-6">
        {/* cabeçalho compacto: mesma identidade do login */}
        <header className="text-center">
          <div className="flex items-center justify-center gap-3 sm:gap-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-valores.png" alt="Projeto Valores" width={720} height={308} className="h-auto w-24 sm:w-32" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/sol-valores.png" alt="" width={900} height={545} className="h-auto w-16 sm:w-20" />
          </div>
          <p className="text-xs font-medium text-brand-dark/85 sm:text-sm">Brincando e cultivando os valores humanos</p>
        </header>

        <div className="flex w-full flex-col gap-3">
          {contaLogada && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900" role="status">
              <span>
                Você está logado como <strong>{contaLogada}</strong>. Ao cadastrar um(a) coordenador(a) aqui, essa conta será trocada pela nova.
              </span>
              <span className="flex gap-3 font-semibold">
                <Link href="/admin/termo-adesao" className="underline">Voltar ao painel</Link>
                <button type="button" onClick={sairDaConta} className="underline">Sair desta conta</button>
              </span>
            </div>
          )}
          {/* como funciona: faixa compacta acima do formulário */}
          <aside className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-md">
            <div className="flex items-center gap-2 bg-brand px-4 py-2.5 text-white sm:px-5">
              <Estrela className="h-4 w-4 shrink-0" />
              <h1 className="text-sm font-bold leading-snug sm:text-base">Vamos levar os valores humanos para as escolas do seu município</h1>
            </div>

            <ol className="grid gap-2 px-4 py-3 sm:grid-cols-3 sm:gap-4 sm:px-5">
              {PASSOS.map((p, i) => (
                <li key={p.titulo} className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold" style={{ background: p.cor.barra, color: p.cor.sobre }}>{i + 1}</span>
                  <div className="leading-tight">
                    <p className="text-[13px] font-bold" style={{ color: p.cor.texto }}>{p.titulo}</p>
                    <p className="text-xs text-brand-dark/70">{p.texto}</p>
                  </div>
                </li>
              ))}
            </ol>

            {/* cenário baixinho: escolinha, crianças, árvores e flor */}
            <div className="relative select-none bg-[#FFF6EA] pt-1" aria-hidden="true">
              <Nuvem className="absolute left-[10%] top-1 w-10 opacity-90 sm:w-14" />
              <Nuvem className="absolute right-[12%] top-2 w-9 opacity-80 sm:w-12" />
              <div className="relative mx-auto flex max-w-md items-end justify-center gap-1 px-4 sm:gap-2">
                <Arvore className="hidden w-7 sm:block" />
                <Escolinha className="w-20 sm:w-24" />
                <CriancasPulando tamanho="w-8 sm:w-10" />
                <Flor className="hidden w-4 sm:block" petala="#F49AC1" />
                <Arvore className="w-7" />
              </div>
              <div className="-mt-1"><Grama className="!h-5" /></div>
            </div>
          </aside>

          {/* formulário */}
          <form onSubmit={enviar} className="space-y-2.5 rounded-2xl border border-black/5 bg-white p-4 shadow-lg sm:p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4">
              <h2 className="inline-block border-b-2 border-brand-light pb-0.5 text-lg font-bold text-brand-dark">Cadastro do(a) coordenador(a)</h2>
              <p className="text-xs text-brand-dark/70">Leva poucos minutos. Depois você já preenche a ficha.</p>
            </div>

            {erro && (
              <div className="rounded-lg bg-status-pendente/10 px-3 py-2 text-sm text-status-pendente" role="alert">{erro}</div>
            )}

            {/* campo-isca contra robôs: fica escondido, pessoas não preenchem */}
            <input type="text" name="website" tabIndex={-1} autoComplete="off" value={form.website}
              onChange={(e) => campo("website", e.target.value)} className="hidden" aria-hidden />

            <Bloco n={1} titulo="Município em que você vai atuar" cor={CORES_ALEGRES[0]}>
              <label htmlFor="municipio" className="sr-only">Município</label>
              <select id="municipio" required value={form.municipio_id} onChange={(e) => campo("municipio_id", e.target.value)} className={CAMPO}>
                <option value="">{municipios.length ? "Selecione o município..." : "Carregando municípios..."}</option>
                {municipios.map((m) => (
                  <option key={m.id} value={m.id} disabled={m.ocupado}>{m.nome}{m.ocupado ? " (já possui coordenador)" : ""}</option>
                ))}
              </select>
            </Bloco>

            <Bloco n={2} titulo="Seus dados" cor={CORES_ALEGRES[2]}>
              <div className="space-y-2">
                <div>
                  <label htmlFor="nome" className={ROTULO}>Nome completo</label>
                  <input id="nome" required autoComplete="name" value={form.nome} onChange={(e) => campo("nome", e.target.value)} className={CAMPO} />
                </div>
                <div className="grid gap-2 sm:grid-cols-4">
                  <div>
                    <label htmlFor="cpf" className={ROTULO}>CPF</label>
                    <input id="cpf" required inputMode="numeric" placeholder="000.000.000-00" value={form.cpf}
                      onChange={(e) => campo("cpf", mascaraCpf(e.target.value))} className={CAMPO} />
                  </div>
                  <div>
                    <label htmlFor="rg" className={ROTULO}>RG</label>
                    <input id="rg" value={form.rg} onChange={(e) => campo("rg", e.target.value)} className={CAMPO} />
                  </div>
                  <div>
                    <label htmlFor="tel1" className={ROTULO}>Telefone 1</label>
                    <input id="tel1" required inputMode="tel" placeholder="(00) 00000-0000" value={form.telefone1}
                      onChange={(e) => campo("telefone1", mascaraTelefone(e.target.value))} className={CAMPO} />
                  </div>
                  <div>
                    <label htmlFor="tel2" className={ROTULO}>Telefone 2 <span className="font-normal text-brand-dark/60">(opc.)</span></label>
                    <input id="tel2" inputMode="tel" placeholder="(00) 00000-0000" value={form.telefone2}
                      onChange={(e) => campo("telefone2", mascaraTelefone(e.target.value))} className={CAMPO} />
                  </div>
                </div>
              </div>
            </Bloco>

            <Bloco n={3} titulo="Acesso ao sistema" cor={CORES_ALEGRES[4]}>
              <div className="grid gap-2 sm:grid-cols-3">
                <div>
                  <label htmlFor="email" className={ROTULO}>E-mail <span className="font-normal text-brand-dark/60">(login)</span></label>
                  <input id="email" type="email" required autoComplete="email" value={form.email}
                    onChange={(e) => campo("email", e.target.value)} className={CAMPO} />
                </div>
                <div>
                  <label htmlFor="senha" className={ROTULO}>Senha</label>
                  <input id="senha" type="password" required autoComplete="new-password" minLength={6} placeholder="Mín. 6 caracteres" value={form.senha}
                    onChange={(e) => campo("senha", e.target.value)} className={CAMPO} />
                </div>
                <div>
                  <label htmlFor="confirmar" className={ROTULO}>Repita a senha</label>
                  <input id="confirmar" type="password" required autoComplete="new-password" minLength={6} value={form.confirmar}
                    onChange={(e) => campo("confirmar", e.target.value)} className={CAMPO} />
                </div>
              </div>
            </Bloco>

            <button type="submit" disabled={enviando}
              className="w-full rounded-lg bg-brand-light py-2.5 text-sm font-bold text-white shadow-md transition hover:bg-brand-accent hover:shadow-lg disabled:opacity-50">
              {enviando ? "Cadastrando..." : "Cadastrar e continuar →"}
            </button>
            <p className="text-center text-sm text-brand-dark/80">
              Já tem cadastro? <Link href="/login" className="font-bold text-brand-light underline">Entrar</Link>
            </p>
            <FaixaValores />
          </form>
        </div>

        {/* A logo da FAEC é branca, então fica sobre um bloco verde */}
        <div className="rounded-lg bg-brand px-3 py-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-sistema.png" alt="Sistema FAEC SENAR Ceará — Sindicato Rural" width={800} height={294} className="h-auto w-24" />
        </div>
      </div>
    </FundoLogin>
  );
}
