import { db, doc, collection, setDoc, updateDoc, deleteDoc, serverTimestamp } from "../../fb.js";
import { A, isOwner, catName, invById } from "../state.js";
import { esc, baht, toast, openModal, confirmDialog, resizeImage, uid, initials } from "../../common.js";
import { I } from "../ui.js";
import { addMissingSeed } from "./settings.js";

export default {
  deps: ["products", "categories", "inventory"],
  render(el) {
    const owner = isOwner();
    const byCat = (cid) => A.products.filter((p) => p.categoryId === cid).length;
    el.innerHTML = `
      ${owner ? `<section class="card">
        <div class="card-head"><h3 class="card-title">หมวดหมู่เมนู</h3><button class="btn sm" id="addCat">${I.plus} เพิ่มหมวดหมู่</button></div>
        <div class="chips">${A.categories.map((c) => `
          <span class="chip" style="cursor:default">${esc(c.name)} <span class="n">${byCat(c.id)}</span>
            <button class="btn icon ghost sm" style="width:28px;min-height:28px" data-ecat="${c.id}" aria-label="แก้ไขหมวด ${esc(c.name)}">${I.edit}</button></span>`).join("") || `<span class="muted">ยังไม่มีหมวดหมู่</span>`}
        </div>
      </section>` : ""}
      <section class="card">
        <div class="card-head"><h3 class="card-title">รายการเมนู (${A.products.length})</h3>
          ${owner ? `<button class="btn sm" id="addSeed">เพิ่มเมนูเริ่มต้นที่ยังไม่มี</button><button class="btn primary sm" id="addProd">${I.plus} เพิ่มเมนู</button>` : `<span class="muted small">พนักงานเปิด/ปิด "มีขาย" ได้เมื่อของหมด</span>`}</div>
        ${A.products.length ? `<div class="table-wrap"><table class="tbl">
          <thead><tr><th></th><th>เมนู</th><th>หมวด</th><th class="r">ราคา</th><th>ตัวเลือก</th><th>สูตรตัดสต็อก</th><th>มีขาย</th>${owner ? "<th></th>" : ""}</tr></thead>
          <tbody>${A.products.map((p) => {
            const recipeCount = (p.recipe || []).length + (p.optionGroups || []).reduce((s, g) => s + (g.choices || []).reduce((t, c) => t + (c.recipe || []).length, 0), 0);
            return `<tr>
              <td>${p.image ? `<img class="p-thumb" src="${esc(p.image)}" alt="">` : `<div class="p-thumb thumb-ph">${esc(initials(p.name))}</div>`}</td>
              <td><b>${esc(p.name)}</b>${p.description ? `<br><span class="muted small">${esc(p.description)}</span>` : ""}</td>
              <td>${esc(catName(p.categoryId))}</td>
              <td class="r"><b>${baht(p.price)}</b><br><span class="muted small">/ ${esc(p.unit || "-")}</span></td>
              <td class="small">${(p.optionGroups || []).map((g) => `${esc(g.name)} (${(g.choices || []).length})`).join("<br>") || "–"}</td>
              <td>${recipeCount ? `<span class="pill ok">${recipeCount} รายการ</span>` : `<span class="pill warn">ยังไม่ตั้ง</span>`}</td>
              <td><label class="switch"><input type="checkbox" data-active="${p.id}" ${p.active !== false ? "checked" : ""} aria-label="มีขาย ${esc(p.name)}"><span class="track"></span></label></td>
              ${owner ? `<td style="white-space:nowrap"><button class="btn sm" data-edit="${p.id}">${I.edit} แก้ไข</button>
                <button class="btn icon ghost sm" data-dup="${p.id}" title="ทำสำเนา" aria-label="ทำสำเนา">${I.plus}</button>
                <button class="btn icon ghost sm" data-del="${p.id}" title="ลบ" aria-label="ลบ">${I.trash}</button></td>` : ""}
            </tr>`; }).join("")}</tbody></table></div>`
          : `<div class="empty"><p>ยังไม่มีเมนู${owner ? " — กด เพิ่มเมนู หรือไปที่หน้าภาพรวมเพื่อสร้างเมนูเริ่มต้น" : ""}</p></div>`}
      </section>`;

    el.querySelectorAll("[data-active]").forEach((cb) => cb.onchange = async () => {
      try { await updateDoc(doc(db, "products", cb.dataset.active), { active: cb.checked }); toast(cb.checked ? "เปิดขายแล้ว" : "ตั้งเป็น หมดแล้ว", "ok", 1500); }
      catch (e) { cb.checked = !cb.checked; toast("บันทึกไม่สำเร็จ", "bad"); }
    });
    if (!owner) return;
    el.querySelector("#addCat").onclick = () => editCategory();
    el.querySelectorAll("[data-ecat]").forEach((b) => b.onclick = () => editCategory(A.categories.find((c) => c.id === b.dataset.ecat)));
    el.querySelector("#addProd").onclick = () => editProduct();
    el.querySelector("#addSeed").onclick = addMissingSeed;
    el.querySelectorAll("[data-edit]").forEach((b) => b.onclick = () => editProduct(A.products.find((p) => p.id === b.dataset.edit)));
    el.querySelectorAll("[data-dup]").forEach((b) => b.onclick = () => {
      const p = structuredClone(A.products.find((x) => x.id === b.dataset.dup));
      delete p.id; p.name += " (สำเนา)"; editProduct(p, true);
    });
    el.querySelectorAll("[data-del]").forEach((b) => b.onclick = async () => {
      const p = A.products.find((x) => x.id === b.dataset.del);
      if (!(await confirmDialog(`ลบเมนู "${p.name}"?`, { okText: "ลบเมนู", danger: true }))) return;
      try { await deleteDoc(doc(db, "products", p.id)); toast("ลบเมนูแล้ว", "ok"); } catch { toast("ลบไม่สำเร็จ", "bad"); }
    });
  },
};

// ---------------- category ----------------
function editCategory(c) {
  const m = openModal(`
    <div class="modal-head"><h3>${c ? "แก้ไขหมวดหมู่" : "เพิ่มหมวดหมู่"}</h3><button class="btn icon ghost" data-close aria-label="ปิด">${I.x}</button></div>
    <form id="cf" class="form-grid">
      <label class="field full">ชื่อหมวดหมู่ * <input class="input" name="name" id="cat-name" value="${esc(c?.name || "")}" required maxlength="40" placeholder="เช่น อาหารคาว"></label>
      <label class="field">ลำดับการแสดง <input class="input" type="number" name="sort" id="cat-sort" value="${c?.sort ?? A.categories.length + 1}"></label>
    </form>
    <div class="modal-foot">
      ${c ? `<button class="btn danger" data-del style="margin-right:auto">${I.trash} ลบ</button>` : ""}
      <button class="btn ghost" data-close>ยกเลิก</button><button class="btn primary" data-save>บันทึก</button>
    </div>`);
  const f = m.el.querySelector("#cf");
  f.onsubmit = (e) => { e.preventDefault(); save(); };
  const save = async () => {
    const name = f.name.value.trim();
    if (!name) { f.name.classList.add("invalid"); return; }
    try {
      const ref = c ? doc(db, "categories", c.id) : doc(collection(db, "categories"));
      await setDoc(ref, { name, sort: Number(f.sort.value) || 0 });
      toast("บันทึกหมวดหมู่แล้ว", "ok"); m.close();
    } catch { toast("บันทึกไม่สำเร็จ", "bad"); }
  };
  m.el.querySelector("[data-save]").onclick = save;
  const del = m.el.querySelector("[data-del]");
  if (del) del.onclick = async () => {
    if (A.products.some((p) => p.categoryId === c.id)) return toast("ย้ายหรือลบเมนูในหมวดนี้ก่อน", "bad");
    try { await deleteDoc(doc(db, "categories", c.id)); toast("ลบหมวดหมู่แล้ว", "ok"); m.close(); } catch { toast("ลบไม่สำเร็จ", "bad"); }
  };
}

// ---------------- product editor ----------------
function editProduct(src, isCopy = false) {
  const isNew = !src || isCopy;
  const D = structuredClone(src || {
    name: "", categoryId: A.categories[0]?.id || "", description: "", price: 0, unit: "", image: "",
    active: true, sort: A.products.length + 1, optionGroups: [], recipe: [],
  });
  D.optionGroups = D.optionGroups || []; D.recipe = D.recipe || [];
  const open = new Set(); // choice ids with recipe expanded

  const m = openModal(`<div id="pe"></div>`, { wide: true });
  const root = m.el.querySelector("#pe");

  const invOptions = (sel) => `<option value="">— เลือกวัตถุดิบ —</option>` + A.inventory.map((i) => `<option value="${i.id}" ${i.id === sel ? "selected" : ""}>${esc(i.name)}</option>`).join("");
  const recipeRows = (list, path) => `
    <div class="recipe-box">
      ${list.map((r, ri) => `<div class="mini-row rec">
        <select class="input" data-rec="${path}" data-r="${ri}" data-f="invId" aria-label="วัตถุดิบ">${invOptions(r.invId)}</select>
        <input class="input" type="number" min="0" step="any" data-rec="${path}" data-r="${ri}" data-f="qty" value="${r.qty ?? ""}" placeholder="จำนวน" aria-label="จำนวนต่อ 1 หน่วยขาย">
        <span class="small muted">${esc(invById(r.invId)?.unit || "")}</span>
        <button class="btn icon ghost sm" data-delrec="${path}" data-r="${ri}" aria-label="ลบวัตถุดิบ">${I.x}</button>
      </div>`).join("")}
      <button class="btn sm ghost" data-addrec="${path}" style="justify-self:start">${I.plus} เพิ่มวัตถุดิบ</button>
      ${A.inventory.length ? "" : `<span class="small muted">ยังไม่มีวัตถุดิบ — เพิ่มที่หน้า สต็อกวัตถุดิบ ก่อน</span>`}
    </div>`;
  const recipeList = (path) => {
    if (path === "base") return D.recipe;
    const [gi, ci] = path.split(".").map(Number);
    const c = D.optionGroups[gi].choices[ci]; c.recipe = c.recipe || []; return c.recipe;
  };

  const draw = () => {
    const scroll = m.el.scrollTop;
    root.innerHTML = `
      <div class="modal-head"><h3>${isNew ? "เพิ่มเมนู" : "แก้ไขเมนู"}</h3><button class="btn icon ghost" data-close aria-label="ปิด">${I.x}</button></div>
      <div class="stack" style="gap:18px">
        <div class="img-drop">
          ${D.image ? `<img class="prev" src="${esc(D.image)}" alt="">` : `<div class="prev thumb-ph">${esc(initials(D.name || "?"))}</div>`}
          <div class="stack" style="gap:6px">
            <label class="btn sm" style="width:fit-content">อัปโหลดรูป<input type="file" accept="image/*" id="pimg" hidden></label>
            ${D.image ? `<button class="btn sm ghost" id="rmimg" style="width:fit-content">ลบรูป</button>` : ""}
            <span class="small muted">ระบบย่อรูปให้อัตโนมัติ</span>
          </div>
        </div>
        <div class="form-grid">
          <label class="field">ชื่อเมนู * <input class="input" id="p-name" data-k="name" value="${esc(D.name)}" maxlength="60"></label>
          <label class="field">หมวดหมู่ <select class="input" id="p-cat" data-k="categoryId">${A.categories.map((c) => `<option value="${c.id}" ${c.id === D.categoryId ? "selected" : ""}>${esc(c.name)}</option>`).join("")}<option value="" ${!D.categoryId ? "selected" : ""}>ไม่มีหมวด</option></select></label>
          <label class="field">ราคา (บาท) * <input class="input" id="p-price" type="number" min="0" step="any" data-k="price" value="${D.price}"></label>
          <label class="field">หน่วยขาย <input class="input" id="p-unit" data-k="unit" value="${esc(D.unit)}" placeholder="เช่น กล่อง, สกู้ป" maxlength="20"></label>
          <label class="field">ลำดับการแสดง <input class="input" id="p-sort" type="number" data-k="sort" value="${D.sort ?? 0}"></label>
          <label class="field" style="align-self:end"><span class="switch"><input type="checkbox" id="p-active" data-k="active" ${D.active !== false ? "checked" : ""}><span class="track"></span> มีขาย</span></label>
          <label class="field full">คำอธิบาย <textarea class="input" id="p-desc" data-k="description" maxlength="200" rows="2">${esc(D.description)}</textarea></label>
        </div>

        <div class="box">
          <div class="box-head"><b class="grow">ตัวเลือก / ท็อปปิ้ง</b><button class="btn sm" id="addGroup">${I.plus} เพิ่มกลุ่มตัวเลือก</button></div>
          ${D.optionGroups.length ? "" : `<p class="muted small">เช่น กลุ่ม "โปรตีน" (ต้องเลือก 1 อย่าง) หรือ "ท็อปปิ้ง" (เลือกได้หลายอย่าง บวกราคาเพิ่ม)</p>`}
          ${D.optionGroups.map((g, gi) => `
            <div class="box" style="background:var(--surface)">
              <div class="form-grid" style="grid-template-columns:minmax(0,2fr) minmax(0,1.4fr) auto auto;align-items:end">
                <label class="field">ชื่อกลุ่ม <input class="input" data-g="${gi}" data-f="name" value="${esc(g.name)}" placeholder="เช่น โปรตีน"></label>
                <label class="field">วิธีเลือก <select class="input" data-g="${gi}" data-f="type">
                  <option value="single" ${g.type !== "multi" ? "selected" : ""}>เลือก 1 อย่าง</option>
                  <option value="multi" ${g.type === "multi" ? "selected" : ""}>เลือกได้หลายอย่าง</option></select></label>
                <label class="switch" style="margin-bottom:8px"><input type="checkbox" data-g="${gi}" data-f="required" ${g.required ? "checked" : ""}><span class="track"></span> บังคับ</label>
                <button class="btn icon ghost" data-delg="${gi}" aria-label="ลบกลุ่ม">${I.trash}</button>
              </div>
              ${(g.choices || []).map((c, ci) => `
                <div class="mini-row">
                  <input class="input" data-g="${gi}" data-c="${ci}" data-f="name" value="${esc(c.name)}" placeholder="ชื่อตัวเลือก">
                  <input class="input" type="number" step="any" data-g="${gi}" data-c="${ci}" data-f="price" value="${c.price || 0}" aria-label="ราคาเพิ่ม" title="ราคาเพิ่ม (บาท)">
                  <div class="row" style="gap:4px;flex-wrap:nowrap">
                    <button class="btn sm ${open.has(c.id) ? "primary" : ""}" data-togrec="${c.id}" title="วัตถุดิบที่ใช้เพิ่มเมื่อเลือกตัวเลือกนี้">สูตร ${(c.recipe || []).length ? `(${c.recipe.length})` : ""}</button>
                    <button class="btn icon ghost sm" data-delc="${gi}.${ci}" aria-label="ลบตัวเลือก">${I.x}</button>
                  </div>
                </div>
                ${open.has(c.id) ? `<div style="margin-left:14px"><span class="small muted">ตัดสต็อกเพิ่มเมื่อลูกค้าเลือก "${esc(c.name)}" (ต่อ 1 ${esc(D.unit || "หน่วย")})</span>${recipeRows(c.recipe || [], `${gi}.${ci}`)}</div>` : ""}
              `).join("")}
              <div class="row"><button class="btn sm ghost" data-addc="${gi}">${I.plus} เพิ่มตัวเลือก</button><span class="small muted">ช่องตัวเลข = ราคาเพิ่ม (บาท)</span></div>
            </div>`).join("")}
        </div>

        <div class="box">
          <div class="box-head"><b class="grow">สูตรตัดสต็อก (ต่อ 1 ${esc(D.unit || "หน่วยขาย")})</b></div>
          <p class="muted small">วัตถุดิบที่ใช้ทุกครั้ง ไม่ว่าลูกค้าเลือกตัวเลือกใด ระบบจะตัดสต็อกเมื่อออเดอร์เปลี่ยนเป็น "สำเร็จ"</p>
          ${recipeRows(D.recipe, "base")}
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn ghost" data-close>ยกเลิก</button>
        <button class="btn primary" id="saveProd">บันทึกเมนู</button>
      </div>`;
    m.el.scrollTop = scroll;
  };

  // ---- bindings (delegated) ----
  root.addEventListener("input", (e) => {
    const t = e.target, ds = t.dataset;
    const val = t.type === "checkbox" ? t.checked : t.type === "number" ? (t.value === "" ? "" : Number(t.value)) : t.value;
    if (ds.k) D[ds.k] = val;
    else if (ds.rec) { recipeList(ds.rec)[Number(ds.r)][ds.f] = val; if (ds.f === "invId") draw(); }
    else if (ds.g !== undefined && ds.c !== undefined) D.optionGroups[+ds.g].choices[+ds.c][ds.f] = val;
    else if (ds.g !== undefined) D.optionGroups[+ds.g][ds.f] = val;
  });
  root.addEventListener("change", async (e) => {
    if (e.target.id !== "pimg") return;
    const file = e.target.files[0]; if (!file) return;
    try { D.image = await resizeImage(file, 480, 0.72); draw(); } catch (err) { toast(err.message, "bad"); }
  });
  root.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    const ds = b.dataset;
    if (b.id === "rmimg") { D.image = ""; draw(); }
    else if (b.id === "addGroup") { D.optionGroups.push({ id: uid("g"), name: "", type: "single", required: true, choices: [{ id: uid("c"), name: "", price: 0, recipe: [] }] }); draw(); }
    else if (ds.delg !== undefined) { D.optionGroups.splice(+ds.delg, 1); draw(); }
    else if (ds.addc !== undefined) { D.optionGroups[+ds.addc].choices.push({ id: uid("c"), name: "", price: 0, recipe: [] }); draw(); }
    else if (ds.delc) { const [gi, ci] = ds.delc.split(".").map(Number); D.optionGroups[gi].choices.splice(ci, 1); draw(); }
    else if (ds.togrec) { open.has(ds.togrec) ? open.delete(ds.togrec) : open.add(ds.togrec); draw(); }
    else if (ds.addrec) { recipeList(ds.addrec).push({ invId: "", qty: "" }); draw(); }
    else if (ds.delrec) { recipeList(ds.delrec).splice(+ds.r, 1); draw(); }
    else if (b.id === "saveProd") save(b);
  });

  const cleanRecipe = (list) => (list || []).filter((r) => r.invId && Number(r.qty) > 0).map((r) => ({ invId: r.invId, qty: Number(r.qty) }));
  async function save(btn) {
    const name = String(D.name || "").trim();
    if (!name) { toast("กรุณากรอกชื่อเมนู", "bad"); root.querySelector("#p-name").classList.add("invalid"); return; }
    const price = Number(D.price);
    if (!(price >= 0) || D.price === "") { toast("กรุณากรอกราคาให้ถูกต้อง", "bad"); return; }
    for (const g of D.optionGroups) {
      if (!String(g.name).trim()) return toast("กรุณาตั้งชื่อกลุ่มตัวเลือกให้ครบ", "bad");
      g.choices = (g.choices || []).filter((c) => String(c.name).trim());
      if (!g.choices.length) return toast(`กลุ่ม "${g.name}" ต้องมีตัวเลือกอย่างน้อย 1 อย่าง`, "bad");
    }
    const data = {
      name, categoryId: D.categoryId || "", description: String(D.description || "").trim(), price,
      unit: String(D.unit || "").trim(), image: D.image || "", active: D.active !== false, sort: Number(D.sort) || 0,
      optionGroups: D.optionGroups.map((g) => ({
        id: g.id || uid("g"), name: String(g.name).trim(), type: g.type === "multi" ? "multi" : "single", required: !!g.required,
        choices: g.choices.map((c) => ({ id: c.id || uid("c"), name: String(c.name).trim(), price: Number(c.price) || 0, recipe: cleanRecipe(c.recipe) })),
      })),
      recipe: cleanRecipe(D.recipe),
      updatedAt: serverTimestamp(),
    };
    if (JSON.stringify(data).length > 900000) return toast("รูปใหญ่เกินไป ลองใช้รูปอื่น", "bad");
    btn.disabled = true;
    try {
      const ref = isNew ? doc(collection(db, "products")) : doc(db, "products", src.id);
      if (isNew) data.createdAt = serverTimestamp();
      else if (src.createdAt) data.createdAt = src.createdAt;
      await setDoc(ref, data);
      toast("บันทึกเมนูแล้ว", "ok"); m.close();
    } catch (e) { console.error(e); toast("บันทึกไม่สำเร็จ", "bad"); btn.disabled = false; }
  }
  draw();
}
