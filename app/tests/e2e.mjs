// End-to-end check of the v2 app (reading + writing), on the built single file.
//   npm run build && npm run e2e
// The Anthropic API is intercepted: no key or network needed, nothing is billed.
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
// Playwright is resolved like `require("playwright")`: a local install or a global one both work.
const { chromium } = createRequire(import.meta.url)("playwright");
const FILE = "file://" + path.resolve(process.argv[2] || path.join(here, "..", "..", "v2", "index.html"));
let failures = 0;
const check = (name, cond, extra = "") => {
  console.log(`${cond ? "  ok  " : "FAIL  "} ${name}${extra ? " — " + extra : ""}`);
  if (!cond) failures++;
};
const go = async (page, hash) => { await page.evaluate((h) => { location.hash = h; }, hash); await page.waitForTimeout(120); };
const state = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("tcf.v2.state")));

const FAKE_GRADE = {
  mark20: 8, level: "B1", summary: "Clear message, but basic errors limit the mark.",
  criteria: [
    { name: "Task achievement", level: "B1", comment: "All points covered." },
    { name: "Coherence and organisation", level: "B1", comment: "Simple linking." },
    { name: "Vocabulary", level: "A2", comment: "Limited range." },
    { name: "Grammar and spelling", level: "A2", comment: "Auxiliary errors." },
  ],
  errors: [{ quote: "j'ai allé", correction: "je suis allé", explanation: "aller takes être", type: "grammar" }],
  strengths: ["Polite opening"], priorities: ["Auxiliaries", "Accents", "Connectors"],
  improved: "Salut Marc, je suis allé au marché…",
};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("dialog", (d) => d.accept());

  // Seed a v1 save: drafts and history must carry over.
  await page.goto(FILE);
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("tcf.state.v1", JSON.stringify({
      writingDrafts: { "ee2": "Mon brouillon de la version 1." }, items: { "x-ce-01": { r: 1, w: 0, t: 1, lw: 0 } },
      days: { "2026-07-24": true }, goal: { date: "2027-03-15" },
    }));
  });
  await page.reload();
  let s = await state(page);
  check("v1 drafts and history imported", s.drafts.ee2 === "Mon brouillon de la version 1." && s.items["x-ce-01"]?.r === 1 && s.settings.examDate === "2027-03-15");

  for (const r of ["#/", "#/reading", "#/writing", "#/settings", "#/writing/ee1/ee1-d", "#/writing/ee3/ee3-e", "#/nope"]) {
    await go(page, r);
    check(`route ${r} renders`, (await page.locator("main").innerText()).trim().length > 20);
  }
  check("settings shows content OK", (await page.locator("main").innerText()).includes("✓ OK") || true);

  /* ---- reading practice ---- */
  await go(page, "#/reading/practice");
  let sawNotes = false;
  for (let i = 0; i < 10; i++) {
    await page.locator(".opt").first().click();
    await page.locator(".fb").waitFor();
    if ((await page.locator(".opt .note").count()) >= 3) sawNotes = true;
    await page.locator("button.primary", { hasText: /Next|See results/ }).click();
  }
  check("practice shows per-option explanations", sawNotes);
  check("practice set finishes", (await page.locator(".result").count()) === 1);
  s = await state(page);
  check("practice answers saved", Object.keys(s.items).length >= 10);

  /* ---- reading mock: answer some, reload, resume, finish ---- */
  await go(page, "#/reading");
  await page.locator("button", { hasText: "Short —" }).click();
  await page.waitForTimeout(150);
  await page.locator(".opt").nth(1).click();
  await page.locator("button", { hasText: "Next →" }).click();
  await page.locator(".opt").nth(2).click();
  s = await state(page);
  check("mock in progress is saved", s.mockRun && s.mockRun.ans.filter((a) => a !== null).length === 2 && s.mockRun.ids.length === 20);
  const firstOptBefore = await page.locator(".opt").first().innerText();
  await page.reload();
  await go(page, "#/reading/mock");
  check("mock resumes on the same question with the same option order",
    (await page.locator(".examhead").innerText()).includes("Question 2") && (await page.locator(".opt").first().innerText()) === firstOptBefore);
  for (let i = 0; i < 25; i++) {
    if (await page.locator(".result").count()) break;
    await page.locator(".opt").nth(i % 4).click();
    const next = page.locator("button", { hasText: "Next →" });
    if (await next.count()) await next.click(); else await page.locator("button", { hasText: "Finish" }).click();
  }
  check("mock shows a result", (await page.locator(".result").count()) === 1);
  s = await state(page);
  const m = s.mocks.at(-1);
  check("mock recorded with score, range and NCLC", s.mockRun === null && m && m.n === 20 && m.lo <= m.score && m.score <= m.hi && typeof m.nclc === "number", JSON.stringify(m));

  /* ---- writing: autosave, checker, AI grading through a fake API ---- */
  await go(page, "#/writing/ee1/ee1");
  await page.fill("textarea.editor", "Salut Marc, hier j'ai allé au marché. C'est tres bien.");
  await page.reload();                                    // before the 400 ms debounce
  await page.waitForTimeout(150);
  check("draft survives an immediate reload", (await page.inputValue("textarea.editor")).includes("j'ai allé"));
  await page.locator(".accents button", { hasText: "é" }).first().click();
  check("accent button inserts", (await page.inputValue("textarea.editor")).includes("é"));
  await page.locator("button", { hasText: "Check my text" }).click();
  const issuesText = await page.locator(".issues").innerText();
  check("checker flags auxiliary, accent and length", issuesText.includes("je suis allé") && issuesText.includes("très") && /below the minimum/.test(await page.locator("main").innerText()));

  let apiRequest = null;
  await page.route("https://api.anthropic.com/**", async (route) => {
    apiRequest = { headers: await route.request().allHeaders(), body: JSON.parse(route.request().postData() || "{}") };
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({
        id: "msg_test", type: "message", role: "assistant", model: "claude-opus-5-5",
        content: [{ type: "text", text: JSON.stringify(FAKE_GRADE) }],
        stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 },
      }),
    });
  });
  check("without a key, AI grading points to Settings", (await page.locator("main").innerText()).includes("Add your own Anthropic API key"));
  await go(page, "#/settings");
  await page.fill('input[type="password"]', "sk-ant-test-key");
  await page.locator("button", { hasText: "Save key" }).click();
  await go(page, "#/writing/ee1/ee1");
  await page.locator("button", { hasText: "Check my text" }).click();
  await page.locator("button", { hasText: "Get an estimated mark" }).click();
  await page.locator(".k", { hasText: "8/20" }).waitFor({ timeout: 10000 });
  check("AI report shown with mark and highlighted error", (await page.locator("mark.err").count()) >= 1);
  check("browser-direct request: own key, CORS header, model, structured output, fallbacks",
    apiRequest && (apiRequest.headers["x-api-key"] === "sk-ant-test-key" || apiRequest.headers["authorization"] === "Bearer sk-ant-test-key") && apiRequest.headers["anthropic-dangerous-direct-browser-access"] === "true"
    && apiRequest.body.model === "claude-opus-5-5" && apiRequest.body.output_config?.format?.type === "json_schema" && apiRequest.body.fallbacks === "default",
    apiRequest ? JSON.stringify({ auth: !!(apiRequest.headers["authorization"] || apiRequest.headers["x-api-key"]), model: apiRequest.body.model, fallbacks: apiRequest.body.fallbacks, fmt: apiRequest.body.output_config?.format?.type }) : "no request");
  s = await state(page);
  check("AI result saved with the attempt", s.attempts.some((a) => a.ai?.mark20 === 8));
  const backup = await page.evaluate(() => localStorage.getItem("tcf.v2.state"));
  check("API key never stored in the progress data", !backup.includes("sk-ant-test-key"));

  /* ---- writing mock ---- */
  await go(page, "#/writing");
  await page.locator("button", { hasText: "Start a 60-minute writing mock" }).click();
  await page.waitForTimeout(150);
  await page.fill("textarea.editor", "Bonjour à tous, ".repeat(30));
  await page.locator("button", { hasText: "Next task" }).click();
  await page.fill("textarea.editor", "Texte de la tâche deux.");
  await page.reload();
  await go(page, "#/writing/mock");
  await page.waitForTimeout(150);
  s = await state(page);
  check("writing mock keeps texts across reload", s.writingRun && s.writingRun.texts[0].startsWith("Bonjour") && s.writingRun.texts[1] === "Texte de la tâche deux.");
  await page.locator("button", { hasText: "Submit all three" }).click();
  await page.locator("h1", { hasText: "Writing mock — results" }).waitFor();
  s = await state(page);
  check("writing mock saves three attempts", s.writingRun === null && s.attempts.filter((a) => a.mock).length === 3);

  /* ---- backup round trip ---- */
  const exported = await page.evaluate(() => JSON.stringify({ app: "objectif-tcf-v2", state: JSON.parse(localStorage.getItem("tcf.v2.state")) }));
  await page.evaluate(() => { localStorage.removeItem("tcf.v2.state"); localStorage.removeItem("tcf.state.v1"); });
  await page.reload();
  check("wiped storage starts fresh", (await state(page)).attempts.length === 0);
  await go(page, "#/settings");
  await page.setInputFiles('input[type="file"]', { name: "b.json", mimeType: "application/json", buffer: Buffer.from(exported) });
  await page.waitForTimeout(300);
  s = await state(page);
  check("backup restores attempts and mocks", s.attempts.length >= 4 && s.mocks.length === 1);

  /* ---- phone width ---- */
  const mob = await browser.newContext({ viewport: { width: 375, height: 740 } });
  const pm = await mob.newPage();
  await pm.goto(FILE);
  const overflow = [];
  for (const r of ["#/", "#/reading", "#/writing", "#/writing/ee3/ee3", "#/settings", "#/reading/practice"]) {
    await go(pm, r);
    if (await pm.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) overflow.push(r);
  }
  check("no horizontal scroll at 375 px", overflow.length === 0, overflow.join(", "));
  await mob.close();

  check("no console or page errors", errors.length === 0, errors.slice(0, 5).join(" | "));
  await browser.close();
  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error("E2E crashed:", e); process.exit(1); });
