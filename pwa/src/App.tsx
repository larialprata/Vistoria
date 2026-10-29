import { minhaConta } from "@shared/accounts";
import { enterSession, useAccount, veSomenteObra } from "@shared/session";
import { sincronizarVistorias } from "@shared/sync";
import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { FieldShell } from "./components/FieldShell";
import { ChecklistPage } from "./pages/ChecklistPage";
import { DecisaoPage } from "./pages/DecisaoPage";
import { CoverPage } from "./pages/CoverPage";
import { useObra } from "./obra";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { ObraPage } from "./pages/ObraPage";
import { PerfilPage } from "./pages/PerfilPage";
import { RegistrarPage } from "./pages/RegistrarPage";
import { RoomsPage } from "./pages/RoomsPage";
import { VistoriasPage } from "./pages/VistoriasPage";

function AppRoutes() {
  const conta = useAccount();
  const obra = useObra();
  useEffect(() => {
    if (!conta || conta.acesso === "web") return;
    sincronizarVistorias();
    let ativo = true;
    minhaConta().then((atual) => {
      if (!ativo || !atual?.token || atual.token === conta.token) return;
      enterSession(atual, Boolean(localStorage.getItem("dime.vistoria.conta")));
    });
    return () => {
      ativo = false;
    };
  }, [conta]);
  if (!conta || conta.acesso === "web") {
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  if (!obra) return <ObraPage />;

  return (
    <Routes>
      <Route element={<FieldShell />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/vistorias" element={<VistoriasPage />} />
        <Route path="/vistorias/:id" element={<DecisaoPage />} />
        <Route path="/perfil" element={<PerfilPage />} />
        <Route path="/registrar" element={veSomenteObra(conta) ? <Navigate to="/vistorias" replace /> : <RegistrarPage />} />
        <Route path="/nova" element={veSomenteObra(conta) ? <Navigate to="/vistorias" replace /> : <CoverPage />} />
        <Route path="/vistoria/:id" element={veSomenteObra(conta) ? <Navigate to="/vistorias" replace /> : <RoomsPage />} />
        <Route path="/vistoria/:id/:ambienteId/:blockId" element={veSomenteObra(conta) ? <Navigate to="/vistorias" replace /> : <ChecklistPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return <AppRoutes />;
}
