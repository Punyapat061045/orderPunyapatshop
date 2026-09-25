import { db, doc, collection, setDoc, updateDoc, deleteDoc, serverTimestamp, increment, writeBatch } from "../../fb.js";
import { A, isOwner, isLow } from "../state.js";
import { esc, baht, fmtNum, fmtDateTime, toast, openModal, confirmDialog } from "../../common.js";
import { I, kpi } from "../ui.js";

export default {
  deps: ["inventory", "invTx", "products"],
  render(el) {
    const owner = isOwner();
    const low = A.inventory.filter(isLow);
    const value = A.inventory.reduce((s, i) => s + Math.max(0, Number(i.stock) || 0) * (Number(i.cost) || 0), 0);
    el.innerHTML = `
      <div class="kpis">
        ${kpi({ label: "วัตถุดิบทั้งหมด", value: A.inventory.length, unit: "รายการ", tone: "t-sky", icon: I.box })}
        ${kpi({ label: "ใกล้หมด / ติดลบ", value: low.length, unit: "รายการ", tone: "t-red", icon: I.alert, alert: low.length > 0 })}
        ${owner ? kpi({ label: "มูลค่าสต็อกโดยประมาณ", value: fmtNum(value), unit: "บาท", sub: "คงเหลือ × ต้นทุนต่อหน่วย", tone: "t-mint", icon: I.cash }) : ""}
      </div>
      <section class="card">
        <div class="card-head"><h3 class="card-title">สต็อกคงเหลือ</h3>${owner ? `<button class="btn primary sm" id="addInv">${I.plus} เพิ่มวัตถุดิบ</button>` : ""}</div>
        ${A.inventory.length ? `<div class="table-wrap"><table class="tbl">
          <thead><tr><th>วัตถุดิบ</th><th class="r">คงเหลือ</th><th>หน่วย</th><th class="r">ขั้นต่ำ</th>${owner ? `<th class="r">ต้นทุน/หน่วย</th><th class="r">มูลค่า</th>` : ""}<th>สถานะ</th><th></th></tr></thead>
          <tbody>${A.inventory.map((i) => {
            const bad = isLow(i);
            return `<tr>
              <td><b>${esc(i.name)}</b></td>
              <td class="r"><b class="${Number(i.stock) < 0 ? "neg" : ""}">${fmtNum(i.stock)}</b></td>
              <td>${esc(i.unit)}</td>
              <td class="r">${fmtNum(i.minStock)}</td>
              ${owner ? `<td class="r">${fmtNum(i.cost, 4)}</td><td class="r">${fmtNum(Math.max(0, i.stock) * (i.cost || 0))}</td>` : ""}
              <td>${bad ? `<span class="pill bad">${Number(i.stock) < 0 ? "ติดลบ" : "ใกล้หมด"}</span>` : `<span class="pill ok">ปกติ</span>`}</td>
              <td style="white-space:nowrap"><button class="btn sm" data-adj="${i.id}">ปรับสต็อก</button>
                ${owner ? `<button class="btn icon ghost sm" data-edit="${i.id}" aria-label="แก้ไข">${I.edit}</button><button class="btn icon ghost sm" data-del="${i.id}" aria-label="ลบ">${I.trash}</button>` : ""}</td>
            </tr>`; }).join("")}</tbody></table></div>`
          : `<div class="empty"><p>ยังไม่มีวัตถุดิบ</p></div>`}
      </section>
      <section class="card">
        <div class="card-head"><h3 class="card-title">ความเคลื่อนไหวล่าสุด</h3><span class="muted small">60 รายการล่าสุด</span></div>
        ${A.invTx.length ? `<div class="table-wrap"><table class="tbl">
          <thead><tr><th>เวลา</th><th>วัตถุดิบ</th><th class="r">เปลี่ยนแปลง</th><th>เหตุผล</th><th>โดย</th></tr></thead>
          <tbody>${A.invTx.map((t) => `<tr><td class="small num">${fmtDateTime(t.createdAt)}</td><td>${esc(t.name)}</td>
            <td class="r"><b class="${t.change < 0 ? "neg" : "pos"}">${t.change > 0 ? "+" : ""}${fmtNum(t.change)}</b> ${esc(t.unit || "")}</td>
            <td class="small">${esc(t.reason)}</td><td class="small muted">${esc(t.by || "")}</td></tr>`).join("")}</tbody></table></div>`
          : `<div class="empty"><p>ยังไม่มีความเคลื่อนไหว</p></div>`}
      </section>`;
    el.querySelectorAll("[data-adj]").forEach((b) => b.onclick = () => adjust(A.inventory.find((i) => i.id === b.dataset.adj)));
    if (!owner) return;
    el.querySelector("#addInv").onclick = () => editInv();
    el.querySelectorAll("[data-edit]").forEach((b) => b.onclick = () => editInv(A.inventory.find((i) => i.id === b.dataset.edit)));
    el.querySelectorAll("[data-del]").forEach((b) => b.onclick = async () => {
      const i = A.inventory.find((x) => x.id === b.dataset.del);
      const used = A.products.filter((p) => JSON.stringify([p.recipe, p.optionGroups]).includes(`"${i.id}"`));
      if (used.length) return toast(`ใช้อยู่ในสูตรเมนู: ${used.map((p) => p.name).join(", ")} — ลบออกจากสูตรก่อน`, "bad", 5000);
      if (!(await confirmDialog(`ลบ "${i.name}"?`, { okText: "ลบ", danger: true }))) return;
      try { await deleteDoc(doc(db, "inventory", i.id)); toast("ลบแล้ว", "ok"); } catch { toast("ลบไม่สำเร็จ", "bad"); }
    });
  },
};

export function editInv(i) {
  const m = openModal(`
    <div class="modal-head"><h3>${i ? "แก้ไขวัตถุดิบ" : "เพิ่มวัตถุดิบ"}</h3><button class="btn icon ghost" data-close aria-label="ปิด">${I.x}</button></div>
    <form id="vf" class="form-grid">
      <label class="field full">ชื่อวัตถุดิบ * <input class="input" name="name" id="inv-name" value="${esc(i?.name || "")}" maxlength="50"></label>
      <label class="field">หน่วยนับ * <input class="input" name="unit" id="inv-unit" value="${esc(i?.unit || "")}" placeholder="เช่น แผ่น, กรัม, ชิ้น" maxlength="15"></label>
      ${i ? "" : `<label class="field">คงเหลือเริ่มต้น <input class="input" type="number" step="any" name="stock" id="inv-stock" value="0"></label>`}
      <label class="field">แจ้งเตือนเมื่อเหลือไม่เกิน <input class="input" type="number" step="any" min="0" name="minStock" id="inv-min" value="${i?.minStock ?? 0}"></label>
      <label class="field">ต้นทุนต่อหน่วย (บาท) <input class="input" type="number" step="any" min="0" name="cost" id="inv-cost" value="${i?.cost ?? 0}"></label>
    </form>
    <p class="small muted">หน่วยนับต้องตรงกับที่ใช้ในสูตรเมนู เช่น สูตรใช้ "20 กรัม" หน่วยนับก็ต้องเป็นกรัม</p>
    <div class="modal-foot"><button class="btn ghost" data-close>ยกเลิก</button><button class="btn primary" data-save>บันทึก</button></div>`);
  const f = m.el.querySelector("#vf");
  m.el.querySelector("[data-save]").onclick = async () => {
    const name = f.name.value.trim(), unit = f.unit.value.trim();
    if (!name || !unit) return toast("กรอกชื่อและหน่วยนับ", "bad");
    const data = { name, unit, minStock: Number(f.minStock.value) || 0, cost: Number(f.cost.value) || 0, updatedAt: serverTimestamp() };
    try {
      if (i) await updateDoc(doc(db, "inventory", i.id), data);
      else {
        const ref = doc(collection(db, "inventory"));
        const stock = Number(f.stock.value) || 0;
        const b = writeBatch(db);
        b.set(ref, { ...data, stock });
        if (stock) b.set(doc(collection(db, "inventoryTx")), { invId: ref.id, name, unit, change: stock, reason: "ยอดเริ่มต้น", createdAt: serverTimestamp(), by: A.email });
        await b.commit();
      }
      toast("บันทึกแล้ว", "ok"); m.close();
    } catch (e) { console.error(e); toast("บันทึกไม่สำเร็จ", "bad"); }
  };
}

function adjust(i) {
  const m = openModal(`
    <div class="modal-head"><div class="grow"><h3>ปรับสต็อก: ${esc(i.name)}</h3><p class="muted small">คงเหลือตอนนี้ ${fmtNum(i.stock)} ${esc(i.unit)}</p></div><button class="btn icon ghost" data-close aria-label="ปิด">${I.x}</button></div>
    <div class="chips" id="mode" role="radiogroup">
      <button class="chip active" data-m="in" aria-checked="true" role="radio">รับเข้า (+)</button>
      <button class="chip" data-m="out" aria-checked="false" role="radio">เบิกใช้ / เสีย (−)</button>
      <button class="chip" data-m="set" aria-checked="false" role="radio">นับจริง (ตั้งยอดใหม่)</button>
    </div>
    <div class="form-grid" style="margin-top:14px">
      <label class="field">จำนวน (${esc(i.unit)}) <input class="input" type="number" step="any" min="0" id="aq"></label>
      <label class="field">หมายเหตุ <input class="input" id="an" placeholder="เช่น ซื้อจากแม็คโคร, ของเสีย" maxlength="80"></label>
    </div>
    <div class="modal-foot"><button class="btn ghost" data-close>ยกเลิก</button><button class="btn primary" data-save>บันทึก</button></div>`);
  let mode = "in";
  m.el.querySelectorAll("[data-m]").forEach((b) => b.onclick = () => {
    mode = b.dataset.m;
    m.el.querySelectorAll("[data-m]").forEach((x) => { x.classList.toggle("active", x === b); x.setAttribute("aria-checked", x === b); });
  });
  m.el.querySelector("[data-save]").onclick = async () => {
    const q = Number(m.el.querySelector("#aq").value);
    if (!(q >= 0) || m.el.querySelector("#aq").value === "") return toast("กรอกจำนวน", "bad");
    const note = m.el.querySelector("#an").value.trim();
    const change = mode === "in" ? q : mode === "out" ? -q : q - (Number(i.stock) || 0);
    const reason = (mode === "in" ? "รับเข้า" : mode === "out" ? "เบิกใช้/เสีย" : "นับสต็อกจริง") + (note ? ` · ${note}` : "");
    try {
      const b = writeBatch(db);
      b.update(doc(db, "inventory", i.id), { stock: mode === "set" ? q : increment(change), updatedAt: serverTimestamp() });
      b.set(doc(collection(db, "inventoryTx")), { invId: i.id, name: i.name, unit: i.unit, change, reason, createdAt: serverTimestamp(), by: A.email });
      await b.commit();
      toast("ปรับสต็อกแล้ว", "ok"); m.close();
    } catch (e) { console.error(e); toast("บันทึกไม่สำเร็จ", "bad"); }
  };
}
