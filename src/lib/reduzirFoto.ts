// Reduz a foto escolhida para um quadrado pequeno (JPEG) antes de enviar: fica leve (~30 a 60 KB)
// e é guardada junto com o cadastro, sem precisar de pasta no Drive.
export async function reduzirFoto(arquivo: File, lado = 360, qualidade = 0.82): Promise<string> {
  if (!arquivo.type.startsWith("image/")) throw new Error("Escolha um arquivo de imagem (JPG ou PNG).");
  const url = URL.createObjectURL(arquivo);
  try {
    const img = await new Promise<HTMLImageElement>((ok, falha) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => falha(new Error("Não consegui abrir esta imagem. Tente outra foto."));
      i.src = url;
    });
    const corte = Math.min(img.width, img.height);
    const canvas = document.createElement("canvas");
    canvas.width = lado;
    canvas.height = lado;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Seu navegador não conseguiu preparar a foto.");
    // recorta o centro (quadrado) e redimensiona
    ctx.drawImage(img, (img.width - corte) / 2, (img.height - corte) / 2, corte, corte, 0, 0, lado, lado);
    return canvas.toDataURL("image/jpeg", qualidade);
  } finally {
    URL.revokeObjectURL(url);
  }
}
