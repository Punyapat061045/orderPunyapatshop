import { A, isOwner, isLow, revenueBetween, expensesBetween, periodKeys, productSalesBetween } from "../state.js";
import { STATUS, esc, baht, dateKey, addDays, fmtTime, fmtNum, parseKey, fmtDate, fmtDelivery } from "../../common.js";
import { kpi, I } from "../ui.js";
import { makeChart, SERIES } from "../charts.js";
import { openOrder, quickStatusButtons, bindQuick } from "./orders.js";
import { openSeed } from "./settings.js";

const minsAgo = (o) => { const d = o.createdAt?.toDate?.(); return d ? Math.max(0, Math.round((Date.now() - d) / 60000)) : 0; };

export default {
  deps: ["orders", "daily", "expenses", "inventory", "products", "settings", "tick"],
  render(el) {
    const today = dateKey(), tomorrow = dateKey(addDays(new Date(), 1));
    const newToday = A.orders.filter((o) => o.dateKey === today && o.status !== "cancelled");
    const dueTomorrow = A.orders.filter((o) => o.deliveryDate === tomorrow && o.status !== "cancelled");
    const dueToday = A.orders.filter((o) => o.deliveryDate === today && o.status !== "cancelled");
    const pending = A.orders.filter((o) => o.status === "pending");
    const preparing = A.orders.filter((o) => o.status === "preparing" || o.status === "ready");
    const completedToday = dueToday.filter((o) => o.status === "completed");
    const low = A.inventory.filter(isLow);
    const slips = A.orders.filter((o) => o.paymentStatus === "slip" && o.status !== "cancelled");
    const P = periodKeys();
    const revToday = revenueBetween(...P.today).rev;
    const revMonth = revenueBetween(...P.month).rev;
    const profitMonth = revMonth - expensesBetween(...P.month);
    const needsSeed = isOwner() && A.loaded.products && A.products.length === 0;

    const k = [];
    let d = 0;
    k.push(kpi({ label: "ออเดอร์ใหม่วันนี้", value: newToday.length, unit: "ออเดอร์", sub: "สั่งเข้ามาวันนี้ (ทุกวันส่ง)", tone: "t-pink", icon: I.receipt, delay: d += 30 }));
    k.push(kpi({ label: "ต้องส่งพรุ่งนี้", value: dueTomorrow.length, unit: "ออเดอร์", sub: `${fmtNum(dueTomorrow.reduce((s, o) => s + (o.itemCount || 0), 0))} ชิ้น`, tone: "t-sky", icon: I.chef, delay: d += 30 }));
    if (isOwner()) {
      k.push(kpi({ label: "ยอดขายวันนี้", value: fmtNum(revToday), unit: "บาท", sub: "ออเดอร์ที่ส่งสำเร็จวันนี้", tone: "t-mint", icon: I.cash, delay: d += 30 }));
      k.push(kpi({ label: "ยอดขายเดือนนี้", value: fmtNum(revMonth), unit: "บาท", sub: new Date().toLocaleDateString("th-TH", { month: "long", year: "numeric" }), tone: "t-sky", icon: I.trend, delay: d += 30 }));
      k.push(kpi({ label: "กำไรเดือนนี้", value: `<span class="${profitMonth < 0 ? "neg" : ""}">${fmtNum(profitMonth)}</span>`, unit: "บาท", sub: "ยอดขาย − รายจ่าย", tone: "t-lilac", icon: I.wallet, delay: d += 30 }));
    }
    k.push(kpi({ label: "สลิปรอตรวจ", value: slips.length, unit: "ออเดอร์", sub: slips.length ? `<a href="#orders">ไปตรวจสลิป</a>` : "ไม่มีค้าง", tone: "t-sky", icon: I.cash, alert: slips.length > 0, delay: d += 30 }));
    k.push(kpi({ label: "รอดำเนินการ", value: pending.length, unit: "ออเดอร์", sub: `กำลังทำ/รอรับ ${preparing.length}`, tone: "t-butter", icon: I.clock, alert: pending.length > 0, delay: d += 30 }));
    k.push(kpi({ label: "ส่งสำเร็จวันนี้", value: completedToday.length, unit: `/ ${dueToday.length}`, sub: "ออเดอร์ที่ต้องส่งวันนี้", tone: "t-mint", icon: I.check, delay: d += 30 }));
    k.push(kpi({ label: "วัตถุดิบใกล้หมด", value: low.length, unit: "รายการ", sub: low.slice(0, 3).map((i) => esc(i.name)).join(", ") || "สต็อกปกติ", tone: "t-red", icon: I.alert, alert: low.length > 0, delay: d += 30 }));

    const queue = A.orders.filter((o) => o.status === "pending").slice(0, 8);

    // 14-day revenue
    const days = [...Array(14)].map((_, i) => dateKey(addDays(new Date(), i - 13)));
    const top = isOwner() ? productSalesBetween(P.month[0], P.month[1]).slice(0, 5) : [];
    const topMax = Math.max(1, ...top.map((t) => t.qty));

    el.innerHTML = `
      ${needsSeed ? `<div class="banner warn"><div class="grow"><b>เริ่มต้นใช้งานร้าน</b><br><span class="small">ยังไม่มีเมนูในระบบ กดปุ่มเพื่อสร้างเมนูเริ่มต้น 6 เมนู (สุกี้โรล, กรีกโยเกิร์ตเปล่า, กรีกพาย 4 แบบ) และรายการวัตถุดิบ 8 รายการ</span></div><button class="btn primary" id="seedBtn">สร้างข้อมูลเริ่มต้น</button></div>` : ""}
      ${A.settings.orderingOpen === false ? `<div class="banner warn"><b>ตอนนี้ปิดรับออเดอร์อยู่</b><span class="small grow">ลูกค้าดูเมนูได้แต่สั่งไม่ได้</span>${isOwner() ? `<a class="btn sm" href="#settings">เปิดรับออเดอร์</a>` : ""}</div>` : ""}
      <div class="kpis">${k.join("")}</div>
      <div class="${isOwner() ? "grid-2" : ""}">
        <section class="card">
          <div class="card-head"><h3 class="card-title">ออเดอร์ใหม่ที่ยังไม่รับ</h3><a class="btn sm" href="#prep">${I.chef} เตรียม & ส่งของ</a></div>
          ${queue.length ? `<div class="list">${queue.map((o) => `
            <div class="list-item">
              <button class="btn ghost sm o-no" data-open="${o.id}">#${esc(o.orderNo)}</button>
              <div class="grow"><b>${esc(o.customerName)}</b> <span class="muted small">ส่ง ${esc(fmtDelivery(o.deliveryDate))} · ${esc(o.deliveryPoint || "")}</span><br>
                <span class="small muted">${esc(o.items.map((i) => `${i.name} ×${i.qty}`).join(", "))}</span></div>
              <span class="pill s-${o.status}">${STATUS[o.status].label}</span>
              ${quickStatusButtons(o)}
            </div>`).join("")}</div>` : `<div class="empty"><p>ไม่มีออเดอร์ใหม่ค้างรับ</p></div>`}
        </section>
        ${isOwner() ? `<section class="card">
          <div class="card-head"><h3 class="card-title">เมนูขายดีเดือนนี้</h3><a class="btn sm ghost" href="#analytics">ดูทั้งหมด</a></div>
          ${top.length ? `<div class="list">${top.map((t, i) => `
            <div class="list-item"><span class="rank">${i + 1}</span>
              <div class="grow"><div class="row between"><b>${esc(t.name)}</b><span class="num small">${fmtNum(t.qty)} ชิ้น · ${baht(t.revenue)}</span></div>
              <div class="bar-track"><span style="width:${(t.qty / topMax) * 100}%"></span></div></div></div>`).join("")}</div>`
            : `<div class="empty"><p>ยังไม่มียอดขายเดือนนี้</p></div>`}
        </section>` : ""}
      </div>
      ${isOwner() ? `<section class="card">
        <div class="card-head"><h3 class="card-title">ยอดขาย 14 วันล่าสุด</h3><span class="muted small">รวม ${baht(days.reduce((s, k) => s + (A.daily[k]?.revenue || 0), 0))}</span></div>
        <div class="chart-box"><canvas id="c14" role="img" aria-label="กราฟยอดขาย 14 วันล่าสุด"></canvas></div>
      </section>` : ""}
      ${low.length ? `<section class="card">
        <div class="card-head"><h3 class="card-title">วัตถุดิบใกล้หมด</h3><a class="btn sm" href="#inventory">ไปที่สต็อก</a></div>
        <div class="list">${low.map((i) => `<div class="list-item"><div class="grow"><b>${esc(i.name)}</b></div>
          <span class="num">${fmtNum(i.stock)} ${esc(i.unit)}</span><span class="pill bad">ขั้นต่ำ ${fmtNum(i.minStock)}</span></div>`).join("")}</div>
      </section>` : ""}
    `;
    el.querySelectorAll("[data-open]").forEach((b) => b.onclick = () => openOrder(b.dataset.open));
    bindQuick(el);
    const seed = el.querySelector("#seedBtn"); if (seed) seed.onclick = openSeed;
    if (isOwner()) {
      makeChart(el.querySelector("#c14"), {
        labels: days.map((k) => fmtDate(parseKey(k), { day: "numeric", month: "short" })),
        datasets: [{ label: "ยอดขาย", data: days.map((k) => A.daily[k]?.revenue || 0), color: SERIES().rev }],
      });
    }
  },
};
