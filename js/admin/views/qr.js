import { db, doc, setDoc } from "../../fb.js";
import { A } from "../state.js";
import { esc, toast } from "../../common.js";
import { I, printHtml, downloadBlob } from "../ui.js";

export const defaultBase = () => new URL("index.html", location.href).href;
export const baseUrl = () => (A.settings.qrBaseUrl || "").trim() || defaultBase();
export const qrUrl = () => new URL(baseUrl()).href;

/** สร้างการ์ด QR (canvas) พร้อมชื่อร้านและป้ายกำกับ */
export function makeQrCanvas(text, label) {
  const q = window.qrcode(0, "M");
  q.addData(text); q.make();
  const n = q.getModuleCount();
  const W = 720, H = 900, pad = 60, size = W - pad * 2, cell = size / n;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const x = c.getContext("2d");
  x.fillStyle = "#ffffff"; x.fillRect(0, 0, W, H);
  const brand = A.settings.themeColor || "#f47c9b";
  x.fillStyle = brand; x.fillRect(0, 0, W, 14); x.fillRect(0, H - 14, W, 14);
  x.fillStyle = "#3b2a35"; x.textAlign = "center";
  x.font = "500 46px Mitr, Sarabun, sans-serif";
  x.fillText(A.settings.shopName, W / 2, 86);
  x.font = "400 26px Sarabun, sans-serif"; x.fillStyle = "#8b7682";
  x.fillText("สแกนเพื่อสั่งอาหาร", W / 2, 128);
  const top = 156;
  x.fillStyle = "#1f1720";
  for (let r = 0; r < n; r++) for (let col = 0; col < n; col++) if (q.isDark(r, col)) x.fillRect(Math.floor(pad + col * cell), Math.floor(top + r * cell), Math.ceil(cell), Math.ceil(cell));
  x.fillStyle = brand; x.font = "500 44px Mitr, sans-serif";
  x.fillText(label, W / 2, top + size + 70);
  return c;
}

export default {
  deps: ["settings"],
  async render(el) {
    const url = qrUrl();
    el.innerHTML = `
      <div class="grid-2e">
        <section class="qr-item card" style="align-content:start">
          <b style="font-size:17px">QR สั่งอาหารของร้าน</b>
          <img id="qrImg" alt="QR Code สั่งอาหาร" style="max-width:260px">
          <div class="url">${esc(url)}</div>
          <div class="row" style="justify-content:center">
            <button class="btn primary sm" id="dl">${I.down} ดาวน์โหลด PNG</button>
            <button class="btn sm" id="pr">${I.print} พิมพ์</button>
            <button class="btn sm ghost" id="cp">คัดลอกลิงก์</button>
          </div>
          <p class="muted small">ส่งรูป QR หรือลิงก์นี้ในกลุ่ม LINE ที่ทำงาน หรือพิมพ์ติดไว้ให้เพื่อนร่วมงานสแกน</p>
        </section>
        <section class="card stack" style="align-content:start">
          <h3 class="card-title">ลิงก์ที่ QR จะพาไป</h3>
          <input class="input" id="qBase" value="${esc(A.settings.qrBaseUrl || "")}" placeholder="${esc(defaultBase())}">
          <div><button class="btn sm" id="saveBase">บันทึก</button></div>
          <p class="muted small">เว้นว่าง = ใช้ลิงก์หน้าสั่งอาหารของเว็บนี้อัตโนมัติ เปลี่ยนเฉพาะกรณีย้ายเว็บไปที่อื่น</p>
        </section>
      </div>`;
    const qBase = el.querySelector("#qBase");
    el.querySelector("#saveBase").onclick = async () => {
      const v = qBase.value.trim();
      if (v) { try { new URL(v); } catch { return toast("ลิงก์ไม่ถูกต้อง (ต้องขึ้นต้นด้วย https://)", "bad"); } }
      try { await setDoc(doc(db, "settings", "shop"), { qrBaseUrl: v }, { merge: true }); toast("บันทึกลิงก์แล้ว", "ok"); } catch { toast("บันทึกไม่สำเร็จ", "bad"); }
    };
    el.querySelector("#cp").onclick = async () => {
      try { await navigator.clipboard.writeText(url); toast("คัดลอกลิงก์แล้ว", "ok", 1500); } catch { toast(url, "", 6000); }
    };
    if (!window.qrcode) { toast("โหลดตัวสร้าง QR ไม่สำเร็จ ตรวจอินเทอร์เน็ตแล้วรีเฟรช", "bad"); return; }
    try { await document.fonts.ready; } catch {}
    const canvas = makeQrCanvas(url, "สั่งล่วงหน้า ส่งถึงที่");
    const data = canvas.toDataURL("image/png");
    el.querySelector("#qrImg").src = data;
    el.querySelector("#dl").onclick = () => canvas.toBlob((blob) => downloadBlob(blob, `QR_${A.settings.shopName}.png`), "image/png");
    el.querySelector("#pr").onclick = () => printHtml(`<div class="qr-sheet" style="grid-template-columns:1fr"><div class="qr-card" style="width:110mm;margin:0 auto"><img src="${data}" style="width:90mm;height:112mm;object-fit:contain"></div></div>`);
  },
};
