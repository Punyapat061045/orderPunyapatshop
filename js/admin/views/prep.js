// เตรียมของ & ส่งของ: สรุปจำนวนที่ต้องทำ วัตถุดิบที่ต้องใช้ และรายการส่งแยกตามจุดส่ง
import { A, ingredientUsage, invById, liveFromKey } from "../state.js";
import { db, collection, query, where, getDocs } from "../../fb.js";
import { STATUS, esc, baht, fmtNum, dateKey, addDays, fmtDelivery, toast } from "../../common.js";
import { I, printHtml } from "../ui.js";
import { quickStatusButtons, bindQuick, openOrder, changeStatus, payPill, itemText, openNewOrder } from "./orders.js";
import { emit } from "../state.js";

const V = { date: dateKey(addDays(new Date(), 1)), fetched: {} };
const optText = (it) => (it.options || []).map((x) => x.name).join(" · ");

function ordersOf(k) {
  if (k >= liveFromKey()) return A.orders.filter((o) => o.deliveryDate === k);
  if (!V.fetched[k]) {
    V.fetched[k] = "loading";
    getDocs(query(collection(db, "orders"), where("deliveryDate", "==", k)))
      .then((s) => { V.fetched[k] = s.docs.map((d) => ({ id: d.id, ...d.data() })); emit("orders"); })
      .catch(() => { V.fetched[k] = []; toast("โหลดออเดอร์ไม่สำเร็จ", "bad"); emit("orders"); });
  }
  return V.fetched[k] === "loading" ? null : V.fetched[k];
}

export default {
  deps: ["orders", "inventory", "products"],
  render(el) {
    const all = ordersOf(V.date);
    const active = (all || []).filter((o) => o.status !== "cancelled").sort((a, b) => (a.seq || 0) - (b.seq || 0));
    // สรุปจำนวนที่ต้องทำ แยกเมนู + ตัวเลือก
    const lines = {};
    for (const o of active) for (const it of o.items) {
      const key = it.name + "|" + optText(it);
      lines[key] = lines[key] || { name: it.name, opt: optText(it), qty: 0, unit: it.unit || "" };
      lines[key].qty += it.qty;
    }
    const prodTotals = {};
    Object.values(lines).forEach((l) => prodTotals[l.name] = (prodTotals[l.name] || 0) + l.qty);
    // วัตถุดิบ (เฉพาะที่ยังไม่ตัดสต็อก)
    const need = {};
    for (const o of active) if (!o.stockDeducted) for (const [id, q] of Object.entries(ingredientUsage(o))) need[id] = (need[id] || 0) + q;
    // จุดส่ง
    const byPoint = {};
    for (const o of active) (byPoint[o.deliveryPoint || "ไม่ระบุ"] = byPoint[o.deliveryPoint || "ไม่ระบุ"] || []).push(o);
    const money = active.reduce((s, o) => s + o.total, 0);
    const paid = active.filter((o) => o.paymentStatus === "paid").reduce((s, o) => s + o.total, 0);
    const slipWait = active.filter((o) => o.paymentStatus === "slip").length;
    const counts = Object.fromEntries(Object.keys(STATUS).map((s) => [s, active.filter((o) => o.status === s).length]));

    el.innerHTML = `
      <div class="toolbar">
        <span class="small muted" style="font-weight:600">วันที่ส่ง</span>
        <button class="chip ${V.date === dateKey() ? "active" : ""}" data-day="0">วันนี้</button>
        <button class="chip ${V.date === dateKey(addDays(new Date(), 1)) ? "active" : ""}" data-day="1">พรุ่งนี้</button>
        <input class="input" type="date" id="pDate" value="${V.date}" aria-label="วันที่ส่ง">
        <span class="grow"></span>
        <button class="btn sm" id="addOrder">${I.plus} เพิ่มออเดอร์</button>
        <button class="btn sm" id="printSheet" ${active.length ? "" : "disabled"}>${I.print} พิมพ์ใบจัดส่ง</button>
      </div>
      ${!all ? `<div class="spinner"></div>` : !active.length ? `<section class="card empty"><p>ยังไม่มีออเดอร์ที่ต้องส่ง ${esc(fmtDelivery(V.date))}</p></section>` : `
      <div class="kpis">
        <div class="kpi"><span class="lbl">ออเดอร์ที่ต้องส่ง</span><div class="val">${active.length}<small>ออเดอร์</small></div><div class="sub">${esc(fmtDelivery(V.date))}</div></div>
        <div class="kpi"><span class="lbl">ยอดรวม</span><div class="val">${fmtNum(money)}<small>บาท</small></div><div class="sub">รับแล้ว ${fmtNum(paid)} · ต้องเก็บเพิ่ม ${fmtNum(money - paid)}</div></div>
        <div class="kpi ${slipWait ? "alert" : ""}"><span class="lbl">สลิปรอตรวจ</span><div class="val">${slipWait}<small>ออเดอร์</small></div><div class="sub">กดเลขออเดอร์เพื่อดูสลิป</div></div>
        <div class="kpi"><span class="lbl">ความคืบหน้า</span><div class="val">${counts.completed}/${active.length}<small>ส่งแล้ว</small></div>
          <div class="sub">รอ ${counts.pending} · ทำอยู่ ${counts.preparing} · พร้อมส่ง ${counts.ready}</div></div>
      </div>
      <div class="row">
        ${counts.pending ? `<button class="btn primary sm" data-bulk="pending:preparing">รับออเดอร์ทั้งหมด (${counts.pending})</button>` : ""}
        ${counts.preparing ? `<button class="btn primary sm" data-bulk="preparing:ready">ทำเสร็จทั้งหมด (${counts.preparing})</button>` : ""}
      </div>
      <div class="grid-2e">
        <section class="card">
          <div class="card-head"><h3 class="card-title">ต้องทำทั้งหมด</h3></div>
          <div class="list">${Object.entries(prodTotals).map(([n, q]) => `
            <div class="list-item" style="align-items:flex-start"><div class="grow"><b>${esc(n)}</b>
              ${Object.values(lines).filter((l) => l.name === n).map((l) => `<div class="row between small"><span class="muted">${esc(l.opt || "ปกติ")}</span><b class="num">${fmtNum(l.qty)}</b></div>`).join("")}</div>
              <span class="pill ok" style="font-size:14px">${fmtNum(q)} ${esc(Object.values(lines).find((l) => l.name === n)?.unit || "")}</span></div>`).join("")}</div>
        </section>
        <section class="card">
          <div class="card-head"><h3 class="card-title">วัตถุดิบที่ต้องใช้</h3><span class="muted small">เทียบกับสต็อก</span></div>
          ${Object.keys(need).length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>วัตถุดิบ</th><th class="r">ต้องใช้</th><th class="r">คงเหลือ</th><th></th></tr></thead><tbody>
            ${Object.entries(need).map(([id, q]) => { const i = invById(id); const short = (Number(i.stock) || 0) < q; return `<tr><td>${esc(i.name)}</td><td class="r">${fmtNum(q)} ${esc(i.unit)}</td><td class="r">${fmtNum(i.stock)}</td><td>${short ? `<span class="pill bad">ขาด ${fmtNum(q - i.stock)}</span>` : `<span class="pill ok">พอ</span>`}</td></tr>`; }).join("")}
          </tbody></table></div><p class="muted small" style="margin-top:8px">คำนวณจากสูตรในหน้าเมนู (เมนูที่ยังไม่ตั้งสูตรจะไม่ถูกนับ)</p>`
          : `<div class="empty"><p>ยังไม่มีสูตรวัตถุดิบ หรือตัดสต็อกครบแล้ว</p></div>`}
        </section>
      </div>
      ${Object.entries(byPoint).sort((a, b) => a[0].localeCompare(b[0], "th")).map(([pt, list]) => `
        <section class="card">
          <div class="card-head"><h3 class="card-title">ส่งที่: ${esc(pt)}</h3><span class="muted small">${list.length} ออเดอร์ · ${baht(list.reduce((s, o) => s + o.total, 0))}</span></div>
          <div class="list">${list.map((o) => `
            <div class="list-item">
              <button class="btn ghost sm o-no" data-open="${o.id}">#${esc(o.orderNo)}</button>
              <div class="grow"><b>${esc(o.customerName)}</b>${o.phone ? ` <span class="muted small">${esc(o.phone)}</span>` : ""}<br>
                <span class="small muted">${esc(o.items.map(itemText).join(", "))}</span></div>
              <b class="num">${baht(o.total)}</b>
              ${payPill(o)}
              <span class="pill s-${o.status}">${STATUS[o.status].label}</span>
              ${quickStatusButtons(o)}
            </div>`).join("")}</div>
        </section>`).join("")}`}`;

    el.querySelector("#pDate").onchange = (e) => { V.date = e.target.value || dateKey(); this.render(el); };
    el.querySelectorAll("[data-day]").forEach((b) => b.onclick = () => { V.date = dateKey(addDays(new Date(), +b.dataset.day)); this.render(el); });
    el.querySelectorAll("[data-open]").forEach((b) => b.onclick = () => openOrder(b.dataset.open));
    bindQuick(el);
    el.querySelectorAll("[data-bulk]").forEach((b) => b.onclick = async () => {
      const [from, to] = b.dataset.bulk.split(":");
      b.disabled = true;
      for (const o of active.filter((o) => o.status === from)) await changeStatus(o.id, to);
      if (V.fetched[V.date] && V.fetched[V.date] !== "loading") delete V.fetched[V.date];
      emit("orders");
    });
    el.querySelector("#addOrder").onclick = () => openNewOrder(V.date >= dateKey() ? V.date : dateKey(addDays(new Date(), 1)));
    const ps = el.querySelector("#printSheet");
    if (ps) ps.onclick = () => printHtml(`<div class="print-report">
      <h1>${esc(A.settings.shopName)} — ใบจัดส่ง ${esc(fmtDelivery(V.date))}</h1>
      <p>${active.length} ออเดอร์ · ยอดรวม ${baht(money)} · ต้องเก็บเงินเพิ่ม ${baht(money - paid)}</p>
      <h3>ต้องทำทั้งหมด</h3>
      <table><tr><th>เมนู</th><th>ตัวเลือก</th><th class="r">จำนวน</th></tr>
        ${Object.values(lines).map((l) => `<tr><td>${esc(l.name)}</td><td>${esc(l.opt)}</td><td class="r">${fmtNum(l.qty)}</td></tr>`).join("")}</table>
      ${Object.entries(byPoint).map(([pt, list]) => `<h3>ส่งที่: ${esc(pt)}</h3>
        <table><tr><th>✓</th><th>#</th><th>ลูกค้า</th><th>รายการ</th><th class="r">ยอด</th><th>เงิน</th></tr>
        ${list.map((o) => `<tr><td style="width:18px">☐</td><td>${esc(o.orderNo)}</td><td>${esc(o.customerName)}${o.phone ? `<br>${esc(o.phone)}` : ""}</td>
          <td>${esc(o.items.map(itemText).join(", "))}</td><td class="r">${fmtNum(o.total)}</td><td>${o.paymentStatus === "paid" ? "จ่ายแล้ว" : "<b>เก็บเงิน</b>"}</td></tr>`).join("")}</table>`).join("")}
    </div>`);
  },
};
