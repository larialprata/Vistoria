export type BlockOption = {
  id: string;
  nome: string;
  apartamentos: string[];
};

export type PlaceOption = {
  id: string;
  nome: string;
  endereco: string;
  blocos: BlockOption[];
};

export const places: PlaceOption[] = [
  {
    id: "238-239",
    nome: "238 e 239",
    endereco: "Rua das Acácias, 1200",
    blocos: [
      { id: "1", nome: "Bloco 1", apartamentos: ["201", "202", "203", "204", "205", "206"] },
      { id: "2", nome: "Bloco 2", apartamentos: ["101", "102", "103", "104"] },
    ],
  },
  {
    id: "torre-sul",
    nome: "Torre Sul",
    endereco: "Av. das Palmeiras, 450",
    blocos: [
      { id: "A", nome: "Bloco A", apartamentos: ["11", "12", "21", "22"] },
      { id: "B", nome: "Bloco B", apartamentos: ["31", "32", "41"] },
    ],
  },
];
