/**
 * Level estimate for the reading mock.
 *
 * A raw percentage is misleading: 25 % is what random ticking earns, and a
 * right answer on a C1 item says more than one on an A1 item. We estimate an
 * ability θ with a fixed-parameter logistic model that accounts for each
 * item's difficulty (its CEFR label) and for guessing (1 chance in 4):
 *
 *     P(correct) = c + (1 − c) / (1 + e^(−a·(θ − b)))
 *
 * θ is the posterior mean (broad prior centred on B1), mapped onto the TCF
 * scale with score = 400 + 100·θ (400 = start of B2). Item difficulties are the
 * author's labels, not calibrated on real candidates: hence the range.
 */
import type { Level } from "../content/schema";
import { LEVELS } from "../content/schema";

const DIFFICULTY: Record<Level, number> = { A1: -2.5, A2: -1.5, B1: -0.5, B2: 0.5, C1: 1.5, C2: 2.5 };

export interface Response { level: Level; ok: boolean; n?: number }

export function estimateAbility(responses: Response[]): { theta: number; sd: number } {
  const A = 1.5, MU = -0.5, SD = 2;
  const grid: Array<[number, number]> = [];
  let best = -Infinity;
  for (let t = -4.5; t <= 4.5001; t += 0.05) {
    let ll = -((t - MU) ** 2) / (2 * SD * SD);
    for (const r of responses) {
      const c = 1 / (r.n ?? 4);
      const p = c + (1 - c) / (1 + Math.exp(-A * (t - DIFFICULTY[r.level])));
      ll += Math.log(r.ok ? p : 1 - p);
    }
    grid.push([t, ll]);
    if (ll > best) best = ll;
  }
  let z = 0, mean = 0, variance = 0;
  for (const [t, ll] of grid) { const w = Math.exp(ll - best); z += w; mean += w * t; }
  mean /= z;
  for (const [t, ll] of grid) { const w = Math.exp(ll - best); variance += w * (t - mean) ** 2; }
  return { theta: mean, sd: Math.sqrt(variance / z) };
}

export function scoreToLevel(score: number): string {
  return score >= 600 ? "C2" : score >= 500 ? "C1" : score >= 400 ? "B2"
    : score >= 300 ? "B1" : score >= 200 ? "A2" : score >= 100 ? "A1" : "< A1";
}

export interface Estimate { score: number; lo: number; hi: number; level: string; nclc: number }

/** Indicative score (0–699) with an ~80 % range. Capped by the hardest level present. */
export function estimateScore(responses: Response[]): Estimate {
  if (!responses.length) return { score: 0, lo: 0, hi: 0, level: "< A1", nclc: 0 };
  const { theta, sd } = estimateAbility(responses);
  const top = Math.max(...responses.map((r) => LEVELS.indexOf(r.level)));
  const cap = 199 + 100 * top;
  const clamp = (v: number) => Math.max(0, Math.min(cap, Math.round(v)));
  const score = clamp(400 + 100 * theta);
  const margin = Math.max(40, 128 * sd);
  return {
    score,
    level: scoreToLevel(score),
    lo: clamp(Math.round((score - margin) / 10) * 10),
    hi: clamp(Math.round((score + margin) / 10) * 10),
    nclc: nclcReading(score),
  };
}

/* IRCC equivalence tables for the TCF Canada (canada.ca). They can change:
   the app links to the official page next to every NCLC it shows. */
const READING_NCLC: Array<[number, number]> = [[549, 10], [524, 9], [499, 8], [453, 7], [406, 6], [375, 5], [342, 4]];
const WRITING_NCLC: Array<[number, number]> = [[16, 10], [14, 9], [12, 8], [10, 7], [7, 6], [6, 5], [4, 4]];

export function nclcReading(score: number): number {
  for (const [min, n] of READING_NCLC) if (score >= min) return n;
  return 0;
}
export function nclcWriting(mark20: number): number {
  for (const [min, n] of WRITING_NCLC) if (mark20 >= min) return n;
  return 0;
}
export function writingLevel(mark20: number): string {
  return mark20 >= 18 ? "C2" : mark20 >= 14 ? "C1" : mark20 >= 10 ? "B2"
    : mark20 >= 6 ? "B1" : mark20 >= 2 ? "A2" : mark20 >= 1 ? "A1" : "< A1";
}

export const NCLC_TARGET = { reading: 453, writing: 10 } as const;
export const IRCC_TABLE_URL =
  "https://www.canada.ca/en/immigration-refugees-citizenship/corporate/publications-manuals/operational-bulletins-manuals/standard-requirements/language-requirements/test-equivalency-charts.html";
