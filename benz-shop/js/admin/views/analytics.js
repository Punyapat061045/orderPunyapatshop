import { A, revenueBetween, productSalesBetween, periodKeys, lastNMonths } from "../state.js";
import { esc, baht, fmtNum, dateKey, addDays, startOfWeek, parseKey, fmtDate, thMonth, monthKey } from "../../common.js";
import { kpi, I } from "../ui.js";
import { makeChart, SERIES } from "../charts.js";

const V = { range: "month" };

export default {
  deps: ["daily"],
  render(el) {
    const P = periodKeys();
    const ranges = { week: ["สัปดาห์นี้", P.week], month: ["เดือนนี้", P.month], year: ["ปีนี้", P.year], last30: ["30 วันล่าสุด", [dateKey(addDays(new Date(), -29)), P.today[1]]] };
    const [rLabel, [ra, rb]] = ranges[V.range];
    const tops = productSalesBetween(ra, rb);
    const { rev, orders } = revenueBetween(ra, rb);
    const units = tops.reduce((s, t) => s + t.qty, 0);
    const best = tops[0];
    const bestRev = tops.slice().sort((a, b) => b.revenue - a.revenue)[0];

    const d30 = [...Array(30)].map((_, i) => dateKey(addDays(new Date(), i - 29)));
    const wk0 = startOfWeek();
    const weeks = [...Array(12)].map((_, i) => addDays(wk0, (i - 11) * 7));
    const weekRev = weeks.map((w) => revenueBetween(dateKey(w), dateKey(addDays(w, 6))).rev);
    const months = lastNMonths(12);
    const monRev = months.map((m) => revenueBetween(m + "-01", m + "-31").rev);
    const S = SERIES();

    el.innerHTML = `
      <div class="chips">${Object.entries(ranges).map(([k, [l]]) => `<button class="chip ${V.range === k ? "active" : ""}" data-r="${k}">${l}</button>`).join("")}</div>
      <div class="kpis">
        ${kpi({ label: `ยอดขาย${rLabel}`, value: fmtNum(rev), unit: "บาท", tone: "t-mint", icon: I.cash })}
        ${kpi({ label: "ออเดอร์สำเร็จ", value: fmtNum(orders), unit: "ออเดอร์", sub: `เฉลี่ย ${baht(orders ? rev / orders : 0)} / ออเดอร์`, tone: "t-sky", icon: I.receipt })}
        ${kpi({ label: "จำนวนที่ขายได้", value: fmtNum(units), unit: "ชิ้น", tone: "t-lilac", icon: I.menu })}
        ${kpi({ label: "เมนูขายดีที่สุด", value: best ? esc(best.name) : "–", sub: best ? `${fmtNum(best.qty)} ชิ้น${bestRev && bestRev.pid !== best.pid ? ` · ทำเงินสูงสุด: ${esc(bestRev.name)}` : ` · ${baht(best.revenue)}`}` : "ยังไม่มียอดขาย", tone: "t-pink", icon: I.trend })}
      </div>
      <div class="grid-2e">
        <section class="card"><div class="card-head"><h3 class="card-title">ยอดขายรายวัน (30 วัน)</h3></div>
          <div class="chart-box"><canvas id="cd" role="img" aria-label="ยอดขายรายวัน 30 วัน"></canvas></div></section>
        <section class="card"><div class="card-head"><h3 class="card-title">ยอดขายรายสัปดาห์ (12 สัปดาห์)</h3></div>
          <div class="chart-box"><canvas id="cw" role="img" aria-label="ยอดขายรายสัปดาห์"></canvas></div></section>
        <section class="card"><div class="card-head"><h3 class="card-title">แนวโน้มยอดขายรายเดือน</h3></div>
          <div class="chart-box"><canvas id="cm" role="img" aria-label="ยอดขายรายเดือน 12 เดือน"></canvas></div></section>
        <section class="card"><div class="card-head"><h3 class="card-title">เมนูขายดี · ${rLabel}</h3><span class="muted small">จำนวนชิ้น</span></div>
          ${tops.length ? `<div class="chart-box"><canvas id="ct" role="img" aria-label="เมนูขายดี"></canvas></div>` : `<div class="empty"><p>ยังไม่มียอดขายในช่วงนี้</p></div>`}</section>
      </div>
      ${tops.length ? `<section class="card"><div class="card-head"><h3 class="card-title">ยอดขายแยกตามเมนู · ${rLabel}</h3></div>
        <div class="table-wrap"><table class="tbl"><thead><tr><th>#</th><th>เมนู</th><th class="r">จำนวน</th><th class="r">ยอดขาย</th><th class="r">สัดส่วน</th></tr></thead>
        <tbody>${tops.map((t, i) => `<tr><td>${i + 1}</td><td><b>${esc(t.name)}</b></td><td class="r">${fmtNum(t.qty)}</td><td class="r">${baht(t.revenue)}</td><td class="r">${rev ? fmtNum((t.revenue / rev) * 100, 1) : 0}%</td></tr>`).join("")}</tbody></table></div></section>` : ""}
      <p class="muted small">ข้อมูลนับจากออเดอร์ที่สถานะ "สำเร็จ" เท่านั้น โดยนับตามวันที่ส่ง</p>`;

    el.querySelectorAll("[data-r]").forEach((b) => b.onclick = () => { V.range = b.dataset.r; this.render(el); });
    makeChart(el.querySelector("#cd"), { labels: d30.map((k) => fmtDate(parseKey(k), { day: "numeric", month: "short" })), datasets: [{ label: "ยอดขาย", data: d30.map((k) => A.daily[k]?.revenue || 0), color: S.rev }] });
    makeChart(el.querySelector("#cw"), { labels: weeks.map((w) => fmtDate(w, { day: "numeric", month: "short" })), datasets: [{ label: "ยอดขายสัปดาห์เริ่ม", data: weekRev, color: S.rev }] });
    makeChart(el.querySelector("#cm"), { labels: months.map(thMonth), datasets: [{ label: "ยอดขาย", data: monRev, color: S.rev, type: "line" }] });
    if (tops.length) makeChart(el.querySelector("#ct"), { labels: tops.slice(0, 8).map((t) => t.name), datasets: [{ label: "จำนวน", data: tops.slice(0, 8).map((t) => t.qty), color: S.rev }], horizontal: true, money: false });
  },
};
