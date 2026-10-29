import { podeVerPagina, useAccount, type Pagina } from "@shared/session";
import { type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Shell } from "./components/Shell";
import { PainelProvider } from "./data";
import { DashboardPage } from "./pages/DashboardPage";
import { UsuariosPage } from "./pages/UsuariosPage";
import { LoginPage } from "./pages/LoginPage";
import { ConfigPage } from "./pages/NotePage";
import { ObrasPage } from "./pages/ObrasPage";
import { RelatorioPage } from "./pages/RelatorioPage";
import { UnitPage } from "./pages/UnitPage";
import { UnitsPage } from "./pages/UnitsPage";

function PaginaProtegida(props: { page: Pagina | "usuarios"; children: ReactNode }) {
  const conta = useAccount();
  if (podeVerPagina(conta, props.page)) return props.children;
  return (
    <main className="canvas">
      <section className="empty-card">
        <h2>Sem permissão</h2>
        <p>Um administrador precisa liberar esta página para o seu usuário.</p>
      </section>
    </main>
  );
}

function AppRoutes() {
  const conta = useAccount();
  if (!conta || conta.acesso === "app") {
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<PainelProvider />}>
        <Route element={<Shell />}>
          <Route path="/" element={<PaginaProtegida page="painel"><DashboardPage /></PaginaProtegida>} />
          <Route path="/unidades" element={<PaginaProtegida page="vistorias"><UnitsPage /></PaginaProtegida>} />
          <Route path="/unidades/:id" element={<PaginaProtegida page="vistorias"><UnitPage /></PaginaProtegida>} />
          <Route path="/unidades/:id/relatorio" element={<PaginaProtegida page="vistorias"><RelatorioPage /></PaginaProtegida>} />
          <Route path="/obras" element={<PaginaProtegida page="obras"><ObrasPage /></PaginaProtegida>} />
          <Route path="/usuarios" element={<PaginaProtegida page="usuarios"><UsuariosPage /></PaginaProtegida>} />
          <Route path="/equipes" element={<Navigate to="/usuarios" replace />} />
          <Route path="/configuracoes" element={<PaginaProtegida page="configuracoes"><ConfigPage /></PaginaProtegida>} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return <AppRoutes />;
}
