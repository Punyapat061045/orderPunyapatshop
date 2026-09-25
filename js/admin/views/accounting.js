import { db, doc, collection, setDoc, deleteDoc, serverTimestamp, increment, writeBatch } from "../../fb.js";
import { A, revenueBetween, expensesBetween, periodKeys, lastNMonths, invById, productSalesBetween, productById } from "../state.js";
import { esc, baht, fmtNum, dateKey, monthKey, thMonth, fmtDate, toast, openModal, confirmDialog, addDays } from "../../common.js";
import { I } from "../ui.js";
import { makeChart, SERIES, legend } from "../charts.js";

export const EXPENSE_CATS = ["วัตถุดิบ", "บรรจุภัณฑ์", "ค่าแก๊ส / ไฟ / น้ำ", "ค่าเช่า", "ค่าแรง", "ค่าขนส่ง", "การตลาด", "อุปกรณ์", "อื่น ๆ"];
const V = { month: monthKey(), costRange: "3m" };
export const GOODS_CATS = new Set(["วัตถุดิบ", "บรรจุภัณฑ์"]);

/**
 * ประมาณต้นทุนต่อเมนูจาก "ของที่ซื้อเข้า" เทียบ "ของที่ขายออก" ในช่วงเวลาเดียวกัน
 * - รายจ่ายที่ระบุเมนู: เฉลี่ยให้เฉพาะเมนูนั้น (ถ้าระบุหลายเมนู แบ่งตามสัดส่วนยอดขาย)
 * - รายจ่ายที่ไม่ระบุ (ใช้ร่วม): แบ่งให้ทุกเมนูที่ขายได้ตามสัดส่วนยอดขาย
 */
export function productCosts(fromKey, toKey) {
  const sales = productSalesBetween(fromKey, toKey);
  const rows = Object.fromEntries(sales.map((x) => [x.pid, { ...x, goods: 0, other: 0 }]));
  const unallocated = { goods: 0, other: 0, items: [] };
  for (const e of A.expenses.filter((e) => e.date >= fromKey && e.date <= toKey)) {
    const amt = Number(e.total) || 0; if (!amt) continue;
    const kind = GOODS_CATS.has(e.category) ? "goods" : "other";
    const tagged = e.forProducts || [];
    const targets = (tagged.length ? tagged : Object.keys(rows)).filter((pid) => rows[pid]);
    if (!targets.length) { unallocated[kind] += amt; unallocated.items.push(e); continue; }
    const base = targets.reduce((s, pid) => s + rows[pid].revenue, 0);
    const baseQ = targets.reduce((s, pid) => s + rows[pid].qty, 0);
    for (const pid of targets) rows[pid][kind] += amt * (base ? rows[pid].revenue / base : rows[pid].qty / baseQ);
  }
  return { rows: Object.values(rows).sort((a, b) => b.revenue - a.revenue), unallocated };
}

export function monthlyPL(months) {
  return months.map((m) => {
    const rev = revenueBetween(m + "-01", m + "-31").rev;
    const exp = expensesBetween(m + "-01", m + "-31");
    return { m, rev, exp, profit: rev - exp };
  });
}

export default {
  deps: ["daily", "expenses", "inventory"],
  render(el) {
    const P = periodKeys();
    const periods = [["วันนี้", P.today], ["สัปดาห์นี้", P.week], ["เดือนนี้", P.month], ["ปีนี้", P.year]].map(([label, [a, b]]) => {
      const rev = revenueBetween(a, b).rev, exp = expensesBetween(a, b);
      return { label, rev, exp, profit: rev - exp };
    });
    const months = lastNMonths(12);
    const pl = monthlyPL(months);
    const S = SERIES();
    const list = A.expenses.filter((e) => e.date.startsWith(V.month));
    const total = list.reduce((s, e) => s + (Number(e.total) || 0), 0);
    const byCat = {};
    list.forEach((e) => byCat[e.category] = (byCat[e.category] || 0) + (Number(e.total) || 0));

    el.innerHTML = `
      <div class="period">${periods.map((p) => `
        <div class="card">
          <span class="muted small" style="font-weight:600">${p.label}</span>
          <div class="kv"><span>รายรับ</span><b>${baht(p.rev)}</b></div>
          <div class="kv"><span>รายจ่าย</span><b>${baht(p.exp)}</b></div>
          <div class="kv" style="align-items:baseline;border-top:1px dashed var(--line);padding-top:8px"><span>กำไร</span><span class="profit num ${p.profit < 0 ? "neg" : ""}">${fmtNum(p.profit)} <small class="muted" style="font-size:13px">บาท</small></span></div>
        </div>`).join("")}</div>
      <p class="muted small">รายรับนับจากออเดอร์ที่สถานะ "สำเร็จ" ตามวันที่ส่ง · กำไร = รายรับ − รายจ่ายที่บันทึก (รวมค่าวัตถุดิบที่ซื้อ)</p>

      <section class="card">
        <div class="card-head"><h3 class="card-title">กำไร-ขาดทุน 12 เดือน</h3>${legend([["รายรับ", S.rev], ["รายจ่าย", S.exp], ["กำไร", S.pro]])}</div>
        <div class="chart-box"><canvas id="plc" role="img" aria-label="กราฟรายรับ รายจ่าย และกำไรรายเดือน"></canvas></div>
        <details style="margin-top:12px"><summary class="small muted" style="cursor:pointer">ดูเป็นตาราง</summary>
          <div class="table-wrap"><table class="tbl"><thead><tr><th>เดือน</th><th class="r">รายรับ</th><th class="r">รายจ่าย</th><th class="r">กำไร</th></tr></thead>
          <tbody>${pl.map((r) => `<tr><td>${thMonth(r.m)}</td><td class="r">${baht(r.rev)}</td><td class="r">${baht(r.exp)}</td><td class="r ${r.profit < 0 ? "neg" : ""}">${baht(r.profit)}</td></tr>`).join("")}</tbody></table></div>
        </details>
      </section>

      ${costSection()}

      <section class="card">
        <div class="card-head">
          <h3 class="card-title">รายจ่าย</h3>
          <select class="input" id="expMonth" style="width:auto" aria-label="เดือน">${months.slice().reverse().map((m) => `<option value="${m}" ${m === V.month ? "selected" : ""}>${thMonth(m)}</option>`).join("")}</select>
          <button class="btn primary sm" id="addExp">${I.plus} บันทึกรายจ่าย</button>
        </div>
        <div class="row" style="margin-bottom:12px;gap:8px">
          <span class="pill warn">รวม ${baht(total)}</span>
          ${Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([c, v]) => `<span class="chip" style="cursor:default;min-height:32px;padding:4px 12px">${esc(c)} <span class="n">${baht(v)}</span></span>`).join("")}
        </div>
        ${list.length ? `<div class="table-wrap"><table class="tbl">
          <thead><tr><th>วันที่</th><th>หมวด</th><th>รายการ</th><th class="r">จำนวน</th><th class="r">ราคา/หน่วย</th><th class="r">รวม</th><th>ร้านค้า</th><th>หมายเหตุ</th><th></th></tr></thead>
          <tbody>${list.map((e) => `<tr>
            <td class="num">${fmtDate(e.date)}</td><td>${esc(e.category)}</td><td><b>${esc(e.item)}</b>${(e.forProducts || []).length ? `<br><span class="small muted">ใช้กับ: ${esc(e.forProducts.map((id) => productById(id)?.name || "เมนูที่ลบแล้ว").join(", "))}</span>` : ""}${e.stock?.invId ? `<br><span class="pill ok" style="margin-top:2px">เข้าสต็อก ${fmtNum(e.stock.qty)} ${esc(invById(e.stock.invId)?.unit || "")}</span>` : ""}</td>
            <td class="r">${fmtNum(e.qty)} ${esc(e.unit || "")}</td><td class="r">${fmtNum(e.unitCost)}</td><td class="r"><b>${baht(e.total)}</b></td>
            <td>${esc(e.supplier || "")}</td><td class="small muted">${esc(e.note || "")}</td>
            <td style="white-space:nowrap"><button class="btn icon ghost sm" data-edit="${e.id}" aria-label="แก้ไข">${I.edit}</button><button class="btn icon ghost sm" data-del="${e.id}" aria-label="ลบ">${I.trash}</button></td></tr>`).join("")}</tbody></table></div>`
          : `<div class="empty"><p>ยังไม่มีรายจ่ายในเดือนนี้</p></div>`}
      </section>`;

    makeChart(el.querySelector("#plc"), {
      labels: pl.map((r) => thMonth(r.m)),
      datasets: [
        { label: "รายรับ", data: pl.map((r) => r.rev), color: S.rev },
        { label: "รายจ่าย", data: pl.map((r) => r.exp), color: S.exp },
        { label: "กำไร", data: pl.map((r) => r.profit), color: S.pro, type: "line" },
      ],
    });
    el.querySelectorAll("[data-cr]").forEach((b) => b.onclick = () => { V.costRange = b.dataset.cr; this.render(el); });
    el.querySelector("#expMonth").onchange = (e) => { V.month = e.target.value; this.render(el); };
    el.querySelector("#addExp").onclick = () => editExpense();
    el.querySelectorAll("[data-edit]").forEach((b) => b.onclick = () => editExpense(A.expenses.find((x) => x.id === b.dataset.edit)));
    el.querySelectorAll("[data-del]").forEach((b) => b.onclick = async () => {
      const e = A.expenses.find((x) => x.id === b.dataset.del);
      const msg = e.stock?.invId ? `ลบรายจ่าย "${e.item}"? (สต็อกที่รับเข้าไว้จะถูกหักคืน ${fmtNum(e.stock.qty)})` : `ลบรายจ่าย "${e.item}"?`;
      if (!(await confirmDialog(msg, { okText: "ลบ", danger: true }))) return;
      try {
        const bt = writeBatch(db);
        bt.delete(doc(db, "expenses", e.id));
        if (e.stock?.invId && invById(e.stock.invId)) {
          const inv = invById(e.stock.invId);
          bt.update(doc(db, "inventory", inv.id), { stock: increment(-e.stock.qty), updatedAt: serverTimestamp() });
          bt.set(doc(collection(db, "inventoryTx")), { invId: inv.id, name: inv.name, unit: inv.unit, change: -e.stock.qty, reason: `ลบรายจ่าย ${e.item}`, createdAt: serverTimestamp(), by: A.email });
        }
        await bt.commit(); toast("ลบแล้ว", "ok");
      } catch (err) { console.error(err); toast("ลบไม่สำเร็จ", "bad"); }
    });
  },
};

export function editExpense(e) {
  const isNew = !e;
  const cats = EXPENSE_CATS.includes(e?.category) || !e ? EXPENSE_CATS : [e.category, ...EXPENSE_CATS];
  const m = openModal(`
    <div class="modal-head"><h3>${isNew ? "บันทึกรายจ่าย" : "แก้ไขรายจ่าย"}</h3><button class="btn icon ghost" data-close aria-label="ปิด">${I.x}</button></div>
    <form id="ef" class="form-grid">
      <label class="field">วันที่ * <input class="input" type="date" name="date" id="ex-date" value="${e?.date || dateKey()}" max="${dateKey()}"></label>
      <label class="field">หมวดรายจ่าย <select class="input" name="category" id="ex-cat">${cats.map((c) => `<option ${c === (e?.category || "วัตถุดิบ") ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></label>
      <label class="field full">รายการ * <input class="input" name="item" id="ex-item" value="${esc(e?.item || "")}" placeholder="เช่น สาหร่าย" maxlength="60" list="invNames"></label>
      <datalist id="invNames">${A.inventory.map((i) => `<option value="${esc(i.name)}">`).join("")}</datalist>
      <label class="field">จำนวน <input class="input" type="number" step="any" min="0" name="qty" id="ex-qty" value="${e?.qty ?? 1}"></label>
      <label class="field">หน่วย <input class="input" name="unit" id="ex-unit" value="${esc(e?.unit || "")}" placeholder="เช่น แผ่น, ก้อน, แพ็ค" maxlength="15"></label>
      <label class="field">ราคาต่อหน่วย (บาท) <input class="input" type="number" step="any" min="0" name="unitCost" id="ex-unitcost" value="${e?.unitCost ?? ""}"></label>
      <label class="field">ราคารวม (บาท) * <input class="input" type="number" step="any" min="0" name="total" id="ex-total" value="${e?.total ?? ""}"></label>
      <label class="field">ร้านค้า / ผู้ขาย <input class="input" name="supplier" id="ex-sup" value="${esc(e?.supplier || "")}" maxlength="60"></label>
      <label class="field">หมายเหตุ <input class="input" name="note" id="ex-note" value="${esc(e?.note || "")}" maxlength="120"></label>
    </form>
    <div class="box" style="margin-top:14px">
      <b>ใช้กับเมนูไหน</b>
      <div class="chips" id="forP">
        <button type="button" class="chip" data-fp="__all">ใช้ร่วมทุกเมนู</button>
        ${A.products.map((p) => `<button type="button" class="chip" data-fp="${p.id}">${esc(p.name)}</button>`).join("")}
      </div>
      <p class="small muted">เช่น ซื้อบิสกอฟ → เลือกเฉพาะพายที่ใช้บิสกอฟ · ซื้อกล่อง/แก๊ส → ใช้ร่วมทุกเมนู ระบบใช้ข้อมูลนี้ประมาณต้นทุนต่อเมนู</p>
    </div>
    ${isNew ? `<div class="box" style="margin-top:14px">
      <label class="switch"><input type="checkbox" id="toStock"><span class="track"></span> เพิ่มเข้าสต็อกวัตถุดิบด้วย</label>
      <div class="form-grid" id="stockBox" hidden>
        <label class="field">วัตถุดิบ <select class="input" id="sInv"><option value="">— เลือก —</option>${A.inventory.map((i) => `<option value="${i.id}">${esc(i.name)} (${esc(i.unit)})</option>`).join("")}</select></label>
        <label class="field">จำนวนที่เข้าสต็อก <span id="sUnit"></span><input class="input" type="number" step="any" min="0" id="sQty"></label>
        <label class="switch full"><input type="checkbox" id="sCost" checked><span class="track"></span> อัปเดตต้นทุนต่อหน่วยของวัตถุดิบ (= ราคารวม ÷ จำนวนที่เข้าสต็อก)</label>
        <p class="small muted full">ถ้าซื้อเป็น "ก้อน" แต่สูตรนับเป็น "ชิ้น" ให้กรอกจำนวนเป็นชิ้น เช่น เต้าหู้ 10 ก้อน × 4 ชิ้น = 40</p>
      </div>
    </div>` : ""}
    <div class="modal-foot"><button class="btn ghost" data-close>ยกเลิก</button><button class="btn primary" data-save>บันทึก</button></div>`);
  const f = m.el.querySelector("#ef");
  const forP = new Set(e?.forProducts || []);
  const paintFor = () => m.el.querySelectorAll("[data-fp]").forEach((b) => {
    const on = b.dataset.fp === "__all" ? forP.size === 0 : forP.has(b.dataset.fp);
    b.classList.toggle("active", on); b.setAttribute("aria-pressed", on);
  });
  m.el.querySelector("#forP").onclick = (ev) => {
    const b = ev.target.closest("[data-fp]"); if (!b) return;
    if (b.dataset.fp === "__all") forP.clear(); else forP.has(b.dataset.fp) ? forP.delete(b.dataset.fp) : forP.add(b.dataset.fp);
    paintFor();
  };
  paintFor();
  const q = f.qty, uc = f.unitCost, tt = f.total;
  const r2 = (n) => Math.round(n * 10000) / 10000;
  uc.oninput = () => { if (uc.value !== "" && q.value !== "") tt.value = r2(Number(q.value) * Number(uc.value)); };
  q.oninput = () => { if (uc.value !== "") tt.value = r2(Number(q.value) * Number(uc.value)); else if (tt.value !== "" && Number(q.value)) uc.value = r2(Number(tt.value) / Number(q.value)); };
  tt.oninput = () => { if (tt.value !== "" && Number(q.value)) uc.value = r2(Number(tt.value) / Number(q.value)); };
  const ts = m.el.querySelector("#toStock");
  if (ts) {
    const box = m.el.querySelector("#stockBox"), sInv = m.el.querySelector("#sInv"), sQty = m.el.querySelector("#sQty");
    ts.onchange = () => {
      box.hidden = !ts.checked;
      if (ts.checked && !sInv.value) {
        const match = A.inventory.find((i) => i.name === f.item.value.trim());
        if (match) { sInv.value = match.id; sInv.onchange(); }
      }
      if (ts.checked && !sQty.value) sQty.value = q.value;
    };
    sInv.onchange = () => { m.el.querySelector("#sUnit").textContent = invById(sInv.value) ? `(${invById(sInv.value).unit})` : ""; };
  }
  m.el.querySelector("[data-save]").onclick = async (ev) => {
    const d = {
      date: f.date.value, category: f.category.value, item: f.item.value.trim(),
      qty: Number(q.value) || 0, unit: f.unit.value.trim(), unitCost: Number(uc.value) || 0, total: Number(tt.value),
      supplier: f.supplier.value.trim(), note: f.note.value.trim(), forProducts: [...forP],
    };
    if (!d.date || !d.item || !(d.total >= 0) || tt.value === "") return toast("กรอก วันที่ รายการ และราคารวม", "bad");
    if (!d.unitCost && d.qty) d.unitCost = r2(d.total / d.qty);
    let stock = null;
    if (ts?.checked) {
      const invId = m.el.querySelector("#sInv").value, sq = Number(m.el.querySelector("#sQty").value);
      if (!invId || !(sq > 0)) return toast("เลือกวัตถุดิบและจำนวนที่เข้าสต็อก", "bad");
      stock = { invId, qty: sq, updateCost: m.el.querySelector("#sCost").checked };
    }
    ev.target.disabled = true;
    try {
      const b = writeBatch(db);
      const ref = isNew ? doc(collection(db, "expenses")) : doc(db, "expenses", e.id);
      b.set(ref, { ...d, stock: isNew ? (stock ? { invId: stock.invId, qty: stock.qty } : null) : (e.stock || null),
        createdAt: isNew ? serverTimestamp() : (e.createdAt || serverTimestamp()), updatedAt: serverTimestamp(), by: A.email });
      if (stock) {
        const inv = invById(stock.invId);
        const upd = { stock: increment(stock.qty), updatedAt: serverTimestamp() };
        if (stock.updateCost && d.total > 0) upd.cost = r2(d.total / stock.qty);
        b.update(doc(db, "inventory", inv.id), upd);
        b.set(doc(collection(db, "inventoryTx")), { invId: inv.id, name: inv.name, unit: inv.unit, change: stock.qty, reason: `ซื้อ ${d.item}${d.supplier ? " · " + d.supplier : ""}`, createdAt: serverTimestamp(), by: A.email });
      }
      await b.commit();
      if (!d.date.startsWith(V.month)) V.month = d.date.slice(0, 7);
      toast("บันทึกรายจ่ายแล้ว", "ok"); m.close();
    } catch (err) { console.error(err); toast("บันทึกไม่สำเร็จ", "bad"); ev.target.disabled = false; }
  };
}

function costSection() {
  const today = dateKey();
  const ranges = { "1m": ["30 วันล่าสุด", dateKey(addDays(new Date(), -29))], "3m": ["3 เดือนล่าสุด", dateKey(addDays(new Date(), -89))], year: ["ปีนี้", `${new Date().getFullYear()}-01-01`] };
  const [label, from] = ranges[V.costRange];
  const { rows, unallocated } = productCosts(from, "9999-12-31"); // รวมออเดอร์ที่ส่งล่วงหน้าแล้วด้วย
  const tot = rows.reduce((t, r) => ({ qty: t.qty + r.qty, rev: t.rev + r.revenue, goods: t.goods + r.goods, other: t.other + r.other }), { qty: 0, rev: 0, goods: 0, other: 0 });
  const pct = (p, r) => r ? `${fmtNum((p / r) * 100, 0)}%` : "–";
  return `<section class="card">
    <div class="card-head"><h3 class="card-title">ต้นทุนและกำไรต่อเมนู (ประมาณ)</h3>
      <div class="chips">${Object.entries(ranges).map(([k, [l]]) => `<button class="chip ${V.costRange === k ? "active" : ""}" data-cr="${k}">${l}</button>`).join("")}</div></div>
    ${rows.length ? `<div class="table-wrap"><table class="tbl">
      <thead><tr><th>เมนู</th><th class="r">ขายได้</th><th class="r">ยอดขาย</th><th class="r">ต้นทุนของ/ชิ้น</th><th class="r">ค่าใช้จ่ายอื่น/ชิ้น</th><th class="r">กำไร/ชิ้น</th><th class="r">กำไร %</th></tr></thead>
      <tbody>${rows.map((r) => { const profit = r.revenue - r.goods - r.other; return `<tr>
        <td><b>${esc(r.name)}</b></td><td class="r">${fmtNum(r.qty)}</td><td class="r">${baht(r.revenue)}</td>
        <td class="r">${fmtNum(r.goods / r.qty)}</td><td class="r">${fmtNum(r.other / r.qty)}</td>
        <td class="r"><b class="${profit < 0 ? "neg" : ""}">${fmtNum(profit / r.qty)}</b></td><td class="r ${profit < 0 ? "neg" : ""}">${pct(profit, r.revenue)}</td></tr>`; }).join("")}
        <tr><td><b>รวม</b></td><td class="r"><b>${fmtNum(tot.qty)}</b></td><td class="r"><b>${baht(tot.rev)}</b></td><td class="r">${baht(tot.goods)}</td><td class="r">${baht(tot.other)}</td>
        <td class="r"><b>${baht(tot.rev - tot.goods - tot.other)}</b></td><td class="r"><b>${pct(tot.rev - tot.goods - tot.other, tot.rev)}</b></td></tr>
      </tbody></table></div>` : `<div class="empty"><p>ยังไม่มียอดขายใน ${label} จึงยังคำนวณต้นทุนต่อเมนูไม่ได้</p></div>`}
    ${unallocated.goods + unallocated.other ? `<div class="banner warn small" style="margin-top:12px">${I.alert}<span class="grow">มีรายจ่าย ${baht(unallocated.goods + unallocated.other)} (${esc(unallocated.items.slice(0, 3).map((e) => e.item).join(", "))}${unallocated.items.length > 3 ? " …" : ""}) ที่ยังไม่ถูกนับ เพราะเมนูที่ใช้ของนี้ยังไม่มียอดขายใน ${label}</span></div>` : ""}
    <p class="muted small" style="margin-top:10px">วิธีคิด: เอาค่าของที่ซื้อเข้า (หมวดวัตถุดิบ/บรรจุภัณฑ์ = ต้นทุนของ, หมวดอื่น = ค่าใช้จ่ายอื่น) มาเฉลี่ยตามจำนวนที่ขายได้ในช่วงเดียวกัน รายจ่ายที่ใช้ร่วมหลายเมนูแบ่งตามสัดส่วนยอดขาย · เป็นตัวเลขประมาณ ยิ่งดูช่วงยาว (3 เดือนขึ้นไป) ยิ่งแม่น เพราะของที่ซื้อตุนไว้จะเฉลี่ยกันพอดี · บันทึกรายจ่ายโดยเลือก "ใช้กับเมนูไหน" จะได้ตัวเลขแยกเมนูชัดขึ้น</p>
  </section>`;
}
