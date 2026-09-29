// หน้าสั่งอาหารสำหรับลูกค้า
import {
  isConfigured, db, collection, doc, onSnapshot, runTransaction, serverTimestamp, writeBatch, getDoc,
} from "./fb.js";
import {
  STATUS, STATUS_FLOW, DEFAULT_SETTINGS, esc, baht, dateKey, fmtTime, fmtDate, toDate,
  unitPriceOf, applyTheme, toast, openModal, store, initials, ICON, renderNotConfigured,
  unlockAudio, playChime, deliveryDates, fmtDelivery, PAY, PAY_METHOD, hasPayment, resizeImage,
} from "./common.js";

const $ = (s, r = document) => r.querySelector(s);
const view = $("#view");
const params = new URLSearchParams(location.search);

const S = {
  step: 1,
  settings: { ...DEFAULT_SETTINGS },
  categories: [],
  products: [],
  ready: { settings: false, cats: false, prods: false },
  name: store.get("benz.name", ""),
  phone: store.get("benz.phone", ""),
  point: store.get("benz.point", ""),
  deliveryDate: "",
  cart: store.get("benz.cart", []),
  favs: new Set(store.get("benz.favs", [])),
  history: store.get("benz.history", []),
  activeCat: "all",
  trackId: params.get("order") || null,
  trackUnsub: null,
  trackOrder: undefined,
  lastStatus: null,
  placing: false,
  slip: "",          // รูปสลิป (data URL) ที่เลือกไว้ในหน้าชำระเงิน
  payMode: "",
  coupon: null,      // { code, type, value, minTotal }
  bag: store.get("benz.bag", null),        // true/false
  cutlery: store.get("benz.cutlery", null), // true/false
  deskNote: store.get("benz.deskNote", ""),
  deskPhoto: store.get("benz.deskPhoto", ""),
};
const subtotalOf = (lines) => lines.reduce((s, x) => s + (x.v.ok ? x.v.unitPrice * x.l.qty : 0), 0);
function discountOf(sub) {
  const c = S.coupon; if (!c) return 0;
  if (c.minTotal && sub < c.minTotal) return 0;
  const d = c.type === "percent" ? Math.round((sub * c.value) / 100) : Number(c.value) || 0;
  return Math.max(0, Math.min(sub, d));
}

const saveCart = () => store.set("benz.cart", S.cart);
const saveHistory = () => store.set("benz.history", S.history.slice(0, 10));
const productById = (id) => S.products.find((p) => p.id === id);
document.addEventListener("pointerdown", unlockAudio, { once: true });

// ======================= boot =======================
if (!isConfigured) {
  renderNotConfigured($(".c-wrap"));
} else {
  onSnapshot(doc(db, "settings", "shop"), (snap) => {
    S.settings = { ...DEFAULT_SETTINGS, ...(snap.exists() ? snap.data() : {}) };
    S.ready.settings = true;
    applyTheme(S.settings);
    renderHeader();
    render();
  }, onLoadError);
  onSnapshot(collection(db, "categories"), (snap) => {
    S.categories = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name, "th"));
    S.ready.cats = true; render();
  }, onLoadError);
  onSnapshot(collection(db, "products"), (snap) => {
    S.products = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name, "th"));
    S.ready.prods = true; render();
  }, onLoadError);
  if (S.trackId) S.step = 5;
  renderHeader();
}

function onLoadError(err) {
  console.error(err);
  view.innerHTML = `<div class="card empty">โหลดข้อมูลร้านไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วรีเฟรชหน้านี้</div>`;
}

// ======================= header / footer =======================
function renderHeader() {
  const st = S.settings;
  document.title = `${st.shopName} — สั่งอาหาร`;
  $("#shopName").textContent = st.shopName;
  $("#tagline").textContent = st.tagline || "";
  $("#logo").innerHTML = st.logo ? `<img src="${esc(st.logo)}" alt="">` : esc(initials(st.shopName));
  const os = $("#openState");
  if (st.orderingOpen === false) {
    os.hidden = false; os.innerHTML = `<span class="pill warn">ปิดรับออเดอร์ชั่วคราว</span>`;
  } else if (st.hours) {
    os.hidden = false; os.innerHTML = `<span class="pill ok">เปิดรับออเดอร์</span><span class="muted">${esc(st.hours)}</span>`;
  } else { os.hidden = false; os.innerHTML = `<span class="pill ok">เปิดรับออเดอร์</span>`; }
  $("#myOrdersBtn").hidden = S.history.length === 0;

  const f = [];
  if (st.phone) f.push(`<span>${ICON.phone} <a href="tel:${esc(st.phone.replace(/[^0-9+]/g, ""))}">${esc(st.phone)}</a></span>`);
  if (st.lineId) f.push(`<span>LINE: ${esc(st.lineId)}</span>`);
  const link = (label, v) => /^https?:\/\//.test(v) ? `<a href="${esc(v)}" target="_blank" rel="noopener">${label}</a>` : `<span>${label}: ${esc(v)}</span>`;
  if (st.facebook) f.push(link("Facebook", st.facebook));
  if (st.instagram) f.push(link("Instagram", st.instagram));
  $("#foot").innerHTML = `
    ${f.length ? `<div class="row">${f.join("")}</div>` : ""}
    ${st.address ? `<div>${ICON.pin} ${esc(st.address)}</div>` : ""}
    ${st.hours ? `<div>${ICON.clock} ${esc(st.hours)}</div>` : ""}`;
}
$("#myOrdersBtn").addEventListener("click", openMyOrders);

function setStep(n) {
  S.step = n;
  document.querySelectorAll(".step").forEach((el) => el.classList.toggle("on", Number(el.dataset.s) <= n));
  window.scrollTo({ top: 0, behavior: "smooth" });
  render();
}

// ======================= render =======================
function render() {
  document.querySelectorAll(".step").forEach((el) => el.classList.toggle("on", Number(el.dataset.s) <= S.step));
  if (!isConfigured) return;
  if (S.step === 5) return renderTrack();
  if (!S.ready.settings || !S.ready.cats || !S.ready.prods) { view.innerHTML = `<div class="spinner"></div>`; return; }
  if (S.step === 1) renderMenu();
  else if (S.step === 2) renderSummary();
  else if (S.step === 3) renderName();
  else if (S.step === 4) renderPayment();
  renderCartBar();
}

// ---------- step 1 : ข้อมูลผู้สั่ง + วันส่ง + จุดส่ง ----------
function validDates() { return deliveryDates(S.settings); }
function ensureDate() {
  const ds = validDates();
  if (!ds.includes(S.deliveryDate)) S.deliveryDate = ds[0] || "";
  return ds;
}
function renderName() {
  const ds = ensureDate();
  const points = S.settings.deliveryPoints || [];
  const custom = !points.includes(S.point);
  view.innerHTML = `
    <section class="card welcome">
      <div class="stack" style="gap:4px">
        <h2>ข้อมูลการจัดส่ง</h2>
        <p class="muted">บอกชื่อ วันที่อยากรับ และที่ส่ง ร้านจะนำไปส่งให้ถึงที่ค่ะ</p>
      </div>
      <label class="field">ชื่อลูกค้า *
        <input class="input" id="nameIn" maxlength="40" autocomplete="nickname" placeholder="เช่น มิ้นท์" value="${esc(S.name)}">
      </label>
      <label class="field">เบอร์โทร (ไม่บังคับ)
        <input class="input" id="phoneIn" maxlength="20" inputmode="tel" autocomplete="tel" placeholder="ไว้ติดต่อตอนไปส่ง" value="${esc(S.phone)}">
      </label>
      <div class="field" role="group" aria-labelledby="dLbl"><span id="dLbl">วันที่รับอาหาร *</span>
        <div class="opt-list" id="dateList">${ds.map((k) => `<button type="button" class="chip" role="radio" aria-checked="${k === S.deliveryDate}" data-d="${k}">${esc(fmtDelivery(k))}</button>`).join("")}</div>
        ${S.settings.cutoffTime ? `<span class="small muted" style="font-weight:500">สั่งหลัง ${esc(S.settings.cutoffTime)} น. จะได้รับรอบถัดไป</span>` : ""}
      </div>
      <div class="field" role="group" aria-labelledby="pLbl"><span id="pLbl">ส่งที่ไหน *</span>
        ${points.length ? `<div class="opt-list" id="pointList">
          ${points.map((p) => `<button type="button" class="chip" role="radio" aria-checked="${p === S.point}" data-p="${esc(p)}">${esc(p)}</button>`).join("")}
          <button type="button" class="chip" role="radio" aria-checked="${custom && !!S.point}" data-p="__other">ที่อื่น</button>
        </div>` : ""}
        <input class="input" id="pointIn" maxlength="80" placeholder="เช่น ฝ่ายบุคคล อาคาร B ชั้น 5" value="${esc(custom ? S.point : "")}" ${points.length && !(custom && S.point) ? "hidden" : ""}>
      </div>
      <div class="field" role="group"><span>ถุงหูหิ้ว *</span>
        <div class="opt-list" id="bagList">
          <button type="button" class="chip" role="radio" data-bag="1" aria-checked="${S.bag === true}">ใส่ถุงหูหิ้ว</button>
          <button type="button" class="chip" role="radio" data-bag="0" aria-checked="${S.bag === false}">ไม่ใส่ถุง</button>
        </div></div>
      <div class="field" role="group"><span>ช้อนส้อม *</span>
        <div class="opt-list" id="cutList">
          <button type="button" class="chip" role="radio" data-cut="1" aria-checked="${S.cutlery === true}">รับช้อนส้อม</button>
          <button type="button" class="chip" role="radio" data-cut="0" aria-checked="${S.cutlery === false}">ไม่รับ</button>
        </div></div>
      <label class="field">ส่งที่โต๊ะไหน (ไม่บังคับ)
        <input class="input" id="deskIn" maxlength="80" placeholder="เช่น โต๊ะริมหน้าต่าง แถว 3 ข้างเครื่องปริ้น" value="${esc(S.deskNote)}">
      </label>
      <div class="field"><span>รูปโต๊ะทำงาน (ไม่บังคับ) ช่วยให้ร้านหาเจอง่ายขึ้น</span>
        <label class="slip-drop ${S.deskPhoto ? "has" : ""}" style="min-height:90px">
          ${S.deskPhoto ? `<img src="${S.deskPhoto}" alt="รูปโต๊ะ" style="max-height:200px">` : `<span>${ICON.plus}<br>ถ่าย/เลือกรูปโต๊ะ</span>`}
          <input type="file" accept="image/*" id="deskPhotoIn" hidden>
        </label>
        ${S.deskPhoto ? `<button type="button" class="btn ghost sm" id="deskPhotoRm" style="justify-self:start">ลบรูป</button>` : ""}
      </div>
      <p class="small" id="nameErr" style="color:var(--danger)" hidden></p>
      <button class="btn primary lg block" id="toMenu">ไปชำระเงิน</button>
      <button class="btn ghost sm" id="backCart2" style="justify-self:center">กลับไปแก้ตะกร้า</button>
    </section>`;
  const inp = $("#nameIn"), pin = $("#pointIn"), err = $("#nameErr");
  let pointChoice = custom ? (S.point ? "__other" : "") : S.point;
  $("#dateList").onclick = (e) => {
    const b = e.target.closest("[data-d]"); if (!b) return;
    S.deliveryDate = b.dataset.d;
    view.querySelectorAll("[data-d]").forEach((x) => x.setAttribute("aria-checked", x === b));
  };
  const pl = $("#pointList");
  if (pl) pl.onclick = (e) => {
    const b = e.target.closest("[data-p]"); if (!b) return;
    pointChoice = b.dataset.p;
    if (pointChoice !== "__other") S.point = pointChoice;
    pl.querySelectorAll("[data-p]").forEach((x) => x.setAttribute("aria-checked", x === b));
    pin.hidden = pointChoice !== "__other";
    if (!pin.hidden) pin.focus();
  };
  const pick = (listId, attr, key) => { $(listId).onclick = (e) => {
    const b = e.target.closest(`[${attr}]`); if (!b) return;
    S[key] = b.getAttribute(attr) === "1";
    $(listId).querySelectorAll(`[${attr}]`).forEach((x) => x.setAttribute("aria-checked", x === b));
    err.hidden = true;
  }; };
  pick("#bagList", "data-bag", "bag"); pick("#cutList", "data-cut", "cutlery");
  const keepForm = () => {
    S.name = inp.value.trim(); S.phone = $("#phoneIn").value.trim(); S.deskNote = $("#deskIn").value.trim();
    if (!pin.hidden && pin.value.trim()) S.point = pin.value.trim();
  };
  $("#deskPhotoIn").onchange = async (e) => {
    try { keepForm(); S.deskPhoto = await resizeImage(e.target.files[0], 900, 0.7); store.set("benz.deskPhoto", S.deskPhoto); renderName(); }
    catch (er) { toast(er.message, "bad"); }
  };
  const dpr = $("#deskPhotoRm"); if (dpr) dpr.onclick = () => { keepForm(); S.deskPhoto = ""; store.set("benz.deskPhoto", ""); renderName(); };
  const go = () => {
    const v = inp.value.trim();
    const point = (pl ? (pointChoice === "__other" ? pin.value : pointChoice) : pin.value).trim();
    const msg = !v ? "กรุณากรอกชื่อ" : !S.deliveryDate ? "ยังไม่มีวันส่งที่เลือกได้ กรุณาติดต่อร้าน" : !point ? "กรุณาระบุที่ส่ง"
      : S.bag == null ? "กรุณาเลือกว่าจะใส่ถุงหูหิ้วไหม" : S.cutlery == null ? "กรุณาเลือกว่าจะรับช้อนส้อมไหม" : "";
    if (msg) { err.textContent = msg; err.hidden = false; if (!v) { inp.classList.add("invalid"); inp.focus(); } return; }
    S.name = v; S.phone = $("#phoneIn").value.trim(); S.point = point;
    store.set("benz.name", v); store.set("benz.phone", S.phone); store.set("benz.point", point);
    S.deskNote = $("#deskIn").value.trim();
    store.set("benz.bag", S.bag); store.set("benz.cutlery", S.cutlery); store.set("benz.deskNote", S.deskNote);
    setStep(4);
  };
  $("#toMenu").addEventListener("click", go);
  $("#backCart2").onclick = () => setStep(2);
  inp.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
  inp.addEventListener("input", () => { inp.classList.remove("invalid"); err.hidden = true; });
  pin.addEventListener("input", () => { err.hidden = true; });
}

// ---------- step 2 ----------
function cartQtyOf(pid) { return S.cart.filter((l) => l.productId === pid).reduce((s, l) => s + l.qty, 0); }

function menuCard(p, i) {
  const sold = p.active === false;
  const q = cartQtyOf(p.id);
  const fav = S.favs.has(p.id);
  return `
    <div class="m-card ${sold ? "soldout" : ""}" role="button" tabindex="${sold ? -1 : 0}" data-pid="${p.id}" style="animation-delay:${Math.min(i, 8) * 40}ms" aria-label="${esc(p.name)} ${p.price} บาท">
      ${p.image ? `<img class="thumb" src="${esc(p.image)}" alt="" loading="lazy">` : `<div class="thumb thumb-ph">${esc(initials(p.name))}</div>`}
      ${q ? `<span class="in-cart">${q}</span>` : ""}
      <div class="info">
        <h4>${esc(p.name)}</h4>
        ${p.description ? `<p class="desc">${esc(p.description)}</p>` : ""}
        <p class="price num">${baht(p.price, false)} <small>บาท / ${esc(p.unit || "ที่")}</small></p>
        ${sold ? `<span class="pill s-cancelled" style="width:fit-content">หมดแล้ว</span>` : ""}
      </div>
      <button class="fav ${fav ? "on" : ""}" data-fav="${p.id}" aria-label="${fav ? "เอาออกจากรายการโปรด" : "เพิ่มในรายการโปรด"}" aria-pressed="${fav}">${fav ? ICON.heartFill : ICON.heart}</button>
      <span class="add" aria-hidden="true">${ICON.plus}</span>
    </div>`;
}

function renderMenu() {
  const st = S.settings;
  const visible = S.products;
  const catIds = new Set(S.categories.map((c) => c.id));
  const groups = S.categories.map((c) => ({ ...c, items: visible.filter((p) => p.categoryId === c.id) }))
    .filter((g) => g.items.length);
  const orphans = visible.filter((p) => !catIds.has(p.categoryId));
  if (orphans.length) groups.push({ id: "_other", name: "อื่น ๆ", items: orphans });
  const favItems = visible.filter((p) => S.favs.has(p.id));
  if (S.activeCat === "fav" && !favItems.length) S.activeCat = "all";
  if (!["all", "fav"].includes(S.activeCat) && !groups.some((g) => g.id === S.activeCat)) S.activeCat = "all";

  let shown;
  if (S.activeCat === "all") shown = groups;
  else if (S.activeCat === "fav") shown = [{ id: "fav", name: "รายการโปรด", items: favItems }];
  else shown = groups.filter((g) => g.id === S.activeCat);

  const recent = S.history.filter((h) => h.items?.length).slice(0, 2);
  let i = 0;
  view.innerHTML = `
    ${st.orderingOpen === false ? `<div class="closed-banner">ตอนนี้ร้านปิดรับออเดอร์ชั่วคราว ดูเมนูได้แต่ยังสั่งไม่ได้นะคะ</div>` : ""}
    <p class="muted" style="margin-bottom:12px">เลือกเมนูใส่ตะกร้าได้เลยค่ะ สั่งล่วงหน้า ร้านนำไปส่งให้ถึงที่</p>
    ${recent.length ? `<div class="reorder">${recent.map((h) => `
      <div class="reorder-item">
        <div class="grow"><b>สั่งซ้ำ #${esc(h.orderNo)}</b> <span class="muted">· ${esc(fmtDate(new Date(h.createdAt)))}</span><br>
          <span class="muted">${esc(h.items.map((x) => `${x.name} ×${x.qty}`).join(", "))}</span></div>
        <button class="btn sm" data-reorder="${h.id}">${ICON.repeat} ใส่ตะกร้า</button>
      </div>`).join("")}</div>` : ""}
    <div class="cat-bar" role="tablist">
      <button class="chip ${S.activeCat === "all" ? "active" : ""}" data-cat="all">ทั้งหมด</button>
      ${favItems.length ? `<button class="chip ${S.activeCat === "fav" ? "active" : ""}" data-cat="fav">${ICON.heartFill.replace("<svg", '<svg width="14" height="14" style="color:var(--danger)"')} รายการโปรด</button>` : ""}
      ${groups.map((g) => `<button class="chip ${S.activeCat === g.id ? "active" : ""}" data-cat="${g.id}">${esc(g.name)}</button>`).join("")}
    </div>
    ${shown.length ? shown.map((g) => `
      <h3 class="cat-title">${esc(g.name)} <small>${g.items.length} รายการ</small></h3>
      <div class="menu-grid">${g.items.map((p) => menuCard(p, i++)).join("")}</div>`).join("")
      : `<div class="card empty">${ICON.bowl}<p>ยังไม่มีเมนูในตอนนี้</p></div>`}
  `;

  view.querySelectorAll("[data-cat]").forEach((b) => b.onclick = () => { S.activeCat = b.dataset.cat; renderMenu(); });
  view.querySelectorAll("[data-reorder]").forEach((b) => b.onclick = () => reorder(b.dataset.reorder));
  view.querySelectorAll(".m-card").forEach((card) => {
    const open = (e) => {
      if (e.target.closest("[data-fav]")) return;
      const p = productById(card.dataset.pid);
      if (p && p.active !== false) openProduct(p);
    };
    card.addEventListener("click", open);
    card.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(e); } });
  });
  view.querySelectorAll("[data-fav]").forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    const id = b.dataset.fav;
    S.favs.has(id) ? S.favs.delete(id) : S.favs.add(id);
    store.set("benz.favs", [...S.favs]);
    renderMenu();
  });
}

function openProduct(p) {
  const groups = p.optionGroups || [];
  const sel = {};
  groups.forEach((g) => { sel[g.id] = new Set(g.type !== "multi" && g.choices?.length === 1 ? [g.choices[0].id] : []); });
  let qty = 1;

  const m = openModal(`
    <div class="sheet-img ${p.image ? "" : "noimg"}">${p.image ? `<img src="${esc(p.image)}" alt="">` : `<div class="thumb thumb-ph">${esc(initials(p.name))}</div>`}</div>
    <div class="modal-head" style="margin-bottom:4px">
      <div class="grow"><h3>${esc(p.name)}</h3>
        <p class="muted small">${esc(p.description || "")}</p></div>
      <button class="btn icon ghost" data-close aria-label="ปิด">${ICON.x}</button>
    </div>
    <p class="num" style="font-weight:700;color:var(--brand-strong)">${baht(p.price)} / ${esc(p.unit || "ที่")}</p>
    ${groups.map((g) => `
      <div class="opt-group" data-g="${g.id}">
        <h5>${esc(g.name)} ${g.required ? `<span class="req">ต้องเลือก</span>` : `<span class="muted small" style="font-family:var(--font-body);font-weight:500">${g.type === "multi" ? "เลือกได้หลายอย่าง" : "ไม่บังคับ"}</span>`}</h5>
        <div class="opt-list" role="${g.type === "multi" ? "group" : "radiogroup"}" aria-label="${esc(g.name)}">
          ${(g.choices || []).map((c) => `<button type="button" class="chip" role="${g.type === "multi" ? "checkbox" : "radio"}" data-c="${c.id}" aria-checked="false">
            ${esc(c.name)}${Number(c.price) ? ` <small>+${baht(c.price, false)}</small>` : ""}</button>`).join("")}
        </div>
      </div>`).join("")}
    <div class="form-grid" style="margin-top:18px">
      <label class="field">สั่งให้ใคร (ถ้าสั่งแทนเพื่อน)
        <input class="input" id="lineFor" maxlength="30" placeholder="เช่น พี่ต่าย" list="forNames">
        <datalist id="forNames">${[...new Set(S.cart.map((l) => l.forName).filter(Boolean))].map((n) => `<option value="${esc(n)}">`).join("")}</datalist>
      </label>
      <label class="field">หมายเหตุถึงร้าน (ถ้ามี)
        <input class="input" id="lineNote" maxlength="80" placeholder="เช่น ไม่ใส่ผัก, แยกน้ำจิ้ม">
      </label>
    </div>
    <div class="modal-foot" style="justify-content:space-between;align-items:center">
      <div class="qty"><button type="button" data-q="-1" aria-label="ลดจำนวน">${ICON.minus}</button><output id="qv">1</output><button type="button" data-q="1" aria-label="เพิ่มจำนวน">${ICON.plus}</button></div>
      <button class="btn primary lg" id="addBtn"></button>
    </div>`);

  const el = m.el;
  const selectedOptions = () => groups.flatMap((g) => (g.choices || []).filter((c) => sel[g.id].has(c.id))
    .map((c) => ({ groupId: g.id, group: g.name, choiceId: c.id, name: c.name, price: Number(c.price) || 0 })));
  const refresh = () => {
    groups.forEach((g) => {
      const box = el.querySelector(`[data-g="${g.id}"]`);
      box.querySelectorAll("[data-c]").forEach((b) => b.setAttribute("aria-checked", sel[g.id].has(b.dataset.c)));
      const req = box.querySelector(".req");
      if (req) { const ok = sel[g.id].size > 0; req.classList.toggle("done", ok); req.textContent = ok ? "เลือกแล้ว" : "ต้องเลือก"; }
    });
    el.querySelector("#qv").textContent = qty;
    const total = unitPriceOf(p.price, selectedOptions()) * qty;
    el.querySelector("#addBtn").innerHTML = `${ICON.bag} ใส่ตะกร้า · ${baht(total, false)} บาท`;
  };
  groups.forEach((g) => {
    el.querySelector(`[data-g="${g.id}"]`).addEventListener("click", (e) => {
      const b = e.target.closest("[data-c]"); if (!b) return;
      const s = sel[g.id], c = b.dataset.c;
      if (g.type === "multi") s.has(c) ? s.delete(c) : s.add(c);
      else if (s.has(c) && !g.required) s.clear();
      else { s.clear(); s.add(c); }
      refresh();
    });
  });
  el.querySelectorAll("[data-q]").forEach((b) => b.onclick = () => { qty = Math.max(1, Math.min(99, qty + Number(b.dataset.q))); refresh(); });
  el.querySelector("#addBtn").onclick = () => {
    const missing = groups.find((g) => g.required && sel[g.id].size === 0);
    if (missing) {
      const box = el.querySelector(`[data-g="${missing.id}"]`);
      box.classList.remove("shake"); void box.offsetWidth; box.classList.add("shake");
      box.scrollIntoView({ behavior: "smooth", block: "center" });
      toast(`กรุณาเลือก${missing.name}`, "bad");
      return;
    }
    addToCart(p, selectedOptions(), qty, el.querySelector("#lineNote").value.trim(), el.querySelector("#lineFor").value.trim());
    m.close();
    toast(`เพิ่ม ${p.name} ×${qty} แล้ว`, "ok", 1800);
  };
  refresh();
}

function addToCart(p, options, qty, note = "", forName = "") {
  const key = [p.id, options.map((o) => o.choiceId).sort().join(","), note, forName].join("|");
  const ex = S.cart.find((l) => l.key === key);
  if (ex) ex.qty = Math.min(99, ex.qty + qty);
  else S.cart.push({ key, productId: p.id, name: p.name, unit: p.unit || "", basePrice: Number(p.price) || 0, options, qty, note, forName });
  saveCart();
  render();
}

function reorder(orderId) {
  const h = S.history.find((x) => x.id === orderId);
  if (!h) return;
  let added = 0, skipped = 0;
  for (const it of h.items) {
    const p = productById(it.productId);
    if (!p || p.active === false) { skipped++; continue; }
    const opts = [];
    let ok = true;
    for (const cid of it.choiceIds || []) {
      const g = (p.optionGroups || []).find((g) => (g.choices || []).some((c) => c.id === cid));
      const c = g?.choices.find((c) => c.id === cid);
      if (!c) { ok = false; break; }
      opts.push({ groupId: g.id, group: g.name, choiceId: c.id, name: c.name, price: Number(c.price) || 0 });
    }
    if (!ok) { skipped++; continue; }
    addToCart(p, opts, it.qty, it.note || "", it.forName || "");
    added++;
  }
  if (added) toast(`ใส่ตะกร้าแล้ว ${added} รายการ${skipped ? ` (มี ${skipped} รายการที่ไม่พร้อมขาย)` : ""}`, "ok");
  else toast("เมนูในออเดอร์นี้ไม่พร้อมขายแล้ว", "bad");
}

// ---------- cart bar ----------
function renderCartBar() {
  const bar = $("#cartBar");
  const n = S.cart.reduce((s, l) => s + l.qty, 0);
  if (S.step !== 1 || !n) { bar.innerHTML = ""; return; }
  const total = S.cart.reduce((s, l) => s + unitPriceOf(l.basePrice, l.options) * l.qty, 0);
  bar.innerHTML = `<div class="cart-bar"><button class="btn primary lg" id="toSum">
    <span class="row" style="gap:10px"><span class="count num">${n}</span> ดูตะกร้า</span>
    <span class="num">${baht(total)}</span></button></div>`;
  $("#toSum").onclick = () => setStep(2);
}

// ---------- step 3 ----------
/** ตรวจรายการในตะกร้ากับเมนูปัจจุบัน (ราคาอาจเปลี่ยน/ของหมด) */
function validateLine(l) {
  const p = productById(l.productId);
  if (!p) return { ok: false, reason: "เมนูนี้ถูกนำออกแล้ว" };
  if (p.active === false) return { ok: false, reason: "หมดแล้ว" };
  const options = [];
  for (const o of l.options) {
    const g = (p.optionGroups || []).find((g) => g.id === o.groupId);
    const c = g?.choices?.find((c) => c.id === o.choiceId);
    if (!c) return { ok: false, reason: "ตัวเลือกเปลี่ยนแล้ว กรุณาเลือกใหม่" };
    options.push({ groupId: g.id, group: g.name, choiceId: c.id, name: c.name, price: Number(c.price) || 0 });
  }
  for (const g of p.optionGroups || []) {
    if (g.required && !options.some((o) => o.groupId === g.id)) return { ok: false, reason: `ยังไม่ได้เลือก${g.name}` };
  }
  const unitPrice = unitPriceOf(p.price, options);
  return { ok: true, p, options, unitPrice };
}

function renderSummary() {
  if (!S.cart.length) {
    view.innerHTML = `<div class="card empty">${ICON.bag}<p>ตะกร้ายังว่างอยู่</p><br><button class="btn primary" id="back">เลือกเมนู</button></div>`;
    $("#back").onclick = () => setStep(1); return;
  }
  const lines = S.cart.map((l) => ({ l, v: validateLine(l) }));
  const bad = lines.some((x) => !x.v.ok);
  const total = subtotalOf(lines);
  const closed = S.settings.orderingOpen === false;
  view.innerHTML = `
    <section class="card sum-card">
      <div class="row between"><h2 style="font-size:21px">สรุปรายการ</h2><button class="btn ghost sm" id="addMore">${ICON.plus} เพิ่มเมนู</button></div>
      <div>
        ${lines.map(({ l, v }, i) => `
          <div class="sum-row">
            <div class="grow">
              <b>${esc(l.name)}</b>
              ${l.options.length ? `<div class="opts">${esc(l.options.map((o) => o.name).join(" · "))}</div>` : ""}
              ${l.forName ? `<div class="opts">สำหรับ: <b style="color:var(--ink)">${esc(l.forName)}</b></div>` : ""}
              ${l.note ? `<div class="opts">หมายเหตุ: ${esc(l.note)}</div>` : ""}
              ${v.ok ? `<div class="opts num">${baht(v.unitPrice)} / ${esc(l.unit || "ที่")}</div>` : `<div class="small" style="color:var(--danger);font-weight:600">${esc(v.reason)}</div>`}
            </div>
            <div class="stack" style="justify-items:end;gap:6px">
              <div class="qty sm"><button data-i="${i}" data-d="-1" aria-label="ลด">${ICON.minus}</button><output>${l.qty}</output><button data-i="${i}" data-d="1" aria-label="เพิ่ม" ${v.ok ? "" : "disabled"}>${ICON.plus}</button></div>
              <b class="num">${v.ok ? baht(v.unitPrice * l.qty) : "–"}</b>
            </div>
          </div>`).join("")}
      </div>
      <div class="coupon-row">
        <input class="input" id="cpIn" placeholder="โค้ดส่วนลด (ถ้ามี)" value="${esc(S.coupon?.code || "")}" maxlength="30" autocapitalize="characters" ${S.coupon ? "disabled" : ""}>
        ${S.coupon ? `<button class="btn sm ghost" id="cpRm">ยกเลิกโค้ด</button>` : `<button class="btn sm" id="cpApply">ใช้โค้ด</button>`}
      </div>
      ${S.coupon ? `<div class="kv"><span>ยอดอาหาร</span><b class="num">${baht(total)}</b></div>
        <div class="kv"><span>ส่วนลด (${esc(S.coupon.code)})</span><b class="num" style="color:var(--mint)">${discountOf(total) ? "−" + baht(discountOf(total)) : `ยังไม่ถึงขั้นต่ำ ${baht(S.coupon.minTotal)}`}</b></div>` : ""}
      <div class="sum-total"><span>ยอดรวม</span><span class="num">${baht(total - discountOf(total))}</span></div>
      ${closed ? `<div class="closed-banner" style="margin:0">ร้านปิดรับออเดอร์ชั่วคราว</div>` : ""}
      ${bad ? `<p class="small" style="color:var(--danger)">กรุณาลบรายการที่ขึ้นสีแดงก่อนยืนยัน (กด − จนหมด)</p>` : ""}
      ${new Set(S.cart.map((l) => l.forName).filter(Boolean)).size ? `<p class="muted small">สั่งรวม ${new Set(S.cart.map((l) => l.forName || S.name)).size} คน · ร้านจะแยกรายการตามชื่อให้ตอนส่ง</p>` : `<p class="muted small">สั่งแทนเพื่อนได้ กด "เพิ่มเมนู" แล้วใส่ชื่อในช่อง "สั่งให้ใคร"</p>`}
      <button class="btn primary lg block" id="confirm" ${bad || closed ? "disabled" : ""}>ถัดไป: กรอกข้อมูลจัดส่ง</button>
    </section>`;
  $("#addMore").onclick = () => setStep(1);
  view.querySelectorAll("[data-d]").forEach((b) => b.onclick = () => {
    const l = S.cart[Number(b.dataset.i)];
    l.qty += Number(b.dataset.d);
    if (l.qty <= 0) S.cart.splice(Number(b.dataset.i), 1);
    l.qty = Math.min(99, l.qty);
    saveCart(); render();
  });
  $("#confirm").onclick = () => setStep(3);
  const ap = $("#cpApply");
  if (ap) ap.onclick = async () => {
    const code = $("#cpIn").value.trim().toUpperCase();
    if (!code) return;
    if (!/^[A-Z0-9_-]{1,30}$/.test(code)) return toast("โค้ดไม่ถูกต้อง", "bad");
    ap.disabled = true;
    try {
      const snap = await getDoc(doc(db, "coupons", code));
      const c = snap.exists() ? snap.data() : null;
      if (!c || c.active === false) { toast("ไม่พบโค้ดนี้ หรือโค้ดหมดอายุแล้ว", "bad"); ap.disabled = false; return; }
      S.coupon = { code, type: c.type === "percent" ? "percent" : "amount", value: Number(c.value) || 0, minTotal: Number(c.minTotal) || 0 };
      toast(`ใช้โค้ด ${code} แล้ว`, "ok", 1800); render();
    } catch { toast("ตรวจโค้ดไม่สำเร็จ ลองใหม่อีกครั้ง", "bad"); ap.disabled = false; }
  };
  const rm = $("#cpRm"); if (rm) rm.onclick = () => { S.coupon = null; render(); };
}

// ---------- step 4 : ชำระเงิน ----------
function cartLines() { return S.cart.map((l) => ({ l, v: validateLine(l) })); }
function payMethods(st) {
  const m = [];
  if (hasPayment(st)) m.push("transfer");
  if (st.payCash !== false) m.push("cash");
  if (st.payHalf !== false) m.push("halfhalf");
  return m.length ? m : ["cash"];
}
function renderPayment() {
  const lines = cartLines();
  if (!lines.length || lines.some((x) => !x.v.ok)) { setStep(2); return; }
  if (!S.name || !S.point || !validDates().includes(S.deliveryDate) || S.bag == null || S.cutlery == null) { setStep(3); return; }
  const st = S.settings;
  const sub = subtotalOf(lines), disc = discountOf(sub), total = sub - disc;
  const methods = payMethods(st);
  if (!methods.includes(S.payMode)) S.payMode = methods[0];
  const label = { transfer: ["โอนผ่าน QR", "โอนแล้วแนบสลิป"], cash: ["เงินสด", "จ่ายตอนรับอาหาร"], halfhalf: ["คนละครึ่ง", "จ่ายผ่านแอปเป๋าตังตอนรับ"] };
  view.innerHTML = `
    <section class="card sum-card">
      <h2 style="font-size:21px">ชำระเงิน</h2>
      <div class="stack" style="gap:6px">
        <div class="kv"><span>ชื่อลูกค้า</span><b>${esc(S.name)}</b></div>
        ${S.phone ? `<div class="kv"><span>เบอร์โทร</span><b>${esc(S.phone)}</b></div>` : ""}
        <div class="kv"><span>วันที่รับอาหาร</span><b>${esc(fmtDelivery(S.deliveryDate))}</b></div>
        <div class="kv"><span>ส่งที่</span><b style="text-align:right">${esc(S.point)}${S.deskNote ? ` · ${esc(S.deskNote)}` : ""}</b></div>
        <div class="kv"><span>ถุง / ช้อนส้อม</span><b>${S.bag ? "ใส่ถุง" : "ไม่ใส่ถุง"} · ${S.cutlery ? "รับช้อนส้อม" : "ไม่รับช้อนส้อม"}</b></div>
        <button class="btn ghost sm" id="editInfo" style="justify-self:end">แก้ไขข้อมูลการส่ง</button>
      </div>
      <div class="pay-amount"><span class="muted small">ยอดที่ต้องชำระ${disc ? `<br>(ลด ${baht(disc)} จากโค้ด ${esc(S.coupon.code)})` : ""}</span><span class="num">${baht(total)}</span></div>
      <div class="field"><span>เลือกวิธีชำระเงิน *</span>
        <div class="pay-methods" id="payMode" role="radiogroup">
          ${methods.map((m) => `<button type="button" class="pay-opt" role="radio" data-m="${m}" aria-checked="${S.payMode === m}"><b>${label[m][0]}</b><small>${label[m][1]}</small></button>`).join("")}
        </div></div>
      ${S.payMode === "transfer" ? `
        <div class="pay-box">
          ${st.payQr ? `<img class="pay-qr" src="${esc(st.payQr)}" alt="QR สำหรับโอนเงิน"><p class="muted small">กดค้างที่รูปเพื่อบันทึก แล้วสแกนจากแอปธนาคาร</p>` : ""}
          ${st.bankAccount ? `<div class="bank">
            ${st.bankName ? `<div class="muted small">${esc(st.bankName)}</div>` : ""}
            <div class="acc num" id="accNo">${esc(st.bankAccount)}</div>
            ${st.bankAccountName ? `<div>${esc(st.bankAccountName)}</div>` : ""}
            <button type="button" class="btn sm" id="copyAcc">คัดลอกเลขบัญชี</button>
          </div>` : ""}
          ${st.payNote ? `<p class="small muted">${esc(st.payNote)}</p>` : ""}
        </div>
        <div class="field"><span>แนบสลิปการโอน *</span>
          <label class="slip-drop ${S.slip ? "has" : ""}">
            ${S.slip ? `<img src="${S.slip}" alt="สลิปที่แนบ">` : `<span>${ICON.plus}<br>แตะเพื่อเลือกรูปสลิป</span>`}
            <input type="file" accept="image/*" id="slipIn" hidden>
          </label>
          ${S.slip ? `<button type="button" class="btn ghost sm" id="slipRm" style="justify-self:start">เปลี่ยนรูป</button>` : ""}
        </div>` : S.payMode === "cash" ? `
        <p class="muted">เตรียมเงินสด <b style="color:var(--ink)">${baht(total)}</b> ไว้จ่ายตอนรับอาหารนะคะ</p>` : `
        <p class="muted">ชำระผ่านโครงการคนละครึ่ง (แอปเป๋าตัง) ตอนรับอาหาร ยอด <b style="color:var(--ink)">${baht(total)}</b> ร้านจะเช็กการชำระให้ค่ะ</p>`}
      <button class="btn primary lg block" id="placeBtn" ${S.payMode === "transfer" && !S.slip ? "disabled" : ""}>ยืนยันการสั่งซื้อ</button>
      ${S.payMode === "transfer" && !S.slip ? `<p class="muted small" style="text-align:center">แนบสลิปก่อนจึงจะยืนยันได้</p>` : ""}
      <button class="btn ghost sm" id="backCart" style="justify-self:center">กลับไปแก้ตะกร้า</button>
    </section>`;
  $("#payMode").onclick = (e) => { const b = e.target.closest("[data-m]"); if (b) { S.payMode = b.dataset.m; renderPayment(); } };
  const cp = $("#copyAcc");
  if (cp) cp.onclick = async () => {
    const acc = String(st.bankAccount).replace(/[^0-9]/g, "") || st.bankAccount;
    try { await navigator.clipboard.writeText(acc); toast("คัดลอกเลขบัญชีแล้ว", "ok", 1500); }
    catch { const r = document.createRange(); r.selectNodeContents($("#accNo")); getSelection().removeAllRanges(); getSelection().addRange(r); }
  };
  const si = $("#slipIn");
  if (si) si.onchange = async () => {
    try { S.slip = await resizeImage(si.files[0], 1100, 0.72); renderPayment(); }
    catch (e) { toast(e.message, "bad"); }
  };
  const sr = $("#slipRm"); if (sr) sr.onclick = () => $("#slipIn").click();
  $("#backCart").onclick = () => setStep(2);
  $("#editInfo").onclick = () => setStep(3);
  $("#placeBtn").onclick = () => placeOrder(lines);
}

async function placeOrder(lines) {
  if (S.placing) return;
  const btn = $("#placeBtn");
  S.placing = true; btn.disabled = true; btn.textContent = "กำลังส่งออเดอร์...";
  const items = lines.map(({ l, v }) => ({
    productId: l.productId, name: v.p.name, unit: v.p.unit || "",
    basePrice: Number(v.p.price) || 0, options: v.options,
    unitPrice: v.unitPrice, qty: l.qty, lineTotal: v.unitPrice * l.qty, note: l.note || "", forName: l.forName || "",
  }));
  const withSlip = S.payMode === "transfer";
  if (withSlip && !S.slip) { S.placing = false; toast("กรุณาแนบสลิป", "bad"); return; }
  const subtotal = items.reduce((s, it) => s + it.lineTotal, 0);
  const discount = discountOf(subtotal);
  const total = subtotal - discount;
  const withPhoto = !!S.deskPhoto;
  const dk = dateKey();
  const dd = S.deliveryDate;
  if (!validDates().includes(dd)) {
    S.placing = false; if (btn) { btn.disabled = false; btn.textContent = "ยืนยันการสั่งซื้อ"; }
    toast("วันส่งที่เลือกปิดรับแล้ว กรุณาเลือกวันใหม่", "bad", 4500); setStep(3); return;
  }
  const orderRef = doc(collection(db, "orders"));
  try {
    let seq = 0;
    await runTransaction(db, async (tx) => {
      const cRef = doc(db, "counters", dd);
      const c = await tx.get(cRef);
      seq = c.exists() ? (c.data().n || 0) + 1 : 1;
      if (c.exists()) tx.update(cRef, { n: seq }); else tx.set(cRef, { n: 1 });
      if (withSlip) tx.set(doc(db, "slips", orderRef.id), { image: S.slip, createdAt: serverTimestamp() });
      if (withPhoto) tx.set(doc(db, "deskPhotos", orderRef.id), { image: S.deskPhoto, createdAt: serverTimestamp() });
      tx.set(orderRef, {
        paymentStatus: withSlip ? "slip" : "unpaid", paymentMethod: S.payMode,
        subtotal, discount, ...(discount ? { couponCode: S.coupon.code } : {}),
        bag: !!S.bag, cutlery: !!S.cutlery, deskNote: (S.deskNote || "").slice(0, 80), hasDeskPhoto: withPhoto,
        ...(withSlip ? { slipAt: serverTimestamp() } : {}), source: "web",
        customerName: S.name.slice(0, 60), phone: S.phone.slice(0, 20), deliveryDate: dd, deliveryPoint: S.point.slice(0, 80), items,
        itemCount: items.reduce((s, it) => s + it.qty, 0), total,
        status: "pending", seq, orderNo: String(seq).padStart(3, "0"), dateKey: dk,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        stockDeducted: false, revenueCounted: false, note: "",
      });
    });
    S.history.unshift({
      id: orderRef.id, orderNo: String(seq).padStart(3, "0"), total, createdAt: Date.now(), deliveryDate: dd,
      items: items.map((it) => ({ productId: it.productId, name: it.name, qty: it.qty, note: it.note, forName: it.forName, choiceIds: it.options.map((o) => o.choiceId) })),
    });
    saveHistory();
    S.cart = []; saveCart(); S.slip = ""; S.coupon = null;
    goTrack(orderRef.id);
  } catch (e) {
    console.error(e);
    toast(S.settings.orderingOpen === false ? "ร้านปิดรับออเดอร์ชั่วคราว" : "ส่งออเดอร์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง", "bad", 4500);
    if (btn) { btn.disabled = false; btn.textContent = "ยืนยันการสั่งซื้อ"; }
  } finally { S.placing = false; }
}

// ---------- step 5 : ติดตามสถานะ ----------
function goTrack(id) {
  S.trackId = id; S.trackOrder = undefined; S.lastStatus = null;
  const u = new URL(location.href);
  u.searchParams.set("order", id);
  history.replaceState(null, "", u);
  renderHeader();
  setStep(5);
}

function renderTrack() {
  $("#cartBar").innerHTML = "";
  if (S.trackUnsub && S.trackUnsub.id !== S.trackId) { S.trackUnsub(); S.trackUnsub = null; }
  if (!S.trackUnsub) {
    const id = S.trackId;
    const un = onSnapshot(doc(db, "orders", id), (snap) => {
      S.trackOrder = snap.exists() ? { id: snap.id, ...snap.data() } : null;
      const st = S.trackOrder?.status;
      if (S.lastStatus && st && st !== S.lastStatus && st === "ready") {
        playChime(2); try { navigator.vibrate?.([200, 100, 200]); } catch {}
        toast("อาหารพร้อมแล้ว กำลังนำไปส่งค่ะ", "ok", 6000);
      }
      S.lastStatus = st;
      if (S.step === 5) renderTrack();
    }, () => { S.trackOrder = null; if (S.step === 5) renderTrack(); });
    un.id = id; S.trackUnsub = un;
  }
  const o = S.trackOrder;
  if (o === undefined) { view.innerHTML = `<div class="spinner"></div>`; return; }
  if (o === null) {
    view.innerHTML = `<div class="card empty"><p>ไม่พบออเดอร์นี้</p><br><button class="btn primary" id="newOrder">สั่งอาหาร</button></div>`;
    $("#newOrder").onclick = newOrder; return;
  }
  const cancelled = o.status === "cancelled";
  const cur = STATUS[o.status]?.step ?? 0;
  const headline = cancelled ? "ออเดอร์นี้ถูกยกเลิก"
    : o.status === "completed" ? "ส่งถึงแล้ว ขอบคุณที่อุดหนุนค่ะ"
    : o.status === "ready" ? "อาหารพร้อมแล้ว กำลังนำไปส่ง"
    : "สั่งสำเร็จแล้ว!";
  view.innerHTML = `
    <section class="card success">
      <div class="badge ${cancelled ? "cancel" : ""}">${cancelled ? ICON.x : ICON.check}</div>
      <h2 style="font-size:22px">${headline}</h2>
      <div><p class="muted small">เลขที่ออเดอร์</p><div class="order-no num">#${esc(o.orderNo)}</div></div>
      <div class="stack" style="width:100%;gap:6px;text-align:left">
        <div class="kv"><span>ชื่อลูกค้า</span><b>${esc(o.customerName)}</b></div>
        ${o.deliveryDate ? `<div class="kv"><span>วันที่รับอาหาร</span><b>${esc(fmtDelivery(o.deliveryDate))}</b></div>` : ""}
        ${o.deliveryPoint ? `<div class="kv"><span>ส่งที่</span><b style="text-align:right">${esc(o.deliveryPoint)}</b></div>` : ""}
        <div class="kv"><span>เวลาสั่ง</span><b>${o.createdAt ? `${fmtDate(o.createdAt)} ${fmtTime(o.createdAt)}` : "กำลังบันทึก..."}</b></div>
        <div class="kv"><span>สถานะ</span><span class="pill s-${o.status}">${STATUS[o.status]?.label || o.status}</span></div>
        ${o.paymentStatus ? `<div class="kv"><span>การชำระเงิน</span><span class="pill ${PAY[o.paymentStatus]?.cls || ""}">${PAY[o.paymentStatus]?.label || o.paymentStatus}${o.paymentMethod ? ` · ${PAY_METHOD[o.paymentMethod] || ""}` : ""}</span></div>` : ""}
      </div>
      ${cancelled ? "" : `<div class="track">${STATUS_FLOW.map((s, i) => `
        <div class="t ${i <= cur ? "on" : ""} ${i === cur && s !== "completed" ? "now" : ""}"><span class="c">${i <= cur ? ICON.check : ""}</span>${STATUS[s].label}</div>`).join("")}</div>`}
      <div style="width:100%;text-align:left;border-top:1px dashed var(--line);padding-top:12px" class="stack">
        ${o.items.map((it) => `<div class="kv"><span style="color:var(--ink)">${esc(it.name)} ×${it.qty}${it.forName ? ` <small class="muted">(${esc(it.forName)})</small>` : ""}${it.options?.length ? `<br><small class="muted">${esc(it.options.map((x) => x.name).join(" · "))}</small>` : ""}</span><b class="num">${baht(it.lineTotal)}</b></div>`).join("")}
        ${o.discount ? `<div class="kv"><span>ส่วนลด (${esc(o.couponCode || "")})</span><b class="num" style="color:var(--mint)">−${baht(o.discount)}</b></div>` : ""}
        <div class="sum-total"><span>ยอดรวม</span><span class="num">${baht(o.total)}</span></div>
      </div>
      ${o.paymentStatus === "unpaid" && o.paymentMethod === "later" && !cancelled && hasPayment(S.settings) ? `
      <div class="pay-later stack" style="width:100%;text-align:left">
        <b>ยังไม่ได้ชำระเงิน ${baht(o.total)}</b>
        ${S.settings.payQr ? `<img class="pay-qr" src="${esc(S.settings.payQr)}" alt="QR สำหรับโอนเงิน">` : ""}
        ${S.settings.bankAccount ? `<div class="small">${esc(S.settings.bankName || "")} <b class="num">${esc(S.settings.bankAccount)}</b> ${esc(S.settings.bankAccountName || "")}</div>` : ""}
        <label class="btn block">แนบสลิปการโอน<input type="file" accept="image/*" id="lateSlip" hidden></label>
      </div>` : ""}
      ${o.paymentStatus === "slip" && !cancelled ? `<label class="btn ghost sm">แนบสลิปผิด? เปลี่ยนรูปสลิป<input type="file" accept="image/*" id="lateSlip" hidden></label>` : ""}
      <p class="muted small">หน้านี้อัปเดตสถานะอัตโนมัติ กดบันทึกหน้านี้ไว้ หรือกด "ออเดอร์ของฉัน" ด้านบนเพื่อกลับมาดูได้ค่ะ</p>
      <button class="btn primary block" id="newOrder">สั่งเพิ่ม</button>
    </section>`;
  $("#newOrder").onclick = newOrder;
  const ls = $("#lateSlip");
  if (ls) ls.onchange = async () => {
    try {
      const img = await resizeImage(ls.files[0], 1100, 0.72);
      const b = writeBatch(db);
      b.set(doc(db, "slips", o.id), { image: img, createdAt: serverTimestamp() });
      if (o.paymentStatus === "unpaid") b.update(doc(db, "orders", o.id), { paymentStatus: "slip", paymentMethod: "transfer", slipAt: serverTimestamp(), updatedAt: serverTimestamp() });
      else b.update(doc(db, "orders", o.id), { slipAt: serverTimestamp(), updatedAt: serverTimestamp() });
      await b.commit();
      toast("ส่งสลิปแล้ว ร้านจะตรวจสอบให้ค่ะ", "ok");
    } catch (e) { console.error(e); toast("ส่งสลิปไม่สำเร็จ กรุณาลองใหม่", "bad"); }
  };
}

function newOrder() {
  if (S.trackUnsub) { S.trackUnsub(); S.trackUnsub = null; }
  S.trackId = null; S.trackOrder = undefined;
  const u = new URL(location.href); u.searchParams.delete("order"); history.replaceState(null, "", u);
  setStep(1);
}

// ---------- ออเดอร์ของฉัน ----------
function openMyOrders() {
  const m = openModal(`
    <div class="modal-head"><h3>ออเดอร์ของฉัน</h3><button class="btn icon ghost" data-close aria-label="ปิด">${ICON.x}</button></div>
    <p class="muted small" style="margin-bottom:10px">ประวัติบนมือถือเครื่องนี้ (ล่าสุด 10 ออเดอร์)</p>
    <div class="stack">${S.history.map((h) => `
      <div class="reorder-item">
        <div class="grow"><b class="num">#${esc(h.orderNo)}</b> <span class="muted">· ${h.deliveryDate ? `รับ ${esc(fmtDelivery(h.deliveryDate))}` : esc(fmtDate(new Date(h.createdAt)))}</span><br>
          <span class="muted">${esc((h.items || []).map((x) => `${x.name} ×${x.qty}`).join(", "))}</span> · <b class="num">${baht(h.total)}</b></div>
        <div class="stack" style="gap:6px">
          <button class="btn sm" data-track="${h.id}">ดูสถานะ</button>
          <button class="btn sm ghost" data-re="${h.id}">${ICON.repeat} สั่งซ้ำ</button>
        </div>
      </div>`).join("")}</div>`);
  m.el.addEventListener("click", (e) => {
    const t = e.target.closest("[data-track]"), r = e.target.closest("[data-re]");
    if (t) { m.close(); goTrack(t.dataset.track); }
    if (r) {
      m.close();
      if (S.trackUnsub) { S.trackUnsub(); S.trackUnsub = null; }
      S.trackId = null;
      const u = new URL(location.href); u.searchParams.delete("order"); history.replaceState(null, "", u);
      S.step = 1; reorder(r.dataset.re);
      setStep(2);
    }
  });
}
