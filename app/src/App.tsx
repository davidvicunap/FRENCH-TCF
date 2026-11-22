import { useEffect, useRef, useState } from "react";
import { CONTENT_PROBLEMS, READING, WRITING } from "./content";
import { IRCC_TABLE_URL, NCLC_TARGET } from "./lib/score";
import {
  dayStreak, exportBackup, getApiKey, importBackup, resetAll, setApiKey, storageWorks, THEME_KEY, update, useAppState,
} from "./lib/store";
import { todayKey } from "./lib/words";
import { ReadingHome, ReadingMockView, ReadingPractice } from "./features/reading/Reading";
import { WritingHome, WritingMockView, WritingTaskView } from "./features/writing/Writing";
import { Bar, Callout, Crumbs, useRoute } from "./ui";

export function App() {
  const route = useRoute();
  const s = useAppState();
  const [head, a, b] = route;
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme ?? "dark");
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* ignore */ }
  }, [theme]);
  useEffect(() => { document.getElementById("main")?.focus({ preventScroll: true }); }, [route.join("/")]);

  let view;
  if (!head) view = <Home />;
  else if (head === "reading" && a === "practice") view = <ReadingPractice />;
  else if (head === "reading" && a === "mock") view = <ReadingMockView />;
  else if (head === "reading") view = <ReadingHome />;
  else if (head === "writing" && a === "mock") view = <WritingMockView />;
  else if (head === "writing" && a) view = <WritingTaskView taskId={a} promptId={b} />;
  else if (head === "writing") view = <WritingHome />;
  else if (head === "settings") view = <Settings />;
  else view = <><h1>Page not found</h1><p>This address does not exist. <a href="#/">Back to the home page</a></p></>;

  const nav = (href: string, label: string, key: string) =>
    <a href={href} className={(head ?? "") === key ? "on" : ""}>{label}</a>;
  const streak = dayStreak(s.days);

  return (
    <>
      <header className="top"><div className="top-in">
        <a className="brand" href="#/">🇨🇦 Objectif TCF <span>Canada</span></a>
        <nav className="nav" aria-label="Main">
          {nav("#/", "Home", "")}{nav("#/reading", "Reading", "reading")}{nav("#/writing", "Writing", "writing")}
          {nav("#/settings", "⚙", "settings")}
          {streak > 0 && <span className="small" title="Days in a row" style={{ color: "var(--amber)", fontWeight: 700 }}>🔥{streak}</span>}
          <button className="icon" type="button" aria-label="Toggle light/dark theme"
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}>{theme === "dark" ? "☀" : "☾"}</button>
        </nav>
      </div></header>
      {!storageWorks() && <div className="banner" role="alert">⚠ This browser refuses to save your progress (private mode or storage blocked).
        Nothing will be kept when you close it. <a href="#/settings">Export a backup</a></div>}
      <main id="main" tabIndex={-1}>{view}</main>
      <footer>Independent practice tool, not affiliated with France Éducation international or IRCC.
        Your progress stays in this browser. <a href="../index.html">Full course (v1)</a></footer>
    </>
  );
}

/* ------------------------------------------------------------------ home */

function Home() {
  const s = useAppState();
  const lastMock = s.mocks[s.mocks.length - 1];
  const graded = s.attempts.filter((x) => x.ai).slice(-3);
  const writingAvg = graded.length ? Math.round(graded.reduce((n, x) => n + (x.ai?.mark20 ?? 0), 0) / graded.length) : null;
  const daysLeft = s.settings.examDate
    ? Math.round((new Date(s.settings.examDate + "T00:00").getTime() - new Date(todayKey() + "T00:00").getTime()) / 86400000) : null;
  const missed = Object.values(s.items).filter((x) => x.lw).length;
  const today = !!s.days[todayKey()];
  const lastMockAge = lastMock ? (Date.now() - lastMock.at) / 86400000 : Infinity;

  return (
    <>
      <h1>TCF Canada — reading & writing</h1>
      <p className="dim">Target: <strong>NCLC 7</strong> = {NCLC_TARGET.reading}+ in reading and {NCLC_TARGET.writing}/20 in writing.
        {daysLeft !== null && (daysLeft >= 0 ? <> Exam in <strong>{daysLeft} days</strong>.</> : <> Exam date passed — <a href="#/settings">update it</a>.</>)}
        {daysLeft === null && <> <a href="#/settings">Set your exam date</a>.</>}</p>

      <div className="grid">
        <a className="card stack" href="#/reading">
          <h3>📖 Reading</h3>
          {lastMock ? <>
            <div className="k">≈ {lastMock.score}</div>
            <Bar value={lastMock.score} max={699} target={NCLC_TARGET.reading} />
            <p className="small dim">Last mock: {lastMock.level}, NCLC {lastMock.nclc || "< 4"} · {NCLC_TARGET.reading - lastMock.score > 0
              ? `${NCLC_TARGET.reading - lastMock.score} points to NCLC 7` : "NCLC 7 reached on this mock"}</p>
          </> : <p className="small dim">No mock yet — take a short one to find your starting point.</p>}
        </a>
        <a className="card stack" href="#/writing">
          <h3>✍️ Writing</h3>
          {writingAvg !== null ? <>
            <div className="k">≈ {writingAvg}/20</div>
            <Bar value={writingAvg} max={20} target={NCLC_TARGET.writing} />
            <p className="small dim">Average of your last {graded.length} AI-graded text(s).</p>
          </> : <p className="small dim">{s.attempts.length} text(s) written. AI marks appear here once you add a key in Settings.</p>}
        </a>
      </div>

      <h2>Today</h2>
      <ul className="stack" style={{ listStyle: "none", padding: 0 }}>
        {!lastMock && <Todo href="#/reading" title="Take a short reading mock (31 min)" sub="It sets your practice level automatically." />}
        <Todo href="#/reading/practice" title={`Reading practice: 10 questions${missed ? ` (${missed} missed waiting)` : ""}`} sub="15–20 minutes, every answer explained." />
        <Todo href={`#/writing/${WRITING[(new Date().getDate()) % 3].id}`} title={`Write one task: ${WRITING[(new Date().getDate()) % 3].titleEn}`} sub="Then check it and compare with the model." />
        {lastMock && lastMockAge > 7 && <Todo href="#/reading" title="Weekly reading mock" sub="One a week is enough to see the trend." />}
      </ul>
      {today && <p className="small" style={{ color: "var(--green)" }}>✓ You have practised today.</p>}

      <Callout kind="warn" title="Your starting point is A1–A2, the target is B2.">
        That gap takes months of daily work, not days. This app trains the two exam skills you asked for —
        reading and writing — but you also need volume: read simple French every day (news in easy French,
        graded readers) and have your writing corrected by a person when you can.
      </Callout>
    </>
  );
}

function Todo({ href, title, sub }: { href: string; title: string; sub: string }) {
  return <li><a className="card row" href={href}><div className="grow"><strong>{title}</strong><div className="small dim">{sub}</div></div><span aria-hidden>→</span></a></li>;
}

/* -------------------------------------------------------------- settings */

function Settings() {
  const s = useAppState();
  const [key, setKey] = useState(getApiKey());
  const [msg, setMsg] = useState("");
  const file = useRef<HTMLInputElement>(null);

  function download() {
    const blob = new Blob([exportBackup()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `objectif-tcf-v2-backup-${todayKey()}.json`;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    update((st) => { st.backupAt = Date.now(); });
    setMsg("Backup downloaded. Keep it outside this browser (cloud drive, email to yourself).");
  }

  return (
    <>
      <Crumbs items={[["Home", "#/"], ["Settings"]]} />
      <h1>⚙ Settings</h1>

      <h2>Exam</h2>
      <div className="form">
        <label>Exam date<input type="date" value={s.settings.examDate}
          onChange={(e) => update((st) => { st.settings.examDate = e.target.value; })} /></label>
        <label>English help in explanations
          <select value={s.settings.english ? "yes" : "no"} onChange={(e) => update((st) => { st.settings.english = e.target.value === "yes"; })}>
            <option value="yes">On — recommended below B1</option><option value="no">Off — French only, like the exam</option>
          </select></label>
      </div>

      <h2>AI feedback on writing (optional)</h2>
      <p className="small">Uses your own Anthropic API key. Your text is sent <strong>directly from this browser to Anthropic</strong> —
        there is no server in between. The key is stored only on this device and is never included in backups.
        Each graded text costs a few cents on your Anthropic account; set a monthly spending limit in the Anthropic Console.</p>
      <div className="form">
        <label>API key<input type="password" autoComplete="off" value={key} placeholder="sk-ant-…"
          onChange={(e) => setKey(e.target.value)} /></label>
        <label>Model
          <select value={s.settings.model} onChange={(e) => update((st) => { st.settings.model = e.target.value as typeof st.settings.model; })}>
            <option value="claude-opus-5-5">Claude Opus 5.5 — most accurate (default)</option>
            <option value="claude-sonnet-5-5">Claude Sonnet 5.5 — cheaper</option>
          </select></label>
      </div>
      <p className="row"><button className="btn primary" onClick={() => { setApiKey(key); setMsg(key ? "Key saved on this device." : "Key removed."); }}>Save key</button>
        <button className="btn" onClick={() => { setKey(""); setApiKey(""); setMsg("Key removed."); }}>Remove key</button></p>
      <p className="small dim">Don't use this on a shared or public computer: anyone using this browser could use your key.</p>

      <h2>Your data</h2>
      <p className="small">Progress is saved automatically in this browser{storageWorks() ? "" : " — ⚠ but this browser currently refuses to save"}.
        Last backup: {s.backupAt ? new Date(s.backupAt).toLocaleString() : "never"}.</p>
      <p className="row">
        <button className="btn primary" onClick={download}>⬇ Export backup</button>
        <button className="btn" onClick={() => file.current?.click()}>⬆ Restore backup</button>
        <input ref={file} type="file" accept=".json,application/json" hidden onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          f.text().then((t) => {
            if (s.attempts.length + s.mocks.length > 0 && !confirm("Replace your current progress with this backup?")) return;
            setMsg(importBackup(t).msg);
          });
        }} />
        <button className="btn danger" onClick={() => { if (confirm("Erase all reading and writing progress on this device?")) { resetAll(); setMsg("Progress erased."); } }}>Reset</button>
      </p>
      {msg && <p role="status" className="small">{msg}</p>}

      <h2>About</h2>
      <p className="small dim">{READING.length} reading questions · {WRITING.reduce((n, t) => n + t.prompts.length, 0)} writing prompts ·
        content check: {CONTENT_PROBLEMS.length ? `⚠ ${CONTENT_PROBLEMS.length} problem(s)` : "✓ OK"} ·
        NCLC thresholds from <a href={IRCC_TABLE_URL} target="_blank" rel="noreferrer">IRCC</a>. Formats change: confirm on
        France Éducation international's site before booking.</p>
      {CONTENT_PROBLEMS.length > 0 && <ul className="small">{CONTENT_PROBLEMS.map((p) => <li key={p}>{p}</li>)}</ul>}
    </>
  );
}
