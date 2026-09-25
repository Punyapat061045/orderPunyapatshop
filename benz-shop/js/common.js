// ฟังก์ชันใช้ร่วมกันระหว่างหน้าลูกค้าและหน้าแอดมิน

export const STATUS = {
  pending:   { label: "รอดำเนินการ",   step: 0 },
  preparing: { label: "กำลังจัดเตรียม", step: 1 },
  ready:     { label: "พร้อมส่งมอบ",   step: 2 },
  completed: { label: "สำเร็จ",        step: 3 },
  cancelled: { label: "ยกเลิก",        step: -1 },
};
export const STATUS_FLOW = ["pending", "preparing", "ready", "completed"];
export const PAY = {
  unpaid: { label: "ยังไม่จ่าย", cls: "warn" },
  slip:   { label: "แนบสลิปแล้ว รอตรวจ", cls: "s-preparing" },
  paid:   { label: "จ่ายแล้ว", cls: "ok" },
};
export const PAY_METHOD = { transfer: "โอนเงิน", cash: "เงินสด", later: "จ่ายทีหลัง" };

export const DEFAULT_SETTINGS = {
  shopName: "ร้านของเบนซ์",
  tagline: "สุกี้โรลโฮมเมด & กรีกโยเกิร์ต",
  logo: "",
  themeColor: "#f47c9b",
  phone: "",
  lineId: "",
  facebook: "",
  instagram: "",
  address: "",
  hours: "",
  orderingOpen: true,
  qrBaseUrl: "",
  // สั่งล่วงหน้า / จัดส่ง
  leadDays: 1,          // ส่งเร็วสุดกี่วันหลังสั่ง (1 = สั่งวันนี้ ส่งพรุ่งนี้)
  cutoffTime: "",       // เวลาปิดรับของรอบถัดไป เช่น "20:00" (ว่าง = ไม่จำกัด)
  preorderDays: 7,      // ให้ลูกค้าเลือกวันส่งล่วงหน้าได้กี่วัน
  closedDays: [],       // วันที่ไม่ส่ง 0=อาทิตย์ ... 6=เสาร์
  deliveryPoints: [],   // จุดส่งที่ใช้บ่อย เช่น "อาคาร A ชั้น 3"
  // ชำระเงิน
  bankName: "",
  bankAccountName: "",
  bankAccount: "",
  payQr: "",            // รูป QR พร้อมเพย์/ธนาคาร (data URL)
  payNote: "",
  payLater: false,      // อนุญาตให้ลูกค้าสั่งก่อนแล้วจ่ายทีหลัง
};
/** ร้านตั้งค่าช่องทางโอนเงินแล้วหรือยัง */
export const hasPayment = (st) => !!(st.bankAccount || st.payQr);
export const WEEKDAYS = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];

export const THEME_PRESETS = ["#f47c9b", "#f79a6b", "#e9b949", "#5cc1a0", "#6aa9e9", "#a58be0", "#e27fc9"];

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const baht = (n, withUnit = true) => {
  const v = Number(n) || 0;
  const s = v.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return withUnit ? `${s} บาท` : s;
};
export const fmtNum = (n, d = 2) => (Number(n) || 0).toLocaleString("th-TH", { maximumFractionDigits: d });

const pad = (n) => String(n).padStart(2, "0");
/** YYYY-MM-DD ตามเวลาเครื่อง */
export const dateKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const monthKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
export const parseKey = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d || 1); };
export const startOfDay = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const startOfWeek = (d = new Date()) => { const s = startOfDay(d); const wd = (s.getDay() + 6) % 7; return addDays(s, -wd); }; // จันทร์

export const toDate = (ts) => (ts?.toDate ? ts.toDate() : ts instanceof Date ? ts : ts ? new Date(ts) : null);
export const fmtTime = (ts) => { const d = toDate(ts); return d ? d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) + " น." : "–"; };
export const fmtDate = (d, opt = { day: "numeric", month: "short", year: "2-digit" }) => (toDate(d) || parseKey(d)).toLocaleDateString("th-TH", opt);
export const fmtDateTime = (ts) => { const d = toDate(ts); return d ? `${fmtDate(d)} ${fmtTime(d)}` : "–"; };
export const thMonth = (k) => parseKey(k + "-01").toLocaleDateString("th-TH", { month: "short", year: "2-digit" });

/** วันที่ลูกค้าเลือกส่งได้ (YYYY-MM-DD) ตามการตั้งค่าร้าน */
export function deliveryDates(st, now = new Date()) {
  let lead = Math.max(0, Number(st.leadDays ?? 1) || 0);
  const m = /^(\d{1,2}):(\d{2})$/.exec(st.cutoffTime || "");
  if (m && now.getHours() * 60 + now.getMinutes() >= Number(m[1]) * 60 + Number(m[2])) lead += 1;
  const closed = new Set((st.closedDays || []).map(Number));
  const want = Math.min(30, Math.max(1, Number(st.preorderDays) || 7));
  const out = [];
  for (let i = lead; out.length < want && i < lead + 60; i++) {
    const d = addDays(startOfDay(now), i);
    if (!closed.has(d.getDay())) out.push(dateKey(d));
  }
  return out;
}
export const relDay = (k) => k === dateKey() ? "วันนี้" : k === dateKey(addDays(new Date(), 1)) ? "พรุ่งนี้" : k === dateKey(addDays(new Date(), 2)) ? "มะรืนนี้" : "";
export const fmtDelivery = (k) => { if (!k) return ""; const r = relDay(k); const d = parseKey(k).toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short" }); return r ? `${r} (${d})` : d; };

export const uid = (p = "") => p + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

/** ราคาต่อหน่วยของรายการ (ราคาเมนู + ราคาตัวเลือกเพิ่ม) */
export const unitPriceOf = (basePrice, options = []) =>
  (Number(basePrice) || 0) + options.reduce((s, o) => s + (Number(o.price) || 0), 0);

export function applyTheme(settings) {
  const c = settings?.themeColor || DEFAULT_SETTINGS.themeColor;
  document.documentElement.style.setProperty("--brand", c);
  // เลือกสีตัวอักษรบนปุ่มให้อ่านง่าย
  const hex = c.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.substr(i, 2), 16));
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  document.documentElement.style.setProperty("--brand-ink", lum > 0.72 ? "#3b2a35" : "#ffffff");
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", c);
}

// ---------- toast ----------
let toastBox;
export function toast(msg, type = "", ms = 3200, onClick) {
  if (!toastBox) { toastBox = document.createElement("div"); toastBox.className = "toasts"; toastBox.setAttribute("role", "status"); document.body.appendChild(toastBox); }
  const t = document.createElement("div");
  t.className = "toast " + type;
  t.textContent = msg;
  if (onClick) t.addEventListener("click", () => { onClick(); t.remove(); });
  toastBox.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

// ---------- modal ----------
export function openModal(html, { wide = false, onClose } = {}) {
  const ov = document.createElement("div");
  ov.className = "overlay";
  ov.innerHTML = `<div class="modal ${wide ? "wide" : ""}" role="dialog" aria-modal="true">${html}</div>`;
  const close = () => { ov.remove(); document.removeEventListener("keydown", onKey); onClose && onClose(); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  ov.addEventListener("mousedown", (e) => { if (e.target === ov) close(); });
  ov.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) close(); });
  document.addEventListener("keydown", onKey);
  document.body.appendChild(ov);
  const first = ov.querySelector("input:not([type=hidden]), select, textarea");
  if (first && window.matchMedia("(min-width: 720px)").matches) setTimeout(() => first.focus(), 50);
  return { el: ov.firstElementChild, close };
}

export function confirmDialog(message, { okText = "ยืนยัน", danger = false } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const m = openModal(`
      <div class="modal-head"><h3>${esc(message)}</h3></div>
      <div class="modal-foot">
        <button class="btn ghost" data-close>ยกเลิก</button>
        <button class="btn ${danger ? "danger" : "primary"}" data-ok>${esc(okText)}</button>
      </div>`, { onClose: () => { if (!done) resolve(false); } });
    m.el.querySelector("[data-ok]").addEventListener("click", () => { done = true; resolve(true); m.close(); });
  });
}

// ---------- image resize → data URL ----------
export function resizeImage(file, max = 480, quality = 0.72) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith("image/")) return reject(new Error("ไฟล์ต้องเป็นรูปภาพ"));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      const png = file.type === "image/png" && max <= 256; // โลโก้เล็กเก็บเป็น PNG ได้
      resolve(c.toDataURL(png ? "image/png" : "image/jpeg", quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("เปิดรูปไม่ได้")); };
    img.src = url;
  });
}

// ---------- browser storage (ปลอดภัยเมื่อถูกบล็อก) ----------
export const store = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

export function initials(name = "") { return (name.trim()[0] || "?").toUpperCase(); }

export const ICON = {
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20s-7-4.5-9.3-9A5 5 0 0 1 12 5.5 5 5 0 0 1 21.3 11C19 15.5 12 20 12 20z"/></svg>',
  heartFill: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 20s-7-4.5-9.3-9A5 5 0 0 1 12 5.5 5 5 0 0 1 21.3 11C19 15.5 12 20 12 20z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  minus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 12h14"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  repeat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 0 1 14-5.3L20 9"/><path d="M20 4v5h-5"/><path d="M20 12a8 8 0 0 1-14 5.3L4 15"/><path d="M4 20v-5h5"/></svg>',
  bowl: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11h18a9 9 0 0 1-18 0z"/><path d="M8 7c0-1.5 1-2 1-3.5M12 7c0-1.5 1-2 1-3.5M16 7c0-1.5 1-2 1-3.5"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></svg>',
};

// ---------- เสียงแจ้งเตือน (ต้องมีการแตะหน้าจอก่อน 1 ครั้งตามกฎของเบราว์เซอร์) ----------
let audioCtx;
export function unlockAudio() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch {}
}
export function playChime(times = 1) {
  try {
    unlockAudio();
    if (!audioCtx) return;
    const notes = [880, 1175, 1568];
    for (let r = 0; r < times; r++) {
      notes.forEach((f, i) => {
        const t0 = audioCtx.currentTime + r * 0.75 + i * 0.13;
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = "sine"; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.45);
        o.connect(g).connect(audioCtx.destination);
        o.start(t0); o.stop(t0 + 0.5);
      });
    }
  } catch {}
}

/** หน้าจอแจ้งว่ายังไม่ได้ตั้งค่า Firebase */
export function renderNotConfigured(root) {
  root.innerHTML = `
    <div style="max-width:560px;margin:10vh auto;padding:0 16px">
      <div class="card stack">
        <h2>ยังไม่ได้เชื่อมต่อฐานข้อมูล</h2>
        <p>เปิดไฟล์ <code>js/config.js</code> แล้วใส่ค่า Firebase ของร้าน ตามขั้นตอนที่ 3 ในไฟล์ <code>README.md</code> จากนั้นอัปโหลดขึ้น GitHub อีกครั้ง</p>
      </div>
    </div>`;
}
