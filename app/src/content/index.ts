import readingV1 from "../../content/reading.json";
import readingCanada from "../../content/reading-canada.json";
import writingRaw from "../../content/writing.json";
import { parseContent } from "./validate";

const parsed = parseContent({ reading: [...readingV1, ...readingCanada], writing: writingRaw });

/** Problems found at load time; shown on the settings page (empty in a valid build). */
export const CONTENT_PROBLEMS = parsed.problems;
export const READING = parsed.content.reading.filter((r) => r.status !== "retired");
export const READING_BY_ID = new Map(READING.map((r) => [r.id, r]));
export const WRITING = parsed.content.writing.sort((a, b) => a.n - b.n);
export const PROMPT_BY_ID = new Map(
  WRITING.flatMap((task) => task.prompts.map((p) => [p.id, { task, prompt: p }] as const)),
);
