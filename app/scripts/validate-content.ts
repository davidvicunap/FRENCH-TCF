import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseContent } from "../src/content/validate";

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "content");
const read = (f: string) => JSON.parse(readFileSync(path.join(dir, f), "utf8"));
const { content, problems } = parseContent({
  reading: [...read("reading.json"), ...read("reading-canada.json")],
  writing: read("writing.json"),
});
const by: Record<string, number> = {};
for (const r of content.reading) by[r.level] = (by[r.level] ?? 0) + 1;
console.log(`reading: ${content.reading.length} items`, by);
console.log(`writing: ${content.writing.map((t) => `task ${t.n} × ${t.prompts.length}`).join(", ")}`);
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n- ` + problems.join("\n- "));
  process.exit(1);
}
console.log("content OK");
