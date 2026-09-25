// ตัวช่วยสร้างกราฟ (Chart.js)
import { baht } from "../common.js";

const live = new Set();
export const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

export function destroyCharts() { live.forEach((c) => c.destroy()); live.clear(); }

export const SERIES = () => ({ rev: cssVar("--c-rev"), exp: cssVar("--c-exp"), pro: cssVar("--c-pro") });

/**
 * สร้างกราฟแท่ง/เส้น แกนเดียว (หน่วยบาทหรือจำนวน)
 * datasets: [{label, data, color, type?:'bar'|'line'}]
 */
export function makeChart(canvas, { labels, datasets, horizontal = false, money = true, stacked = false }) {
  if (!window.Chart || !canvas) return null;
  const ink = cssVar("--muted"), grid = cssVar("--line"), surface = cssVar("--surface");
  const font = { family: getComputedStyle(document.body).fontFamily, size: 12 };
  const fmt = (v) => money ? baht(v) : Number(v).toLocaleString("th-TH");
  const allLine = datasets.every((d) => d.type === "line");
  const chart = new window.Chart(canvas, {
    type: allLine ? "line" : "bar",
    data: {
      labels,
      datasets: datasets.map((d) => d.type === "line" ? {
        type: "line", label: d.label, data: d.data, borderColor: d.color, backgroundColor: d.color,
        borderWidth: 2, pointRadius: 3, pointHoverRadius: 6, pointBackgroundColor: d.color,
        pointBorderColor: surface, pointBorderWidth: 2, tension: 0, order: 0,
      } : {
        type: "bar", label: d.label, data: d.data, backgroundColor: d.color, hoverBackgroundColor: d.color,
        borderRadius: 4, borderSkipped: "start", borderColor: surface, borderWidth: { top: 0, right: 0, bottom: 0, left: 0 },
        maxBarThickness: 34, categoryPercentage: .72, barPercentage: .86, order: 1,
      }),
    },
    options: {
      indexAxis: horizontal ? "y" : "x",
      responsive: true, maintainAspectRatio: false, animation: { duration: 500 },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: cssVar("--ink"), titleColor: cssVar("--bg"), bodyColor: cssVar("--bg"),
          padding: 10, cornerRadius: 10, titleFont: { ...font, weight: "600" }, bodyFont: font, boxPadding: 4,
          callbacks: { label: (c) => ` ${c.dataset.label}: ${fmt(c.parsed[horizontal ? "x" : "y"])}` },
        },
      },
      scales: {
        x: { stacked, grid: { display: horizontal, color: grid, drawTicks: false }, border: { display: false }, ticks: { color: ink, font, padding: 6, autoSkipPadding: 10, ...(horizontal ? { callback: (v) => Number(v).toLocaleString("th-TH"), precision: money ? undefined : 0 } : { maxRotation: 0 }) } },
        y: { stacked, beginAtZero: true, grid: { display: !horizontal, color: grid, drawTicks: false }, border: { display: false },
             ticks: { color: ink, font, padding: 8, ...(horizontal ? {} : { maxTicksLimit: 6, callback: (v) => Number(v).toLocaleString("th-TH") }) } },
      },
    },
  });
  live.add(chart);
  return chart;
}

export const legend = (items) => `<div class="legend">${items.map(([label, color]) => `<span><i style="background:${color}"></i>${label}</span>`).join("")}</div>`;
