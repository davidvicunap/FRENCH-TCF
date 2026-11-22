import { useEffect, useRef, useState, type ReactNode } from "react";
import { fmtTime } from "./lib/words";

/** Tiny hash router: "#/reading/mock" → ["reading", "mock"]. */
export function useRoute(): string[] {
  const read = () => location.hash.replace(/^#\/?/, "").split("?")[0].split("/").filter(Boolean);
  const [parts, setParts] = useState(read);
  useEffect(() => {
    const on = () => { setParts(read()); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return parts;
}

export function go(hash: string) { location.hash = hash; }

export function Crumbs({ items }: { items: Array<[string, string?]> }) {
  return (
    <p className="small dim" style={{ margin: "0 0 .6rem" }}>
      {items.map(([label, href], i) => (
        <span key={i}>{i > 0 && " / "}{href ? <a href={href} className="dim">{label}</a> : label}</span>
      ))}
    </p>
  );
}

export function Callout({ kind, title, children }: { kind?: "warn" | "tip"; title?: string; children: ReactNode }) {
  return <div className={`callout ${kind ?? ""}`}>{title && <strong>{title} </strong>}{children}</div>;
}

/** Progress bar with an optional green marker for the target. */
export function Bar({ value, max, target }: { value: number; max: number; target?: number }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const style = target !== undefined ? ({ "--t": `${(target / max) * 100}%` } as React.CSSProperties) : undefined;
  return <div className={`bar ${target !== undefined ? "target" : ""}`} style={style}><i style={{ width: `${pct}%` }} /></div>;
}

/**
 * Countdown that keeps running while the tab is hidden. `onTick` receives the
 * seconds left (persist it); `onEnd` fires once at zero.
 */
export function useCountdown(initial: number, running: boolean, onTick: (left: number) => void, onEnd: () => void) {
  const [left, setLeft] = useState(initial);
  const leftRef = useRef(initial);
  const cbs = useRef({ onTick, onEnd });
  cbs.current = { onTick, onEnd };
  useEffect(() => { leftRef.current = initial; setLeft(initial); }, [initial]);
  useEffect(() => {
    if (!running) return;
    let last = Date.now();
    const h = setInterval(() => {
      const now = Date.now();
      const dt = Math.max(1, Math.round((now - last) / 1000));
      last = now;
      leftRef.current = Math.max(0, leftRef.current - dt);
      setLeft(leftRef.current);
      cbs.current.onTick(leftRef.current);
      if (leftRef.current === 0) { clearInterval(h); cbs.current.onEnd(); }
    }, 1000);
    return () => clearInterval(h);
  }, [running]);
  return left;
}

export function Timer({ left, total }: { left: number; total: number }) {
  const cls = left <= 60 ? "danger" : left <= total * 0.15 ? "warn" : "";
  return <span className={`timer ${cls}`} role="timer" aria-label={`${fmtTime(left)} left`}>{fmtTime(left)}</span>;
}

export function LevelBadge({ level }: { level: string }) {
  return <span className="badge lvl">{level}</span>;
}
