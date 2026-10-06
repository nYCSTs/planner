"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { addDays } from "date-fns";
import type { ResolvedOccurrence } from "@/types";
import type { TaskInput } from "@/lib/store/actions";

export type View = "day" | "week" | "upcoming" | "reports" | "habits";

export type Scope = "this" | "following" | "all";

export interface ScopeRequest {
  title: string;
  description?: string;
  allowThis?: boolean;
  allowFollowing?: boolean;
  allowAll?: boolean;
  labels?: Partial<Record<Scope, string>>;
  destructive?: boolean;
}

export interface FormRequest {
  /** Prefill for a new task. */
  initial?: Partial<TaskInput>;
  /** Edit an existing task. */
  taskId?: string;
  /** Occurrence the edit started from (enables "só este dia"). */
  occ?: { key: string; date: string };
  /** Reopen the detail when the form closes. */
  returnToDetail?: boolean;
}

export interface EntryRequest {
  entryId?: string;
  start?: number;
  end?: number | null;
  title?: string;
  taskId?: string;
}

export interface Toast {
  id: number;
  message: string;
  action?: { label: string; run: () => void };
}

export interface Selection {
  key: string;
  date: string;
}

interface UIContextValue {
  view: View;
  setView: (v: View) => void;
  day: Date;
  setDay: (d: Date) => void;
  shiftDay: (n: number) => void;
  selected: Selection | null;
  openDetail: (occ: Pick<ResolvedOccurrence, "key" | "date">) => void;
  closeDetail: () => void;
  form: FormRequest | null;
  openForm: (req: FormRequest) => void;
  closeForm: () => void;
  entry: EntryRequest | null;
  openEntry: (req: EntryRequest) => void;
  closeEntry: () => void;
  toasts: Toast[];
  toast: (message: string, action?: Toast["action"]) => void;
  dismissToast: (id: number) => void;
  scope: ScopeRequest | null;
  askScope: (req: ScopeRequest) => Promise<Scope | null>;
  resolveScope: (s: Scope | null) => void;
  settingsOpen: boolean;
  setSettingsOpen: (o: boolean) => void;
  syncOpen: boolean;
  setSyncOpen: (o: boolean) => void;
  paletteOpen: boolean;
  setPaletteOpen: (o: boolean) => void;
  duplicateFrom: { taskId?: string; date: string } | null;
  setDuplicateFrom: (v: { taskId?: string; date: string } | null) => void;
  pomodoroOpen: boolean;
  setPomodoroOpen: (o: boolean | ((o: boolean) => boolean)) => void;
  listOpen: boolean;
  setListOpen: (o: boolean | ((o: boolean) => boolean)) => void;
  helpOpen: boolean;
  setHelpOpen: (o: boolean) => void;
  overdueOpen: boolean;
  setOverdueOpen: (o: boolean) => void;
}

const UIContext = createContext<UIContextValue | null>(null);

export function UIProvider({ children }: { children: React.ReactNode }) {
  const [view, setView] = useState<View>("day");
  const [day, setDay] = useState<Date>(() => new Date());
  const [selected, setSelected] = useState<Selection | null>(null);
  const [form, setForm] = useState<FormRequest | null>(null);
  const [entry, setEntry] = useState<EntryRequest | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [scope, setScope] = useState<ScopeRequest | null>(null);
  const scopeResolver = useRef<((s: Scope | null) => void) | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [duplicateFrom, setDuplicateFrom] = useState<{ taskId?: string; date: string } | null>(null);
  const [pomodoroOpen, setPomodoroOpen] = useState(false);
  const [listOpen, setListOpen] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);
  const [overdueOpen, setOverdueOpen] = useState(false);
  const toastSeq = useRef(0);

  const shiftDay = useCallback((n: number) => setDay((d) => addDays(d, n)), []);
  const openDetail = useCallback(
    (occ: Pick<ResolvedOccurrence, "key" | "date">) => setSelected({ key: occ.key, date: occ.date }),
    [],
  );
  const closeDetail = useCallback(() => setSelected(null), []);
  const openForm = useCallback((req: FormRequest) => setForm(req), []);
  const closeForm = useCallback(() => setForm(null), []);
  const openEntry = useCallback((req: EntryRequest) => setEntry(req), []);
  const closeEntry = useCallback(() => setEntry(null), []);

  const dismissToast = useCallback((id: number) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, action?: Toast["action"]) => {
      const id = ++toastSeq.current;
      setToasts((ts) => [...ts.slice(-2), { id, message, action }]);
      setTimeout(() => dismissToast(id), action ? 6000 : 3500);
    },
    [dismissToast],
  );

  const askScope = useCallback((req: ScopeRequest) => {
    scopeResolver.current?.(null);
    setScope(req);
    return new Promise<Scope | null>((resolve) => {
      scopeResolver.current = resolve;
    });
  }, []);

  const resolveScope = useCallback((s: Scope | null) => {
    scopeResolver.current?.(s);
    scopeResolver.current = null;
    setScope(null);
  }, []);

  const value = useMemo<UIContextValue>(
    () => ({
      view,
      setView,
      day,
      setDay,
      shiftDay,
      selected,
      openDetail,
      closeDetail,
      form,
      openForm,
      closeForm,
      entry,
      openEntry,
      closeEntry,
      toasts,
      toast,
      dismissToast,
      scope,
      askScope,
      resolveScope,
      settingsOpen,
      setSettingsOpen,
      syncOpen,
      setSyncOpen,
      paletteOpen,
      setPaletteOpen,
      duplicateFrom,
      setDuplicateFrom,
      pomodoroOpen,
      setPomodoroOpen,
      listOpen,
      setListOpen,
      helpOpen,
      setHelpOpen,
      overdueOpen,
      setOverdueOpen,
    }),
    [
      view, day, shiftDay, selected, openDetail, closeDetail, form, openForm, closeForm, entry,
      openEntry, closeEntry, toasts, toast, dismissToast, scope, askScope, resolveScope,
      settingsOpen, syncOpen, paletteOpen, duplicateFrom, pomodoroOpen, listOpen, helpOpen, overdueOpen,
    ],
  );

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI(): UIContextValue {
  const ctx = useContext(UIContext);
  if (!ctx) {
    throw new Error("useUI must be used within UIProvider");
  }

  return ctx;
}
