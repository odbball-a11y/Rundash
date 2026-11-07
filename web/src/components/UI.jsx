import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";

const P = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };
const ICONS = {
  progress: <><path d="M4 20V10" {...P} /><path d="M10 20V4" {...P} /><path d="M16 20v-7" {...P} /><path d="M22 20H2" {...P} /></>,
  activities: <><circle cx="13" cy="4" r="2" {...P} /><path d="M7 21l3-6 3 2v4M6 12l3-3 4 1 3 3 3 1" {...P} /></>,
  explore: <><circle cx="12" cy="12" r="9" {...P} /><path d="M15.5 8.5l-2 5-5 2 2-5z" {...P} /></>,
  profile: <><circle cx="12" cy="8" r="4" {...P} /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" {...P} /></>,
  chevron: <path d="M9 6l6 6-6 6" {...P} />,
  back: <path d="M15 6l-6 6 6 6" {...P} />,
  refresh: <><path d="M20 11a8 8 0 0 0-14.9-3M4 4v4h4" {...P} /><path d="M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4" {...P} /></>,
  edit: <><path d="M4 20h4L19 9l-4-4L4 16z" {...P} /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" {...P} /><path d="M3 10h18M8 3v4M16 3v4" {...P} /></>,
  run: <><circle cx="14" cy="4" r="2" {...P} /><path d="M6 21l3-6 3 2v4M5 12l3-3 4 1 3 3 3 1" {...P} /></>,
  heart: <path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" {...P} />,
  moon: <path d="M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10z" {...P} />,
  steps: <><path d="M8 3c2 0 3 2 3 5s-1 5-3 5-3-2-3-5 1-5 3-5zM6 15h4v3a2 2 0 0 1-4 0z" {...P} /><path d="M16 7c2 0 3 2 3 5s-1 5-3 5-3-2-3-5 1-5 3-5z" {...P} /></>,
  trophy: <><path d="M7 4h10v4a5 5 0 0 1-10 0zM5 5H3a3 3 0 0 0 4 4M19 5h2a3 3 0 0 1-4 4M12 13v4M8 21h8M9 17h6" {...P} /></>,
  zones: <><path d="M4 18h16M4 13h12M4 8h8" {...P} /></>,
  gear: <><circle cx="12" cy="12" r="3" {...P} /><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14 3h-4l-.6 2.7a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2L10 21h4l.6-2.7a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z" {...P} /></>,
  list: <><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" {...P} /></>,
  plan: <><rect x="4" y="3" width="16" height="18" rx="2" {...P} /><path d="M8 8h8M8 12h8M8 16h5" {...P} /></>,
  sliders: <><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" {...P} /><circle cx="16" cy="6" r="2" {...P} /><circle cx="10" cy="12" r="2" {...P} /><circle cx="18" cy="18" r="2" {...P} /></>,
};
export const Icon = ({ name, size = 22, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={style}>{ICONS[name]}</svg>
);

// Info sheet: definition + how we calculate it (method label from the engine).
export function Info({ title, children, method }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const k = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open]);
  return (
    <>
      <button className="info" aria-label={`About ${title}`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }}>i</button>
      {open && (
        <div className="sheet-bg" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(false); }}>
          <div className="sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
            <h3>{title}</h3>
            {children}
            {method && <p><b>How Kemp Fit calculates it:</b> {method}</p>}
            <button className="iconbtn" style={{ marginTop: 8 }} onClick={() => setOpen(false)}>Close</button>
          </div>
        </div>
      )}
    </>
  );
}

export function Card({ title, info, to, children, className = "", right }) {
  const head = title && (
    <div className="ch">
      {title}
      {info}
      {right}
      {to && <span className="chev"><Icon name="chevron" size={18} /></span>}
    </div>
  );
  return to ? (
    <Link to={to} className={`card ${className}`}>{head}{children}</Link>
  ) : (
    <div className={`card ${className}`}>{head}{children}</div>
  );
}

export function PageHeader({ title, sub, back, right }) {
  const nav = useNavigate();
  return (
    <div className="ph">
      {back && <button className="back" aria-label="Back" onClick={() => (window.history.length > 1 ? nav(-1) : nav(back))}><Icon name="back" size={20} /></button>}
      <div>
        <h1>{title}</h1>
        {sub && <div className="sub">{sub}</div>}
      </div>
      <div className="spacer" />
      {right}
    </div>
  );
}

export const Est = ({ children = "est." }) => <span className="est">{children}</span>;
export const NA = ({ children = "Not measured by your watch" }) => <div className="na">{children}</div>;
export const Badge = ({ color, children }) => <span className="badge" style={{ color }}>{children}</span>;

export function Bar({ value, max = 100, color = "var(--cyan)" }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return <div className="bar"><i style={{ width: `${pct}%`, background: color }} /></div>;
}

// Arc gauge (240 degrees). value in [min, max].
export function Gauge({ value, min = 0, max = 100, color = "var(--cyan)", size = 150, label, sub }) {
  const r = 60, cx = 75, cy = 75, a0 = 150, a1 = 390;
  const t = value == null ? 0 : Math.max(0, Math.min(1, (value - min) / (max - min)));
  const pt = (deg) => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)];
  const arc = (from, to) => { const [x0, y0] = pt(from), [x1, y1] = pt(to); return `M${x0} ${y0} A${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x1} ${y1}`; };
  return (
    <svg width={size} height={size * 0.82} viewBox="0 0 150 123" role="img" aria-label={`${label || ""} ${value ?? "no data"}`}>
      <path d={arc(a0, a1)} stroke="var(--card-2)" strokeWidth="10" fill="none" strokeLinecap="round" />
      {t > 0 && <path d={arc(a0, a0 + (a1 - a0) * t)} stroke={color} strokeWidth="10" fill="none" strokeLinecap="round" />}
      <text x="75" y="80" textAnchor="middle" fill="var(--text)" fontSize="30" fontWeight="700" className="num">{value ?? "—"}</text>
      {sub && <text x="75" y="100" textAnchor="middle" fill="var(--text-2)" fontSize="11">{sub}</text>}
    </svg>
  );
}

export function Seg({ options, value, onChange }) {
  return (
    <div className="seg" role="tablist">
      {options.map(([v, l]) => <button key={v} role="tab" aria-selected={v === value} className={v === value ? "on" : ""} onClick={() => onChange(v)}>{l}</button>)}
    </div>
  );
}

export function Loading() { return <div className="empty">Loading…</div>; }
export function ErrorState({ error }) {
  return <div className="empty">Couldn't load data ({String(error?.message || error)}). Check your connection and try Refresh.</div>;
}
export function Soon({ phase, children }) {
  return <div className="card empty">{children || "This screen is part of a later build phase."}{phase && <div className="lbl" style={{ marginTop: 8 }}>Planned: {phase}</div>}</div>;
}
