import { useEffect, useRef } from "react";
import {
  Chart, LineController, BarController, LineElement, BarElement, PointElement, LinearScale, CategoryScale,
  Filler, Tooltip, Legend,
} from "chart.js";

Chart.register(LineController, BarController, LineElement, BarElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip, Legend);
Chart.defaults.color = "#94a3b8";
Chart.defaults.borderColor = "#24304a";
Chart.defaults.font.family = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
Chart.defaults.font.size = 11;
Chart.defaults.plugins.tooltip.backgroundColor = "#1a2338";
Chart.defaults.plugins.tooltip.borderColor = "#24304a";
Chart.defaults.plugins.tooltip.borderWidth = 1;

function useChart(config, deps) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    const c = new Chart(ref.current, config());
    return () => c.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}

const baseOpts = (extra = {}) => ({
  responsive: true, maintainAspectRatio: false, animation: false,
  interaction: { mode: "index", intersect: false },
  plugins: { legend: { display: false } },
  scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 7, maxRotation: 0 } }, y: { grid: { color: "#1c2640" }, ticks: { maxTicksLimit: 5 } } },
  ...extra,
});

// series: [{ label, data:[numbers|null], color, fill?, dashed?, axis? }]
export function LineChart({ labels, series, height = "", yMin, yMax, legend = false, reverseY = false, y2 = false, yFmt }) {
  const ref = useChart(() => ({
    type: "line",
    data: {
      labels,
      datasets: series.map((s) => ({
        label: s.label, data: s.data, borderColor: s.color, backgroundColor: s.fill ? s.color + "22" : s.color,
        fill: !!s.fill, tension: 0.3, pointRadius: 0, borderWidth: s.width || 2, spanGaps: true,
        borderDash: s.dashed ? [5, 4] : undefined, yAxisID: s.axis || "y",
      })),
    },
    options: baseOpts({
      plugins: {
        legend: { display: legend, labels: { boxWidth: 10, boxHeight: 10 } },
        ...(yFmt ? { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.parsed.y == null ? "—" : yFmt(c.parsed.y)}` } } } : {}),
      },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 7, maxRotation: 0 } },
        y: { grid: { color: "#1c2640" }, ticks: { maxTicksLimit: 5, ...(yFmt ? { callback: (v) => yFmt(v) } : {}) }, min: yMin, max: yMax, reverse: reverseY },
        ...(y2 ? { y2: { position: "right", grid: { display: false }, ticks: { maxTicksLimit: 5 } } } : {}),
      },
    }),
  }), [JSON.stringify(labels), JSON.stringify(series), yMin, yMax, legend, reverseY, y2]);
  return <div className={`chart ${height}`}><canvas ref={ref} /></div>;
}

export function BarChart({ labels, series, height = "", stacked = false, legend = false }) {
  const ref = useChart(() => ({
    type: "bar",
    data: { labels, datasets: series.map((s) => ({ label: s.label, data: s.data, backgroundColor: s.color, borderRadius: 4, maxBarThickness: 28 })) },
    options: baseOpts({
      plugins: { legend: { display: legend, labels: { boxWidth: 10, boxHeight: 10 } } },
      scales: { x: { stacked, grid: { display: false }, ticks: { maxTicksLimit: 12, maxRotation: 0 } }, y: { stacked, grid: { color: "#1c2640" }, ticks: { maxTicksLimit: 5 } } },
    }),
  }), [JSON.stringify(labels), JSON.stringify(series), stacked, legend]);
  return <div className={`chart ${height}`}><canvas ref={ref} /></div>;
}
