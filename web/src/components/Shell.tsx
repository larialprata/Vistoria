import { minhaConta } from "@shared/accounts";
import { AvisoFotos } from "@shared/AvisoFotos";
import { currentUser, enterSession, leaveSession, podeVerPagina, useAccount, type Pagina } from "@shared/session";
import { BotaoTema } from "@shared/theme";
import { Building2, ClipboardList, LayoutDashboard, Settings, Users } from "lucide-react";
import { useEffect } from "react";
import { NavLink, Outlet } from "react-router-dom";
import "../console.css";
import "../vision.css";

const GROUPS: {
  label: string;
  links: { to: string; label: string; icon: typeof LayoutDashboard; end: boolean; page: Pagina | "usuarios" }[];
}[] = [
  {
    label: "Operação",
    links: [
      { to: "/", label: "Painel", icon: LayoutDashboard, end: true, page: "painel" },
      { to: "/unidades", label: "Vistorias", icon: ClipboardList, end: false, page: "vistorias" },
      { to: "/obras", label: "Obras", icon: Building2, end: false, page: "obras" },
    ],
  },
  {
    label: "Administração",
    links: [
      { to: "/usuarios", label: "Usuários", icon: Users, end: false, page: "usuarios" },
      { to: "/configuracoes", label: "Configurações", icon: Settings, end: false, page: "configuracoes" },
    ],
  },
];

export function Shell() {
  const conta = useAccount();
  const name = currentUser() || "Equipe";
  const inicial = (name.trim()[0] || "D").toUpperCase();

  useEffect(() => {
    minhaConta().then((atual) => {
      if (atual?.token) enterSession(atual);
    });
  }, []);

  return (
    <div className="console">
      <aside className="side">
        <div className="brand">
          <span>D</span>
          <div>
            <strong>DIMENSIONAL</strong>
            <small>Vistoria</small>
          </div>
        </div>
        {GROUPS.map((group) => {
          const links = group.links.filter((item) => podeVerPagina(conta, item.page));
          if (links.length === 0) return null;
          return (
            <div key={group.label}>
              <p className="nav-label">{group.label}</p>
              <nav>
                {links.map((item) => (
                  <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? "is-on" : "")}>
                    <item.icon size={18} strokeWidth={1.75} />
                    {item.label}
                  </NavLink>
                ))}
              </nav>
            </div>
          );
        })}
        <div className="side-account">
          <div className="who-card">
            <span className="who-avatar">{inicial}</span>
            <div>
              <strong>{name}</strong>
              <small>{conta?.email}</small>
            </div>
          </div>
          <BotaoTema />
          <button
            type="button"
            className="sign-out"
            onClick={() => {
              leaveSession();
              window.location.assign("/");
            }}
          >
            Sair
          </button>
        </div>
      </aside>
      <div className="work">
        <AvisoFotos />
        <Outlet />
      </div>
    </div>
  );
}
