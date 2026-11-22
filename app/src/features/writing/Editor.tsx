import { useEffect, useRef } from "react";
import type { WritingTask } from "../../content/schema";
import { textStats } from "../../lib/checker";

/* On the computer-based TCF there is an accent palette; on paper you write by hand.
   Either way, accents count as spelling. */
const ACCENTS = ["é", "è", "ê", "à", "â", "ç", "ù", "û", "î", "ï", "ô", "ë", "œ", "É", "À", "Ç", "«", "»", "’"];

export function useInsert(ref: React.RefObject<HTMLTextAreaElement | null>, onChange: (v: string) => void) {
  return (snippet: string) => {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    const text = snippet === "«" ? "« " : snippet === "»" ? " »" : snippet;
    const value = el.value.slice(0, start) + text + el.value.slice(end);
    onChange(value);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + text.length;
    });
  };
}

export function Editor(props: {
  task: WritingTask;
  value: string;
  onChange: (v: string) => void;
  onFlush?: () => void;
  textRef?: React.RefObject<HTMLTextAreaElement | null>;
  label?: string;
}) {
  const { task, value, onChange, onFlush } = props;
  const own = useRef<HTMLTextAreaElement>(null);
  const ref = props.textRef ?? own;
  const insert = useInsert(ref, onChange);
  const st = textStats(value);
  const inRange = st.words >= task.min && st.words <= task.max;

  // Persist immediately when the page is hidden or closed.
  const flush = useRef(onFlush);
  flush.current = onFlush;
  useEffect(() => {
    const f = () => flush.current?.();
    const vis = () => { if (document.hidden) f(); };
    window.addEventListener("pagehide", f);
    document.addEventListener("visibilitychange", vis);
    return () => { f(); window.removeEventListener("pagehide", f); document.removeEventListener("visibilitychange", vis); };
  }, []);

  return (
    <div>
      <label htmlFor={`ed-${task.id}`} className="small dim">{props.label ?? "Your text — saved automatically on this device"}</label>
      <div className="accents" role="group" aria-label="Insert a French character">
        {ACCENTS.map((c) => (
          <button key={c} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insert(c)}>{c}</button>
        ))}
      </div>
      <textarea id={`ed-${task.id}`} ref={ref} className="editor" lang="fr" spellCheck={false}
        value={value} onChange={(e) => onChange(e.target.value)} onBlur={() => onFlush?.()}
        placeholder="Écrivez ici…" />
      <div className="row small" style={{ marginTop: ".35rem" }}>
        <span>Words: <span className={`wc ${inRange ? "in" : "out"}`}>{st.words}</span> <span className="dim">/ {task.min}–{task.max}</span></span>
        <span className="dim">· {st.paragraphs} paragraph(s) · {st.connectors.length} linking word(s)</span>
      </div>
    </div>
  );
}

export function PhraseBank({ task, onInsert }: { task: WritingTask; onInsert: (s: string) => void }) {
  return (
    <div className="side">
      <h3>Useful phrases</h3>
      <p className="small dim">Click to insert. Replace the [brackets].</p>
      {task.phrases.map((p) => (
        <button key={p.fr} type="button" className="phrase" onMouseDown={(e) => e.preventDefault()}
          onClick={() => onInsert(p.fr.split(" / ")[0] + " ")}>
          <b lang="fr">{p.fr}</b><span>{p.en}</span>
        </button>
      ))}
      <h3 style={{ marginTop: "1rem" }}>Linking words</h3>
      <div className="pills">{task.connectors.map((c) => (
        <button key={c} type="button" className="pill" onMouseDown={(e) => e.preventDefault()} onClick={() => onInsert(c + " ")}>{c}</button>
      ))}</div>
    </div>
  );
}
