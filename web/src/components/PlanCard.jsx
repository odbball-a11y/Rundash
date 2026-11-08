import { useApi } from "../api.js";
import { Card, NA } from "./UI.jsx";
import { fmtDate, fmtDur } from "../format.js";
const k = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export default function PlanCard({ title = "Training Calendar" }) {
  const from = k(new Date()), to = k(new Date(Date.now() + 14 * 86400000));
  const { data } = useApi(`/api/calendar?from=${from}&to=${to}`);
  const items = (data?.events || []).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 4);
  return (
    <Card title={title} to="/calendar">
      {!items.length ? <NA>Nothing planned in the next two weeks. Tap to plan.</NA> : (
        <table className="tbl num"><tbody>
          {items.map((e) => <tr key={e.id}><td className="muted">{fmtDate(e.date, { weekday: "short", day: "2-digit" })}</td><td>{e.category === "WORKOUT" ? "" : "⚑ "}{e.name}</td><td style={{ textAlign: "right" }} className="muted">{e.estimate ? `${fmtDur(e.estimate.seconds)} · TL ${e.estimate.load}` : ""}</td></tr>)}
        </tbody></table>
      )}
    </Card>
  );
}
