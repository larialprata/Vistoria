import { AvisoFotos } from "@shared/AvisoFotos";
import { BotaoTema } from "@shared/theme";
import { Marca } from "../components/Marca";
import { escolherObra, OBRAS } from "../obra";
import "../phone.css";

export function ObraPage() {
  return (
    <div className="shell shell-login">
      <AvisoFotos />
      <div className="obra-gate">
        <div className="obra-tema">
          <BotaoTema />
        </div>
        <form className="obra-card" onSubmit={(event) => event.preventDefault()}>
          <Marca destaque />
          <h1>Selecione a obra</h1>
          <p>A página inicial abre com a obra escolhida.</p>
          <select
            className="obra-select"
            defaultValue=""
            aria-label="Obra"
            onChange={(event) => {
              if (event.target.value) escolherObra(event.target.value);
            }}
          >
            <option value="" disabled>
              Selecione
            </option>
            {OBRAS.map((obra) => (
              <option key={obra.nome} value={obra.nome}>
                {obra.nome}
              </option>
            ))}
          </select>
        </form>
      </div>
    </div>
  );
}
