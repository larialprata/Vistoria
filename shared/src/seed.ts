import type { Store } from "./types";

export function createSeed(): Store {
  return { inspections: [], answers: [], approvals: [] };
}
