/**
 * Parses every content file and runs the cross-file checks that a schema
 * alone cannot express (unique ids, model answers inside their word range,
 * enough items per level for a full mock). Used by `npm run validate`,
 * the unit tests and the in-app diagnostic.
 */
import { z } from "zod";
import { LEVELS, ReadingItem, WritingTask } from "./schema";
import { countWords } from "../lib/words";

export interface ContentInput { reading: unknown[]; writing: unknown[] }
export interface ParsedContent { reading: ReadingItem[]; writing: WritingTask[] }

export function parseContent(input: ContentInput): { content: ParsedContent; problems: string[] } {
  const problems: string[] = [];
  const reading: ReadingItem[] = [];
  const writing: WritingTask[] = [];

  input.reading.forEach((raw, i) => {
    const r = ReadingItem.safeParse(raw);
    const id = (raw as { id?: string })?.id ?? `#${i}`;
    if (r.success) reading.push(r.data);
    else problems.push(`reading ${id}: ${z.prettifyError(r.error).replace(/\n/g, " ")}`);
  });
  input.writing.forEach((raw, i) => {
    const r = WritingTask.safeParse(raw);
    const id = (raw as { id?: string })?.id ?? `#${i}`;
    if (r.success) writing.push(r.data);
    else problems.push(`writing ${id}: ${z.prettifyError(r.error).replace(/\n/g, " ")}`);
  });

  const seen = new Set<string>();
  const unique = (id: string, where: string) => {
    if (seen.has(id)) problems.push(`${where}: duplicate id "${id}"`);
    seen.add(id);
  };
  reading.forEach((it) => unique(it.id, "reading"));
  for (const t of writing) {
    unique(t.id + "#task", "writing task");
    for (const p of t.prompts) {
      unique(p.id, "writing prompt");
      const w = countWords(p.model);
      if (w < t.min || w > t.max) problems.push(`writing ${p.id}: model has ${w} words (expected ${t.min}–${t.max})`);
    }
  }
  const tasks = new Set(writing.map((t) => t.n));
  for (const n of [1, 2, 3]) if (!tasks.has(n as 1)) problems.push(`writing: task ${n} is missing`);

  const live = reading.filter((r) => r.status !== "retired");
  for (const l of LEVELS) {
    const n = live.filter((r) => r.level === l).length;
    if (n < 6) problems.push(`reading: only ${n} item(s) at ${l} — a full mock needs at least 6`);
  }
  return { content: { reading, writing }, problems };
}
