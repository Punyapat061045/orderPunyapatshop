// หน้าแอดมิน: ล็อกอิน, โครงหน้า, การดึงข้อมูลแบบเรียลไทม์ และการแจ้งเตือนออเดอร์ใหม่
import {
  isConfigured, db, auth, doc, getDoc, collection, query, where, orderBy, limit, onSnapshot,
  signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail, Timestamp,
} from "../fb.js";
import { OWNER_EMAIL } from "../config.js";
import {
  DEFAULT_SETTINGS, dateKey, addDays, esc, applyTheme, toast, renderNotConfigured, initials, fmtDelivery, store, playChime, unlockAudio,
} from "../common.js";
import { A, emit, onData, isOwner, windowStartKey, liveFromKey, isLow } from "./state.js";
import { I } from "./ui.js";
import { destroyCharts } from "./charts.js";
import dashboard from "./views/dashboard.js";
import orders, { openOrder } from "./views/orders.js";
import prep from "./views/prep.js";
import menu from "./views/menu.js";
import inventory from "./views/inventory.js";
import accounting from "./views/accounting.js";
import analytics from "./views/analytics.js";
import reports from "./views/reports.js";
import qr from "./views/qr.js";
import settings from "./views/settings.js";

const $ = (s, r = document) => r.querySelector(s);
const app = $("#app");

const VIEWS = {
  dashboard:  { title: "ภาพรวม", icon: I.home, mod: dashboard, staff: true, sec: "หน้าร้าน" },
  orders:     { title: "ออเดอร์", icon: I.receipt, mod: orders, staff: true },
  prep:       { title: "เตรียม & ส่งของ", icon: I.chef, mod: prep, staff: true },
  menu:       { title: "เมนูอาหาร", icon: I.menu, mod: menu, staff: true, sec: "จัดการร้าน" },
  inventory:  { title: "สต็อกวัตถุดิบ", icon: I.box, mod: inventory, staff: true },
  qr:         { title: "QR Code สั่งอาหาร", icon: I.qr, mod: qr },
  accounting: { title: "บัญชี รายรับ-รายจ่าย", icon: I.wallet, mod: accounting, sec: "การเงิน" },
  analytics:  { title: "วิเคราะห์ยอดขาย", icon: I.chart, mod: analytics },
  reports:    { title: "รายงาน", icon: I.file, mod: reports },
  settings:   { title: "ตั้งค่าร้าน", icon: I.gear, mod: settings, sec: "ระบบ" },
};

let unsubs = [];
let current = null;
let firstOrders = true;
const seenOrders = new Set();
const lastPay = new Map();

document.addEventListener("pointerdown", unlockAudio);

// ======================= boot =======================
if (!isConfigured) {
  renderNotConfigured(app);
} else {
  onAuthStateChanged(auth, async (user) => {
    stopListeners();
    A.user = user; A.role = null;
    if (!user) return renderLogin();
    A.email = (user.email || "").toLowerCase();
    try { A.role = await resolveRole(A.email); } catch (e) { console.error(e); A.role = null; }
    if (!A.role) return renderNoAccess();
    startListeners();
    renderShell();
  });
}

async function resolveRole(email) {
  if (email && email === String(OWNER_EMAIL).toLowerCase()) return "owner";
  const s = await getDoc(doc(db, "staff", email));
  if (!s.exists()) return null;
  return s.data().role === "owner" ? "owner" : "staff";
}

// ======================= login =======================
function renderLogin() {
  destroyCharts();
  app.innerHTML = `
    <div class="login-wrap">
      <form class="card login" id="loginForm" novalidate>
        <div class="c-logo">${A.settings.logo ? `<img src="${esc(A.settings.logo)}" alt="">` : esc(initials(A.settings.shopName))}</div>
        <div><h1>หลังร้าน</h1><p class="muted" style="text-align:center">เข้าสู่ระบบสำหรับเจ้าของร้านและพนักงาน</p></div>
        <label class="field">อีเมล <input class="input" name="email" type="email" autocomplete="username" required></label>
        <label class="field">รหัสผ่าน <input class="input" name="password" type="password" autocomplete="current-password" required></label>
        <p class="small" id="loginErr" style="color:var(--danger)" hidden></p>
        <button class="btn primary lg block" type="submit">เข้าสู่ระบบ</button>
        <button class="btn ghost sm" type="button" id="forgot">ลืมรหัสผ่าน</button>
        <a class="small" href="index.html" style="text-align:center">ไปหน้าสั่งอาหารของลูกค้า</a>
      </form>
    </div>`;
  const f = $("#loginForm"), err = $("#loginErr");
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = f.querySelector("[type=submit]");
    btn.disabled = true; btn.textContent = "กำลังเข้าสู่ระบบ..."; err.hidden = true;
    try {
      await signInWithEmailAndPassword(auth, f.email.value.trim(), f.password.value);
    } catch (ex) {
      const map = {
        "auth/invalid-credential": "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
        "auth/wrong-password": "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
        "auth/user-not-found": "ไม่พบบัญชีนี้",
        "auth/invalid-email": "รูปแบบอีเมลไม่ถูกต้อง",
        "auth/too-many-requests": "ลองผิดหลายครั้งเกินไป กรุณารอสักครู่",
        "auth/network-request-failed": "เชื่อมต่ออินเทอร์เน็ตไม่ได้",
      };
      err.textContent = map[ex.code] || "เข้าสู่ระบบไม่สำเร็จ (" + (ex.code || ex.message) + ")";
      err.hidden = false; btn.disabled = false; btn.textContent = "เข้าสู่ระบบ";
    }
  });
  $("#forgot").onclick = async () => {
    const email = f.email.value.trim();
    if (!email) { err.textContent = "กรอกอีเมลก่อน แล้วกด ลืมรหัสผ่าน อีกครั้ง"; err.hidden = false; return; }
    try { await sendPasswordResetEmail(auth, email); toast("ส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่อีเมลแล้ว", "ok"); }
    catch { toast("ส่งอีเมลไม่สำเร็จ ตรวจสอบอีเมลอีกครั้ง", "bad"); }
  };
}

function renderNoAccess() {
  app.innerHTML = `
    <div class="login-wrap"><div class="card login">
      <h1>ยังไม่มีสิทธิ์เข้าใช้งาน</h1>
      <p class="muted">บัญชี <b>${esc(A.email)}</b> ยังไม่ได้ถูกเพิ่มเป็นพนักงาน ให้เจ้าของร้านเพิ่มอีเมลนี้ที่เมนู ตั้งค่าร้าน › พนักงาน</p>
      <button class="btn primary block" id="lo">ออกจากระบบ</button>
    </div></div>`;
  $("#lo").onclick = () => signOut(auth);
}

// ======================= realtime data =======================
function listen(ref, fn, key) {
  const un = onSnapshot(ref, fn, (e) => {
    console.error(key, e);
    if (e.code === "permission-denied") toast(`ไม่มีสิทธิ์อ่านข้อมูล ${key} (ตรวจ firestore.rules)`, "bad", 6000);
  });
  unsubs.push(un);
}
const docsOf = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

function startListeners() {
  firstOrders = true; seenOrders.clear();
  listen(doc(db, "settings", "shop"), (s) => {
    A.settingsExists = s.exists();
    A.settings = { ...DEFAULT_SETTINGS, ...(s.exists() ? s.data() : {}) };
    applyTheme(A.settings); A.loaded.settings = true; emit("settings"); updateBrand();
  }, "settings");
  listen(collection(db, "categories"), (s) => {
    A.categories = docsOf(s).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name, "th"));
    A.loaded.categories = true; emit("categories");
  }, "categories");
  listen(collection(db, "products"), (s) => {
    A.products = docsOf(s).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name, "th"));
    A.loaded.products = true; emit("products");
  }, "products");
  listen(collection(db, "inventory"), (s) => {
    A.inventory = docsOf(s).sort((a, b) => a.name.localeCompare(b.name, "th"));
    A.loaded.inventory = true; emit("inventory"); updateBadges();
  }, "inventory");
  listen(query(collection(db, "inventoryTx"), orderBy("createdAt", "desc"), limit(60)), (s) => {
    A.invTx = docsOf(s); emit("invTx");
  }, "inventoryTx");
  listen(query(collection(db, "orders"), where("deliveryDate", ">=", liveFromKey())), (s) => {
    A.orders = docsOf(s).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    A.loaded.orders = true;
    const fresh = [];
    for (const o of A.orders) {
      if (!seenOrders.has(o.id)) { seenOrders.add(o.id); if (!firstOrders && o.status === "pending" && o.source !== "admin") fresh.push(o); }
      else if (!firstOrders && o.paymentStatus === "slip" && lastPay.get(o.id) && lastPay.get(o.id) !== "slip") {
        if (A.soundOn) playChime(1);
        toast(`ลูกค้าแนบสลิป #${o.orderNo} · ${o.customerName} (แตะเพื่อตรวจ)`, "order", 9000, () => openOrder(o.id));
      }
      lastPay.set(o.id, o.paymentStatus || "unpaid");
    }
    firstOrders = false;
    fresh.forEach(notifyNewOrder);
    emit("orders"); updateBadges();
  }, "orders");
  if (isOwner()) {
    const since = windowStartKey();
    listen(query(collection(db, "daily"), where("date", ">=", since)), (s) => {
      A.daily = Object.fromEntries(s.docs.map((d) => [d.id, d.data()]));
      A.loaded.daily = true; emit("daily");
    }, "daily");
    listen(query(collection(db, "expenses"), where("date", ">=", since)), (s) => {
      A.expenses = docsOf(s).sort((a, b) => b.date.localeCompare(a.date));
      A.loaded.expenses = true; emit("expenses");
    }, "expenses");
    listen(collection(db, "staff"), (s) => { A.staff = docsOf(s); emit("staff"); }, "staff");
  }
}
function stopListeners() { unsubs.forEach((u) => u()); unsubs = []; }

// ======================= notifications =======================
function notifyNewOrder(o) {
  if (A.soundOn) playChime(3);
  toast(`ออเดอร์ใหม่ ส่ง ${fmtDelivery(o.deliveryDate)} #${o.orderNo} · ${o.customerName} · ${o.total} บาท (แตะเพื่อดู)`, "order", 9000, () => openOrder(o.id));
  try {
    if (document.hidden && "Notification" in window && Notification.permission === "granted") {
      new Notification(`ออเดอร์ใหม่ #${o.orderNo}`, { body: `${o.customerName} · ${o.total} บาท`, tag: o.id });
    }
  } catch {}
  const bell = $("#bellBtn"); if (bell) { bell.animate([{ transform: "rotate(-14deg)" }, { transform: "rotate(14deg)" }, { transform: "rotate(0)" }], { duration: 400, iterations: 3 }); }
}

function updateBadges() {
  const pending = A.orders.filter((o) => o.status === "pending").length;
  const low = A.inventory.filter(isLow).length;
  document.title = `${pending ? `(${pending}) ` : ""}หลังร้าน — ${A.settings.shopName}`;
  const set = (sel, n) => { const el = $(sel); if (el) { el.textContent = n; el.hidden = !n; } };
  set("#bellDot", pending); set("#navBadge-orders", pending); set("#navBadge-prep", A.orders.filter((o) => o.deliveryDate === dateKey(addDays(new Date(), 1)) && !["completed", "cancelled"].includes(o.status)).length);
  set("#navBadge-inventory", low);
}
function updateBrand() {
  const b = $("#sideBrand");
  if (b) b.innerHTML = `<div class="c-logo">${A.settings.logo ? `<img src="${esc(A.settings.logo)}" alt="">` : esc(initials(A.settings.shopName))}</div>
    <div><b>${esc(A.settings.shopName)}</b><small>${isOwner() ? "เจ้าของร้าน" : "พนักงาน"}</small></div>`;
  updateBadges();
}

// ======================= shell =======================
function allowed(key) { return VIEWS[key] && (isOwner() || VIEWS[key].staff); }

function renderShell() {
  const navHtml = Object.entries(VIEWS).filter(([k]) => allowed(k)).map(([k, v]) =>
    `${v.sec && isOwner() ? `<div class="nav-sec">${v.sec}</div>` : ""}
     <a href="#${k}" data-v="${k}">${v.icon}<span>${v.title}</span><span class="badge" id="navBadge-${k}" hidden></span></a>`).join("");
  app.innerHTML = `
    <div class="shell">
      <aside class="side" id="side">
        <div class="side-brand" id="sideBrand"></div>
        <nav class="nav">${navHtml}</nav>
        <div class="side-foot">
          <a href="index.html" target="_blank" rel="noopener" class="btn sm">เปิดหน้าลูกค้า</a>
          <div class="muted" style="word-break:break-all">${esc(A.email)}</div>
          <button class="btn sm ghost" id="logout">${I.out} ออกจากระบบ</button>
        </div>
      </aside>
      <div class="main">
        <header class="topbar">
          <button class="btn icon ghost menu-btn" id="menuBtn" aria-label="เมนู">${I.bars}</button>
          <h2 id="viewTitle"></h2>
          <button class="btn icon ghost" id="soundBtn" aria-label="เสียงแจ้งเตือน" title="เสียงแจ้งเตือน"></button>
          <button class="btn icon ghost" id="themeBtn" aria-label="โหมดมืด/สว่าง" title="โหมดมืด/สว่าง"></button>
          <button class="btn icon ghost bell" id="bellBtn" aria-label="ออเดอร์รอดำเนินการ" title="ออเดอร์รอดำเนินการ">${I.bell}<span class="dot" id="bellDot" hidden></span></button>
        </header>
        <main class="content" id="content"></main>
      </div>
    </div>`;
  updateBrand();
  $("#logout").onclick = () => signOut(auth);
  $("#bellBtn").onclick = () => { location.hash = "#orders"; askNotifyPermission(); };
  $("#menuBtn").onclick = () => toggleSide(true);
  $("#soundBtn").onclick = () => {
    A.soundOn = !A.soundOn; store.set("benz.admin.sound", A.soundOn); paintTopButtons();
    if (A.soundOn) { unlockAudio(); playChime(1); toast("เปิดเสียงแจ้งเตือนแล้ว", "ok", 1500); } else toast("ปิดเสียงแจ้งเตือนแล้ว", "", 1500);
  };
  $("#themeBtn").onclick = () => {
    const dark = isDark();
    document.documentElement.dataset.theme = dark ? "light" : "dark";
    store.set("benz.admin.theme", document.documentElement.dataset.theme);
    paintTopButtons(); route();
  };
  paintTopButtons();
  askNotifyPermission();
  route();
}
const isDark = () => document.documentElement.dataset.theme ? document.documentElement.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
function paintTopButtons() {
  $("#soundBtn").innerHTML = A.soundOn ? I.sound : I.mute;
  $("#themeBtn").innerHTML = isDark() ? I.sun : I.moon;
}
function askNotifyPermission() {
  try { if ("Notification" in window && Notification.permission === "default") Notification.requestPermission(); } catch {}
}
function toggleSide(open) {
  const side = $("#side"); side.classList.toggle("open", open);
  let scrim = $(".side-scrim");
  if (open && !scrim) { scrim = document.createElement("div"); scrim.className = "side-scrim"; scrim.onclick = () => toggleSide(false); document.body.appendChild(scrim); }
  if (!open && scrim) scrim.remove();
}

function route() {
  if (!A.role || !$("#content")) return;
  let key = location.hash.replace("#", "") || "dashboard";
  if (!allowed(key)) key = "dashboard";
  current = key;
  document.querySelectorAll(".nav a").forEach((a) => a.classList.toggle("active", a.dataset.v === key));
  $("#viewTitle").textContent = VIEWS[key].title;
  toggleSide(false);
  renderView();
  window.scrollTo(0, 0);
}
let pending = false;
function renderView() {
  if (!current) return;
  destroyCharts();
  const el = $("#content");
  try { VIEWS[current].mod.render(el); } catch (e) { console.error(e); el.innerHTML = `<div class="card">เกิดข้อผิดพลาด: ${esc(e.message)}</div>`; }
}
window.addEventListener("hashchange", route);
onData((key) => {
  if (!current || !A.role) return;
  const deps = VIEWS[current].mod.deps || [];
  if (!deps.includes(key) || pending) return;
  pending = true;
  requestAnimationFrame(() => { pending = false; renderView(); });
});
// รีเฟรชหน้าภาพรวมทุกนาที (เปลี่ยนวัน/เวลา)
setInterval(() => { if (current === "dashboard") emit("tick"); }, 60000);
