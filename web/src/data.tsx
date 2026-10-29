import { loadPainel, painelDaConta, type PainelData } from "@shared/painel";
import { useAccount } from "@shared/session";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Outlet } from "react-router-dom";

type PainelState = {
  data: PainelData | null;
  loading: boolean;
  reload: () => Promise<void>;
};

const PainelContext = createContext<PainelState>({
  data: null,
  loading: true,
  reload: async () => {},
});

export function PainelProvider({ children }: { children?: ReactNode }) {
  const [state, setState] = useState<Omit<PainelState, "reload">>({ data: null, loading: true });
  const reload = useCallback(async () => {
    const data = await loadPainel();
    setState({ data, loading: false });
  }, []);

  useEffect(() => {
    let active = true;
    loadPainel().then((data) => {
      if (active) setState({ data, loading: false });
    });
    return () => {
      active = false;
    };
  }, []);

  return <PainelContext.Provider value={{ ...state, reload }}>{children ?? <Outlet />}</PainelContext.Provider>;
}

export function usePainel() {
  const conta = useAccount();
  const state = useContext(PainelContext);
  const data = useMemo(() => painelDaConta(state.data, conta), [state.data, conta]);
  return { ...state, data };
}
