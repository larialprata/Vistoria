import { AvisoFotos } from "@shared/AvisoFotos";
import { ClipboardList, Home, UserRound } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";

export function FieldShell() {
  return (
    <div className="shell">
      <AvisoFotos />
      <Outlet />
      <nav className="dock">
        <NavLink to="/" end className={({ isActive }) => (isActive ? "is-on" : "")}>
          <Home />
          Início
        </NavLink>
        <NavLink to="/vistorias" className={({ isActive }) => (isActive ? "is-on" : "")}>
          <ClipboardList />
          Vistorias
        </NavLink>
        <NavLink to="/perfil" className={({ isActive }) => (isActive ? "is-on" : "")}>
          <UserRound />
          Perfil
        </NavLink>
      </nav>
    </div>
  );
}
