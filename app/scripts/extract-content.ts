/**
 * One-time migration: pull the content out of the v1 single-file app
 * (`../index.html`) into `content/*.json`, keeping every id so that saved
 * progress still maps.
 *
 *   npm run extract            # refuses to overwrite existing files
 *   npm run extract -- --force # regenerate (loses hand edits!)
 *
 * After extraction the JSON files are the source of truth and are edited by hand.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const outDir = path.join(root, "content");
const force = process.argv.includes("--force");

const html = readFileSync(path.resolve(root, "..", "index.html"), "utf8");
const start = html.indexOf("const SECTIONS = [");
const end = html.indexOf("/* ==========================================================================\n   APPLICATION");
if (start < 0 || end < 0) throw new Error("Could not find the content block in ../index.html");

// The content block is plain data (plus achievement predicates, ignored here).
const sandbox: Record<string, unknown> = {};
vm.createContext(sandbox);
vm.runInContext(
  html.slice(start, end) +
    "\n;globalThis.__out = { SECTIONS, EXAM_BANK, WRITING_TASKS, SPEAKING_TASKS, FLASHCARDS, TCF_VERSIONS };",
  sandbox,
);
const { SECTIONS, EXAM_BANK, WRITING_TASKS, SPEAKING_TASKS, FLASHCARDS, TCF_VERSIONS } =
  (sandbox as { __out: any }).__out;

const SECTION_SKILL: Record<string, string> = { bases: "msl", msl: "msl", co: "co", ce: "ce" };
const reading: any[] = [];
const structures: any[] = [];
const listening: any[] = [];
const lessons: any[] = [];

for (const sec of SECTIONS) {
  for (const l of sec.lessons) {
    lessons.push({
      section: sec.id, id: l.id, title: l.title, minutes: l.minutes, html: l.content.trim(),
      drillTitle: l.drill?.title, drill: (l.drill?.items ?? []).map((i: any) => i.id),
    });
    for (const item of l.drill?.items ?? []) {
      const base = { ...item, from: "lesson", lesson: `${sec.id}/${l.id}` };
      const skill = SECTION_SKILL[sec.id];
      if (skill === "ce") reading.push(toReading(base));
      else if (skill === "co") listening.push(base);
      else structures.push({ ...base, section: sec.id });   // incl. "intro" format questions
    }
  }
}
for (const item of EXAM_BANK) {
  const { skill, ...rest } = item;
  const base = { ...rest, from: "bank" };
  if (skill === "ce") reading.push(toReading(base));
  else if (skill === "co") listening.push(base);
  else structures.push(base);
}

function toReading(item: any) {
  const { type, ...rest } = item;
  if (type !== "read") throw new Error(`${item.id}: expected a reading item`);
  return { kind: "other", status: "reviewed", ...rest };
}

const writing = WRITING_TASKS.map((t: any) => ({ ...t, phrases: [] }));

const files: Record<string, unknown> = {
  "reading.json": reading,
  "writing.json": writing,
  "structures.json": structures,
  "listening.json": listening,
  "lessons.json": lessons,
  "cards.json": FLASHCARDS,
  "speaking.json": SPEAKING_TASKS,
  "versions.json": TCF_VERSIONS,
};

mkdirSync(outDir, { recursive: true });
for (const [name, data] of Object.entries(files)) {
  const file = path.join(outDir, name);
  if (existsSync(file) && !force) {
    console.log(`skip  ${name} (exists — use --force to overwrite)`);
    continue;
  }
  writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
  console.log(`write ${name} (${Array.isArray(data) ? data.length + " entries" : "object"})`);
}
