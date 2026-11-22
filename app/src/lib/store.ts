/**
 * Local-first state. Everything lives in this browser's localStorage under
 * `tcf.v2.state`; nothing is sent anywhere. The optional AI-grading API key is
 * kept under a separate key so that it is never included in exported backups.
 *
 * Every read goes through `StateSchema`: a damaged or hand-edited save can't
 * crash the app or inject markup, and new fields get their defaults.
 */
import { useSyncExternalStore } from "react";
import { z } from "zod";
import { todayKey } from "./words";

export const STATE_KEY = "tcf.v2.state";
export const KEY_KEY = "tcf.v2.apikey";
export const THEME_KEY = "tcf.v2.theme";
const V1_KEY = "tcf.state.v1";

const ts = z.number().int().nonnegative().catch(0);
const str = (max = 20000) => z.string().max(max).catch("");

const ItemStat = z.object({ r: ts, w: ts, t: ts, lw: z.boolean().catch(false) });

const ReadingMock = z.object({
  at: ts, n: ts, correct: ts, score: ts, lo: ts, hi: ts,
  level: str(8), nclc: ts, secs: ts, fresh: ts, full: z.boolean().catch(true),
  byLevel: z.record(z.string(), z.object({ n: ts, c: ts })).catch({}),
});

const MockRun = z.object({
  at: ts, full: z.boolean(), ids: z.array(z.string()).max(80), ans: z.array(z.number().int().nullable()),
  flags: z.array(z.boolean()), left: ts, total: ts, qi: ts, fresh: ts,
});

export const AiCriterion = z.object({ name: z.string(), level: z.string(), comment: z.string() });
export const AiError = z.object({ quote: z.string(), correction: z.string(), explanation: z.string(), type: z.string() });
export const AiResult = z.object({
  mark20: z.number(), level: z.string(), summary: z.string(),
  criteria: z.array(AiCriterion), errors: z.array(AiError), strengths: z.array(z.string()),
  priorities: z.array(z.string()), improved: z.string(), model: z.string().catch(""),
});
export type AiResult = z.infer<typeof AiResult>;

const Attempt = z.object({
  id: z.string(), promptId: z.string(), at: ts, text: str(), words: ts,
  secs: ts, mock: z.boolean().catch(false), issues: ts, ai: AiResult.nullable().catch(null),
});
export type Attempt = z.infer<typeof Attempt>;

const WritingRun = z.object({
  at: ts, promptIds: z.array(z.string()).length(3), texts: z.array(z.string()).length(3),
  left: ts, ti: ts,
});

const StateSchema = z.object({
  v: z.literal(2).catch(2),
  items: z.record(z.string(), ItemStat).catch({}),
  mocks: z.array(ReadingMock).catch([]),
  mockRun: MockRun.nullable().catch(null),
  drafts: z.record(z.string(), str()).catch({}),
  attempts: z.array(Attempt).catch([]),
  writingRun: WritingRun.nullable().catch(null),
  days: z.record(z.string(), z.boolean()).catch({}),
  settings: z.object({
    english: z.boolean().catch(true),
    examDate: str(10),
    model: z.enum(["claude-opus-5-5", "claude-sonnet-5-5"]).catch("claude-opus-5-5"),
    practiceLevel: z.enum(["auto", "A1", "A2", "B1", "B2", "C1", "C2"]).catch("auto"),
  }).catch({ english: true, examDate: "", model: "claude-opus-5-5", practiceLevel: "auto" }),
  savedAt: ts,
  backupAt: ts,
  importedV1: z.boolean().catch(false),
});
export type State = z.infer<typeof StateSchema>;
export type MockRun = z.infer<typeof MockRun>;
export type WritingRun = z.infer<typeof WritingRun>;
export type ReadingMock = z.infer<typeof ReadingMock>;

export function sanitize(raw: unknown): State {
  const parsed = StateSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : StateSchema.parse({});
}

function readStorage(): State {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STATE_KEY);
    const state = sanitize(raw ? JSON.parse(raw) : {});
    if (!state.importedV1) importV1(state);
    return state;
  } catch {
    try { if (raw) localStorage.setItem(STATE_KEY + ".unreadable", raw); } catch { /* nothing more to do */ }
    return sanitize({});
  }
}

/** Carry over writing drafts and reading-question history from the v1 app, once. */
function importV1(state: State) {
  state.importedV1 = true;
  try {
    const raw = localStorage.getItem(V1_KEY);
    if (!raw) return;
    const old = JSON.parse(raw);
    for (const [id, text] of Object.entries(old.writingDrafts ?? {})) {
      if (typeof text === "string" && text.trim() && !state.drafts[id]) state.drafts[id] = text.slice(0, 20000);
    }
    for (const [id, st] of Object.entries(old.items ?? {})) {
      const s = ItemStat.safeParse({ ...(st as object), lw: !!(st as { lw?: number }).lw });
      if (s.success && !state.items[id]) state.items[id] = s.data;
    }
    for (const day of Object.keys(old.days ?? {})) if (/^\d{4}-\d{2}-\d{2}$/.test(day)) state.days[day] = true;
    if (typeof old.goal?.date === "string" && !state.settings.examDate) state.settings.examDate = old.goal.date;
  } catch { /* unreadable v1 data: ignore */ }
}

/* ---------------------------------------------------------------- the store */

let state: State = readStorage();
let saveOk = true;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function write(): boolean {
  state.savedAt = Date.now();
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
    saveOk = true;
  } catch {
    saveOk = false;
  }
  return saveOk;
}
write();

/** Apply a change and save it. Returns false if the browser refused to store it. */
export function update(fn: (s: State) => void): boolean {
  const next = structuredClone(state);
  fn(next);
  state = next;
  const ok = write();
  emit();
  return ok;
}

export const getState = () => state;
export const storageWorks = () => saveOk;

/** The whole state; re-renders on every change (the state object is replaced, never mutated). */
export function useAppState(): State {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => state,
  );
}

// Another tab saved: adopt its state instead of overwriting it later.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === STATE_KEY || e.key === null) { state = readStorage(); emit(); }
  });
}

export function markToday(s: State) { s.days[todayKey()] = true; }

export function dayStreak(days: Record<string, boolean>): number {
  const d = new Date();
  if (!days[todayKey(d)]) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days[todayKey(d)]) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

/* ------------------------------------------------------------ backup files */

export function exportBackup(): string {
  return JSON.stringify({ app: "objectif-tcf-v2", exportedAt: new Date().toISOString(), state }, null, 1);
}

export function importBackup(text: string): { ok: boolean; msg: string } {
  let data: unknown;
  try { data = JSON.parse(text); } catch { return { ok: false, msg: "This is not a readable backup file." }; }
  const d = data as { app?: string; state?: unknown };
  if (!d || d.app !== "objectif-tcf-v2" || typeof d.state !== "object") {
    return { ok: false, msg: "This file is not an Objectif TCF v2 backup." };
  }
  const next = sanitize(d.state);
  next.backupAt = Date.now();
  next.importedV1 = true;
  state = next;
  const ok = write();
  emit();
  return { ok: true, msg: ok ? "Backup restored." : "Backup loaded, but this browser refuses to save it." };
}

export function resetAll() {
  state = sanitize({ importedV1: true });
  write();
  emit();
}

/* ------------------------------------------------------------- API key ---- */

export function getApiKey(): string {
  try { return localStorage.getItem(KEY_KEY) ?? ""; } catch { return ""; }
}
export function setApiKey(key: string) {
  try {
    if (key) localStorage.setItem(KEY_KEY, key.trim());
    else localStorage.removeItem(KEY_KEY);
  } catch { /* storage blocked */ }
  emit();
}
