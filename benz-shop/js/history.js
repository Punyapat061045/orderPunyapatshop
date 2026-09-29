// ข้อมูลก่อนเข้าระบบ (ต้นทุนที่ลงไปแล้ว + ยอดขายที่เคยขาย) — นำเข้าครั้งเดียว กดซ้ำไม่ซ้ำซ้อน
const SUKI = ["p-suki-roll", "h-tofu-roll"]; // เต้าหู้ห่อสาหร่าย (ขายก่อนเข้าระบบ) ใช้วัตถุดิบชุดเดียวกัน
const DESSERT = ["p-greek-yogurt", "p-banoffee-pie", "p-banana-biscoff-pie", "p-biscoff-pie", "p-oreo-pie"];
const ALL = []; // ใช้ร่วมทุกเมนู → ระบบเฉลี่ยตามสัดส่วนยอดขาย

export const HIST_DATE = "2026-09-29";

// [รายการ, ราคา, หมวด, ใช้กับเมนู]
const E = [
  ["สาหร่าย", 273, "วัตถุดิบ", SUKI],
  ["ซึ้ง", 199, "อุปกรณ์", ALL],
  ["ที่หั่นซูชิ", 44, "อุปกรณ์", SUKI],
  ["แปรง", 43, "อุปกรณ์", ALL],
  ["ถ้วยใสกรีกโยเกิร์ต", 142, "บรรจุภัณฑ์", DESSERT],
  ["ทัพเพอร์แวร์", 166, "อุปกรณ์", ALL],
  ["กระปุกสุญญากาศ + ผ้าขาวบาง", 106, "อุปกรณ์", DESSERT],
  ["องุ่น (1 กิโล)", 119, "วัตถุดิบ", DESSERT],
  ["สตรอเบอรี่", 179, "วัตถุดิบ", DESSERT],
  ["อโวคาโด้", 79, "วัตถุดิบ", ALL],
  ["กล้วย", 50, "วัตถุดิบ", ["p-banoffee-pie", "p-banana-biscoff-pie"]],
  ["ผ้าขาวบาง", 20, "อุปกรณ์", DESSERT],
  ["หมูเด้ง", 98, "วัตถุดิบ", SUKI],
  ["โยเกิร์ต", 69, "วัตถุดิบ", DESSERT],
  ["น้ำจิ้มสุกี้", 49, "วัตถุดิบ", SUKI],
  ["งาขาว", 19, "วัตถุดิบ", SUKI],
  ["วุ้นเส้น", 28, "วัตถุดิบ", SUKI],
  ["โยเกิร์ต", 48, "วัตถุดิบ", DESSERT],
  ["เต้าหู้ไข่ไก่", 42, "วัตถุดิบ", SUKI],
  ["กล่อง", 107, "บรรจุภัณฑ์", ALL],
  ["หมูเด้ง", 98, "วัตถุดิบ", SUKI],
  ["เต้าหู้", 76, "วัตถุดิบ", SUKI],
  ["สาหร่าย", 185, "วัตถุดิบ", SUKI],
  ["แป้งญวน", 63, "วัตถุดิบ", ALL],
  ["สกู้ป 6mm ถุงมือ ผ้าเช็ด", 117, "อุปกรณ์", ALL],
  ["น้ำจิ้มสุกี้", 50, "วัตถุดิบ", SUKI],
  ["หมู เต้าหู้ นมเรย์", 240, "วัตถุดิบ", ALL],
  ["โยเกิร์ต", 30, "วัตถุดิบ", DESSERT],
  ["องุ่น", 60, "วัตถุดิบ", DESSERT],
  ["เครื่องบด ของใช้ แผ่นรองนึ่ง", 305, "อุปกรณ์", ALL],
  ["หมูเด้ง เต้าหู้ เบ็คกิ้งโซดา", 96, "วัตถุดิบ", SUKI],
  ["กล่องพลาสติกใส่อาหาร 50 ชุด", 83.17, "บรรจุภัณฑ์", ALL],
  ["ถ้วยน้ำจิ้มพลาสติก 50 ชิ้น", 25.83, "บรรจุภัณฑ์", SUKI],
  ["ถ้วยมูส 250ml 50 ชิ้น", 115.97, "บรรจุภัณฑ์", DESSERT],
  ["ผ้ากันเปื้อน", 88.03, "อุปกรณ์", ALL],
  ["ถุงหิ้วไฮโซ PE 7×15 (500 ใบ)", 43.45, "บรรจุภัณฑ์", ALL],
  ["ช้อน + ส้อมพลาสติก 50 คู่", 34.55, "บรรจุภัณฑ์", ALL],
  ["Lotus Biscoff Crumble 750g", 229.89, "วัตถุดิบ", ["p-biscoff-pie", "p-banana-biscoff-pie"]],
  ["Oreo Crumbs 454g", 85.94, "วัตถุดิบ", ["p-oreo-pie"]],
  ["Lotus Biscoff Biscuit 156g", 83.17, "วัตถุดิบ", ["p-biscoff-pie", "p-banana-biscoff-pie"]],
  ["ตราชั่งดิจิตัล", 99, "อุปกรณ์", ALL],
];

export const HIST_EXPENSES = E.map(([item, total, category, forProducts], i) => ({
  id: `hist-exp-${String(i + 1).padStart(2, "0")}`,
  date: HIST_DATE, category, item, qty: 0, unit: "", unitCost: 0, total,
  supplier: "", note: "ลงทุนก่อนเข้าระบบ", forProducts, stock: null,
}));

const it = (productId, name, unitPrice, qty, extra = {}) => ({
  productId, name, unit: "", basePrice: unitPrice, options: [], unitPrice, qty, lineTotal: unitPrice * qty, note: "", forName: "", ...extra,
});
const sukiOpt = (protein, sauce) => [
  { groupId: "g-protein", group: "โปรตีน", ...protein, price: 0 },
  { groupId: "g-sauce", group: "น้ำจิ้ม", ...sauce, price: 0 },
];
const PORK = { choiceId: "c-pork", name: "หมูเด้ง" }, CHICK = { choiceId: "c-chicken", name: "อกไก่" };
const SUKI_S = { choiceId: "c-suki", name: "น้ำจิ้มสุกี้" }, SESAME = { choiceId: "c-sesame", name: "น้ำจิ้มงา" };

const O = [
  ["2026-08-27", [it("h-tofu-roll", "เต้าหู้ห่อสาหร่าย", 55, 6)]],
  ["2026-08-27", [it("p-greek-yogurt", "กรีกโยเกิร์ต", 69, 4), it("p-greek-yogurt", "กรีกโยเกิร์ต", 39, 1)]],
  ["2026-08-28", [it("h-tofu-roll", "เต้าหู้ห่อสาหร่าย", 55, 6)]],
  ["2026-08-30", [it("p-greek-yogurt", "กรีกโยเกิร์ต", 69, 1)]],
  ["2026-09-01", [it("p-greek-yogurt", "กรีกโยเกิร์ต", 69, 1, { note: "แป้งญวน" })]],
  ["2026-09-24", [
    it("p-suki-roll", "สุกี้โรล", 60, 1, { forName: "พี่เฟิร์นชยามาส", options: sukiOpt(PORK, SUKI_S) }),
    it("p-suki-roll", "สุกี้โรล", 60, 1, { forName: "พี่กัส", options: sukiOpt(PORK, SUKI_S) }),
    it("p-suki-roll", "สุกี้โรล", 60, 1, { forName: "พี่ชม", options: sukiOpt(PORK, SESAME) }),
    it("p-suki-roll", "สุกี้โรล", 60, 1, { forName: "พี่ไปร์ท", options: sukiOpt(CHICK, SUKI_S) }),
  ]],
];

export const HIST_ORDERS = O.map(([date, items], i) => {
  const total = items.reduce((s, x) => s + x.lineTotal, 0);
  const no = "H" + String(i + 1).padStart(2, "0");
  return {
    id: `hist-order-${String(i + 1).padStart(2, "0")}`,
    data: {
      source: "history", status: "completed", paymentStatus: "paid", paymentMethod: "history",
      customerName: "ลูกค้า (ก่อนเข้าระบบ)", phone: "", deliveryDate: date, deliveryPoint: "", dateKey: date,
      items, itemCount: items.reduce((s, x) => s + x.qty, 0), subtotal: total, discount: 0, total,
      seq: i + 1, orderNo: no, stockDeducted: false, revenueCounted: true, note: "ยอดขายก่อนเข้าระบบ",
      bag: false, cutlery: false, deskNote: "", hasDeskPhoto: false,
    },
  };
});

export const HIST_COUPON = { id: "STAM22", type: "amount", value: 22, minTotal: 0, active: true, note: "ลด 22 บาท" };
export const HIST_BALANCE = { amount: 425, date: HIST_DATE, note: "เงินในบัญชีร้าน (เคยมี 1,316)" };
