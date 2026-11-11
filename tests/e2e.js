// End-to-end check of Objectif TCF. Usage: node tests/e2e.js [path/to/index.html]
// Needs Playwright (npm i -D playwright, or any environment where require("playwright") works).
const { chromium } = require("playwright");
const path = require("path");

const FILE = "file://" + path.resolve(process.argv[2] || path.join(__dirname, "..", "index.html"));
const KEY = "tcf.state.v1";
let failures = 0;
function check(name, cond, extra = "") {
  console.log(`${cond ? "  ok  " : "FAIL  "} ${name}${extra ? " — " + extra : ""}`);
  if (!cond) failures++;
}
const go = async (page, hash) => { await page.evaluate((h) => { location.hash = h; }, hash); await page.waitForTimeout(70); };
const stored = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("dialog", (d) => d.accept());
  await page.goto(FILE);

  /* 1. content is coherent */
  const problems = await page.evaluate(() => validateContent());
  check("content validator reports no problem", problems.length === 0, problems.slice(0, 12).join(" | "));

  /* 2. every route renders */
  const routes = await page.evaluate(() => {
    const r = ["#/", "#/ecrit", "#/oral", "#/vocabulaire", "#/vocabulaire/liste", "#/examen", "#/bareme",
      "#/succes", "#/reglages", "#/diagnostic", "#/entrainement", "#/revision", "#/nope"];
    for (const s of SECTIONS) { r.push(`#/section/${s.id}`); for (const l of s.lessons) r.push(`#/lecon/${s.id}/${l.id}`); }
    for (const t of WRITING_TASKS) t.prompts.forEach((_, i) => r.push(`#/ecrit/${t.id}/${i + 1}`));
    for (const t of SPEAKING_TASKS) t.prompts.forEach((_, i) => r.push(`#/oral/${t.id}/${i + 1}`));
    for (const k of Object.keys(SKILLS)) r.push(`#/entrainement/${k}`);
    return r;
  });
  let blank = 0;
  for (const r of routes) { await go(page, r); if (!(await page.locator("#app").innerText()).trim()) blank++; }
  check(`all ${routes.length} routes render`, blank === 0 && errors.length === 0, errors.join(" | "));

  /* 3. lesson HTML is well formed: the score table sits right after the intro paragraph */
  await go(page, "#/lecon/intro/l2");
  const kids = await page.evaluate(() => [...document.querySelector("article.prose").children].map((c) => c.tagName));
  check("intro/l2 table is in place", kids[1] === "DIV" && kids[2] === "H2", kids.slice(0, 4).join(","));

  /* 4. drill → saved → survives reload; redoing a drill counts for the day */
  await go(page, "#/lecon/co/l1");
  await page.click("#start-drill");
  await page.waitForTimeout(1700);
  check("listening item offers its text when no French voice exists",
    (await page.locator(".audio-box .no-voice").count()) === 1 && (await page.locator(".audio-box details.transcript").count()) === 1);
  for (let i = 0; i < 3; i++) { await page.locator(".opt").first().click(); await page.locator(".feedback .btn").click(); }
  let st = await stored(page);
  check("drill result saved", st.drillsDone["co-l1"] === true && st.xp >= 40 && Object.keys(st.items).length === 3);
  await page.reload();
  check("XP survives reload", (await page.evaluate(() => S.xp)) === st.xp);
  await page.evaluate(() => { S.days = {}; save(); });
  await go(page, "#/lecon/co/l1");
  await page.click("#start-drill");
  await page.locator(".opt").first().click();
  check("any answer marks the day as studied", Object.keys((await stored(page)).days).length === 1);

  /* 5. options are shuffled: always clicking the first one is not a strategy */
  const firstIsRight = await page.evaluate(() => {
    let hits = 0; const item = itemIndex().get("pc-1");
    for (let i = 0; i < 400; i++) if (optionOrder(item)[0] === item.a) hits++;
    return hits / 400;
  });
  check("correct answer position is random", firstIsRight > 0.15 && firstIsRight < 0.35, firstIsRight.toFixed(2));

  /* 6. writing draft survives an immediate reload */
  await go(page, "#/ecrit/ee1/1");
  await page.fill("#editor", "Bonjour Camille, ceci est un brouillon.");
  await page.reload();
  await page.waitForTimeout(80);
  check("draft typed just before reload is kept", (await page.inputValue("#editor")) === "Bonjour Camille, ceci est un brouillon.");
  // ticking the grid without a text must not validate the task
  const xp0 = await page.evaluate(() => S.xp);
  await page.fill("#editor", "Trop court.");
  for (const box of await page.locator("#checklist input").all()) await box.check();
  check("checklist alone does not validate a writing task", (await page.evaluate(() => S.xp)) === xp0);

  /* 7. two tabs: the stale tab must not overwrite the other one */
  const page2 = await ctx.newPage();
  await page2.goto(FILE);
  await page2.evaluate(() => { S.xp += 500; save(); });
  await page.waitForTimeout(150);
  await page.evaluate(() => { S.settings.rate = 0.9; save(); });
  check("second tab's progress is not overwritten", (await stored(page)).xp === xp0 + 500);
  await page2.close();

  /* 8. vocabulary: daily limit of new cards, ratings saved */
  await go(page, "#/vocabulaire");
  const total = await page.evaluate(() => vocabQueue().fresh.length);
  check("new cards are limited per day", total === 10, String(total));
  for (let i = 0; i < 10; i++) { await page.click("#reveal"); await page.locator('[data-r="2"]').click(); }
  st = await stored(page);
  check("card ratings saved, quota used", Object.keys(st.cards).length === 10 && st.newCount === 10);
  check("no more new cards today", (await page.evaluate(() => vocabQueue().fresh.length)) === 0);

  /* 9. mock exam: starts, persists mid-way, resumes after reload, finishes */
  await go(page, "#/examen");
  await page.locator('[data-start="half"]').click();
  await page.click("#go");
  await page.waitForTimeout(1600);
  const playBtn = page.locator(".audio-box .btn").first();
  check("exam listening: one listen only (or text fallback)", await playBtn.isDisabled());
  await page.locator(".opt").nth(1).click();
  await page.click("#exam-next");
  await page.locator(".opt").nth(0).click();
  st = await stored(page);
  check("exam in progress is saved", !!st.examRun && st.examRun.sections[0].ans.filter((a) => a !== null).length === 2);
  await page.reload();
  await go(page, "#/examen");
  check("exam can be resumed after reload", (await page.locator("#resume-exam").count()) === 1);
  await page.click("#resume-exam");
  await page.click("#go");
  check("resumes on the same question", (await page.locator(".exam-bar .sub").innerText()).includes("Question 2"));
  // answer everything quickly
  for (let guard = 0; guard < 300; guard++) {
    if (await page.locator(".result-band").count()) break;
    if (await page.locator("#go").count()) { await page.click("#go"); continue; }
    await page.locator(".opt").nth(guard % 4).click();
    if (await page.locator("#exam-next").count()) await page.click("#exam-next");
    else await page.click("#exam-end");
  }
  check("exam reaches the result screen", (await page.locator(".result-band").count()) === 1);
  st = await stored(page);
  const last = st.exams[st.exams.length - 1];
  check("exam recorded with per-section scores", st.examRun === null && typeof last.score === "number" && Object.keys(last.sec).length >= 2,
    JSON.stringify(last));

  /* 10. level estimate resists guessing */
  const guess = await page.evaluate(() => {
    const out = {};
    const f = examFormats("tp");
    for (let t = 0; t < 400; t++) {
      const resp = f.half.flatMap((s) => drawSection(s.skill, s.n, f.levels))
        .map((it) => ({ level: it.level, n: it.options.length, ok: Math.random() < 1 / it.options.length }));
      const L = estimateScore(resp).level; out[L] = (out[L] || 0) + 1;
    }
    return out;
  });
  const high = Object.keys(guess).filter((l) => !["< A1", "A1"].includes(l)).reduce((n, l) => n + guess[l], 0);
  check("random guessing is not rewarded with A2+", high / 400 < 0.08, JSON.stringify(guess));

  /* 11. backup round trip */
  const before = await page.evaluate(() => exportPayload());
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload();
  check("after wiping storage the app starts fresh", (await page.evaluate(() => S.xp)) === 0);
  const res = await page.evaluate((txt) => importBackup(txt), before);
  await page.reload();
  const after = await page.evaluate(() => S);
  const b = JSON.parse(before).state;
  check("backup restores everything", res.ok && after.xp === b.xp && Object.keys(after.cards).length === Object.keys(b.cards).length
    && after.exams.length === b.exams.length && after.writingDrafts.ee1 === b.writingDrafts.ee1);
  check("garbage is refused on import", (await page.evaluate(() => importBackup("not json").ok)) === false
    && (await page.evaluate(() => importBackup('{"a":1}').ok)) === false);
  check("hostile backup is neutralised", await page.evaluate(() => {
    const s = sanitizeState({ xp: "<img>", exams: [{ level: "<img src=x onerror=alert(1)>", pct: 50, at: 1 }], cards: { v1: { box: 99 } }, goal: { version: "zz" } });
    return s.xp === 0 && s.exams[0].level === "—" && s.cards.v1.box === 5 && s.goal.version === "tp";
  }));

  /* 12. a save file written by the previous version of the app still loads */
  await page.evaluate((k) => localStorage.setItem(k, JSON.stringify({
    xp: 260, lessonsDone: { "msl-l1": true }, drillsDone: { "msl-l1": true }, drillBest: { "msl-l1": 0.8 },
    perfectDrills: 1, bestStreak: 7, writingDrafts: { ee2: "Mon ancien brouillon." }, writingChecks: { ee1: { c1: true } },
    writingDone: { ee1: true }, speakingChecks: {}, speakingDone: { eo3: true },
    cards: { v1: { box: 3, due: 1 }, v2: { box: 1, due: 0 } }, exams: [{ at: 1753300000000, pct: 65, level: "B1+" }],
    bestExamPct: 65, days: { "2026-07-24": true }, achievements: { "premier-pas": 1753300000000 }, settings: { theme: "light", rate: 0.8 },
  })), KEY);
  await page.reload();
  const old = await page.evaluate(() => S);
  check("v1 save loads intact", old.xp === 260 && old.lessonsDone["msl-l1"] && old.writingDrafts.ee2 === "Mon ancien brouillon."
    && old.writingDone.ee1 && old.cards.v1.box === 3 && old.exams[0].level === "B1+" && old.settings.rate === 0.8 && old.goal.level === "B2");
  await go(page, "#/examen");
  await go(page, "#/ecrit/ee2");
  check("old draft shows under its prompt", (await page.inputValue("#editor")) === "Mon ancien brouillon.");

  /* 13. storage refused → the learner is told */
  const ctx2 = await browser.newContext();
  const p3 = await ctx2.newPage();
  await p3.addInitScript(() => { Object.getPrototypeOf(window.localStorage).setItem = function () { throw new DOMException("QuotaExceededError"); }; });
  await p3.goto(FILE);
  check("blocked storage shows a warning banner", await p3.locator("#save-banner").isVisible());
  await ctx2.close();

  /* 14. phone width: no horizontal scroll on the main screens */
  const mob = await browser.newContext({ viewport: { width: 375, height: 740 } });
  const pm = await mob.newPage();
  await pm.goto(FILE);
  let overflow = [];
  for (const r of ["#/", "#/examen", "#/reglages", "#/ecrit/ee3", "#/lecon/intro/l1", "#/bareme"]) {
    await go(pm, r);
    if (await pm.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) overflow.push(r);
  }
  check("no horizontal overflow at 375px", overflow.length === 0, overflow.join(","));
  await mob.close();

  check("no console or page errors", errors.length === 0, errors.join(" | "));
  await browser.close();
  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error("E2E crashed:", e); process.exit(1); });
