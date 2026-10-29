import { supabase } from "./supabase";

export type RemoteApartment = {
  key: string;
  bloco: string;
  unidade: string;
  label: string;
};

export type RemotePlace = {
  id: string;
  nome: string;
  apartments: RemoteApartment[];
};

const APTOS = ["101", "102", "103", "104", "201", "202", "203", "204", "301", "302", "303", "304", "401", "402", "403", "404"];

const COND_II = new Set(["condomínio ii", "condominio ii", "mangueira ii", "mangueira - cond ii"]);

export function nomeDoEmpreendimento(nome: string) {
  const texto = nome.trim().toLocaleLowerCase("pt-BR");
  if (COND_II.has(texto)) return "Mangueira - Cond II";
  if (texto === "condomínio ibge" || texto === "condominio ibge" || texto === "ibge") return "Mangueira IBGE";
  return nome.trim();
}

function placeWithBlocks(id: string, nome: string, blocos: number): RemotePlace {
  const apartments: RemoteApartment[] = [];
  for (let bloco = 1; bloco <= blocos; bloco += 1) {
    for (const unidade of APTOS) {
      apartments.push({
        key: `${id}:${bloco}:${unidade}`,
        bloco: String(bloco),
        unidade,
        label: `Apto ${unidade}`,
      });
    }
  }
  return { id, nome, apartments };
}

/** Usado quando o Supabase ainda não devolve linhas para a chave do app. */
export const builtInPlaces: RemotePlace[] = [
  placeWithBlocks("ibge", "Condomínio IBGE", 11),
  placeWithBlocks("ii", "Mangueira - Cond II", 6),
];

type Row = Record<string, string | number | null>;

export async function loadRemotePlaces(): Promise<{ places: RemotePlace[]; error: string | null }> {
  if (!supabase) return { places: builtInPlaces, error: null };

  const [condominios, blocos, unidades] = await Promise.all([
    supabase.from("condominios").select("id, nome").order("nome"),
    supabase.from("blocos").select("id, condominio_id, numero"),
    supabase.from("unidades").select("id, bloco_id, numero"),
  ]);

  if (condominios.error || blocos.error || unidades.error || (condominios.data ?? []).length === 0) {
    return { places: builtInPlaces, error: null };
  }

  const places = ((condominios.data ?? []) as Row[]).map((place) => {
    const placeBlocks = ((blocos.data ?? []) as Row[]).filter((block) => block.condominio_id === place.id);
    const apartments = placeBlocks.flatMap((block) =>
      ((unidades.data ?? []) as Row[])
        .filter((unit) => unit.bloco_id === block.id)
        .map((unit) => ({
          key: String(unit.id),
          bloco: String(block.numero ?? ""),
          unidade: String(unit.numero ?? ""),
          label: `Apto ${unit.numero}`,
        })),
    );
    apartments.sort((a, b) => a.bloco.localeCompare(b.bloco, "pt", { numeric: true }) || a.unidade.localeCompare(b.unidade, "pt", { numeric: true }));
    return { id: String(place.id), nome: nomeDoEmpreendimento(String(place.nome ?? "")), apartments };
  });

  return { places, error: null };
}
