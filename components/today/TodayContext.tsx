"use client";

/* =========================================================================
   Today page — shared client state. Holds page-level scope + historical date,
   and the "which overlay is open" state so any component (including entity
   mentions rendered deep in the tree) can open the account drawer, a user
   profile, a Signal page, Ask Signal, or Add task — without prop
   drilling. Overlays themselves are rendered by TodayWorkspace, driven by this
   state, so this module imports no overlay components (no import cycle).
   ========================================================================= */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { PortfolioScope, LaneKey, TodayTask } from "@/lib/today/types";
import { track } from "@/lib/today/analytics";
import { getViewer } from "@/lib/today/repo";

export type AccountDrawerTab = "overview" | "signals" | "timeline" | "notes";

export interface AddTaskPrefill {
  category?: LaneKey;
  accountId?: string;
  projectId?: string;
  newCategory?: boolean;
  title?: string;
  sourceType?: "signal" | "commitment";
  sourceId?: string;
}

interface OverlayState {
  account: { id: string; tab: AccountDrawerTab } | null;
  user: string | null;
  page: string | null;
  askSignal: { prefill?: string } | null;
  addTask: AddTaskPrefill | null;
}

interface TodayCtx {
  scope: PortfolioScope;
  setScope: (s: PortfolioScope) => void;
  /** Selected date as YYYY-MM-DD, or null = today. */
  date: string | null;
  setDate: (d: string | null) => void;
  /** Admin drill-in: a specific CSM's book, or null = no owner filter. */
  ownerFilter: string | null;
  setOwnerFilter: (userId: string | null) => void;

  overlay: OverlayState;
  openAccount: (id: string, tab?: AccountDrawerTab) => void;
  openUser: (id: string) => void;
  openPage: (id: string) => void;
  openAskSignal: (prefill?: string) => void;
  openAddTask: (prefill?: AddTaskPrefill) => void;
  closeOverlays: () => void;

  /** Board tasks added this session + per-task status overrides (optimistic). */
  localTasks: TodayTask[];
  addTask: (t: TodayTask) => void;
  taskStatus: Record<string, "open" | "done">;
  setTaskStatus: (id: string, status: "open" | "done") => void;
}

const Ctx = createContext<TodayCtx | null>(null);

export function TodayProvider({ children }: { children: ReactNode }) {
  // Admins/super-admins default to the whole (permitted) book; CSMs to their own.
  const [scope, setScopeState] = useState<PortfolioScope>(() => (getViewer().canSeeAll ? "company" : "my_portfolio"));
  const [date, setDateState] = useState<string | null>(null);
  const [ownerFilter, setOwnerFilterState] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<OverlayState>({ account: null, user: null, page: null, askSignal: null, addTask: null });
  const [localTasks, setLocalTasks] = useState<TodayTask[]>([]);
  const [taskStatus, setTaskStatusState] = useState<Record<string, "open" | "done">>({});
  const addTask = useCallback((t: TodayTask) => { setLocalTasks((prev) => [t, ...prev]); track("action_created", { category: t.category }); }, []);
  const setTaskStatus = useCallback((id: string, status: "open" | "done") => { setTaskStatusState((prev) => ({ ...prev, [id]: status })); if (status === "done") track("action_completed", { taskId: id }); }, []);

  const setScope = useCallback((s: PortfolioScope) => { setScopeState(s); track("scope_changed", { scope: s }); }, []);
  const setOwnerFilter = useCallback((userId: string | null) => {
    setOwnerFilterState(userId);
    if (userId) { setScopeState("company"); track("scope_changed", { scope: "owner", ownerId: userId }); }
  }, []);
  const setDate = useCallback((d: string | null) => {
    setDateState(d);
    track("date_changed", { date: d ?? "today" });
    if (d) track("historical_mode_entered", { date: d });
  }, []);

  const BASE: OverlayState = { account: null, user: null, page: null, askSignal: null, addTask: null };
  const closeOverlays = useCallback(() => setOverlay({ ...BASE }), []);

  const openAccount = useCallback((id: string, tab: AccountDrawerTab = "overview") => {
    setOverlay({ ...BASE, account: { id, tab } });
    track("account_drawer_opened", { accountId: id, tab });
  }, []);
  const openUser = useCallback((id: string) => {
    setOverlay({ ...BASE, user: id });
    track("user_profile_opened", { userId: id });
  }, []);
  const openPage = useCallback((id: string) => {
    setOverlay({ ...BASE, page: id });
    track("signal_page_opened", { pageId: id });
  }, []);
  const openAskSignal = useCallback((prefill?: string) => {
    setOverlay({ ...BASE, askSignal: { prefill } });
  }, []);
  const openAddTask = useCallback((prefill?: AddTaskPrefill) => {
    setOverlay({ ...BASE, addTask: prefill ?? {} });
  }, []);

  const value = useMemo<TodayCtx>(() => ({
    scope, setScope, date, setDate, ownerFilter, setOwnerFilter, overlay, openAccount, openUser, openPage, openAskSignal, openAddTask, closeOverlays,
    localTasks, addTask, taskStatus, setTaskStatus,
  }), [scope, setScope, date, setDate, ownerFilter, setOwnerFilter, overlay, openAccount, openUser, openPage, openAskSignal, openAddTask, closeOverlays, localTasks, addTask, taskStatus, setTaskStatus]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useToday(): TodayCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useToday must be used within TodayProvider");
  return v;
}
