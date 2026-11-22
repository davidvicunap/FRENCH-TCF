/**
 * Content contract for Objectif TCF.
 *
 * Every file in `app/content/` is parsed with these schemas at build time
 * (`npm run validate`) and in the unit tests. Hand-written and LLM-drafted
 * content must pass the same checks before it reaches the app.
 *
 * Ids are permanent: saved progress refers to them. Never rename one; retire
 * an item with `status: "retired"` instead.
 */
import { z } from "zod";

export const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export const Level = z.enum(LEVELS);
export type Level = z.infer<typeof Level>;

const Id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "ids are lowercase, digits and dashes");
const Status = z.enum(["draft", "reviewed", "retired"]).default("reviewed");

/* ---------------------------------------------------------------- reading */

/** Kinds of document found in the TCF reading test. */
export const DocKind = z.enum([
  "notice", "message", "email", "ad", "letter", "article", "opinion", "review", "literary", "other",
]);

export const ReadingItem = z.object({
  id: Id,
  level: Level,
  kind: DocKind.default("other"),
  /** The document, exactly as the candidate sees it. Line breaks are kept. */
  context: z.string().min(10),
  q: z.string().min(5),
  options: z.array(z.string().min(1)).min(3).max(5),
  /** Index of the correct option in `options`. */
  a: z.number().int().nonnegative(),
  /** Explanation in French (exam language). */
  why: z.string().min(10),
  /** Same explanation in English, for learners below B1. */
  whyEn: z.string().optional(),
  /** One short English note per option: why it is right or wrong (distractor analysis). */
  notes: z.array(z.string()).optional(),
  /** Key words of the document with their English meaning. */
  glossary: z.array(z.object({ fr: z.string(), en: z.string() })).optional(),
  gloss: z.string().optional(),
  from: z.enum(["bank", "lesson", "new"]).default("new"),
  /** Lesson of the v1 app the item came from, e.g. "ce/l1". */
  lesson: z.string().optional(),
  status: Status,
}).superRefine((it, ctx) => {
  if (it.a >= it.options.length) ctx.addIssue({ code: "custom", message: "answer index out of range" });
  if (it.notes && it.notes.length !== it.options.length) {
    ctx.addIssue({ code: "custom", message: "notes must have one entry per option" });
  }
  const norm = it.options.map((o) => o.trim().toLowerCase());
  if (new Set(norm).size !== norm.length) ctx.addIssue({ code: "custom", message: "duplicate options" });
});
export type ReadingItem = z.infer<typeof ReadingItem>;

/* ---------------------------------------------------------------- writing */

export const WritingPrompt = z.object({
  id: Id,
  prompt: z.string().min(20),
  /** A model answer inside the task's word range. */
  model: z.string().min(20),
  /** Optional English translation of the prompt, for learners below B1. */
  promptEn: z.string().optional(),
});

export const Phrase = z.object({ fr: z.string(), en: z.string() });

export const WritingTask = z.object({
  id: Id,
  n: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  title: z.string(),
  titleEn: z.string().optional(),
  minutes: z.number().int().positive(),
  min: z.number().int().positive(),
  max: z.number().int().positive(),
  audience: z.string(),
  goal: z.string(),
  goalEn: z.string().optional(),
  official: z.string().optional(),
  plan: z.array(z.string()).min(1),
  connectors: z.array(z.string()),
  checklist: z.array(z.object({ id: Id, text: z.string() })).min(1),
  /** Ready-made sentences for this task, with their meaning. */
  phrases: z.array(Phrase).default([]),
  prompts: z.array(WritingPrompt).min(1),
}).refine((t) => t.min < t.max, "min must be below max");
export type WritingTask = z.infer<typeof WritingTask>;
export type WritingPrompt = z.infer<typeof WritingPrompt>;

/* ------------------------------------------- other content kept for later */

/** Kept from v1 for the next modules (listening, structures, vocabulary). */
export const ChoiceItem = z.object({
  id: Id,
  level: Level,
  type: z.enum(["mcq", "gap", "listen", "read"]),
  q: z.string(),
  options: z.array(z.string()).optional(),
  a: z.number().int().optional(),
  answers: z.array(z.string()).optional(),
  audio: z.string().optional(),
  transcript: z.string().optional(),
  context: z.string().optional(),
  why: z.string(),
  gloss: z.string().optional(),
  from: z.enum(["bank", "lesson"]),
  lesson: z.string().optional(),
}).loose();

export const Card = z.object({
  id: Id, theme: z.string(), front: z.string(), back: z.string(), note: z.string(), ex: z.string().optional(),
});

export const Lesson = z.object({
  section: Id, id: Id, title: z.string(), minutes: z.number(), html: z.string(),
  drillTitle: z.string().optional(), drill: z.array(Id).default([]),
});

export const SpeakingTask = z.object({ id: Id, n: z.number() }).loose();
