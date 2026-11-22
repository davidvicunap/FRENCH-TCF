import { useState } from "react";
import type { WritingPrompt, WritingTask } from "../../content/schema";
import type { Issue } from "../../lib/checker";
import { gradeTask, GradingError } from "../../lib/grader";
import { IRCC_TABLE_URL, nclcWriting, NCLC_TARGET } from "../../lib/score";
import { getApiKey, getState, type AiResult } from "../../lib/store";

export function IssueList({ issues }: { issues: Issue[] }) {
  if (!issues.length) {
    return <p className="small">✓ No mechanical problem found. That doesn't make the text perfect: compare it with the model and the checklist.</p>;
  }
  const errors = issues.filter((i) => i.severity === "error").length;
  return (
    <>
      <p className="small">{errors} error(s), {issues.length - errors} warning(s).</p>
      <ul className="issues">
        {issues.map((i, k) => (
          <li key={k} className={`issue ${i.severity}`}>
            {i.quote && <><q lang="fr">{i.quote}</q>{i.fix && <> → <span className="fix" lang="fr">{i.fix}</span></>} — </>}
            {i.message}
          </li>
        ))}
      </ul>
    </>
  );
}

/** Highlights the AI's quoted errors inside the learner's text. */
export function Highlighted({ text, ai }: { text: string; ai: AiResult }) {
  const quotes = ai.errors.map((e) => e.quote).filter((q) => q.length > 1 && text.includes(q));
  if (!quotes.length) return <div className="essay" lang="fr">{text}</div>;
  const escaped = quotes.map((q) => q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).sort((a, b) => b.length - a.length);
  const parts = text.split(new RegExp(`(${escaped.join("|")})`, "g"));
  return (
    <div className="essay" lang="fr">
      {parts.map((p, i) => (quotes.includes(p) ? <mark key={i} className="err">{p}</mark> : <span key={i}>{p}</span>))}
    </div>
  );
}

export function AiReport({ ai, text }: { ai: AiResult; text: string }) {
  const nclc = nclcWriting(ai.mark20);
  return (
    <div className="stack">
      <div className="card">
        <div className="row">
          <div className="k">{ai.mark20}/20</div>
          <div className="grow"><strong>{ai.level}</strong> · NCLC {nclc || "< 4"}
            <div className="small dim">{ai.mark20 >= NCLC_TARGET.writing ? "At or above the NCLC 7 threshold (10/20)." : `NCLC 7 needs 10/20: ${NCLC_TARGET.writing - ai.mark20} point(s) to go.`}</div></div>
        </div>
        <p style={{ marginBottom: 0 }}>{ai.summary}</p>
      </div>
      <div className="scroll"><table className="t"><thead><tr><th>Criterion</th><th>Level</th><th>Comment</th></tr></thead>
        <tbody>{ai.criteria.map((c) => <tr key={c.name}><td>{c.name}</td><td><span className="badge lvl">{c.level}</span></td><td>{c.comment}</td></tr>)}</tbody></table></div>
      {ai.priorities.length > 0 && <div className="callout tip"><strong>Work on next:</strong>
        <ol style={{ margin: ".3rem 0 0", paddingLeft: "1.2rem" }}>{ai.priorities.map((p) => <li key={p}>{p}</li>)}</ol></div>}
      <h3>Errors in your text</h3>
      <Highlighted text={text} ai={ai} />
      <ul className="issues">{ai.errors.map((e, i) => (
        <li key={i} className="issue error"><q lang="fr">{e.quote}</q> → <span className="fix" lang="fr">{e.correction}</span>
          <span className="dim small"> ({e.type})</span> — {e.explanation}</li>
      ))}</ul>
      {ai.strengths.length > 0 && <p className="small"><strong>Strengths:</strong> {ai.strengths.join(" · ")}</p>}
      <details><summary>Corrected and improved version</summary><div className="essay" lang="fr" style={{ marginTop: ".5rem" }}>{ai.improved}</div></details>
      <p className="small dim">AI estimate by {ai.model || "Claude"} against the public TCF criteria. On exam day, two trained
        examiners mark your paper — use this to find errors and track progress, not as a guaranteed score.
        NCLC from <a href={IRCC_TABLE_URL} target="_blank" rel="noreferrer">IRCC's table</a>.</p>
    </div>
  );
}

/** Button + state for an AI grading request. */
export function useGrader() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function grade(task: WritingTask, prompt: WritingPrompt, text: string): Promise<AiResult | null> {
    setBusy(true); setError("");
    try {
      return await gradeTask({ apiKey: getApiKey(), model: getState().settings.model, task, prompt, text });
    } catch (e) {
      setError(e instanceof GradingError ? e.message : `Unexpected error: ${(e as Error).message}`);
      return null;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, grade, hasKey: !!getApiKey() };
}
