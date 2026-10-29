import type { ReactNode } from "react";
import simbolo from "../marca/simbolo.png";

export function Marca({ destaque = false }: { destaque?: boolean }) {
  return <img className={destaque ? "marca marca-destaque" : "marca"} src={simbolo} alt="Dimensional" />;
}

export function MarcaNome({ children }: { children: ReactNode }) {
  return (
    <div className="phone-id">
      <Marca />
      <div>{children}</div>
    </div>
  );
}
