// สถานะข้อมูลของหน้าแอดมิน + ฟังก์ชันจัดการข้อมูลที่ใช้หลายหน้า
import {
  db, doc, collection, runTransaction, serverTimestamp, increment, updateDoc,
} from "../fb.js";
import { DEFAULT_SETTINGS, dateKey, addDays, startOfDay, startOfWeek, monthKey, store } from "../common.js";

export const A = {
  user: null,
  email: "",
  role: null,            // 'owner' | 'staff'
  settings: { ...DEFAULT_SETTINGS },
  settingsExists: false,
  categories: [],
  products: [],
  inventory: [],
  invTx: [],
  orders: [],            // ออเดอร์ที่วันส่งตั้งแต่ 2 วันก่อนเป็นต้นไป (เรียลไทม์)
  daily: {},             // { 'YYYY-MM-DD': {revenue, orders, products} }
  expenses: [],
  staff: [],
  loaded: {},
  soundOn: store.get("benz.admin.sound", true),
};

export const isOwner = () => A.role === "owner";

// ---------- change bus ----------
const listeners = new Set();
export const onData = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const emit = (key) => listeners.forEach((fn) => fn(key));

// ---------- lookups ----------
export const productById = (id) => A.products.find((p) => p.id === id);
export const invById = (id) => A.inventory.find((i) => i.id === id);
export const catName = (id) => A.categories.find((c) => c.id === id)?.name || "ไม่มีหมวด";
export const isLow = (i) => (Number(i.minStock) || 0) > 0 ? Number(i.stock) <= Number(i.minStock) : Number(i.stock) < 0;

// ---------- aggregates ----------
export function revenueBetween(fromKey, toKey) {
  let rev = 0, orders = 0;
  for (const [k, d] of Object.entries(A.daily)) if (k >= fromKey && k <= toKey) { rev += d.revenue || 0; orders += d.orders || 0; }
  return { rev, orders };
}
export function expensesBetween(fromKey, toKey) {
  return A.expenses.filter((e) => e.date >= fromKey && e.date <= toKey).reduce((s, e) => s + (Number(e.total) || 0), 0);
}
export function periodKeys() {
  const now = new Date();
  const today = dateKey(now);
  return {
    today: [today, today],
    week: [dateKey(startOfWeek(now)), today],
    month: [monthKey(now) + "-01", today],
    year: [`${now.getFullYear()}-01-01`, today],
  };
}
export function productSalesBetween(fromKey, toKey) {
  const m = {};
  for (const [k, d] of Object.entries(A.daily)) {
    if (k < fromKey || k > toKey) continue;
    for (const [pid, v] of Object.entries(d.products || {})) {
      m[pid] = m[pid] || { pid, name: v.name, qty: 0, revenue: 0 };
      m[pid].qty += v.qty || 0; m[pid].revenue += v.revenue || 0;
      if (v.name) m[pid].name = v.name;
    }
  }
  return Object.values(m).filter((x) => x.qty > 0).sort((a, b) => b.qty - a.qty || b.revenue - a.revenue);
}
export function lastNMonths(n) {
  const now = new Date(); const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  return out;
}
export const windowStartKey = () => { const now = new Date(); return monthKey(new Date(now.getFullYear(), now.getMonth() - 11, 1)) + "-01"; };
export const liveFromKey = () => dateKey(addDays(new Date(), -2));
export const deliveryKeyOf = (o) => o.deliveryDate || o.dateKey;

// ---------- วัตถุดิบที่ใช้ต่อออเดอร์ ตามสูตรเมนู ----------
export function ingredientUsage(order) {
  const use = {};
  const add = (invId, q) => { if (!invId || !q) return; use[invId] = (use[invId] || 0) + q; };
  for (const it of order.items || []) {
    const p = productById(it.productId);
    if (!p) continue;
    for (const r of p.recipe || []) add(r.invId, (Number(r.qty) || 0) * it.qty);
    for (const o of it.options || []) {
      for (const g of p.optionGroups || []) {
        const c = (g.choices || []).find((c) => c.id === o.choiceId);
        if (c) for (const r of c.recipe || []) add(r.invId, (Number(r.qty) || 0) * it.qty);
      }
    }
  }
  for (const k of Object.keys(use)) if (!invById(k)) delete use[k];
  return use;
}

/** ราคาที่ควรเป็นตามเมนูปัจจุบัน (ใช้เตือนเมื่อราคาไม่ตรง) */
export function expectedTotal(order) {
  let t = 0;
  for (const it of order.items || []) {
    const p = productById(it.productId);
    if (!p) return null;
    let u = Number(p.price) || 0;
    for (const o of it.options || []) {
      const g = (p.optionGroups || []).find((g) => g.id === o.groupId);
      const c = g?.choices?.find((c) => c.id === o.choiceId);
      if (!c) return null;
      u += Number(c.price) || 0;
    }
    t += u * it.qty;
  }
  return t;
}

/**
 * เปลี่ยนสถานะออเดอร์
 * - เปลี่ยนเป็น "สำเร็จ": ตัดสต็อกตามสูตร + บันทึกยอดขายรายวัน
 * - เปลี่ยนออกจาก "สำเร็จ": คืนสต็อก + หักยอดขายคืน
 */
export async function setOrderStatus(orderId, next) {
  const ref = doc(db, "orders", orderId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("ไม่พบออเดอร์");
    const o = { id: snap.id, ...snap.data() };
    const upd = { status: next, updatedAt: serverTimestamp() };
    if (next === "completed") upd.completedAt = serverTimestamp();
    const done = next === "completed";

    // --- stock ---
    let stockSign = 0;
    if (done && !o.stockDeducted) { stockSign = -1; upd.stockDeducted = true; }
    if (!done && o.stockDeducted) { stockSign = 1; upd.stockDeducted = false; }
    // --- revenue ---
    let revSign = 0;
    if (done && !o.revenueCounted) { revSign = 1; upd.revenueCounted = true; }
    if (!done && o.revenueCounted) { revSign = -1; upd.revenueCounted = false; }

    if (stockSign) {
      const use = ingredientUsage(o);
      for (const [invId, q] of Object.entries(use)) {
        const inv = invById(invId);
        tx.update(doc(db, "inventory", invId), { stock: increment(stockSign * q), updatedAt: serverTimestamp() });
        tx.set(doc(collection(db, "inventoryTx")), {
          invId, name: inv?.name || "", unit: inv?.unit || "", change: stockSign * q,
          reason: stockSign < 0 ? `ขายออเดอร์ #${o.orderNo}` : `คืนสต็อกออเดอร์ #${o.orderNo}`,
          orderId: o.id, createdAt: serverTimestamp(), by: A.email,
        });
      }
    }
    if (revSign) {
      const products = {};
      for (const it of o.items || []) {
        const cur = products[it.productId] || { name: it.name, q: 0, r: 0 };
        cur.q += it.qty; cur.r += it.lineTotal || 0; products[it.productId] = cur;
      }
      const pmap = {};
      for (const [pid, v] of Object.entries(products)) pmap[pid] = { name: v.name, qty: increment(revSign * v.q), revenue: increment(revSign * v.r) };
      const dk = deliveryKeyOf(o);
      tx.set(doc(db, "daily", dk), {
        date: dk, revenue: increment(revSign * (o.total || 0)), orders: increment(revSign), products: pmap,
      }, { merge: true });
    }
    tx.update(ref, upd);
  });
}

/** เปลี่ยนสถานะการชำระเงิน */
export async function setPayment(orderId, paymentStatus, paymentMethod) {
  const upd = { paymentStatus, updatedAt: serverTimestamp() };
  if (paymentMethod) upd.paymentMethod = paymentMethod;
  if (paymentStatus === "paid") { upd.paidAt = serverTimestamp(); upd.paidBy = A.email; }
  await updateDoc(doc(db, "orders", orderId), upd);
}
