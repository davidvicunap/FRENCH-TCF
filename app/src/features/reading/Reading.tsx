import { useEffect, useMemo, useRef, useState } from "react";
import { LEVELS, type Level, type ReadingItem } from "../../content/schema";
import { READING, READING_BY_ID } from "../../content";
import { IRCC_TABLE_URL, NCLC_TARGET } from "../../lib/score";
import { getState, update, useAppState, type MockRun } from "../../lib/store";
import { fmtTime } from "../../lib/words";
import { Bar, Callout, Crumbs, go, Timer, useCountdown } from "../../ui";
import { drawMock, MOCK_FULL, MOCK_SHORT, practiceLevels, practiceSet, recordAnswer, scoreMock, SECS_PER_ITEM, type MockResult } from "./logic";
import { Question, useOrder } from "./Question";

/* ------------------------------------------------------------------ home */

export function ReadingHome() {
  const s = useAppState();
  const levels = practiceLevels(s);
  const missed = Object.values(s.items).filter((x) => x.lw).length;
  const last = s.mocks[s.mocks.length - 1];
  const byLevel = LEVELS.map((l) => {
    let r = 0, w = 0;
    for (const it of READING) if (it.level === l && s.items[it.id]) { r += s.items[it.id].r; w += s.items[it.id].w; }
    return { l, n: r + w, pct: r + w ? Math.round((100 * r) / (r + w)) : null };
  });

  return (
    <>
      <Crumbs items={[["Home", "#/"], ["Reading"]]} />
      <h1>📖 Compréhension écrite</h1>
      <p className="dim">TCF Canada: <strong>39 questions in 60 minutes</strong>, one document per question,
        difficulty rising from A1 to C2. Your target for NCLC 7: <strong>{NCLC_TARGET.reading}+</strong> points.</p>

      {s.mockRun && (
        <Callout kind="tip" title="Mock exam in progress:">
          question {s.mockRun.qi + 1} of {s.mockRun.ids.length}, {fmtTime(s.mockRun.left)} left.{" "}
          <a className="btn sm primary" href="#/reading/mock">Resume</a>
        </Callout>
      )}

      <div className="grid">
        <div className="card stack">
          <h3>🎯 Practice set</h3>
          <p className="small dim">10 questions, corrected one by one, with why each wrong option is wrong.
            Missed questions come back first.</p>
          <div className="pills" role="group" aria-label="Level">
            {(["auto", ...LEVELS] as const).map((l) => (
              <button key={l} type="button" className={`pill ${s.settings.practiceLevel === l ? "on" : ""}`}
                onClick={() => update((st) => { st.settings.practiceLevel = l; })}>{l === "auto" ? "Auto" : l}</button>
            ))}
          </div>
          <p className="small dim">Now: {levels.join(" + ")}{s.settings.practiceLevel === "auto" ? " (your level and the next one)" : ""}</p>
          <a className="btn primary" href="#/reading/practice">Start practice</a>
          {missed > 0 && <p className="small">🩹 {missed} missed question(s) waiting.</p>}
        </div>
        <div className="card stack">
          <h3>⏱️ Mock exam</h3>
          <p className="small dim">Real conditions: one clock, no feedback until the end, free navigation, flags.</p>
          <button className="btn primary" disabled={!!s.mockRun} onClick={() => start(true)}>
            Full — {MOCK_FULL.n} questions, 60 min</button>
          <button className="btn" disabled={!!s.mockRun} onClick={() => start(false)}>
            Short — {MOCK_SHORT.n} questions, 31 min</button>
        </div>
      </div>

      <h2>Your accuracy by level</h2>
      <div className="scroll"><table className="t">
        <thead><tr><th>Level</th><th>Answers</th><th>Accuracy</th><th style={{ width: "40%" }}></th></tr></thead>
        <tbody>{byLevel.map((b) => (
          <tr key={b.l}><td><span className="badge lvl">{b.l}</span></td><td>{b.n}</td>
            <td>{b.pct === null ? "—" : `${b.pct} %`}</td><td>{b.pct !== null && <Bar value={b.pct} max={100} />}</td></tr>
        ))}</tbody>
      </table></div>

      {s.mocks.length > 0 && <>
        <h2>Mock history</h2>
        <ul className="stack" style={{ listStyle: "none", padding: 0 }}>
          {s.mocks.slice().reverse().slice(0, 8).map((m) => (
            <li key={m.at} className="card row">
              <div className="grow">
                <strong>{m.level} · ≈ {m.score}</strong> <span className="dim small">({m.lo}–{m.hi}) · NCLC {m.nclc || "< 4"}</span>
                <div className="small dim">{new Date(m.at).toLocaleDateString()} · {m.correct}/{m.n} · {m.full ? "full" : "short"} · {fmtTime(m.secs)} used · {m.fresh}% new questions</div>
              </div>
              <div style={{ width: "8rem" }}><Bar value={m.score} max={699} target={NCLC_TARGET.reading} /></div>
            </li>
          ))}
        </ul>
        {last && <p className="small dim">Green mark = NCLC 7 threshold ({NCLC_TARGET.reading}).</p>}
      </>}

      <Callout title="How the score is estimated:">
        from which questions you got right, weighted by difficulty and corrected for guessing — not a
        raw percentage. The questions were levelled by their author, not calibrated on real
        candidates, so treat the score as a range and watch the trend. NCLC uses{" "}
        <a href={IRCC_TABLE_URL} target="_blank" rel="noreferrer">IRCC's equivalence table</a>.
      </Callout>
    </>
  );

  function start(full: boolean) {
    update((st) => { st.mockRun = drawMock(getState(), full); });
    go("#/reading/mock");
  }
}

/* -------------------------------------------------------------- practice */

export function ReadingPractice() {
  const s = useAppState();
  const [items] = useState(() => practiceSet(getState(), practiceLevels(getState())));
  const [i, setI] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const [correct, setCorrect] = useState(0);
  const [started, setStarted] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState(0);
  const item = items[i];
  const order = useOrder(item ?? READING[0]);

  useEffect(() => {
    if (chosen !== null) return;
    const h = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(h);
  }, [started, chosen]);

  useKeys(order, chosen === null, (orig) => choose(orig), () => { if (chosen !== null) next(); });

  if (!items.length) return <p>No questions at this level. <a href="#/reading">Back</a></p>;
  if (i >= items.length) {
    return (
      <div className="card result">
        <p className="big">{correct} / {items.length}</p>
        <p className="dim">{correct === items.length ? "Perfect set." : "Missed questions will come back in your next sets until you get them right."}</p>
        <p className="row" style={{ justifyContent: "center" }}>
          <button className="btn primary" onClick={() => location.reload()}>Another set</button>
          <a className="btn" href="#/reading">Back to reading</a>
        </p>
      </div>
    );
  }

  return (
    <>
      <Crumbs items={[["Home", "#/"], ["Reading", "#/reading"], ["Practice"]]} />
      <div className="examhead" style={{ position: "static" }}>
        <strong>Practice</strong><span className="small dim">Question {i + 1} / {items.length} · {correct} correct</span>
        <span className="grow" />
        <span className={`timer ${elapsed > SECS_PER_ITEM ? "warn" : ""}`} title={`Exam pace: ${SECS_PER_ITEM} s per question`}>
          {fmtTime(elapsed)}</span>
        <label className="small row"><input type="checkbox" checked={s.settings.english}
          onChange={(e) => update((st) => { st.settings.english = e.target.checked; })} /> English help</label>
      </div>
      <Question item={item} order={order} chosen={chosen} revealed={chosen !== null} english={s.settings.english}
        onChoose={choose} header={<span>Exam pace ≈ {SECS_PER_ITEM} s</span>} />
      {chosen !== null && (
        <p style={{ marginTop: "1rem" }}><button className="btn primary" autoFocus onClick={next}>
          {i === items.length - 1 ? "See results" : "Next question →"}</button></p>
      )}
    </>
  );

  function choose(orig: number) {
    if (chosen !== null) return;
    setChosen(orig);
    const ok = orig === item.a;
    if (ok) setCorrect((c) => c + 1);
    update((st) => recordAnswer(st, item.id, ok));
  }
  function next() {
    setI((x) => x + 1);
    setChosen(null);
    setStarted(Date.now());
    setElapsed(0);
    window.scrollTo(0, 0);
  }
}

/** A–D / 1–4 to answer, Enter to continue. */
function useKeys(order: number[], active: boolean, onChoose: (orig: number) => void, onEnter: () => void) {
  const ref = useRef({ order, active, onChoose, onEnter });
  ref.current = { order, active, onChoose, onEnter };
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const k = e.key.toLowerCase();
      const pos = "abcd".includes(k) && k.length === 1 ? "abcd".indexOf(k) : "1234".indexOf(k);
      const { order, active, onChoose, onEnter } = ref.current;
      if (pos >= 0 && active && order[pos] !== undefined) { e.preventDefault(); onChoose(order[pos]); }
      else if (e.key === "Enter" && !active && tag !== "BUTTON") onEnter();
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, []);
}

/* ------------------------------------------------------------------ mock */

export function ReadingMockView() {
  const s = useAppState();
  const run = s.mockRun;
  const [result, setResult] = useState<MockResult | null>(null);
  if (result) return <MockResultView result={result} />;
  if (!run) {
    return <p>No mock exam in progress. <a href="#/reading">Start one</a></p>;
  }
  return <MockRunner run={run} onDone={setResult} />;
}

function MockRunner({ run, onDone }: { run: MockRun; onDone: (r: MockResult) => void }) {
  const items = useMemo(() => run.ids.map((id) => READING_BY_ID.get(id)).filter(Boolean) as ReadingItem[], [run.at]);
  const [initialLeft] = useState(run.left);
  const item = items[run.qi];
  const order = useOrder(item, `${run.at}:${item.id}`);
  const finished = useRef(false);

  const left = useCountdown(initialLeft, true,
    (l) => { if (l % 5 === 0) update((st) => { if (st.mockRun) st.mockRun.left = l; }); },
    () => finish(true));

  // Save the remaining time when the page is hidden or closed.
  useEffect(() => {
    const save = () => update((st) => { if (st.mockRun) st.mockRun.left = leftRef.current; });
    const leftRef = { current: left };
    const vis = () => { if (document.hidden) save(); };
    window.addEventListener("pagehide", save);
    document.addEventListener("visibilitychange", vis);
    return () => { window.removeEventListener("pagehide", save); document.removeEventListener("visibilitychange", vis); };
  });

  useKeys(order, true, (orig) => answer(orig), () => {});

  if (items.length !== run.ids.length) {
    update((st) => { st.mockRun = null; });
    return <p>This mock could not be resumed (content changed). <a href="#/reading">Start a new one</a></p>;
  }
  const answered = run.ans.filter((a) => a !== null).length;

  return (
    <>
      <div className="examhead">
        <strong>📖 Mock — reading</strong>
        <span className="small dim">Question {run.qi + 1} / {items.length} · {answered} answered</span>
        <span className="grow" />
        <Timer left={left} total={run.total} />
      </div>
      <div className="palette" role="group" aria-label="Go to question">
        {items.map((_, i) => (
          <button key={i} type="button" onClick={() => goTo(i)}
            className={`${run.ans[i] !== null ? "done" : ""} ${i === run.qi ? "cur" : ""} ${run.flags[i] ? "flag" : ""}`}
            aria-label={`Question ${i + 1}${run.ans[i] !== null ? ", answered" : ""}${run.flags[i] ? ", flagged" : ""}`}>{i + 1}</button>
        ))}
      </div>
      <Question item={item} order={order} chosen={run.ans[run.qi]} revealed={false} english={false} onChoose={answer} />
      <div className="row" style={{ marginTop: "1rem" }}>
        <button className="btn" disabled={run.qi === 0} onClick={() => goTo(run.qi - 1)}>← Previous</button>
        <button className="btn" onClick={() => update((st) => { if (st.mockRun) st.mockRun.flags[run.qi] = !st.mockRun.flags[run.qi]; })}>
          {run.flags[run.qi] ? "⚑ Unflag" : "⚐ Flag for review"}</button>
        {run.qi < items.length - 1 && <button className="btn primary" onClick={() => goTo(run.qi + 1)}>Next →</button>}
        <span className="grow" />
        <button className={`btn ${run.qi === items.length - 1 ? "primary" : ""}`} onClick={() => {
          const blanks = run.ans.filter((a) => a === null).length;
          if (blanks && !confirm(`${blanks} question(s) unanswered. A wrong answer costs nothing — a blank earns nothing.\n\nFinish anyway?`)) return;
          finish(false);
        }}>Finish</button>
      </div>
      <p className="small dim" style={{ marginTop: "1rem" }}>
        <button className="btn sm danger" onClick={() => {
          if (confirm("Abandon this mock? Your answers will be lost.")) { update((st) => { st.mockRun = null; }); go("#/reading"); }
        }}>Abandon</button> Keys: A–D to answer.</p>
    </>
  );

  function answer(orig: number) {
    update((st) => { if (st.mockRun) st.mockRun.ans[st.mockRun.qi] = orig; });
  }
  function goTo(i: number) {
    update((st) => { if (st.mockRun) { st.mockRun.qi = i; st.mockRun.left = left; } });
    window.scrollTo(0, 0);
  }
  function finish(timedOut: boolean) {
    if (finished.current) return;
    finished.current = true;
    const current = getState().mockRun;
    if (!current) return;
    const done = { ...current, left: timedOut ? 0 : left };
    const res = scoreMock(done, items);
    update((st) => {
      st.mockRun = null;
      st.mocks.push(res.record);
      items.forEach((it, i) => { if (done.ans[i] !== null) recordAnswer(st, it.id, done.ans[i] === it.a); });
    });
    onDone(res);
    window.scrollTo(0, 0);
  }
}

function MockResultView({ result }: { result: MockResult }) {
  const { record: r, items, answers } = result;
  const english = getState().settings.english;
  const gap = NCLC_TARGET.reading - r.score;
  const wrong = items.map((it, i) => ({ it, a: answers[i] })).filter((x) => x.a !== x.it.a);
  return (
    <>
      <h1>Reading mock — result</h1>
      <div className="card result">
        <div className="big">{r.level}</div>
        <p style={{ margin: ".3rem 0", fontSize: "1.1rem" }}><strong>≈ {r.score} / 699</strong> · likely range {r.lo}–{r.hi}</p>
        <p className="dim">{r.correct} / {r.n} correct · {fmtTime(r.secs)} used · NCLC {r.nclc || "below 4"}</p>
        <div style={{ maxWidth: "26rem", margin: ".8rem auto" }}><Bar value={r.score} max={699} target={NCLC_TARGET.reading} /></div>
        <p>{gap <= 0 ? "At or above the NCLC 7 threshold on this mock. Keep it there on the next ones."
          : `About ${gap} points below the NCLC 7 threshold (${NCLC_TARGET.reading}).`}</p>
      </div>

      <h2>By level</h2>
      <div className="scroll"><table className="t"><thead><tr><th>Question level</th><th>Correct</th><th>Rate</th></tr></thead>
        <tbody>{LEVELS.filter((l) => r.byLevel[l]).map((l) => (
          <tr key={l}><td><span className="badge lvl">{l}</span></td><td>{r.byLevel[l].c} / {r.byLevel[l].n}</td>
            <td>{Math.round((100 * r.byLevel[l].c) / r.byLevel[l].n)} %</td></tr>))}</tbody></table></div>
      <p className="small dim">To reach NCLC 7 you need to be reliable on A1–B1 and win most B2 questions.
        {r.fresh < 100 && ` ${100 - r.fresh}% of these questions were already known to you, so this score is slightly flattering.`}</p>

      <h2>Correction ({wrong.length} to review)</h2>
      {wrong.map(({ it, a }) => (
        <details key={it.id} className="card" style={{ marginBottom: ".5rem" }}>
          <summary><span className="badge lvl">{it.level}</span> <span lang="fr">{it.q}</span>
            <span className="dim small"> — your answer: {a === null ? "none" : <span lang="fr">{it.options[a]}</span>}</span></summary>
          <div style={{ marginTop: ".8rem" }}>
            <Question item={it} order={it.options.map((_, i) => i)} chosen={a} revealed english={english} onChoose={() => {}} />
          </div>
        </details>
      ))}
      <p className="row" style={{ marginTop: "1.2rem" }}>
        <a className="btn primary" href="#/reading/practice">Practise my mistakes</a>
        <a className="btn" href="#/reading">Back to reading</a>
      </p>
    </>
  );
}

export type { Level };
