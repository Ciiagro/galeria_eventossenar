import { redirect } from "next/navigation";

// O link antigo /cadastro agora é /adesao.
export default function CadastroAntigo() {
  redirect("/adesao");
}
