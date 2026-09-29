import { db, doc, collection, setDoc, deleteDoc, getDocs, writeBatch, serverTimestamp } from "../../fb.js";
import { OWNER_EMAIL } from "../../config.js";
import { A } from "../state.js";
import { esc, toast, openModal, confirmDialog, resizeImage, THEME_PRESETS, applyTheme, initials, dateKey, WEEKDAYS, deliveryDates, fmtDelivery } from "../../common.js";
import { I, downloadBlob } from "../ui.js";
import { SEED_CATEGORIES, SEED_INVENTORY, SEED_PRODUCTS } from "../../seed.js";
import { HIST_EXPENSES, HIST_ORDERS, HIST_COUPON, HIST_BALANCE } from "../../history.js";
import { getDoc, increment } from "../../fb.js";

let draftLogo = null;
let draftQr = null;

export default {
  deps: ["settings", "staff", "products", "coupons"],
  render(el) {
    const s = A.settings;
    const logo = draftLogo ?? s.logo;
    el.innerHTML = `
      <section class="card stack">
        <div class="row between"><div><h3 class="card-title">รับออเดอร์ออนไลน์</h3><p class="muted small">ปิดชั่วคราวเมื่อร้านหยุดหรือของหมด ลูกค้าจะดูเมนูได้แต่สั่งไม่ได้</p></div>
          <label class="switch"><input type="checkbox" id="openSw" ${s.orderingOpen !== false ? "checked" : ""}><span class="track"></span> ${s.orderingOpen !== false ? "เปิดรับอยู่" : "ปิดอยู่"}</label></div>
      </section>

      <section class="card">
        <div class="card-head"><h3 class="card-title">การสั่งล่วงหน้าและจัดส่ง</h3></div>
        <div class="stack" style="gap:16px">
          <div class="form-grid">
            <label class="field">ลูกค้ารับอาหารได้เร็วสุด
              <select class="input" id="d-lead">
                ${[[0, "วันเดียวกับที่สั่ง"], [1, "วันถัดไป (สั่งวันนี้ ได้พรุ่งนี้)"], [2, "อีก 2 วัน"], [3, "อีก 3 วัน"]].map(([v, l]) => `<option value="${v}" ${Number(s.leadDays) === v ? "selected" : ""}>${l}</option>`).join("")}
              </select></label>
            <label class="field">เวลาปิดรับออเดอร์ของรอบนั้น (ไม่บังคับ)
              <input class="input" type="time" id="d-cut" value="${esc(s.cutoffTime || "")}"></label>
            <label class="field">ให้เลือกวันรับล่วงหน้าได้ (จำนวนวัน)
              <input class="input" type="number" min="1" max="30" id="d-days" value="${Number(s.preorderDays) || 7}"></label>
          </div>
          <div class="stack" style="gap:8px"><span class="small muted" style="font-weight:600">วันที่ไม่ส่ง (เช่น เสาร์-อาทิตย์ที่ไม่ได้ไปทำงาน)</span>
            <div class="chips" id="d-closed">${WEEKDAYS.map((w, i) => `<button type="button" class="chip ${(s.closedDays || []).map(Number).includes(i) ? "active" : ""}" data-wd="${i}" aria-pressed="${(s.closedDays || []).map(Number).includes(i)}">${w}</button>`).join("")}</div></div>
          <div class="stack" style="gap:8px"><span class="small muted" style="font-weight:600">จุดส่งที่ใช้บ่อย (ลูกค้ากดเลือกได้เลย หรือพิมพ์ที่อื่นเอง)</span>
            <div class="chips" id="d-points">${(s.deliveryPoints || []).map((p, i) => `<span class="chip" style="cursor:default">${esc(p)}<button type="button" class="btn icon ghost sm" style="width:26px;min-height:26px" data-rmpt="${i}" aria-label="ลบ ${esc(p)}">${I.x}</button></span>`).join("") || `<span class="muted small">ยังไม่มี</span>`}</div>
            <div class="row"><input class="input" id="d-newpt" placeholder="เช่น อาคาร A ชั้น 3 / ฝ่ายบัญชี" maxlength="80" style="flex:1 1 220px;width:auto"><button type="button" class="btn sm" id="d-addpt">${I.plus} เพิ่ม</button></div></div>
          <p class="small muted" id="d-preview"></p>
          <div><button class="btn primary" id="d-save">บันทึกการจัดส่ง</button></div>
        </div>
      </section>

      <section class="card">
        <div class="card-head"><h3 class="card-title">การชำระเงิน</h3></div>
        <div class="stack" style="gap:16px">
          <div class="img-drop">
            ${(draftQr ?? s.payQr) ? `<img class="prev" src="${esc(draftQr ?? s.payQr)}" alt="QR รับเงิน" style="width:140px;height:auto;background:#fff">` : `<div class="prev thumb-ph" style="font-size:14px">ยังไม่มี QR</div>`}
            <div class="stack" style="gap:6px">
              <label class="btn sm" style="width:fit-content">อัปโหลดรูป QR รับเงิน<input type="file" accept="image/*" id="qrIn" hidden></label>
              ${(draftQr ?? s.payQr) ? `<button type="button" class="btn sm ghost" id="rmQr" style="width:fit-content">ลบรูป QR</button>` : ""}
              <span class="small muted">แคปรูป QR พร้อมเพย์/QR รับเงินจากแอปธนาคารมาอัปโหลด</span>
            </div>
          </div>
          <div class="form-grid">
            <label class="field">ธนาคาร <input class="input" id="p-bank" value="${esc(s.bankName || "")}" placeholder="เช่น กสิกรไทย / พร้อมเพย์" maxlength="40"></label>
            <label class="field">เลขบัญชี / เบอร์พร้อมเพย์ <input class="input" id="p-acc" value="${esc(s.bankAccount || "")}" maxlength="30" inputmode="numeric"></label>
            <label class="field">ชื่อบัญชี <input class="input" id="p-name" value="${esc(s.bankAccountName || "")}" maxlength="60"></label>
            <label class="field full">ข้อความถึงลูกค้า (ไม่บังคับ) <input class="input" id="p-note" value="${esc(s.payNote || "")}" placeholder="เช่น โอนแล้วแนบสลิปด้วยนะคะ" maxlength="120"></label>
          </div>
          <div class="stack" style="gap:8px"><span class="small muted" style="font-weight:600">วิธีจ่ายที่ให้ลูกค้าเลือก</span>
            <span class="small">✓ โอนผ่าน QR + แนบสลิป (เปิดอัตโนมัติเมื่อใส่ QR หรือเลขบัญชี)</span>
            <label class="switch"><input type="checkbox" id="p-cash" ${s.payCash !== false ? "checked" : ""}><span class="track"></span> เงินสด (จ่ายตอนรับของ)</label>
            <label class="switch"><input type="checkbox" id="p-half" ${s.payHalf !== false ? "checked" : ""}><span class="track"></span> คนละครึ่ง</label></div>
          <p class="small muted">เงินสดและคนละครึ่ง ลูกค้าไม่ต้องแนบสลิป — ออเดอร์จะขึ้นว่า "ยังไม่จ่าย" ให้เรากดเปลี่ยนเป็น "จ่ายแล้ว" เองเมื่อได้รับเงิน</p>
          <div><button class="btn primary" id="p-save">บันทึกการชำระเงิน</button></div>
        </div>
      </section>

      <section class="card">
        <div class="card-head"><h3 class="card-title">โค้ดส่วนลด</h3><button class="btn sm" id="addCp">${I.plus} เพิ่มโค้ด</button></div>
        <div class="list">
          ${A.coupons.map((c) => `<div class="list-item"><span class="rank" style="font-size:12px">${I.tag || "%"}</span>
            <div class="grow"><b class="num">${esc(c.id)}</b><br><span class="muted small">ลด ${c.type === "percent" ? `${Number(c.value)}%` : `${Number(c.value)} บาท`}${Number(c.minTotal) ? ` · ขั้นต่ำ ${Number(c.minTotal)} บาท` : ""}${c.note ? ` · ${esc(c.note)}` : ""}</span></div>
            <label class="switch"><input type="checkbox" data-cpon="${esc(c.id)}" ${c.active !== false ? "checked" : ""}><span class="track"></span> ${c.active !== false ? "ใช้ได้" : "ปิด"}</label>
            <button class="btn icon ghost sm" data-cpedit="${esc(c.id)}" aria-label="แก้ไข">${I.edit || "✎"}</button>
            <button class="btn icon ghost sm" data-cprm="${esc(c.id)}" aria-label="ลบ">${I.trash}</button></div>`).join("") || `<p class="muted small">ยังไม่มีโค้ด</p>`}
        </div>
        <p class="muted small" style="margin-top:10px">ลูกค้าพิมพ์โค้ดในหน้าตะกร้า (พิมพ์เล็ก/ใหญ่ก็ได้) · ปิดโค้ดชั่วคราวได้โดยไม่ต้องลบ</p>
      </section>

      <section class="card">
        <div class="card-head"><h3 class="card-title">เงินตั้งต้นของร้าน</h3></div>
        <div class="form-grid">
          <label class="field">เงินที่มีอยู่ (บาท) <input class="input" type="number" step="0.01" id="ob-amt" value="${s.openingBalance?.amount ?? ""}" inputmode="decimal"></label>
          <label class="field">ณ วันที่ <input class="input" type="date" id="ob-date" value="${esc(s.openingBalance?.date || dateKey())}"></label>
          <label class="field full">หมายเหตุ <input class="input" id="ob-note" value="${esc(s.openingBalance?.note || "")}" maxlength="80"></label>
        </div>
        <p class="muted small" style="margin:10px 0">หน้าบัญชีจะคำนวณ "เงินร้านโดยประมาณ" = เงินตั้งต้น + รายรับหลังวันนี้ − รายจ่ายหลังวันนี้</p>
        <button class="btn primary" id="ob-save">บันทึกเงินตั้งต้น</button>
      </section>

      <section class="card">
        <div class="card-head"><h3 class="card-title">ข้อมูลร้าน</h3></div>
        <form id="sf" class="stack" style="gap:18px">
          <div class="img-drop">
            <div class="c-logo" style="width:84px;height:84px">${logo ? `<img src="${esc(logo)}" alt="">` : esc(initials(s.shopName))}</div>
            <div class="stack" style="gap:6px">
              <label class="btn sm" style="width:fit-content">อัปโหลดโลโก้<input type="file" accept="image/*" id="logoIn" hidden></label>
              ${logo ? `<button type="button" class="btn sm ghost" id="rmLogo" style="width:fit-content">ลบโลโก้</button>` : ""}
            </div>
          </div>
          <div class="form-grid">
            <label class="field">ชื่อร้าน * <input class="input" name="shopName" id="s-name" value="${esc(s.shopName)}" maxlength="40" required></label>
            <label class="field">คำโปรย <input class="input" name="tagline" id="s-tag" value="${esc(s.tagline || "")}" maxlength="60"></label>
            <label class="field">เบอร์โทร <input class="input" name="phone" id="s-phone" value="${esc(s.phone)}" maxlength="20" inputmode="tel"></label>
            <label class="field">LINE ID <input class="input" name="lineId" id="s-line" value="${esc(s.lineId)}" maxlength="40"></label>
            <label class="field">Facebook (ลิงก์) <input class="input" name="facebook" id="s-fb" value="${esc(s.facebook)}" placeholder="https://facebook.com/..." maxlength="200"></label>
            <label class="field">Instagram (ลิงก์) <input class="input" name="instagram" id="s-ig" value="${esc(s.instagram)}" placeholder="https://instagram.com/..." maxlength="200"></label>
            <label class="field full">เวลาเปิด-ปิด <input class="input" name="hours" id="s-hours" value="${esc(s.hours)}" placeholder="เช่น จันทร์–เสาร์ 10:00–19:00 (หยุดวันอาทิตย์)" maxlength="100"></label>
            <label class="field full">ที่อยู่ร้าน <textarea class="input" name="address" id="s-addr" rows="2" maxlength="200">${esc(s.address)}</textarea></label>
          </div>
          <div class="stack" style="gap:8px">
            <span class="small muted" style="font-weight:600">สีธีมร้าน</span>
            <div class="swatches">
              ${THEME_PRESETS.map((c) => `<button type="button" class="swatch ${c === s.themeColor ? "on" : ""}" style="background:${c}" data-c="${c}" aria-label="สี ${c}"></button>`).join("")}
              <label class="row small muted" style="gap:6px">กำหนดเอง <input type="color" id="colorIn" value="${esc(s.themeColor)}"></label>
            </div>
            <input type="hidden" name="themeColor" id="themeColor" value="${esc(s.themeColor)}">
          </div>
          <div><button class="btn primary" type="submit">บันทึกข้อมูลร้าน</button></div>
        </form>
      </section>

      <section class="card">
        <div class="card-head"><h3 class="card-title">พนักงาน</h3><button class="btn sm" id="addStaff">${I.plus} เพิ่มพนักงาน</button></div>
        <div class="list">
          <div class="list-item"><span class="rank">${I.user}</span><div class="grow"><b>${esc(OWNER_EMAIL)}</b><br><span class="muted small">เจ้าของร้าน (กำหนดในไฟล์ config.js)</span></div><span class="pill ok">Owner</span></div>
          ${A.staff.map((p) => `<div class="list-item"><span class="rank">${I.user}</span>
            <div class="grow"><b>${esc(p.name || p.id)}</b><br><span class="muted small">${esc(p.id)}</span></div>
            <span class="pill ${p.role === "owner" ? "ok" : "warn"}">${p.role === "owner" ? "Owner" : "Staff"}</span>
            <button class="btn icon ghost sm" data-rmstaff="${esc(p.id)}" aria-label="ลบ">${I.trash}</button></div>`).join("")}
        </div>
        <p class="muted small" style="margin-top:10px">Staff: ดูออเดอร์ หน้าเตรียม & ส่งของ เปลี่ยนสถานะ ปรับสต็อก และตั้งเมนูเป็น "หมดแล้ว" ได้ · ไม่เห็นยอดเงินและรายจ่าย</p>
      </section>

      <section class="card stack">
        <h3 class="card-title">ข้อมูลและการสำรอง</h3>
        <div class="row">
          <button class="btn" id="backup">${I.down} สำรองข้อมูลทั้งหมด (JSON)</button>
          ${A.products.length === 0 ? `<button class="btn" id="seed2">สร้างข้อมูลเริ่มต้น</button>` : ""}
          <button class="btn" id="histImp">นำเข้าข้อมูลก่อนเข้าระบบ</button>
        </div>
        <p class="muted small">แนะนำให้กดสำรองข้อมูลเดือนละครั้ง แล้วเก็บไฟล์ไว้ใน Google Drive · "นำเข้าข้อมูลก่อนเข้าระบบ" = รายจ่ายที่ลงทุนไป 41 รายการ, ยอดขาย 6 ครั้ง, โค้ด STAM22 และเงินตั้งต้น 425 บาท (กดซ้ำได้ ไม่เพิ่มซ้ำ)</p>
      </section>`;

    // ordering switch
    el.querySelector("#openSw").onchange = async (e) => {
      try { await setDoc(doc(db, "settings", "shop"), { orderingOpen: e.target.checked }, { merge: true }); toast(e.target.checked ? "เปิดรับออเดอร์แล้ว" : "ปิดรับออเดอร์แล้ว", "ok"); }
      catch { e.target.checked = !e.target.checked; toast("บันทึกไม่สำเร็จ", "bad"); }
    };
    // logo
    el.querySelector("#logoIn").onchange = async (e) => {
      try { draftLogo = await resizeImage(e.target.files[0], 256, 0.85); this.render(el); toast('กด "บันทึกข้อมูลร้าน" เพื่อยืนยันโลโก้'); } catch (err) { toast(err.message, "bad"); }
    };
    const rm = el.querySelector("#rmLogo"); if (rm) rm.onclick = () => { draftLogo = ""; this.render(el); };
    // color
    const setColor = (c) => { el.querySelector("#themeColor").value = c; applyTheme({ themeColor: c }); el.querySelectorAll(".swatch").forEach((s) => s.classList.toggle("on", s.dataset.c === c)); };
    el.querySelectorAll(".swatch").forEach((b) => b.onclick = () => setColor(b.dataset.c));
    el.querySelector("#colorIn").oninput = (e) => setColor(e.target.value);
    // save
    el.querySelector("#sf").onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      const data = {
        shopName: f.shopName.value.trim(), tagline: f.tagline.value.trim(), phone: f.phone.value.trim(), lineId: f.lineId.value.trim(),
        facebook: f.facebook.value.trim(), instagram: f.instagram.value.trim(), hours: f.hours.value.trim(), address: f.address.value.trim(),
        themeColor: f.themeColor.value, logo: draftLogo ?? s.logo ?? "", updatedAt: serverTimestamp(),
      };
      if (!data.shopName) return toast("กรุณากรอกชื่อร้าน", "bad");
      try { await setDoc(doc(db, "settings", "shop"), data, { merge: true }); draftLogo = null; toast("บันทึกข้อมูลร้านแล้ว", "ok"); }
      catch (err) { console.error(err); toast("บันทึกไม่สำเร็จ", "bad"); }
    };
    // delivery settings
    let points = [...(s.deliveryPoints || [])];
    const closed = new Set((s.closedDays || []).map(Number));
    const draft = () => ({ leadDays: Number(el.querySelector("#d-lead").value), cutoffTime: el.querySelector("#d-cut").value || "",
      preorderDays: Math.min(30, Math.max(1, Number(el.querySelector("#d-days").value) || 7)), closedDays: [...closed].sort(), deliveryPoints: points });
    const preview = () => {
      const ds = deliveryDates(draft());
      el.querySelector("#d-preview").textContent = ds.length ? `ถ้าลูกค้าสั่งตอนนี้ จะเลือกวันรับได้: ${ds.slice(0, 4).map(fmtDelivery).join(", ")}${ds.length > 4 ? " …" : ""}` : "ตอนนี้ไม่มีวันให้เลือก (ตรวจวันที่ไม่ส่ง)";
    };
    ["#d-lead", "#d-cut", "#d-days"].forEach((id) => el.querySelector(id).addEventListener("input", preview));
    el.querySelector("#d-closed").onclick = (e) => {
      const b = e.target.closest("[data-wd]"); if (!b) return;
      const i = +b.dataset.wd; closed.has(i) ? closed.delete(i) : closed.add(i);
      b.classList.toggle("active", closed.has(i)); b.setAttribute("aria-pressed", closed.has(i)); preview();
    };
    const savePoints = async (next, msg) => {
      try { await setDoc(doc(db, "settings", "shop"), { deliveryPoints: next }, { merge: true }); toast(msg, "ok", 1500); } catch { toast("บันทึกไม่สำเร็จ", "bad"); }
    };
    el.querySelector("#d-addpt").onclick = () => {
      const v = el.querySelector("#d-newpt").value.trim();
      if (!v) return; if (points.includes(v)) return toast("มีจุดนี้แล้ว", "bad");
      savePoints([...points, v], `เพิ่ม "${v}" แล้ว`);
    };
    el.querySelector("#d-newpt").onkeydown = (e) => { if (e.key === "Enter") el.querySelector("#d-addpt").click(); };
    el.querySelectorAll("[data-rmpt]").forEach((b) => b.onclick = () => savePoints(points.filter((_, i) => i !== +b.dataset.rmpt), "ลบแล้ว"));
    el.querySelector("#d-save").onclick = async () => {
      const d = draft();
      if (!deliveryDates(d).length) return toast("ตั้งค่านี้ทำให้ไม่มีวันส่งให้เลือก", "bad");
      try { await setDoc(doc(db, "settings", "shop"), d, { merge: true }); toast("บันทึกการจัดส่งแล้ว", "ok"); } catch { toast("บันทึกไม่สำเร็จ", "bad"); }
    };
    preview();

    // payment
    el.querySelector("#qrIn").onchange = async (e) => {
      try { draftQr = await resizeImage(e.target.files[0], 800, 0.92); this.render(el); toast('กด "บันทึกการชำระเงิน" เพื่อยืนยัน'); } catch (err) { toast(err.message, "bad"); }
    };
    const rq = el.querySelector("#rmQr"); if (rq) rq.onclick = () => { draftQr = ""; this.render(el); };
    el.querySelector("#p-save").onclick = async () => {
      const d = { bankName: el.querySelector("#p-bank").value.trim(), bankAccount: el.querySelector("#p-acc").value.trim(),
        bankAccountName: el.querySelector("#p-name").value.trim(), payNote: el.querySelector("#p-note").value.trim(),
        payCash: el.querySelector("#p-cash").checked, payHalf: el.querySelector("#p-half").checked, payLater: false, payQr: draftQr ?? s.payQr ?? "" };
      if (!d.payCash && !d.payHalf && !d.payQr && !d.bankAccount) return toast("ต้องเปิดวิธีจ่ายอย่างน้อย 1 แบบ", "bad");
      try { await setDoc(doc(db, "settings", "shop"), d, { merge: true }); draftQr = null; toast("บันทึกการชำระเงินแล้ว", "ok"); }
      catch { toast("บันทึกไม่สำเร็จ", "bad"); }
    };

    el.querySelector("#addStaff").onclick = addStaff;
    el.querySelectorAll("[data-rmstaff]").forEach((b) => b.onclick = async () => {
      if (!(await confirmDialog(`ลบสิทธิ์ของ ${b.dataset.rmstaff}?`, { okText: "ลบสิทธิ์", danger: true }))) return;
      try { await deleteDoc(doc(db, "staff", b.dataset.rmstaff)); toast("ลบสิทธิ์แล้ว", "ok"); } catch { toast("ลบไม่สำเร็จ", "bad"); }
    });
    el.querySelector("#backup").onclick = (e) => backup(e.target);
    el.querySelector("#histImp").onclick = (e) => importHistory(e.target);
    el.querySelector("#addCp").onclick = () => editCoupon();
    el.querySelectorAll("[data-cpedit]").forEach((b) => b.onclick = () => editCoupon(A.coupons.find((c) => c.id === b.dataset.cpedit)));
    el.querySelectorAll("[data-cpon]").forEach((b) => b.onchange = async () => {
      try { await setDoc(doc(db, "coupons", b.dataset.cpon), { active: b.checked }, { merge: true }); toast(b.checked ? "เปิดใช้โค้ดแล้ว" : "ปิดโค้ดแล้ว", "ok", 1500); }
      catch { b.checked = !b.checked; toast("บันทึกไม่สำเร็จ", "bad"); }
    });
    el.querySelectorAll("[data-cprm]").forEach((b) => b.onclick = async () => {
      if (!(await confirmDialog(`ลบโค้ด ${b.dataset.cprm}?`, { okText: "ลบ", danger: true }))) return;
      try { await deleteDoc(doc(db, "coupons", b.dataset.cprm)); toast("ลบแล้ว", "ok"); } catch { toast("ลบไม่สำเร็จ", "bad"); }
    });
    el.querySelector("#ob-save").onclick = async () => {
      const v = el.querySelector("#ob-amt").value;
      const ob = v === "" ? null : { amount: Number(v), date: el.querySelector("#ob-date").value || dateKey(), note: el.querySelector("#ob-note").value.trim() };
      try { await setDoc(doc(db, "settings", "shop"), { openingBalance: ob }, { merge: true }); toast("บันทึกแล้ว", "ok"); } catch { toast("บันทึกไม่สำเร็จ", "bad"); }
    };
    const s2 = el.querySelector("#seed2"); if (s2) s2.onclick = openSeed;
  },
};

function addStaff() {
  const m = openModal(`
    <div class="modal-head"><h3>เพิ่มพนักงาน</h3><button class="btn icon ghost" data-close aria-label="ปิด">${I.x}</button></div>
    <div class="form-grid">
      <label class="field full">อีเมล * <input class="input" type="email" id="st-email" placeholder="staff@gmail.com"></label>
      <label class="field">ชื่อเรียก <input class="input" id="st-name" maxlength="40"></label>
      <label class="field">สิทธิ์ <select class="input" id="st-role"><option value="staff">Staff (จำกัดสิทธิ์)</option><option value="owner">Owner (สิทธิ์เต็ม)</option></select></label>
    </div>
    <div class="banner info small" style="margin-top:14px"><span>ขั้นต่อไป: สร้างรหัสผ่านให้อีเมลนี้ที่ Firebase Console › Authentication › Users › Add user (ดู README ขั้นตอนที่ 6)</span></div>
    <div class="modal-foot"><button class="btn ghost" data-close>ยกเลิก</button><button class="btn primary" data-save>บันทึก</button></div>`);
  m.el.querySelector("[data-save]").onclick = async () => {
    const email = m.el.querySelector("#st-email").value.trim().toLowerCase();
    if (!/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(email)) return toast("อีเมลไม่ถูกต้อง", "bad");
    try {
      await setDoc(doc(db, "staff", email), { name: m.el.querySelector("#st-name").value.trim(), role: m.el.querySelector("#st-role").value, createdAt: serverTimestamp() });
      toast("เพิ่มพนักงานแล้ว", "ok"); m.close();
    } catch (e) { console.error(e); toast("บันทึกไม่สำเร็จ", "bad"); }
  };
}

/** เพิ่มเมนู/หมวด/วัตถุดิบเริ่มต้นเฉพาะที่ยังไม่มี (ไม่ทับของเดิม) */
export async function addMissingSeed() {
  const haveP = new Set(A.products.map((p) => p.id)), haveC = new Set(A.categories.map((c) => c.id)), haveI = new Set(A.inventory.map((i) => i.id));
  const cats = SEED_CATEGORIES.filter((c) => !haveC.has(c.id)), prods = SEED_PRODUCTS.filter((p) => !haveP.has(p.id)), invs = SEED_INVENTORY.filter((i) => !haveI.has(i.id));
  if (!cats.length && !prods.length && !invs.length) return toast("มีเมนูเริ่มต้นครบแล้ว", "ok");
  const ok = await confirmDialog(`เพิ่มเมนูที่ยังไม่มี ${prods.length} เมนู${prods.length ? ` (${prods.map((p) => p.name).join(", ")})` : ""}${cats.length ? `, หมวด ${cats.length}` : ""}${invs.length ? `, วัตถุดิบ ${invs.length}` : ""}? เมนูเดิมจะไม่ถูกแก้`, { okText: "เพิ่มเลย" });
  if (!ok) return;
  try {
    const b = writeBatch(db);
    for (const c of cats) { const { id, ...d } = c; b.set(doc(db, "categories", id), d); }
    for (const i of invs) { const { id, ...d } = i; b.set(doc(db, "inventory", id), { ...d, updatedAt: serverTimestamp() }); }
    for (const p of prods) { const { id, ...d } = p; b.set(doc(db, "products", id), { ...d, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }); }
    await b.commit();
    toast("เพิ่มเมนูแล้ว", "ok");
  } catch (e) { console.error(e); toast("เพิ่มไม่สำเร็จ", "bad"); }
}

export async function openSeed() {
  const ok = await confirmDialog("สร้างเมนูเริ่มต้น 6 เมนู (สุกี้โรล, กรีกโยเกิร์ตเปล่า, กรีกพาย 4 แบบ), หมวดหมู่ 2 หมวด และวัตถุดิบ 8 รายการ (สต็อกเริ่มที่ 0)?", { okText: "สร้างเลย" });
  if (!ok) return;
  try {
    const b = writeBatch(db);
    for (const c of SEED_CATEGORIES) { const { id, ...d } = c; b.set(doc(db, "categories", id), d); }
    for (const i of SEED_INVENTORY) { const { id, ...d } = i; b.set(doc(db, "inventory", id), { ...d, updatedAt: serverTimestamp() }); }
    for (const p of SEED_PRODUCTS) { const { id, ...d } = p; b.set(doc(db, "products", id), { ...d, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }); }
    if (!A.settingsExists) {
      const { shopName, tagline, themeColor, orderingOpen, leadDays, cutoffTime, preorderDays, closedDays, deliveryPoints } = A.settings;
      b.set(doc(db, "settings", "shop"), { shopName, tagline, themeColor, orderingOpen, leadDays, cutoffTime, preorderDays, closedDays, deliveryPoints }, { merge: true });
    }
    await b.commit();
    toast("สร้างข้อมูลเริ่มต้นแล้ว ต่อไปกรอกสต็อกที่หน้า สต็อกวัตถุดิบ", "ok", 6000);
  } catch (e) { console.error(e); toast("สร้างข้อมูลไม่สำเร็จ: " + (e.code || e.message), "bad", 6000); }
}

async function backup(btn) {
  btn.disabled = true;
  try {
    const cols = ["settings", "categories", "products", "inventory", "inventoryTx", "orders", "daily", "expenses", "staff", "counters"];
    const out = { exportedAt: new Date().toISOString(), shop: A.settings.shopName };
    const plain = (v) => {
      if (v && typeof v.toDate === "function") return v.toDate().toISOString();
      if (Array.isArray(v)) return v.map(plain);
      if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
      return v;
    };
    for (const c of cols) {
      try { const s = await getDocs(collection(db, c)); out[c] = s.docs.map((d) => ({ id: d.id, ...plain(d.data()) })); }
      catch { out[c] = "no-permission"; }
    }
    downloadBlob(new Blob([JSON.stringify(out, null, 1)], { type: "application/json" }), `backup_${A.settings.shopName}_${dateKey()}.json`);
    toast("ดาวน์โหลดไฟล์สำรองแล้ว", "ok");
  } catch (e) { toast("สำรองข้อมูลไม่สำเร็จ", "bad"); }
  btn.disabled = false;
}

function editCoupon(c) {
  const m = openModal(`
    <div class="modal-head"><h3>${c ? "แก้ไขโค้ด" : "เพิ่มโค้ดส่วนลด"}</h3><button class="btn icon ghost" data-close aria-label="ปิด">${I.x}</button></div>
    <div class="modal-body stack">
      <label class="field">โค้ด (ตัวอักษรอังกฤษ/ตัวเลข) <input class="input" id="cp-code" value="${esc(c?.id || "")}" maxlength="20" ${c ? "disabled" : ""} placeholder="เช่น STAM22" autocapitalize="characters"></label>
      <div class="form-grid">
        <label class="field">แบบส่วนลด <select class="input" id="cp-type"><option value="amount" ${c?.type !== "percent" ? "selected" : ""}>ลดเป็นบาท</option><option value="percent" ${c?.type === "percent" ? "selected" : ""}>ลดเป็น %</option></select></label>
        <label class="field">ลดเท่าไร <input class="input" type="number" min="1" id="cp-val" value="${c?.value ?? ""}" inputmode="decimal"></label>
        <label class="field">ยอดขั้นต่ำ (บาท, ไม่บังคับ) <input class="input" type="number" min="0" id="cp-min" value="${c?.minTotal || ""}" inputmode="numeric"></label>
        <label class="field">หมายเหตุ <input class="input" id="cp-note" value="${esc(c?.note || "")}" maxlength="60"></label>
      </div>
    </div>
    <div class="modal-foot"><button class="btn ghost" data-close>ยกเลิก</button><button class="btn primary" data-save>บันทึก</button></div>`);
  m.el.querySelector("[data-save]").onclick = async () => {
    const code = (c?.id || m.el.querySelector("#cp-code").value).trim().toUpperCase();
    const type = m.el.querySelector("#cp-type").value, value = Number(m.el.querySelector("#cp-val").value);
    if (!/^[A-Z0-9_-]{2,20}$/.test(code)) return toast("โค้ดใช้ได้เฉพาะ A-Z, 0-9 (2–20 ตัว)", "bad");
    if (!(value > 0) || (type === "percent" && value > 100)) return toast("ใส่จำนวนส่วนลดให้ถูกต้อง", "bad");
    if (!c && A.coupons.some((x) => x.id === code)) return toast("มีโค้ดนี้แล้ว", "bad");
    try {
      await setDoc(doc(db, "coupons", code), { type, value, minTotal: Number(m.el.querySelector("#cp-min").value) || 0,
        note: m.el.querySelector("#cp-note").value.trim(), active: c ? c.active !== false : true, updatedAt: serverTimestamp() }, { merge: true });
      m.close(); toast(`บันทึกโค้ด ${code} แล้ว`, "ok");
    } catch (e) { console.error(e); toast("บันทึกไม่สำเร็จ (อัปเดต Rules แล้วหรือยัง?)", "bad"); }
  };
}

async function importHistory(btn) {
  if (!(await confirmDialog("นำเข้ารายจ่ายก่อนเข้าระบบ 41 รายการ (4,089 บาท), ยอดขาย 6 ครั้ง (1,353 บาท), โค้ด STAM22 และเงินตั้งต้น 425 บาท?", { okText: "นำเข้า" }))) return;
  btn.disabled = true;
  try {
    let added = 0;
    const b = writeBatch(db);
    for (const e of HIST_EXPENSES) {
      const { id, ...d } = e;
      b.set(doc(db, "expenses", id), { ...d, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), by: A.email });
    }
    for (const o of HIST_ORDERS) {
      if ((await getDoc(doc(db, "orders", o.id))).exists()) continue;
      added++;
      b.set(doc(db, "orders", o.id), { ...o.data, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), completedAt: serverTimestamp() });
      const pmap = {};
      for (const it of o.data.items) {
        const cur = pmap[it.productId] || { name: it.name, q: 0, r: 0 };
        cur.q += it.qty; cur.r += it.lineTotal; pmap[it.productId] = cur;
      }
      const products = Object.fromEntries(Object.entries(pmap).map(([pid, v]) => [pid, { name: v.name, qty: increment(v.q), revenue: increment(v.r) }]));
      b.set(doc(db, "daily", o.data.deliveryDate), { date: o.data.deliveryDate, revenue: increment(o.data.total), orders: increment(1), products }, { merge: true });
    }
    const { id: cid, ...cp } = HIST_COUPON;
    if (!(await getDoc(doc(db, "coupons", cid))).exists()) b.set(doc(db, "coupons", cid), { ...cp, updatedAt: serverTimestamp() });
    if (!A.settings.openingBalance) b.set(doc(db, "settings", "shop"), { openingBalance: HIST_BALANCE }, { merge: true });
    await b.commit();
    toast(added ? "นำเข้าข้อมูลเรียบร้อยแล้ว" : "ข้อมูลนี้นำเข้าไว้แล้ว (อัปเดตรายจ่ายให้ตรงแล้ว)", "ok", 4000);
  } catch (e) { console.error(e); toast("นำเข้าไม่สำเร็จ (อัปเดต Rules แล้วหรือยัง?)", "bad", 5000); }
  finally { btn.disabled = false; }
}
