// تدقيق آلي لبورتريهات «وَكِيل» — المرحلة 3 (UXUI §3.4 و§3.6).
// يولّد 100 لاعب خيالي عبر الجنسيات والأعمار والمراكز، ويفحص:
// الحتمية، والصلاحية، وقواعد العمر، والأوزان حسب الجنسية،
// وغياب أي تركيبة محظورة (نظارة شمس/وشم وجه)، وتفرد الوجوه.
// تشغيل: node scripts/audit-portraits.js — خروج 0 يعني نجاح كل الفحوص.
// ملاحظة: هذا التدقيق منطقي (قيم الملامح)، لا بصري؛ المراجعة البشرية
// للوجوه على أجهزة حقيقية تبقى لمحمد قبل الإطلاق (Checklist §3.6).
import {
  createPortraitAssignment,
  validatePortraitAssignments,
  portraitRegionForPlayer,
  PORTRAIT_FEATURE_SETS
} from "../src/data/player-portrait-catalog.js";
import { getPortraitProfile } from "../src/ui/player-portrait.js";

const COUNTRIES = [
  { countryId: "country-eg", country: "مصر" },
  { countryId: "country-ma", country: "المغرب" },
  { countryId: "country-tn", country: "تونس" },
  { countryId: "country-gb", country: "إنجلترا" },
  { countryId: "country-de", country: "ألمانيا" },
  { countryId: "country-nl", country: "هولندا" },
  { countryId: "country-es", country: "إسبانيا" },
  { countryId: "country-fr", country: "فرنسا" },
  { countryId: "country-it", country: "إيطاليا" },
  { countryId: "country-pt", country: "البرتغال" },
  { countryId: "country-br", country: "البرازيل" },
  { countryId: "country-ar", country: "الأرجنتين" }
];
const ROLES = ["حارس", "دفاع", "وسط", "هجوم"];

const failures = [];
const notes = [];
function check(name, ok, detail = "") {
  if (ok) notes.push("✓ " + name + (detail ? " — " + detail : ""));
  else failures.push("✗ " + name + (detail ? " — " + detail : ""));
}

const players = [];
for (let index = 0; index < 100; index += 1) {
  const country = COUNTRIES[index % COUNTRIES.length];
  players.push({
    id: "audit-player-" + index,
    name: "لاعب تجريبي " + index,
    age: 16 + (index % 23),
    role: ROLES[index % ROLES.length],
    ...country
  });
}

const assignments = players.map((player) => ({
  ...player,
  ...createPortraitAssignment(player, { primaryColor: "#2f6db3" })
}));

// 1) الحتمية: نفس اللاعب = نفس التعيين دائمًا.
const firstPass = players.map((player) => createPortraitAssignment(player, { primaryColor: "#2f6db3" }));
const secondPass = players.map((player) => createPortraitAssignment(player, { primaryColor: "#2f6db3" }));
check(
  "الحتمية: 100/100 تعيين متطابق عند إعادة التوليد",
  firstPass.every((item, index) => JSON.stringify(item) === JSON.stringify(secondPass[index]))
);

// 2) الصلاحية الكاملة.
const validation = validatePortraitAssignments(assignments);
check("صلاحية كل التعيينات (validatePortraitAssignments)", validation.valid, validation.errors.slice(0, 3).join("; "));

// 3) قواعد العمر.
check(
  "تحت 18 سنة: بلا لحية إطلاقًا",
  assignments.filter((item) => item.age < 18).every((item) => item.appearance.facialHair === "none")
);
check(
  "تحت 26 سنة: بلا قصة أصلع",
  assignments.filter((item) => item.age < 26).every((item) => item.appearance.haircut !== "bald")
);
check(
  "الشعر الرمادي للكبار (30+) فقط",
  assignments.filter((item) => item.hair === "#b6a27f").every((item) => item.age >= 30)
);

// 4) القيم كلها داخل المجموعات المسموحة، ولا محظورات.
const sets = PORTRAIT_FEATURE_SETS;
check(
  "كل الملامح داخل المجموعات المسموحة (أنف/فم/حواجب/عين/إكسسوار/ياقة/وجه/شعر)",
  assignments.every((item) =>
    sets.noses.includes(item.appearance.nose) &&
    sets.mouths.includes(item.appearance.mouth) &&
    sets.eyebrows.includes(item.appearance.eyebrows) &&
    sets.eyeShapes.includes(item.appearance.eyeShape) &&
    sets.accessories.includes(item.appearance.accessory) &&
    sets.collars.includes(item.appearance.collar) &&
    sets.faceShapes.includes(item.appearance.faceShape) &&
    sets.hairStyles.includes(item.appearance.haircut))
);
check(
  "لا نظارة شمس ولا وشم وجه في أي إكسسوار (المسموح: بلا/عصابة/حلق فقط)",
  assignments.every((item) => ["none", "headband", "earring"].includes(item.appearance.accessory))
);

// 5) الأوزان حسب الجنسية: متوسط درجة البشرة (فهرسها) لمنطقة MENA أغمق منه لشمال أوروبا.
const skinIndex = (hex) => sets.skinTones.indexOf(hex);
const meanSkin = (region) => {
  const group = assignments.filter((item) => portraitRegionForPlayer(item) === region);
  return group.reduce((sum, item) => sum + skinIndex(item.skin), 0) / group.length;
};
const menaMean = meanSkin("mena");
const northMean = meanSkin("north-europe");
check(
  "أوزان الجنسية: بشرة MENA أغمق في المتوسط من شمال أوروبا",
  menaMean > northMean,
  "MENA=" + menaMean.toFixed(2) + " مقابل شمال أوروبا=" + northMean.toFixed(2)
);

// 6) تفرد الوجوه: تركيبة الملامح الكاملة.
const combos = new Set(assignments.map((item) => [
  item.skin, item.hair, item.appearance.haircut, item.appearance.faceShape,
  item.appearance.nose, item.appearance.mouth, item.appearance.eyeShape
].join("|")));
check("تفرد الوجوه: تركيبات مميزة ≥ 90 من 100", combos.size >= 90, combos.size + " تركيبة مميزة");

// 7) ملف العرض (getPortraitProfile) حتمي للاعب بلا ملامح صريحة، وكل حقوله صالحة.
const bare = { id: "audit-bare-player", name: "لاعب بلا ملامح", age: 24, role: "وسط", country: "مصر" };
const profileA = getPortraitProfile(bare);
const profileB = getPortraitProfile(bare);
check(
  "ملف العرض حتمي للاعب بلا ملامح صريحة",
  JSON.stringify(profileA) === JSON.stringify(profileB) &&
  sets.noses.includes(profileA.nose) &&
  sets.mouths.includes(profileA.mouth) &&
  sets.accessories.includes(profileA.accessory) &&
  profileA.background === "midfield"
);

for (const line of notes) console.log(line);
if (failures.length > 0) {
  for (const line of failures) console.error(line);
  console.error("\nتدقيق البورتريهات: فشل (" + failures.length + " فحص)");
  process.exit(1);
}
console.log("\nتدقيق البورتريهات: نجاح — 100 وجه عينة، كل الفحوص خضراء.");
