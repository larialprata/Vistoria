import { apiBase, fotosDaResposta, fotosParadas, loadLocalPhoto, marcarFotoEnviada, stagePhoto } from "./photos";
import { currentAccount } from "./session";
import { getStore } from "./store";

let subidaEmCurso: Promise<{ enviadas: number; faltam: number; semArquivo: number }> | null = null;

/** Sobe de novo cada foto que ficou só neste aparelho. O aviso some quando o arquivo chega na pasta. */
export function forcarSubidaDasFotos() {
  if (subidaEmCurso) return subidaEmCurso;
  subidaEmCurso = executarSubidaDasFotos().finally(() => {
    subidaEmCurso = null;
  });
  return subidaEmCurso;
}

async function executarSubidaDasFotos() {
  const api = apiBase();
  const token = currentAccount()?.token;
  const caminhos = new Set<string>(fotosParadas());
  for (const answer of getStore().answers) {
    for (const foto of fotosDaResposta(answer)) {
      if (foto.sharepointPath && !foto.sharepointPath.startsWith("blob:") && !foto.sharepointPath.startsWith("data:")) {
        caminhos.add(foto.sharepointPath);
      }
    }
  }
  if (!api || !token) return { enviadas: 0, faltam: fotosParadas().length, semArquivo: 0 };
  const fila = [...caminhos];
  let enviadas = 0;
  let semArquivo = 0;
  async function enviar() {
    while (fila.length) {
      const caminho = fila.shift();
      if (!caminho) return;
      const existe = await fetch(`${api}/fotos?path=${encodeURIComponent(caminho)}&existe=1`, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => null);
      if (existe?.ok) {
        marcarFotoEnviada(caminho);
        continue;
      }
      const blob = await loadLocalPhoto(caminho).catch(() => null);
      if (!blob || blob.size < 1) {
        if (fotosParadas().includes(caminho)) semArquivo += 1;
        continue;
      }
      const file = new File([blob], "foto.jpg", { type: blob.type || "image/jpeg" });
      const resultado = await stagePhoto(file, caminho);
      if (!resultado.warning) enviadas += 1;
    }
  }
  await Promise.all(Array.from({ length: Math.min(2, fila.length) }, () => enviar()));
  return { enviadas, faltam: fotosParadas().length, semArquivo };
}
