import { LEVELS, type Level, type ReadingItem } from "../../content/schema";
import { READING } from "../../content";
import { estimateScore, type Estimate } from "../../lib/score";
import { markToday, type MockRun, type ReadingMock, type State } from "../../lib/store";
import { shuffle } from "../../lib/words";

/** TCF Canada reading: 39 questions in 60 minutes (≈ 92 s per question). */
export const MOCK_FULL = { n: 39, secs: 60 * 60 };
export const MOCK_SHORT = { n: 20, secs: 31 * 60 };
export const SECS_PER_ITEM = Math.round(MOCK_FULL.secs / MOCK_FULL.n);

const seen = (s: State, id: string) => (s.items[id] ? s.items[id].r + s.items[id].w : 0);

/** The level practice should target: the last mock's level, else A2. */
export function practiceLevels(s: State): Level[] {
  const pick = s.settings.practiceLevel;
  if (pick !== "auto") return [pick];
  const last = s.mocks[s.mocks.length - 1];
  const base = last ? Math.max(0, LEVELS.indexOf(last.level as Level)) : 1;
  // Work at your level and the one above it: that is where points are won.
  return [LEVELS[Math.max(0, base)], LEVELS[Math.min(5, base + 1)]].filter((l, i, a) => a.indexOf(l) === i);
}

/** Ten items: missed ones first, then never-seen ones, then the least seen. */
export function practiceSet(s: State, levels: Level[], size = 10): ReadingItem[] {
  const pool = READING.filter((r) => levels.includes(r.level));
  const rank = (r: ReadingItem) => (s.items[r.id]?.lw ? -1 : seen(s, r.id));
  return shuffle(pool).sort((a, b) => rank(a) - rank(b)).slice(0, size)
    .sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level));
}

function quotas(n: number): Record<Level, number> {
  const q = Object.fromEntries(LEVELS.map((l) => [l, Math.floor(n / 6)])) as Record<Level, number>;
  let rest = n - 6 * Math.floor(n / 6);
  for (const l of ["B1", "B2", "A2", "C1", "A1", "C2"] as Level[]) if (rest-- > 0) q[l]++;
  return q;
}

/** A mock draws from every level, least-seen first, in increasing difficulty like the real test. */
export function drawMock(s: State, full: boolean): MockRun {
  const cfg = full ? MOCK_FULL : MOCK_SHORT;
  const q = quotas(cfg.n);
  const picked: ReadingItem[] = [];
  for (const l of LEVELS) {
    const pool = shuffle(READING.filter((r) => r.level === l)).sort((a, b) => seen(s, a.id) - seen(s, b.id));
    picked.push(...pool.slice(0, q[l]));
  }
  const fresh = Math.round((100 * picked.filter((r) => seen(s, r.id) === 0).length) / picked.length);
  return {
    at: Date.now(), full, ids: picked.map((r) => r.id), ans: picked.map(() => null), flags: picked.map(() => false),
    left: cfg.secs, total: cfg.secs, qi: 0, fresh,
  };
}

export function recordAnswer(s: State, id: string, ok: boolean) {
  const st = s.items[id] ?? { r: 0, w: 0, t: 0, lw: false };
  if (ok) { st.r++; st.lw = false; } else { st.w++; st.lw = true; }
  st.t = Date.now();
  s.items[id] = st;
  markToday(s);
}

export interface MockResult { record: ReadingMock; est: Estimate; items: ReadingItem[]; answers: Array<number | null> }

export function scoreMock(run: MockRun, items: ReadingItem[]): MockResult {
  const responses = items.map((it, i) => ({ level: it.level, ok: run.ans[i] === it.a, n: it.options.length }));
  const est = estimateScore(responses);
  const byLevel: Record<string, { n: number; c: number }> = {};
  responses.forEach((r) => {
    byLevel[r.level] ??= { n: 0, c: 0 };
    byLevel[r.level].n++;
    if (r.ok) byLevel[r.level].c++;
  });
  const correct = responses.filter((r) => r.ok).length;
  return {
    est, items, answers: run.ans,
    record: {
      at: Date.now(), n: items.length, correct, score: est.score, lo: est.lo, hi: est.hi, level: est.level,
      nclc: est.nclc, secs: run.total - run.left, fresh: run.fresh, full: run.full, byLevel,
    },
  };
}
