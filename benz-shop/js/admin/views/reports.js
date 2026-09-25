import { db, collection, query, where, getDocs } from "../../fb.js";
import { A } from "../state.js";
import { STATUS, PAY, PAY_METHOD, esc, dateKey, monthKey, thMonth, fmtTime, fmtDate, fmtDateTime, toast } from "../../common.js";
import { I, printHtml } from "../ui.js";

const V = { day: dateKey(), month: monthKey(), emonth: monthKey(), year: String(new Date().getFullYear()) };

async function range(col, field, a, b) {
  const s = await getDocs(query(collection(db, col), where(field, ">=", a), where(field, "<=", b)));
  return s.docs.map((d) => ({ id: d.id, ...d.data() }));
}
const endOfMonth = (m) => { const [y, mm] = m.split("-").map(Number); return `${m}-${String(new Date(y, mm, 0).getDate()).padStart(2, "0")}`; };
const orderRow = (o) => ({
  "วันที่ส่ง": o.deliveryDate || o.dateKey, "เลขที่": o.orderNo, "ลูกค้า": o.customerName, "เบอร์โทร": o.phone || "", "ส่งที่": o.deliveryPoint || "",
  "สั่งเมื่อ": `${o.dateKey} ${fmtTime(o.createdAt)}`,
  "รายการ": o.items.map((i) => `${i.name}${i.options?.length ? ` (${i.options.map((x) => x.name).join(", ")})` : ""} x${i.qty}${i.forName ? ` [${i.forName}]` : ""}`).join(" | "),
  "จำนวนชิ้น": o.itemCount || o.items.reduce((s, i) => s + i.qty, 0), "ยอดรวม (บาท)": o.total, "สถานะ": STATUS[o.status]?.label || o.status,
  "การชำระเงิน": PAY[o.paymentStatus || "unpaid"]?.label || "", "วิธีจ่าย": PAY_METHOD[o.paymentMethod] || "", "ที่มา": o.source === "admin" ? "ร้านเพิ่มเอง" : "ลูกค้าสั่งเว็บ",
});
function productSummary(orders) {
  const m = {};
  for (const o of orders) if (o.status === "completed") for (const it of o.items) {
    const k = it.name + (it.options?.length ? ` (${it.options.map((x) => x.name).join(", ")})` : "");
    m[k] = m[k] || { "เมนู / ตัวเลือก": k, "จำนวน": 0, "ยอดขาย (บาท)": 0 };
    m[k]["จำนวน"] += it.qty; m[k]["ยอดขาย (บาท)"] += it.lineTotal || 0;
  }
  return Object.values(m).sort((a, b) => b["จำนวน"] - a["จำนวน"]);
}
const expenseRow = (e) => ({ "วันที่": e.date, "หมวด": e.category, "รายการ": e.item, "จำนวน": e.qty, "หน่วย": e.unit || "", "ราคา/หน่วย": e.unitCost, "รวม (บาท)": e.total, "ร้านค้า": e.supplier || "", "หมายเหตุ": e.note || "" });
const sum = (rows, k) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);

const REPORTS = {
  daily: {
    title: "รายงานยอดขายรายวัน", desc: "ออเดอร์ที่ส่งในวันนั้น และสรุปยอดตามเมนู",
    input: () => `<input class="input" type="date" data-v="day" value="${V.day}" aria-label="วันที่ส่ง">`,
    async build() {
      const orders = (await range("orders", "deliveryDate", V.day, V.day)).sort((a, b) => (a.seq || 0) - (b.seq || 0));
      const done = orders.filter((o) => o.status === "completed");
      const summary = [
        { "หัวข้อ": "วันที่ส่ง", "ค่า": fmtDate(V.day, { day: "numeric", month: "long", year: "numeric" }) },
        { "หัวข้อ": "ออเดอร์ทั้งหมด", "ค่า": orders.length },
        { "หัวข้อ": "ออเดอร์สำเร็จ", "ค่า": done.length },
        { "หัวข้อ": "ออเดอร์ยกเลิก", "ค่า": orders.filter((o) => o.status === "cancelled").length },
        { "หัวข้อ": "ออเดอร์ค้าง (ยังไม่สำเร็จ)", "ค่า": orders.filter((o) => !["completed", "cancelled"].includes(o.status)).length },
        { "หัวข้อ": "ยอดขาย (ออเดอร์สำเร็จ) บาท", "ค่า": done.reduce((s, o) => s + o.total, 0) },
      ];
      return { title: `ยอดขายวันที่ ${fmtDate(V.day, { day: "numeric", month: "long", year: "numeric" })}`, file: `ยอดขาย_${V.day}`,
        sheets: [{ name: "สรุป", rows: summary }, { name: "ตามเมนู", rows: productSummary(orders) }, { name: "ออเดอร์", rows: orders.map(orderRow) }] };
    },
  },
  monthly: {
    title: "รายงานยอดขายรายเดือน", desc: "ยอดขาย รายจ่าย กำไร รายวันทั้งเดือน",
    input: () => `<input class="input" type="month" data-v="month" value="${V.month}" max="${monthKey()}" aria-label="เดือน">`,
    async build() {
      const a = V.month + "-01", b = endOfMonth(V.month);
      const [orders, exps] = await Promise.all([range("orders", "deliveryDate", a, b), range("expenses", "date", a, b)]);
      const days = [];
      for (let d = 1; d <= Number(b.slice(-2)); d++) {
        const k = `${V.month}-${String(d).padStart(2, "0")}`;
        const od = orders.filter((o) => o.deliveryDate === k && o.status === "completed");
        const rev = od.reduce((s, o) => s + o.total, 0), ex = exps.filter((e) => e.date === k).reduce((s, e) => s + (Number(e.total) || 0), 0);
        days.push({ "วันที่": k, "ออเดอร์สำเร็จ": od.length, "ยอดขาย (บาท)": rev, "รายจ่าย (บาท)": ex, "กำไร (บาท)": rev - ex });
      }
      days.push({ "วันที่": "รวม", "ออเดอร์สำเร็จ": sum(days, "ออเดอร์สำเร็จ"), "ยอดขาย (บาท)": sum(days, "ยอดขาย (บาท)"), "รายจ่าย (บาท)": sum(days, "รายจ่าย (บาท)"), "กำไร (บาท)": sum(days, "กำไร (บาท)") });
      return { title: `ยอดขายเดือน ${thMonth(V.month)}`, file: `ยอดขาย_${V.month}`,
        sheets: [{ name: "รายวัน", rows: days }, { name: "ตามเมนู", rows: productSummary(orders) },
          { name: "ออเดอร์", rows: orders.sort((x, y) => x.deliveryDate.localeCompare(y.deliveryDate) || (x.seq || 0) - (y.seq || 0)).map(orderRow) }] };
    },
  },
  expense: {
    title: "รายงานรายจ่าย", desc: "รายจ่ายทุกรายการในเดือน และสรุปตามหมวด",
    input: () => `<input class="input" type="month" data-v="emonth" value="${V.emonth}" max="${monthKey()}" aria-label="เดือน">`,
    async build() {
      const exps = (await range("expenses", "date", V.emonth + "-01", endOfMonth(V.emonth))).sort((a, b) => a.date.localeCompare(b.date));
      const rows = exps.map(expenseRow);
      const cats = {};
      exps.forEach((e) => cats[e.category] = (cats[e.category] || 0) + (Number(e.total) || 0));
      const catRows = Object.entries(cats).map(([k, v]) => ({ "หมวด": k, "รวม (บาท)": v })).sort((a, b) => b["รวม (บาท)"] - a["รวม (บาท)"]);
      catRows.push({ "หมวด": "รวมทั้งหมด", "รวม (บาท)": sum(catRows, "รวม (บาท)") });
      return { title: `รายจ่ายเดือน ${thMonth(V.emonth)}`, file: `รายจ่าย_${V.emonth}`, sheets: [{ name: "ตามหมวด", rows: catRows }, { name: "รายการ", rows }] };
    },
  },
  inventory: {
    title: "รายงานสต็อกวัตถุดิบ", desc: "ยอดคงเหลือ ณ ตอนนี้ และความเคลื่อนไหวล่าสุด",
    input: () => `<span class="muted small">ข้อมูล ณ เวลาที่กด</span>`,
    async build() {
      const rows = A.inventory.map((i) => ({ "วัตถุดิบ": i.name, "คงเหลือ": i.stock, "หน่วย": i.unit, "ขั้นต่ำ": i.minStock || 0, "ต้นทุน/หน่วย": i.cost || 0,
        "มูลค่า (บาท)": Math.max(0, i.stock) * (i.cost || 0), "สถานะ": Number(i.stock) < 0 ? "ติดลบ" : (i.minStock > 0 && i.stock <= i.minStock) ? "ใกล้หมด" : "ปกติ" }));
      const tx = A.invTx.map((t) => ({ "เวลา": fmtDateTime(t.createdAt), "วัตถุดิบ": t.name, "เปลี่ยนแปลง": t.change, "หน่วย": t.unit || "", "เหตุผล": t.reason, "โดย": t.by || "" }));
      return { title: `สต็อกวัตถุดิบ ${fmtDateTime(new Date())}`, file: `สต็อก_${dateKey()}`, sheets: [{ name: "คงเหลือ", rows }, { name: "ความเคลื่อนไหว", rows: tx }] };
    },
  },
  pl: {
    title: "รายงานกำไร-ขาดทุน", desc: "รายรับ รายจ่าย กำไร รายเดือนทั้งปี",
    input: () => `<input class="input" type="number" data-v="year" value="${V.year}" min="2020" max="${new Date().getFullYear()}" aria-label="ปี ค.ศ.">`,
    async build() {
      const y = V.year;
      const [daily, exps] = await Promise.all([range("daily", "date", `${y}-01-01`, `${y}-12-31`), range("expenses", "date", `${y}-01-01`, `${y}-12-31`)]);
      const rows = [];
      for (let mo = 1; mo <= 12; mo++) {
        const m = `${y}-${String(mo).padStart(2, "0")}`;
        const rev = daily.filter((d) => d.date.startsWith(m)).reduce((s, d) => s + (d.revenue || 0), 0);
        const ex = exps.filter((e) => e.date.startsWith(m)).reduce((s, e) => s + (Number(e.total) || 0), 0);
        rows.push({ "เดือน": thMonth(m), "รายรับ (บาท)": rev, "รายจ่าย (บาท)": ex, "กำไร (บาท)": rev - ex });
      }
      rows.push({ "เดือน": "รวมทั้งปี", "รายรับ (บาท)": sum(rows, "รายรับ (บาท)"), "รายจ่าย (บาท)": sum(rows, "รายจ่าย (บาท)"), "กำไร (บาท)": sum(rows, "กำไร (บาท)") });
      const cats = {};
      exps.forEach((e) => cats[e.category] = (cats[e.category] || 0) + (Number(e.total) || 0));
      return { title: `กำไร-ขาดทุน ปี ${Number(y) + 543}`, file: `กำไรขาดทุน_${y}`,
        sheets: [{ name: "รายเดือน", rows }, { name: "รายจ่ายตามหมวด", rows: Object.entries(cats).map(([k, v]) => ({ "หมวด": k, "รวม (บาท)": v })) }] };
    },
  },
};

export default {
  deps: [],
  render(el) {
    el.innerHTML = `
      <div class="grid-2e">${Object.entries(REPORTS).map(([k, r]) => `
        <section class="card report-card">
          <div><h3 class="card-title">${r.title}</h3><p class="muted small">${r.desc}</p></div>
          <div class="row">${r.input()}</div>
          <div class="row">
            <button class="btn primary sm" data-x="${k}">${I.down} Excel</button>
            <button class="btn sm" data-p="${k}">${I.print} พิมพ์ / PDF</button>
          </div>
        </section>`).join("")}</div>
      <p class="muted small">ปุ่ม "พิมพ์ / PDF" จะเปิดหน้าต่างพิมพ์ของเบราว์เซอร์ เลือกเครื่องพิมพ์เป็น "บันทึกเป็น PDF" เพื่อได้ไฟล์ PDF</p>`;
    el.querySelectorAll("[data-v]").forEach((inp) => inp.onchange = () => { V[inp.dataset.v] = inp.value; });
    const run = async (btn, k, fn) => {
      btn.disabled = true;
      try { fn(await REPORTS[k].build()); } catch (e) { console.error(e); toast("สร้างรายงานไม่สำเร็จ: " + e.message, "bad", 5000); }
      btn.disabled = false;
    };
    el.querySelectorAll("[data-x]").forEach((b) => b.onclick = () => run(b, b.dataset.x, exportExcel));
    el.querySelectorAll("[data-p]").forEach((b) => b.onclick = () => run(b, b.dataset.p, printReport));
  },
};

export function exportExcel(rep) {
  if (!window.XLSX) return toast("ยังโหลดตัวสร้าง Excel ไม่เสร็จ ลองอีกครั้ง", "bad");
  const wb = window.XLSX.utils.book_new();
  for (const s of rep.sheets) {
    const ws = window.XLSX.utils.json_to_sheet(s.rows.length ? s.rows : [{ "ไม่มีข้อมูล": "" }]);
    const keys = Object.keys(s.rows[0] || { x: 1 });
    ws["!cols"] = keys.map((k) => ({ wch: Math.min(60, Math.max(k.length + 2, ...s.rows.map((r) => String(r[k] ?? "").length + 2))) }));
    window.XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  window.XLSX.writeFile(wb, `${A.settings.shopName}_${rep.file}.xlsx`);
  toast("ดาวน์โหลดไฟล์ Excel แล้ว", "ok");
}

function printReport(rep) {
  const fmt = (v) => typeof v === "number" ? v.toLocaleString("th-TH", { maximumFractionDigits: 2 }) : esc(v);
  printHtml(`<div class="print-report">
    <h1>${esc(A.settings.shopName)} — ${esc(rep.title)}</h1>
    <p>พิมพ์เมื่อ ${fmtDateTime(new Date())}</p>
    ${rep.sheets.map((s) => `<h3>${esc(s.name)}</h3>${s.rows.length ? `<table><thead><tr>${Object.keys(s.rows[0]).map((k) => `<th>${esc(k)}</th>`).join("")}</tr></thead>
      <tbody>${s.rows.map((r) => `<tr>${Object.values(r).map((v) => `<td class="${typeof v === "number" ? "r" : ""}">${fmt(v)}</td>`).join("")}</tr>`).join("")}</tbody></table>` : "<p>ไม่มีข้อมูล</p>"}`).join("")}
  </div>`);
}
