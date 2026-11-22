import { useEffect, useMemo, useRef, useState } from "react";
import { PROMPT_BY_ID, WRITING } from "../../content";
import type { WritingPrompt, WritingTask } from "../../content/schema";
import { checkText, type Issue } from "../../lib/checker";
import { NCLC_TARGET } from "../../lib/score";
import { getState, markToday, update, useAppState, type Attempt, type AiResult, type State } from "../../lib/store";
import { countWords, fmtTime } from "../../lib/words";
import { Callout, Crumbs, go, Timer, useCountdown } from "../../ui";
import { Editor, PhraseBank, useInsert } from "./Editor";
import { AiReport, IssueList, useGrader } from "./Feedback";

const MOCK_SECS = 60 * 60;

function newAttempt(promptId: string, text: string, issues: Issue[], secs: number, mock: boolean): Attempt {
  return {
    id: `${promptId}-${Date.now()}`, promptId, at: Date.now(), text, words: countWords(text),
    secs, mock, issues: issues.filter((i) => i.severity === "error").length, ai: null,
  };
}

function attachAi(attemptId: string, ai: AiResult) {
  update((s) => { const a = s.attempts.find((x) => x.id === attemptId); if (a) a.ai = ai; });
}

/* ------------------------------------------------------------------ home */

export function WritingHome() {
  const s = useAppState();
  const graded = s.attempts.filter((a) => a.ai);
  const lastMock = s.attempts.filter((a) => a.mock).slice(-3);
  return (
    <>
      <Crumbs items={[["Home", "#/"], ["Writing"]]} />
      <h1>✍️ Expression écrite</h1>
      <p className="dim">TCF Canada: <strong>3 tasks in 60 minutes</strong>, marked out of 20. NCLC 7 needs <strong>{NCLC_TARGET.writing}/20</strong>.</p>

      {s.writingRun && <Callout kind="tip" title="Writing mock in progress:">{fmtTime(s.writingRun.left)} left.{" "}
        <a className="btn sm primary" href="#/writing/mock">Resume</a></Callout>}

      <div className="grid">
        {WRITING.map((t) => {
          const done = t.prompts.filter((p) => s.attempts.some((a) => a.promptId === p.id)).length;
          return (
            <div key={t.id} className="card stack">
              <h3>{t.titleEn ?? t.title}</h3>
              <p className="small dim">{t.goalEn ?? t.goal}</p>
              <p className="small">{t.min}–{t.max} words · about {t.minutes} min · {done}/{t.prompts.length} prompts written</p>
              <div className="pills">{t.prompts.map((p, i) => {
                const did = s.attempts.some((a) => a.promptId === p.id);
                return <a key={p.id} className={`pill ${did ? "on" : ""}`} href={`#/writing/${t.id}/${p.id}`}>Prompt {i + 1}{did ? " ✓" : ""}</a>;
              })}</div>
            </div>
          );
        })}
      </div>

      <h2>⏱️ Writing mock</h2>
      <p className="small dim">The three tasks together in 60 minutes, as on exam day. You manage your own time between them
        (suggested: 10 / 20 / 30 minutes, keep 5 to re-read).</p>
      <button className="btn primary" disabled={!!s.writingRun} onClick={startMock}>Start a 60-minute writing mock</button>

      {lastMock.length > 0 && <p className="small" style={{ marginTop: ".6rem" }}>Last mock: {lastMock.map((a) => `${a.words} words${a.ai ? ` (${a.ai.mark20}/20)` : ""}`).join(" · ")}</p>}

      <h2>History</h2>
      {s.attempts.length === 0 ? <p className="dim small">Nothing written yet.</p> : (
        <div className="scroll"><table className="t"><thead><tr><th>Date</th><th>Prompt</th><th>Words</th><th>Checker errors</th><th>AI mark</th></tr></thead>
          <tbody>{s.attempts.slice().reverse().slice(0, 15).map((a) => {
            const ref = PROMPT_BY_ID.get(a.promptId);
            return <tr key={a.id}><td>{new Date(a.at).toLocaleDateString()}</td>
              <td><a href={`#/writing/${ref?.task.id}/${a.promptId}`}>Task {ref?.task.n}{a.mock ? " (mock)" : ""}</a></td>
              <td>{a.words}</td><td>{a.issues}</td><td>{a.ai ? `${a.ai.mark20}/20 · ${a.ai.level}` : "—"}</td></tr>;
          })}</tbody></table></div>
      )}
      {graded.length >= 2 && <p className="small dim">Average AI mark over the last {Math.min(5, graded.length)} graded texts:{" "}
        {(graded.slice(-5).reduce((n, a) => n + (a.ai?.mark20 ?? 0), 0) / Math.min(5, graded.length)).toFixed(1)}/20</p>}

      <Callout kind="warn" title="Be honest with yourself:">
        a checker and an AI can find mistakes, but the best predictor of your mark is a human who knows
        the TCF. If you can, have one text a week corrected by a teacher.
      </Callout>
    </>
  );

  function startMock() {
    const s = getState();
    const pick = (t: WritingTask) => {
      const fresh = t.prompts.find((p) => !s.attempts.some((a) => a.promptId === p.id));
      return (fresh ?? t.prompts[Math.floor(Math.random() * t.prompts.length)]).id;
    };
    update((st) => { st.writingRun = { at: Date.now(), promptIds: WRITING.map(pick), texts: ["", "", ""], left: MOCK_SECS, ti: 0 }; });
    go("#/writing/mock");
  }
}

/* --------------------------------------------------------- single prompt */

export function WritingTaskView({ taskId, promptId }: { taskId: string; promptId?: string }) {
  const s = useAppState();
  const task = WRITING.find((t) => t.id === taskId);
  const prompt = task?.prompts.find((p) => p.id === promptId) ?? task?.prompts[0];
  if (!task || !prompt) return <p>Not found. <a href="#/writing">Back</a></p>;
  return <TaskPage key={prompt.id} task={task} prompt={prompt} s={s} />;
}

function TaskPage({ task, prompt, s }: { task: WritingTask; prompt: WritingPrompt; s: State }) {
  const [text, setText] = useState(() => s.drafts[prompt.id] ?? "");
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [showModel, setShowModel] = useState(false);
  const [running, setRunning] = useState(false);
  const [startedAt] = useState(Date.now());
  const ref = useRef<HTMLTextAreaElement>(null);
  const insert = useInsert(ref, change);
  const grader = useGrader();
  const saveTimer = useRef<number | undefined>(undefined);
  const latest = useRef(text);
  latest.current = text;
  const left = useCountdown(task.minutes * 60, running, () => {}, () => { setRunning(false); alert("Time's up — on exam day you would stop here."); });
  const attempt = attemptId ? s.attempts.find((a) => a.id === attemptId) : undefined;
  const past = s.attempts.filter((a) => a.promptId === prompt.id);

  function persist() {
    clearTimeout(saveTimer.current);
    const value = latest.current;
    if ((getState().drafts[prompt.id] ?? "") !== value) update((st) => { st.drafts[prompt.id] = value; });
  }
  function change(v: string) {
    setText(v);
    latest.current = v;
    clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(persist, 400);
  }
  function check() {
    persist();
    const found = checkText(text, task);
    setIssues(found);
    const a = newAttempt(prompt.id, text, found, Math.round((Date.now() - startedAt) / 1000), false);
    update((st) => { st.attempts.push(a); markToday(st); });
    setAttemptId(a.id);
  }
  async function ai() {
    if (!attemptId) return;
    const res = await grader.grade(task, prompt, text);
    if (res) attachAi(attemptId, res);
  }

  const idx = task.prompts.findIndex((p) => p.id === prompt.id);
  return (
    <>
      <Crumbs items={[["Home", "#/"], ["Writing", "#/writing"], [`Task ${task.n}`]]} />
      <h1>{task.titleEn ?? task.title}</h1>
      <div className="pills" style={{ margin: ".4rem 0 1rem" }}>{task.prompts.map((p, i) => (
        <a key={p.id} className={`pill ${i === idx ? "on" : ""}`} href={`#/writing/${task.id}/${p.id}`}>Prompt {i + 1}</a>
      ))}</div>

      <div className="split">
        <div className="stack">
          <div className="prompt" lang="fr">{prompt.prompt}</div>
          {s.settings.english && prompt.promptEn && <p className="small dim">🇬🇧 {prompt.promptEn}</p>}
          {task.official && <p className="small dim"><strong>Official task:</strong> <span lang="fr">{task.official}</span></p>}
          <details><summary>Suggested plan</summary><ol className="small">{task.plan.map((p) => <li key={p} lang="fr">{p}</li>)}</ol></details>

          <div className="examhead" style={{ position: "static" }}>
            <button className="btn sm" onClick={() => setRunning((r) => !r)}>{running ? "⏸ Pause" : "▶ Timer"}</button>
            <Timer left={left} total={task.minutes * 60} />
            <span className="small dim">suggested time for this task</span>
          </div>

          <Editor task={task} value={text} onChange={change} onFlush={persist} textRef={ref} />

          <div className="row">
            <button className="btn primary" onClick={check} disabled={!text.trim()}>Check my text</button>
            <button className="btn" onClick={() => setShowModel((v) => !v)}>{showModel ? "Hide model" : "Show model answer"}</button>
            <button className="btn sm danger" onClick={() => { if (!text || confirm("Clear your text?")) { change(""); persist(); setIssues(null); } }}>Clear</button>
          </div>

          {issues && (
            <div className="card stack">
              <h3>Automatic check (on this device)</h3>
              <IssueList issues={issues} />
              <h3>AI feedback (optional)</h3>
              {grader.hasKey ? (
                attempt?.ai ? <AiReport ai={attempt.ai} text={attempt.text} /> : (
                  <p><button className="btn primary" disabled={grader.busy} onClick={ai}>
                    {grader.busy ? "Grading… (up to a minute)" : "Get an estimated mark and corrections"}</button>
                    {grader.error && <span className="small" style={{ color: "var(--red)", display: "block", marginTop: ".4rem" }}>{grader.error}</span>}</p>
                )
              ) : (
                <p className="small dim">Add your own Anthropic API key in <a href="#/settings">Settings</a> to get an estimated mark /20,
                  every error corrected and explained, and an improved version. Your text goes only from this browser to Anthropic.</p>
              )}
            </div>
          )}

          {showModel && <div className="card"><h3>Model answer ({countWords(prompt.model)} words)</h3>
            <div className="essay" lang="fr">{prompt.model}</div>
            <p className="small dim">One good answer, not the only one. Compare the structure first, then steal phrases.</p></div>}

          <details className="card"><summary>Self-assessment checklist</summary>
            <ul className="small">{task.checklist.map((c) => <li key={c.id} lang="fr">{c.text}</li>)}</ul></details>

          {past.length > 0 && <details className="card"><summary>Your previous versions ({past.length})</summary>
            {past.slice().reverse().map((a) => <div key={a.id} style={{ marginTop: ".6rem" }}>
              <p className="small dim">{new Date(a.at).toLocaleString()} · {a.words} words{a.ai ? ` · ${a.ai.mark20}/20` : ""}</p>
              <div className="essay" lang="fr">{a.text}</div></div>)}</details>}
        </div>
        <PhraseBank task={task} onInsert={insert} />
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ mock */

export function WritingMockView() {
  const s = useAppState();
  const [done, setDone] = useState<string[] | null>(null);   // attempt ids once submitted
  if (done) return <MockResults attemptIds={done} />;
  if (!s.writingRun) return <p>No writing mock in progress. <a href="#/writing">Start one</a></p>;
  return <MockRunner onDone={setDone} />;
}

function MockRunner({ onDone }: { onDone: (ids: string[]) => void }) {
  const run = useAppState().writingRun!;
  const [initialLeft] = useState(run.left);
  const [texts, setTexts] = useState(run.texts);
  const textsRef = useRef(texts);
  textsRef.current = texts;
  const finished = useRef(false);
  const leftRef = useRef(initialLeft);
  const taskRef = useRef<HTMLTextAreaElement>(null);

  const left = useCountdown(initialLeft, true, (l) => {
    leftRef.current = l;
    if (l % 10 === 0) persist();
  }, () => submit(true));

  const entries = useMemo(() => run.promptIds.map((id) => PROMPT_BY_ID.get(id)!), [run.at]);
  const ti = run.ti;
  const { task } = entries[ti];
  const insert = useInsert(taskRef, (v) => setText(ti, v));

  useEffect(() => () => persist(), []);

  function persist() {
    update((st) => { if (st.writingRun) { st.writingRun.texts = textsRef.current.slice(); st.writingRun.left = leftRef.current; } });
  }
  function setText(i: number, v: string) {
    const next = textsRef.current.slice();
    next[i] = v;
    textsRef.current = next;
    setTexts(next);
  }
  function submit(timedOut: boolean) {
    if (finished.current) return;
    if (!timedOut) {
      const short = entries.map((e, i) => countWords(textsRef.current[i]) < e.task.min ? `Task ${e.task.n}` : "").filter(Boolean);
      if (!confirm(short.length ? `${short.join(", ")} below the minimum word count. Submit anyway?` : "Submit your three texts?")) return;
    }
    finished.current = true;
    const used = MOCK_SECS - leftRef.current;
    const attempts = entries.map((e, i) => newAttempt(e.prompt.id, textsRef.current[i], checkText(textsRef.current[i], e.task), used, true));
    update((st) => {
      st.writingRun = null;
      st.attempts.push(...attempts);
      entries.forEach((e, i) => { st.drafts[e.prompt.id] = textsRef.current[i]; });
      markToday(st);
    });
    onDone(attempts.map((a) => a.id));
  }

  return (
    <>
      <div className="examhead">
        <strong>✍️ Writing mock</strong>
        <span className="small dim">{entries.map((e, i) => `T${e.task.n}: ${countWords(texts[i])}/${e.task.min}–${e.task.max}`).join(" · ")}</span>
        <span className="grow" />
        <Timer left={left} total={MOCK_SECS} />
      </div>
      <div className="tabs" role="tablist">
        {entries.map((e, i) => (
          <button key={i} role="tab" aria-selected={i === ti} className={i === ti ? "on" : ""}
            onClick={() => { persist(); update((st) => { if (st.writingRun) st.writingRun.ti = i; }); }}>Task {e.task.n}</button>
        ))}
      </div>
      <div className="split">
        <div className="stack">
          <div className="prompt" lang="fr">{entries[ti].prompt.prompt}</div>
          <Editor key={ti} task={task} value={texts[ti]} onChange={(v) => setText(ti, v)} onFlush={persist} textRef={taskRef}
            label={`Task ${task.n} — ${task.min}–${task.max} words`} />
          <div className="row">
            {ti < 2 && <button className="btn" onClick={() => { persist(); update((st) => { if (st.writingRun) st.writingRun.ti = ti + 1; }); }}>Next task →</button>}
            <span className="grow" />
            <button className="btn primary" onClick={() => submit(false)}>Submit all three</button>
          </div>
          <p className="small dim">No model answers or checks during the mock. <button className="btn sm danger" onClick={() => {
            if (confirm("Abandon the writing mock? Your texts stay saved as drafts.")) {
              update((st) => { entries.forEach((e, i) => { st.drafts[e.prompt.id] = textsRef.current[i]; }); st.writingRun = null; });
              finished.current = true; go("#/writing");
            }
          }}>Abandon</button></p>
        </div>
        <PhraseBank task={task} onInsert={insert} />
      </div>
    </>
  );
}

function MockResults({ attemptIds }: { attemptIds: string[] }) {
  const s = useAppState();
  const grader = useGrader();
  const attempts = attemptIds.map((id) => s.attempts.find((a) => a.id === id)!).filter(Boolean);
  const marks = attempts.map((a) => a.ai?.mark20);
  const allGraded = marks.every((m) => m !== undefined);
  const avg = allGraded ? Math.round(marks.reduce((n, m) => n + (m ?? 0), 0) / marks.length) : null;

  async function gradeAll() {
    for (const a of attempts) {
      if (a.ai) continue;
      const ref = PROMPT_BY_ID.get(a.promptId)!;
      const res = await grader.grade(ref.task, ref.prompt, a.text);
      if (!res) break;
      attachAi(a.id, res);
    }
  }

  return (
    <>
      <h1>Writing mock — results</h1>
      {avg !== null && <div className="card result"><div className="big">≈ {avg}/20</div>
        <p className="dim">Average of the three AI estimates. The real mark is one global mark for the three tasks.
          NCLC 7 needs 10/20.</p></div>}
      {grader.hasKey ? (!allGraded && <p><button className="btn primary" disabled={grader.busy} onClick={gradeAll}>
        {grader.busy ? "Grading the three tasks…" : "Get AI marks and corrections for all three"}</button>
        {grader.error && <span className="small" style={{ color: "var(--red)", display: "block" }}>{grader.error}</span>}</p>)
        : <p className="small dim">Add an API key in <a href="#/settings">Settings</a> for AI marks and corrections.</p>}
      {attempts.map((a) => {
        const ref = PROMPT_BY_ID.get(a.promptId)!;
        return (
          <section key={a.id} className="card stack" style={{ marginTop: "1rem" }}>
            <h2 style={{ marginTop: 0 }}>{ref.task.titleEn ?? ref.task.title}</h2>
            <p className="small dim">{a.words} words (target {ref.task.min}–{ref.task.max})</p>
            {a.ai ? <AiReport ai={a.ai} text={a.text} /> : <div className="essay" lang="fr">{a.text || "(empty)"}</div>}
            <h3>Automatic check</h3>
            <IssueList issues={checkText(a.text, ref.task)} />
            <details><summary>Model answer</summary><div className="essay" lang="fr">{ref.prompt.model}</div></details>
          </section>
        );
      })}
      <p className="row" style={{ marginTop: "1rem" }}><a className="btn" href="#/writing">Back to writing</a></p>
    </>
  );
}
