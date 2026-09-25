import { db, doc, getDoc, getDocs, deleteDoc, setDoc, collection, query, where, runTransaction, serverTimestamp } from "../../fb.js";
import { A, isOwner, setOrderStatus, setPayment, expectedTotal, liveFromKey } from "../state.js";
import { STATUS, STATUS_FLOW, PAY, PAY_METHOD, esc, baht, dateKey, addDays, fmtDelivery, fmtTime, fmtDate, fmtDateTime, toast, openModal, confirmDialog, unitPriceOf, resizeImage } from "../../common.js";
import { I, printHtml } from "../ui.js";
import { emit } from "../state.js";

const V = { date: dateKey(addDays(new Date(), 1)), status: "all", pay: "all", q: "", fetched: {}, loading: false };
const NEXT = { pending: ["preparing", "รับออเดอร์"], preparing: ["ready", "ทำเสร็จ"], ready: ["completed", "ส่งแล้ว"] };

export function quickStatusButtons(o) {
  const n = NEXT[o.status];
  return n ? `<button class="btn sm primary" data-adv="${o.id}" data-next="${n[0]}">${n[1]}</button>` : "";
}
export function bindQuick(root) {
  root.querySelectorAll("[data-adv]").forEach((b) => b.onclick = (e) => {
    e.stopPropagation(); b.disabled = true;
    changeStatus(b.dataset.adv, b.dataset.next).finally(() => { b.disabled = false; });
  });
}

export const payPill = (o) => o.paymentStatus ? `<span class="pill ${PAY[o.paymentStatus]?.cls || ""}">${PAY[o.paymentStatus]?.label || o.paymentStatus}</span>` : `<span class="pill warn">ยังไม่จ่าย</span>`;
export const itemText = (i) => `${i.name}${i.options?.length ? ` (${i.options.map((x) => x.name).join(", ")})` : ""} ×${i.qty}${i.forName ? ` [${i.forName}]` : ""}${i.note ? ` *${i.note}` : ""}`;

export async function changePayment(id, status, method) {
  try {
    await setPayment(id, status, method);
    toast(`การชำระเงิน: ${PAY[status].label}`, "ok", 1800);
    for (const list of Object.values(V.fetched)) { const o = list.find((x) => x.id === id); if (o) { o.paymentStatus = status; if (method) o.paymentMethod = method; } }
    emit("orders");
    return true;
  } catch (e) { console.error(e); toast("บันทึกไม่สำเร็จ", "bad"); return false; }
}

export async function changeStatus(id, next) {
  if (next === "cancelled" && !(await confirmDialog("ยกเลิกออเดอร์นี้?", { okText: "ยกเลิกออเดอร์", danger: true }))) return false;
  try {
    await setOrderStatus(id, next);
    toast(`เปลี่ยนสถานะเป็น "${STATUS[next].label}" แล้ว`, "ok", 1800);
    // อัปเดตข้อมูลในหน้าย้อนหลังที่โหลดไว้
    for (const list of Object.values(V.fetched)) { const o = list.find((x) => x.id === id); if (o) o.status = next; }
    return true;
  } catch (e) {
    console.error(e);
    toast("เปลี่ยนสถานะไม่สำเร็จ: " + (e.code === "permission-denied" ? "ไม่มีสิทธิ์" : e.message), "bad", 5000);
    return false;
  }
}

const isLiveDate = (k) => k >= liveFromKey();
function ordersForDate(k) {
  if (isLiveDate(k)) return A.orders.filter((o) => o.deliveryDate === k).sort((a, b) => (a.seq || 0) - (b.seq || 0));
  return V.fetched[k] || null;
}
async function fetchDate(k) {
  V.loading = true;
  try {
    const s = await getDocs(query(collection(db, "orders"), where("deliveryDate", "==", k)));
    V.fetched[k] = s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.seq || 0) - (b.seq || 0));
  } catch (e) { console.error(e); toast("โหลดออเดอร์ไม่สำเร็จ", "bad"); V.fetched[k] = []; }
  V.loading = false; emit("orders");
}

export default {
  deps: ["orders", "products"],
  render(el) {
    let list = ordersForDate(V.date);
    if (!list && !V.loading) fetchDate(V.date);
    const all = list || [];
    const counts = { all: all.length };
    Object.keys(STATUS).forEach((s) => counts[s] = all.filter((o) => o.status === s).length);
    const q = V.q.toLowerCase();
    const payOf = (o) => o.paymentStatus || "unpaid";
    const pcounts = Object.fromEntries(Object.keys(PAY).map((k) => [k, all.filter((o) => o.status !== "cancelled" && payOf(o) === k).length]));
    const shown = all.filter((o) => (V.status === "all" || o.status === V.status) && (V.pay === "all" || (payOf(o) === V.pay && o.status !== "cancelled"))
      && (!q || o.customerName.toLowerCase().includes(q) || String(o.orderNo).includes(q) || (o.deliveryPoint || "").toLowerCase().includes(q) || (o.phone || "").includes(q)));
    const sum = all.filter((o) => o.status === "completed").reduce((s, o) => s + o.total, 0);

    el.innerHTML = `
      <section class="card">
        <div class="toolbar" style="margin-bottom:14px">
          <span class="small muted" style="font-weight:600">วันที่ส่ง</span>
          <button class="chip ${V.date === dateKey() ? "active" : ""}" data-day="0">วันนี้</button>
          <button class="chip ${V.date === dateKey(addDays(new Date(), 1)) ? "active" : ""}" data-day="1">พรุ่งนี้</button>
          <input class="input" type="date" id="oDate" value="${V.date}" aria-label="วันที่ส่ง">
          <input class="input grow" id="oSearch" placeholder="ค้นหาชื่อ / เลขที่ / จุดส่ง / เบอร์" value="${esc(V.q)}" style="flex:1 1 200px">
          <span class="muted small">ยอดสำเร็จ <b class="num" style="color:var(--ink)">${baht(sum)}</b></span>
          <button class="btn primary sm" id="newOrder">${I.plus} เพิ่มออเดอร์</button>
        </div>
        <div class="chips" style="margin-bottom:14px">
          <button class="chip ${V.status === "all" ? "active" : ""}" data-st="all">ทั้งหมด <span class="n">${counts.all}</span></button>
          ${Object.entries(STATUS).map(([k, v]) => `<button class="chip ${V.status === k ? "active" : ""}" data-st="${k}">${v.label} <span class="n">${counts[k]}</span></button>`).join("")}
        </div>
        <div class="chips" style="margin-bottom:14px">
          <span class="small muted" style="font-weight:600;align-self:center">การชำระเงิน</span>
          <button class="chip ${V.pay === "all" ? "active" : ""}" data-pay="all">ทั้งหมด</button>
          ${Object.entries(PAY).map(([k, v]) => `<button class="chip ${V.pay === k ? "active" : ""}" data-pay="${k}">${v.label} <span class="n">${pcounts[k]}</span></button>`).join("")}
        </div>
        ${!list ? `<div class="spinner"></div>` : shown.length ? `
        <div class="table-wrap"><table class="tbl">
          <thead><tr><th>เลขที่</th><th>ลูกค้า</th><th>ส่งที่</th><th>สั่งเมื่อ</th><th>รายการ</th><th class="r">ยอดรวม</th><th>ชำระเงิน</th><th>สถานะ</th><th></th></tr></thead>
          <tbody>${shown.map((o) => `
            <tr data-row="${o.id}">
              <td><span class="o-no num">#${esc(o.orderNo)}</span></td>
              <td><b>${esc(o.customerName)}</b>${o.phone ? `<br><span class="muted small">${esc(o.phone)}</span>` : ""}</td>
              <td class="small">${esc(o.deliveryPoint || "–")}</td>
              <td class="num small">${fmtDate(o.createdAt, { day: "numeric", month: "short" })}<br>${fmtTime(o.createdAt)}</td>
              <td class="o-items">${esc(o.items.map((i) => `${i.name} ×${i.qty}${i.forName ? ` (${i.forName})` : ""}`).join(", "))}${o.source === "admin" ? ` <span class="pill s-cancelled" style="font-size:11px">ร้านเพิ่มเอง</span>` : ""}</td>
              <td class="r"><b>${baht(o.total)}</b></td>
              <td><select class="status-sel pay-${payOf(o)}" data-psel="${o.id}" aria-label="การชำระเงิน #${esc(o.orderNo)}">
                ${Object.entries(PAY).map(([k, v]) => `<option value="${k}" ${k === payOf(o) ? "selected" : ""}>${v.label}</option>`).join("")}
              </select></td>
              <td><select class="status-sel s-${o.status}" data-sel="${o.id}" aria-label="สถานะออเดอร์ #${esc(o.orderNo)}">
                ${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${k === o.status ? "selected" : ""}>${v.label}</option>`).join("")}
              </select></td>
              <td><button class="btn sm" data-open="${o.id}">รายละเอียด</button></td>
            </tr>`).join("")}</tbody>
        </table></div>` : `<div class="empty"><p>ไม่มีออเดอร์${V.status !== "all" ? "ในสถานะนี้" : `ที่ต้องส่ง ${fmtDelivery(V.date)}`}</p></div>`}
      </section>`;

    el.querySelector("#oDate").onchange = (e) => { V.date = e.target.value || dateKey(); this.render(el); };
    el.querySelectorAll("[data-day]").forEach((b) => b.onclick = () => { V.date = dateKey(addDays(new Date(), +b.dataset.day)); this.render(el); });
    const s = el.querySelector("#oSearch");
    s.oninput = () => { V.q = s.value; const pos = s.selectionStart; this.render(el); const n = el.querySelector("#oSearch"); n.focus(); n.setSelectionRange(pos, pos); };
    el.querySelectorAll("[data-st]").forEach((b) => b.onclick = () => { V.status = b.dataset.st; this.render(el); });
    el.querySelectorAll("[data-pay]").forEach((b) => b.onclick = () => { V.pay = b.dataset.pay; this.render(el); });
    el.querySelector("#newOrder").onclick = () => openNewOrder(V.date >= dateKey() ? V.date : dateKey(addDays(new Date(), 1)));
    el.querySelectorAll("[data-psel]").forEach((sel) => sel.onchange = async () => {
      const o = all.find((x) => x.id === sel.dataset.psel);
      if (sel.value === "slip") { toast('สถานะ "รอตรวจ" ใช้เมื่อลูกค้าแนบสลิปเท่านั้น', "bad"); sel.value = o.paymentStatus || "unpaid"; return; }
      const ok = await changePayment(o.id, sel.value);
      if (!ok) sel.value = o.paymentStatus || "unpaid";
    });
    el.querySelectorAll("[data-open]").forEach((b) => b.onclick = () => openOrder(b.dataset.open));
    el.querySelectorAll("[data-sel]").forEach((sel) => sel.onchange = async () => {
      const o = all.find((x) => x.id === sel.dataset.sel);
      const ok = await changeStatus(sel.dataset.sel, sel.value);
      if (!ok) sel.value = o.status;
      else if (!isLiveDate(V.date)) this.render(el);
    });
  },
};

// ---------------- order detail ----------------
export async function openOrder(id) {
  let o = A.orders.find((x) => x.id === id) || Object.values(V.fetched).flat().find((x) => x.id === id);
  if (!o) {
    const s = await getDoc(doc(db, "orders", id));
    if (!s.exists()) return toast("ไม่พบออเดอร์", "bad");
    o = { id: s.id, ...s.data() };
  }
  const exp = expectedTotal(o);
  const mismatch = exp !== null && Math.abs(exp - o.total) > 0.001;
  const m = openModal(`
    <div class="modal-head">
      <div class="grow"><h3>ออเดอร์ #${esc(o.orderNo)}</h3><p class="muted small">สั่งเมื่อ ${fmtDateTime(o.createdAt)}</p></div>
      <span class="pill s-${o.status}">${STATUS[o.status].label}</span>
      <button class="btn icon ghost" data-close aria-label="ปิด">${I.x}</button>
    </div>
    <div class="stack" style="gap:6px">
      <div class="kv"><span>ลูกค้า</span><b>${esc(o.customerName)}</b></div>
      ${o.phone ? `<div class="kv"><span>เบอร์โทร</span><b>${esc(o.phone)}</b></div>` : ""}
      ${o.deliveryDate ? `<div class="kv"><span>วันที่ส่ง</span><b>${esc(fmtDelivery(o.deliveryDate))}</b></div>` : ""}
      ${o.deliveryPoint ? `<div class="kv"><span>ส่งที่</span><b style="text-align:right">${esc(o.deliveryPoint)}</b></div>` : ""}
      <div class="kv"><span>สต็อก</span><span>${o.stockDeducted ? "ตัดสต็อกแล้ว" : "ยังไม่ตัด (ตัดเมื่อสถานะ สำเร็จ)"}</span></div>
      ${o.source === "admin" ? `<div class="kv"><span>ที่มา</span><span>ร้านเพิ่มเอง</span></div>` : ""}
    </div>
    <div class="box" style="margin-top:14px">
      <div class="row between"><b>การชำระเงิน</b>${payPill(o)}</div>
      <div class="kv"><span>วิธีจ่าย</span><span>${esc(PAY_METHOD[o.paymentMethod] || "–")}</span></div>
      <div id="slipBox">${o.paymentStatus === "slip" || o.slipAt ? `<div class="spinner" style="margin:10px auto"></div>` : ""}</div>
      <div class="row">
        ${o.paymentStatus !== "paid" ? `<button class="btn primary sm" data-pay="paid:${o.paymentMethod === "cash" ? "cash" : "transfer"}">${I.check} ยืนยันรับเงินแล้ว</button>
          <button class="btn sm" data-pay="paid:cash">รับเงินสดแล้ว</button>` : ""}
        ${o.paymentStatus !== "unpaid" ? `<button class="btn ghost sm" data-pay="unpaid:">${o.paymentStatus === "slip" ? "สลิปไม่ถูกต้อง / ยังไม่จ่าย" : "เปลี่ยนเป็นยังไม่จ่าย"}</button>` : ""}
        <label class="btn ghost sm">แนบสลิปแทนลูกค้า<input type="file" accept="image/*" id="adminSlip" hidden></label>
      </div>
    </div>
    <div style="margin-top:14px;border-top:1px dashed var(--line);padding-top:10px" class="stack">
      ${o.items.map((it) => `<div class="kv"><span style="color:var(--ink)"><b>${esc(it.name)}</b> ×${it.qty}${it.forName ? ` <span class="pill s-ready" style="font-size:11px">${esc(it.forName)}</span>` : ""}
        ${it.options?.length ? `<br><small class="muted">${esc(it.options.map((x) => `${x.group}: ${x.name}${x.price ? ` (+${x.price})` : ""}`).join(" · "))}</small>` : ""}
        ${it.note ? `<br><small style="color:var(--danger)">หมายเหตุ: ${esc(it.note)}</small>` : ""}</span>
        <b class="num">${baht(it.lineTotal)}</b></div>`).join("")}
      <div class="sum-total"><span>ยอดรวม</span><span class="num">${baht(o.total)}</span></div>
      ${mismatch ? `<div class="banner warn small">${I.alert}<span class="grow">ยอดรวมไม่ตรงกับราคาเมนูปัจจุบัน (ควรเป็น ${baht(exp)}) อาจเพราะเปลี่ยนราคาหลังลูกค้าสั่ง กรุณาตรวจสอบก่อนรับเงิน</span></div>` : ""}
    </div>
    <p class="small muted" style="margin:16px 0 8px">เปลี่ยนสถานะ</p>
    <div class="chips">${[...STATUS_FLOW, "cancelled"].map((s) => `<button class="chip ${s === o.status ? "active" : ""}" data-to="${s}">${STATUS[s].label}</button>`).join("")}</div>
    <div class="modal-foot">
      ${isOwner() ? `<button class="btn danger sm" data-del>${I.trash} ลบออเดอร์</button>` : ""}
      <button class="btn" data-print>${I.print} พิมพ์ใบเสร็จ</button>
      <button class="btn primary" data-close>เสร็จ</button>
    </div>`);
  m.el.querySelectorAll("[data-to]").forEach((b) => b.onclick = async () => {
    if (b.dataset.to === o.status) return;
    if (await changeStatus(o.id, b.dataset.to)) { m.close(); }
  });
  m.el.querySelector("[data-print]").onclick = () => printReceipt(o);
  m.el.querySelectorAll("[data-pay]").forEach((b) => b.onclick = async () => {
    const [st, method] = b.dataset.pay.split(":");
    if (await changePayment(o.id, st, method || undefined)) m.close();
  });
  const box = m.el.querySelector("#slipBox");
  if (box.innerHTML) {
    getDoc(doc(db, "slips", o.id)).then((sd) => {
      box.innerHTML = sd.exists() ? `<a href="#" id="slipBig"><img src="${sd.data().image}" alt="สลิป" style="max-height:340px;border-radius:12px;margin:8px auto"></a><p class="small muted" style="text-align:center">แตะรูปเพื่อดูเต็มจอ · ตรวจยอด ${baht(o.total)} และชื่อบัญชีปลายทาง</p>` : `<p class="small muted">ไม่พบรูปสลิป</p>`;
      const big = box.querySelector("#slipBig");
      if (big) big.onclick = (e) => { e.preventDefault(); openModal(`<img src="${sd.data().image}" alt="สลิป" style="width:100%;border-radius:12px"><div class="modal-foot"><button class="btn primary" data-close>ปิด</button></div>`); };
    }).catch(() => { box.innerHTML = `<p class="small muted">โหลดสลิปไม่สำเร็จ</p>`; });
  }
  m.el.querySelector("#adminSlip").onchange = async (e) => {
    try {
      const img = await resizeImage(e.target.files[0], 1100, 0.72);
      await setDoc(doc(db, "slips", o.id), { image: img, createdAt: serverTimestamp() });
      await changePayment(o.id, "paid", "transfer");
      m.close();
    } catch (err) { console.error(err); toast("แนบสลิปไม่สำเร็จ", "bad"); }
  };
  const del = m.el.querySelector("[data-del]");
  if (del) del.onclick = async () => {
    if (o.stockDeducted || o.revenueCounted) return toast("เปลี่ยนสถานะเป็น ยกเลิก ก่อนลบ (เพื่อคืนสต็อกและยอดขาย)", "bad", 5000);
    if (!(await confirmDialog(`ลบออเดอร์ #${o.orderNo} ถาวร?`, { okText: "ลบ", danger: true }))) return;
    try { await deleteDoc(doc(db, "orders", o.id)); for (const k in V.fetched) V.fetched[k] = V.fetched[k].filter((x) => x.id !== o.id); toast("ลบแล้ว", "ok"); m.close(); emit("orders"); }
    catch (e) { toast("ลบไม่สำเร็จ", "bad"); }
  };
}

export function printReceipt(o) {
  const st = A.settings;
  printHtml(`<div class="receipt">
    <h2>${esc(st.shopName)}</h2>
    ${st.address ? `<div style="text-align:center">${esc(st.address)}</div>` : ""}
    ${st.phone ? `<div style="text-align:center">โทร ${esc(st.phone)}</div>` : ""}
    <div class="line"></div>
    <div>ออเดอร์ #${esc(o.orderNo)} · ${esc(o.customerName)}${o.phone ? ` · ${esc(o.phone)}` : ""}</div>
    ${o.deliveryDate ? `<div>ส่ง ${esc(fmtDelivery(o.deliveryDate))}${o.deliveryPoint ? ` · ${esc(o.deliveryPoint)}` : ""}</div>` : ""}
    <div>สั่งเมื่อ ${fmtDate(o.createdAt, { day: "numeric", month: "short", year: "numeric" })} ${fmtTime(o.createdAt)}</div>
    <div class="line"></div>
    <table>${o.items.map((it) => `<tr><td>${esc(it.name)} ×${it.qty}${it.forName ? ` (${esc(it.forName)})` : ""}${it.options?.length ? `<br><small>${esc(it.options.map((x) => x.name).join(", "))}</small>` : ""}</td><td class="r">${baht(it.lineTotal, false)}</td></tr>`).join("")}</table>
    <div class="line"></div>
    <table><tr><td><b>รวมทั้งสิ้น</b></td><td class="r"><b>${baht(o.total)}</b></td></tr>
      <tr><td>การชำระเงิน</td><td class="r">${esc(PAY[o.paymentStatus || "unpaid"]?.label || "")}</td></tr></table>
    <div class="line"></div>
    <div style="text-align:center">ขอบคุณที่อุดหนุนค่ะ</div>
  </div>`);
}

// ---------------- เพิ่มออเดอร์เอง (ลูกค้าสั่งปากเปล่า) ----------------
export function openNewOrder(defaultDate) {
  const lines = [];
  let slip = "";
  const prods = A.products.slice();
  const m = openModal(`<div id="no"></div>`, { wide: true });
  const root = m.el.querySelector("#no");
  const optsFor = (p) => (p?.optionGroups || []).map((g) => g.type === "multi"
    ? `<div class="field"><span>${esc(g.name)}</span><div class="chips">${g.choices.map((c) => `<label class="chip"><input type="checkbox" data-mg="${g.id}" value="${c.id}"> ${esc(c.name)}${c.price ? ` +${c.price}` : ""}</label>`).join("")}</div></div>`
    : `<label class="field">${esc(g.name)}${g.required ? " *" : ""}<select class="input" data-sg="${g.id}">${g.required ? "" : `<option value="">— ไม่เลือก —</option>`}${g.choices.map((c) => `<option value="${c.id}">${esc(c.name)}${c.price ? ` (+${c.price})` : ""}</option>`).join("")}</select></label>`).join("");
  const total = () => lines.reduce((s, l) => s + l.lineTotal, 0);
  const draw = (keep = {}) => {
    root.innerHTML = `
      <div class="modal-head"><h3>เพิ่มออเดอร์ (ลูกค้าสั่งกับร้านโดยตรง)</h3><button class="btn icon ghost" data-close aria-label="ปิด">${I.x}</button></div>
      <div class="form-grid">
        <label class="field">ชื่อลูกค้า * <input class="input" id="n-name" maxlength="60" value="${esc(keep.name || "")}"></label>
        <label class="field">เบอร์โทร <input class="input" id="n-phone" maxlength="20" value="${esc(keep.phone || "")}"></label>
        <label class="field">วันที่ส่ง * <input class="input" type="date" id="n-date" value="${esc(keep.date || defaultDate)}"></label>
        <label class="field">ส่งที่ * <input class="input" id="n-point" maxlength="80" list="n-points" value="${esc(keep.point || "")}">
          <datalist id="n-points">${(A.settings.deliveryPoints || []).map((p) => `<option value="${esc(p)}">`).join("")}</datalist></label>
      </div>
      <div class="box" style="margin-top:16px">
        <b>รายการอาหาร</b>
        ${lines.length ? `<div class="list">${lines.map((l, i) => `<div class="list-item"><div class="grow"><b>${esc(l.name)}</b> ×${l.qty}${l.forName ? ` <span class="pill s-ready" style="font-size:11px">${esc(l.forName)}</span>` : ""}<br><span class="small muted">${esc(l.options.map((o) => o.name).join(" · "))}</span></div><b class="num">${baht(l.lineTotal)}</b><button class="btn icon ghost sm" data-rml="${i}" aria-label="ลบ">${I.x}</button></div>`).join("")}</div>
          <div class="sum-total"><span>ยอดรวม</span><span class="num">${baht(total())}</span></div>` : `<p class="muted small">ยังไม่มีรายการ</p>`}
        <div class="form-grid" style="background:var(--surface-2);border-radius:14px;padding:12px">
          <label class="field">เมนู <select class="input" id="n-prod">${prods.map((p) => `<option value="${p.id}">${esc(p.name)} (${p.price} บาท)${p.active === false ? " · หมด" : ""}</option>`).join("")}</select></label>
          <div id="n-opts" style="display:contents">${optsFor(prods[0])}</div>
          <label class="field">จำนวน <input class="input" type="number" min="1" max="99" id="n-qty" value="1"></label>
          <label class="field">สำหรับใคร (ถ้ามี) <input class="input" id="n-for" maxlength="30"></label>
          <label class="field">หมายเหตุ <input class="input" id="n-note" maxlength="80"></label>
          <div style="align-self:end"><button class="btn sm" id="n-add">${I.plus} เพิ่มรายการ</button></div>
        </div>
      </div>
      <div class="box" style="margin-top:16px">
        <b>การชำระเงิน</b>
        <div class="form-grid">
          <label class="field">สถานะ <select class="input" id="n-pay"><option value="unpaid">ยังไม่จ่าย</option><option value="paid" ${keep.pay === "paid" ? "selected" : ""}>จ่ายแล้ว</option></select></label>
          <label class="field">วิธีจ่าย <select class="input" id="n-method"><option value="cash">เงินสด</option><option value="transfer" ${keep.method === "transfer" ? "selected" : ""}>โอนเงิน</option></select></label>
          <label class="field">แนบสลิป (ถ้ามี) <input type="file" accept="image/*" id="n-slip" class="input"></label>
        </div>
        ${slip ? `<img src="${slip}" alt="สลิป" style="max-height:160px;border-radius:10px">` : ""}
      </div>
      <div class="modal-foot"><button class="btn ghost" data-close>ยกเลิก</button><button class="btn primary" id="n-save">บันทึกออเดอร์</button></div>`;
    const ps = root.querySelector("#n-prod");
    ps.onchange = () => { root.querySelector("#n-opts").innerHTML = optsFor(prods.find((p) => p.id === ps.value)); };
  };
  const snapshotForm = () => ({ name: root.querySelector("#n-name").value, phone: root.querySelector("#n-phone").value, date: root.querySelector("#n-date").value,
    point: root.querySelector("#n-point").value, pay: root.querySelector("#n-pay").value, method: root.querySelector("#n-method").value });
  root.addEventListener("click", async (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.id === "n-add") {
      const p = prods.find((x) => x.id === root.querySelector("#n-prod").value); if (!p) return;
      const options = [];
      for (const g of p.optionGroups || []) {
        const picks = g.type === "multi" ? [...root.querySelectorAll(`[data-mg="${g.id}"]:checked`)].map((x) => x.value) : [root.querySelector(`[data-sg="${g.id}"]`)?.value].filter(Boolean);
        if (g.required && !picks.length) return toast(`เลือก${g.name}ก่อน`, "bad");
        for (const cid of picks) { const c = g.choices.find((c) => c.id === cid); options.push({ groupId: g.id, group: g.name, choiceId: c.id, name: c.name, price: Number(c.price) || 0 }); }
      }
      const qty = Math.max(1, Math.min(99, Number(root.querySelector("#n-qty").value) || 1));
      const unitPrice = unitPriceOf(p.price, options);
      lines.push({ productId: p.id, name: p.name, unit: p.unit || "", basePrice: Number(p.price) || 0, options, unitPrice, qty, lineTotal: unitPrice * qty,
        note: root.querySelector("#n-note").value.trim(), forName: root.querySelector("#n-for").value.trim() });
      draw(snapshotForm());
    } else if (b.dataset.rml !== undefined) { lines.splice(+b.dataset.rml, 1); draw(snapshotForm()); }
    else if (b.id === "n-save") {
      const f = snapshotForm();
      if (!f.name.trim() || !f.date || !f.point.trim()) return toast("กรอกชื่อ วันที่ส่ง และที่ส่ง", "bad");
      if (!lines.length) return toast("เพิ่มรายการอาหารอย่างน้อย 1 รายการ", "bad");
      b.disabled = true;
      try {
        const ref = doc(collection(db, "orders"));
        await runTransaction(db, async (tx) => {
          const cRef = doc(db, "counters", f.date);
          const c = await tx.get(cRef);
          const seq = c.exists() ? (c.data().n || 0) + 1 : 1;
          if (c.exists()) tx.update(cRef, { n: seq }); else tx.set(cRef, { n: 1 });
          if (slip) tx.set(doc(db, "slips", ref.id), { image: slip, createdAt: serverTimestamp() });
          tx.set(ref, {
            customerName: f.name.trim(), phone: f.phone.trim(), deliveryDate: f.date, deliveryPoint: f.point.trim(), items: lines,
            itemCount: lines.reduce((s, l) => s + l.qty, 0), total: total(), status: "pending", seq, orderNo: String(seq).padStart(3, "0"),
            dateKey: dateKey(), createdAt: serverTimestamp(), updatedAt: serverTimestamp(), stockDeducted: false, revenueCounted: false, note: "",
            paymentStatus: f.pay, paymentMethod: f.method, source: "admin", createdBy: A.email,
            ...(f.pay === "paid" ? { paidAt: serverTimestamp(), paidBy: A.email } : {}), ...(slip ? { slipAt: serverTimestamp() } : {}),
          });
        });
        toast("เพิ่มออเดอร์แล้ว", "ok"); m.close();
        V.date = f.date; emit("orders");
      } catch (err) { console.error(err); toast("บันทึกไม่สำเร็จ", "bad"); b.disabled = false; }
    }
  });
  root.addEventListener("change", async (e) => {
    if (e.target.id !== "n-slip") return;
    try { slip = await resizeImage(e.target.files[0], 1100, 0.72); const f = snapshotForm(); draw({ ...f, pay: "paid", method: "transfer" }); }
    catch (err) { toast(err.message, "bad"); }
  });
  draw();
}
