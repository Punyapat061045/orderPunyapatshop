// ข้อมูลเริ่มต้นของร้าน (ใช้ครั้งแรกครั้งเดียว จากปุ่ม "สร้างข้อมูลเริ่มต้น")
// สูตรที่ใส่ไว้ตามที่ร้านกำหนด: สุกี้โรล 1 กล่อง = สาหร่าย 1 แผ่น, เต้าหู้ 1 ชิ้น, วุ้นเส้น 20 กรัม, อกไก่ 50 กรัม (เมื่อเลือกอกไก่)
// ส่วนที่ยังไม่ได้กำหนดปริมาณ (หมูเด้ง, น้ำจิ้ม, ผักกาดขาว) เว้นว่างไว้ ให้ร้านกรอกเองในหน้าเมนู

export const SEED_CATEGORIES = [
  { id: "cat-savory", name: "อาหารคาว", sort: 1 },
  { id: "cat-dessert", name: "ของหวาน", sort: 2 },
];

export const SEED_INVENTORY = [
  { id: "inv-seaweed", name: "สาหร่าย", unit: "แผ่น" },
  { id: "inv-tofu", name: "เต้าหู้", unit: "ชิ้น" },
  { id: "inv-glassnoodle", name: "วุ้นเส้น", unit: "กรัม" },
  { id: "inv-chicken", name: "อกไก่", unit: "กรัม" },
  { id: "inv-pork", name: "หมูเด้ง", unit: "กรัม" },
  { id: "inv-cabbage", name: "ผักกาดขาว", unit: "กรัม" },
  { id: "inv-suki-sauce", name: "น้ำจิ้มสุกี้", unit: "ขวด" },
  { id: "inv-sesame-sauce", name: "น้ำจิ้มงา", unit: "ขวด" },
].map((i) => ({ ...i, stock: 0, minStock: 0, cost: 0 }));

export const SEED_PRODUCTS = [
  {
    id: "p-suki-roll", name: "สุกี้โรล", categoryId: "cat-savory", description: "สุกี้ห่อสาหร่าย เลือกโปรตีนและน้ำจิ้มได้",
    price: 60, unit: "กล่อง", image: "", active: true, sort: 1,
    recipe: [{ invId: "inv-seaweed", qty: 1 }, { invId: "inv-tofu", qty: 1 }, { invId: "inv-glassnoodle", qty: 20 }],
    optionGroups: [
      { id: "g-protein", name: "โปรตีน", type: "single", required: true, choices: [
        { id: "c-chicken", name: "อกไก่", price: 0, recipe: [{ invId: "inv-chicken", qty: 50 }] },
        { id: "c-pork", name: "หมูเด้ง", price: 0, recipe: [] },
      ] },
      { id: "g-sauce", name: "น้ำจิ้ม", type: "single", required: true, choices: [
        { id: "c-suki", name: "น้ำจิ้มสุกี้", price: 0, recipe: [] },
        { id: "c-sesame", name: "น้ำจิ้มงา", price: 0, recipe: [] },
        { id: "c-mix", name: "น้ำจิ้มสุกี้ผสมงา", price: 0, recipe: [] },
      ] },
    ],
  },
  {
    id: "p-greek-yogurt", name: "กรีกโยเกิร์ตเปล่า", categoryId: "cat-dessert", description: "1 สกู้ป 60 กรัม",
    price: 39, unit: "สกู้ป", image: "", active: true, sort: 10, recipe: [], optionGroups: [],
  },
  { id: "p-banoffee-pie", name: "Banoffee Greek Pie", categoryId: "cat-dessert", description: "", price: 89, unit: "ชิ้น", image: "", active: true, sort: 11, recipe: [], optionGroups: [] },
  { id: "p-banana-biscoff-pie", name: "Banana Biscoff Pie", categoryId: "cat-dessert", description: "", price: 89, unit: "ชิ้น", image: "", active: true, sort: 12, recipe: [], optionGroups: [] },
  { id: "p-biscoff-pie", name: "Biscoff Pie", categoryId: "cat-dessert", description: "", price: 79, unit: "ชิ้น", image: "", active: true, sort: 13, recipe: [], optionGroups: [] },
  { id: "p-oreo-pie", name: "Oreo Greek Pie", categoryId: "cat-dessert", description: "", price: 69, unit: "ชิ้น", image: "", active: true, sort: 14, recipe: [], optionGroups: [] },
];
