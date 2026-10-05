import { redirect } from "next/navigation";

// "Adesões" e "Termo de Adesão" viraram uma tela só.
export default function AdesoesAntiga() {
  redirect("/admin/termo-adesao");
}
