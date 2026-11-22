import { useMemo } from "react";
import type { ReadingItem } from "../../content/schema";
import { seeded, shuffle } from "../../lib/words";
import { LevelBadge } from "../../ui";

/** Display order of the options: shuffled, but stable for a given seed. */
export function useOrder(item: ReadingItem, seed?: string): number[] {
  return useMemo(() => {
    const idx = item.options.map((_, i) => i);
    return seed ? shuffle(idx, seeded(seed)) : shuffle(idx);
  }, [item.id, seed]);
}

/**
 * One reading question. In practice mode (`revealed`), each option shows why it
 * is right or wrong — the distractor analysis is where reading skill is built.
 */
export function Question(props: {
  item: ReadingItem;
  order: number[];
  chosen: number | null;
  revealed: boolean;
  english: boolean;
  onChoose: (original: number) => void;
  header?: React.ReactNode;
}) {
  const { item, order, chosen, revealed, english, onChoose } = props;
  return (
    <div>
      <div className="row small dim" style={{ marginBottom: ".5rem" }}>
        <LevelBadge level={item.level} />
        {props.header}
      </div>
      <div className="doc" lang="fr">{item.context}</div>
      <p className="q" lang="fr">{item.q}</p>
      <ul className="opts">
        {order.map((orig, pos) => {
          const cls = revealed
            ? orig === item.a ? "good" : orig === chosen ? "bad" : ""
            : orig === chosen ? "sel" : "";
          return (
            <li key={orig}>
              <button type="button" className={`opt ${cls}`} disabled={revealed}
                aria-pressed={orig === chosen} onClick={() => onChoose(orig)}>
                <span className="key">{"ABCDE"[pos]}</span>
                <span lang="fr">
                  {item.options[orig]}
                  {revealed && english && item.notes && <span className="note" lang="en">{item.notes[orig]}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {revealed && (
        <div className={`fb ${chosen === item.a ? "ok" : "no"}`}>
          <strong>{chosen === item.a ? "✓ Correct" : chosen === null ? "— No answer" : "✗ Incorrect"}</strong>
          <p style={{ margin: ".3rem 0" }} lang="fr">{item.why}</p>
          {english && item.whyEn && <p className="dim" style={{ margin: ".3rem 0" }}>{item.whyEn}</p>}
          {english && item.gloss && <p className="dim small" style={{ margin: ".3rem 0" }}>{item.gloss}</p>}
          {item.glossary && item.glossary.length > 0 && (
            <div className="gloss">{item.glossary.map((g) => <span key={g.fr}><b lang="fr">{g.fr}</b> = {g.en}</span>)}</div>
          )}
        </div>
      )}
    </div>
  );
}
