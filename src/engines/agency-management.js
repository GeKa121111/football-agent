const MAX_LEDGER_ENTRIES = 1000;
const MAX_MONEY_EGP = 2000000000;
const MAX_ACTIVE_STAFF = 6;
const MAX_ACTIVE_BRANCHES = 4;

export const AGENCY_JOB_ROLES = Object.freeze([
  Object.freeze({ id:"negotiator", name:"مفاوض تعاقدات", description:"إدارة عروض التمثيل والتفاوض مع الأندية.", hiringCostEgp:9000, weeklySalaryEgp:1800, maxHeadcount:2 }),
  Object.freeze({ id:"analyst", name:"محلل أداء", description:"تحليل أداء اللاعبين ومقارنة فرص السوق.", hiringCostEgp:7500, weeklySalaryEgp:1450, maxHeadcount:2 }),
  Object.freeze({ id:"legal", name:"مستشار قانوني", description:"مراجعة العقود وبنود الانتقالات والمخاطر.", hiringCostEgp:11000, weeklySalaryEgp:2100, maxHeadcount:1 }),
  Object.freeze({ id:"media", name:"مسؤول إعلام", description:"إدارة صورة الوكالة وعلاقاتها الإعلامية.", hiringCostEgp:6500, weeklySalaryEgp:1250, maxHeadcount:1 }),
  Object.freeze({ id:"operations", name:"مدير عمليات", description:"تنظيم العمل والمهام والتوسع التشغيلي.", hiringCostEgp:10000, weeklySalaryEgp:1900, maxHeadcount:1 })
]);

export const AGENCY_BRANCH_LOCATIONS = Object.freeze([
  Object.freeze({ id:"alexandria", name:"الإسكندرية", setupCostEgp:18000, weeklyRentEgp:1200, region:"مصر" }),
  Object.freeze({ id:"madrid", name:"مدريد", setupCostEgp:45000, weeklyRentEgp:3400, region:"أوروبا" }),
  Object.freeze({ id:"london", name:"لندن", setupCostEgp:60000, weeklyRentEgp:4200, region:"أوروبا" })
]);export const AGENCY_SPONSOR_PACKAGES = Object.freeze([
  Object.freeze({ id:"local-media", name:"شريك إعلامي محلي", description:"رعاية أسبوعية للمحتوى والظهور الإعلامي للوكالة.", signingBonusEgp:8000, weeklyRevenueEgp:3000, termDays:365, minClients:0, minReputation:50 }),
  Object.freeze({ id:"sportswear", name:"شريك ملابس رياضية", description:"شراكة متوسطة ترتبط بحجم قائمة اللاعبين وسمعة الوكالة.", signingBonusEgp:16000, weeklyRevenueEgp:6200, termDays:365, minClients:2, minReputation:58 }),
  Object.freeze({ id:"global-brand", name:"شريك علامة عالمية", description:"اتفاق طويل المدى لوكالة ذات قاعدة عملاء وسمعة قوية.", signingBonusEgp:35000, weeklyRevenueEgp:12500, termDays:730, minClients:4, minReputation:72 })
]);

const COMPETITOR_BLUEPRINTS = Object.freeze([
  Object.freeze({ id:"rival-north-star", name:"North Star Sports", region:"أوروبا", focus:"المواهب الهجومية والوسط", focusKey:"attack", reputation:78, budgetEgp:320000, acquisitionCostEgp:9000, maxClients:24 }),
  Object.freeze({ id:"rival-pioneer", name:"Pioneer Football Group", region:"شمال أفريقيا", focus:"المواهب الشابة والدفاع", focusKey:"youth-defense", reputation:62, budgetEgp:240000, acquisitionCostEgp:7000, maxClients:20 }),
  Object.freeze({ id:"rival-atlas", name:"Atlas Player Partners", region:"عالمي", focus:"اللاعبون أصحاب التقييم المرتفع", focusKey:"elite", reputation:86, budgetEgp:420000, acquisitionCostEgp:14000, maxClients:30 })
]);
const MAX_SPONSORSHIPS = 20;
const MAX_COMPETITIVE_HISTORY = 300;
const MAX_RIVAL_CLIENTS = 100;


function isRecord(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value;
}
function validMoney(value) { return Number.isSafeInteger(value) && value >= 0 && value <= MAX_MONEY_EGP; }
function addDays(value, days) {
  const date = new Date(value + "T00:00:00.000Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
function nextMondayAfter(value) {
  let date = addDays(value, 1);
  for (let index = 0; index < 7 && new Date(date + "T00:00:00.000Z").getUTCDay() !== 1; index += 1) {
    date = addDays(date, 1);
  }
  return date;
}
function stablePositionBonus(player, focusKey) {
  const position = String(player?.position ?? "").toLocaleLowerCase("en");
  const role = String(player?.role ?? "").toLocaleLowerCase("en");
  const combined = position + " " + role;
  if (focusKey === "attack") return /st|cf|fw|lw|rw|مهاجم|هجوم/.test(combined) ? 4 : 0;
  if (focusKey === "youth-defense") return (Number(player?.age) <= 21 ? 4 : 0) + (/cb|lb|rb|def|مدافع|دفاع/.test(combined) ? 3 : 0);
  if (focusKey === "elite") return Number(player?.rating) >= 78 ? 5 : 0;
  return 0;
}
function sequenceOf(id, prefix) {
  const match = new RegExp("^" + prefix + "-(\\d+)$").exec(id);
  return match ? Number(match[1]) : 0;
}
function appendLedger(state, entry) {
  return {
    ...state,
    nextLedgerSequence: state.nextLedgerSequence + 1,
    ledger: [{ id:"agency-ledger-" + state.nextLedgerSequence, ...entry }, ...state.ledger].slice(0, MAX_LEDGER_ENTRIES)
  };
}
function failure(save, error) { return { changed:false, save, error }; }
function resolveManagement(save, currentDate) {
  if (!isRecord(save?.agency) || !validDate(currentDate) || currentDate !== save?.world?.currentDate) return null;
  const management = save.agency.management;
  return isValidAgencyManagementState(management, currentDate) ? management : null;
}

export function createInitialAgencyManagementState() {
  return {
    schemaVersion:1, nextStaffSequence:1, nextBranchSequence:1, nextLedgerSequence:1, nextSponsorshipSequence:1, nextCompetitiveSequence:1,
    lastPayrollDate:null, arrearsEgp:0, staff:[],
    branches:[{
      id:"agency-branch-hq", locationId:"headquarters", name:"المقر الرئيسي", region:"المقر الرئيسي",
      openedDate:"2026-07-01", setupCostEgp:0, weeklyRentEgp:0, isHeadquarters:true,
      status:"active", closedDate:null
    }],
    ledger:[],
    sponsorships:[],
    competitors:COMPETITOR_BLUEPRINTS.map((profile) => ({
      ...profile, clients:[], pendingOffers:[], lastActionDate:null
    })),
    competitiveHistory:[]
  };
}

export function isValidAgencyManagementState(state, currentDate) {
  if (!isRecord(state) || state.schemaVersion !== 1 ||
      !Number.isSafeInteger(state.nextStaffSequence) || state.nextStaffSequence < 1 ||
      !Number.isSafeInteger(state.nextBranchSequence) || state.nextBranchSequence < 1 ||
      !Number.isSafeInteger(state.nextLedgerSequence) || state.nextLedgerSequence < 1 ||
      !validMoney(state.arrearsEgp) || !Array.isArray(state.staff) || state.staff.length > 100 ||
      !Array.isArray(state.branches) || state.branches.length < 1 || state.branches.length > 100 ||
      !Array.isArray(state.ledger) || state.ledger.length > MAX_LEDGER_ENTRIES || !validDate(currentDate)) return false;
  if (state.lastPayrollDate !== null &&
      (!validDate(state.lastPayrollDate) || state.lastPayrollDate > currentDate ||
       new Date(state.lastPayrollDate + "T00:00:00.000Z").getUTCDay() !== 1)) return false;

  const staffIds = new Set();
  let highestStaff = 0;
  for (const employee of state.staff) {
    const role = AGENCY_JOB_ROLES.find((item) => item.id === employee?.roleId);
    if (!isRecord(employee) || !role || typeof employee.id !== "string" ||
        !sequenceOf(employee.id,"agency-staff") || staffIds.has(employee.id) ||
        employee.name !== role.name || employee.weeklySalaryEgp !== role.weeklySalaryEgp ||
        employee.hiringCostEgp !== role.hiringCostEgp || !validDate(employee.hiredDate) ||
        employee.hiredDate > currentDate || !["active","terminated"].includes(employee.status) ||
        (employee.status === "active" && employee.terminatedDate !== null) ||
        (employee.status === "terminated" &&
         (!validDate(employee.terminatedDate) || employee.terminatedDate < employee.hiredDate ||
          employee.terminatedDate > currentDate))) return false;
    staffIds.add(employee.id);
    highestStaff = Math.max(highestStaff, sequenceOf(employee.id,"agency-staff"));
  }
  if (state.nextStaffSequence <= highestStaff) return false;
  const activeByRole = new Map();
  for (const employee of state.staff.filter((item) => item.status === "active")) {
    activeByRole.set(employee.roleId, (activeByRole.get(employee.roleId) ?? 0) + 1);
  }
  if ([...activeByRole].some(([roleId,count]) =>
      count > AGENCY_JOB_ROLES.find((item) => item.id === roleId).maxHeadcount) ||
      state.staff.filter((item) => item.status === "active").length > MAX_ACTIVE_STAFF) return false;

  const branchIds = new Set();
  const activeLocations = new Set();
  let headquartersCount = 0;
  let highestBranch = 0;
  for (const branch of state.branches) {
    const location = branch?.locationId === "headquarters"
      ? { name:"المقر الرئيسي", region:"المقر الرئيسي", setupCostEgp:0, weeklyRentEgp:0 }
      : AGENCY_BRANCH_LOCATIONS.find((item) => item.id === branch?.locationId);
    if (!isRecord(branch) || !location || typeof branch.id !== "string" ||
        !branch.id.startsWith("agency-branch-") || branchIds.has(branch.id) ||
        branch.name !== location.name || branch.region !== location.region ||
        branch.setupCostEgp !== location.setupCostEgp || branch.weeklyRentEgp !== location.weeklyRentEgp ||
        !validDate(branch.openedDate) || branch.openedDate > currentDate ||
        !["active","closed"].includes(branch.status) ||
        (branch.status === "active" && branch.closedDate !== null) ||
        (branch.status === "closed" &&
         (!validDate(branch.closedDate) || branch.closedDate < branch.openedDate || branch.closedDate > currentDate)) ||
        typeof branch.isHeadquarters !== "boolean" ||
        branch.isHeadquarters !== (branch.locationId === "headquarters")) return false;
    if (branch.isHeadquarters) {
      headquartersCount += 1;
      if (branch.id !== "agency-branch-hq" || branch.status !== "active") return false;
    }
    if (branch.status === "active") {
      if (activeLocations.has(branch.locationId)) return false;
      activeLocations.add(branch.locationId);
    }
    highestBranch = Math.max(highestBranch, sequenceOf(branch.id,"agency-branch"));
    branchIds.add(branch.id);
  }
  if (headquartersCount !== 1 || state.nextBranchSequence <= highestBranch ||
      state.branches.filter((item) => item.status === "active").length > MAX_ACTIVE_BRANCHES) return false;

  const ledgerIds = new Set();
  let highestLedger = 0;
  for (const entry of state.ledger) {
    if (!isRecord(entry) || !sequenceOf(entry.id,"agency-ledger") || ledgerIds.has(entry.id) ||
        !validDate(entry.date) || entry.date > currentDate ||
        !["hiring","branch-opening","weekly-operations"].includes(entry.type) ||
        !validMoney(entry.amountEgp) || entry.amountEgp < 1 ||
        !validMoney(entry.paidEgp) || entry.paidEgp > entry.amountEgp ||
        !validMoney(entry.arrearsAfterEgp) || typeof entry.note !== "string" || !entry.note.trim() ||
        (entry.referenceId !== null && typeof entry.referenceId !== "string")) return false;
    highestLedger = Math.max(highestLedger, sequenceOf(entry.id,"agency-ledger"));
    ledgerIds.add(entry.id);
  }
  return state.nextLedgerSequence > highestLedger;
}

export function getAgencyManagementSummary(save) {
  const management = save?.agency?.management ?? createInitialAgencyManagementState();
  const activeStaff = management.staff.filter((item) => item.status === "active");
  const activeBranches = management.branches.filter((item) => item.status === "active");
  const weeklyPayrollEgp = activeStaff.reduce((sum,item) => sum + item.weeklySalaryEgp,0);
  const weeklyRentEgp = activeBranches.reduce((sum,item) => sum + item.weeklyRentEgp,0);
  return {
    activeStaff:activeStaff.length, activeBranches:activeBranches.length,
    weeklyPayrollEgp, weeklyRentEgp, weeklyCostsEgp:weeklyPayrollEgp + weeklyRentEgp,
    arrearsEgp:management.arrearsEgp,
    totalOperatingCommitmentEgp:weeklyPayrollEgp + weeklyRentEgp + management.arrearsEgp
  };
}

export function hireAgencyEmployee(save, roleId, currentDate = save?.world?.currentDate) {
  const state = resolveManagement(save,currentDate);
  if (!state) return failure(save,"بيانات إدارة الوكالة أو التاريخ غير صالحة.");
  const role = AGENCY_JOB_ROLES.find((item) => item.id === roleId);
  if (!role) return failure(save,"الوظيفة المطلوبة غير متاحة.");
  const active = state.staff.filter((item) => item.status === "active");
  if (active.length >= MAX_ACTIVE_STAFF ||
      active.filter((item) => item.roleId === roleId).length >= role.maxHeadcount)
    return failure(save,"وصلت الوكالة إلى الحد المسموح لهذا المنصب.");
  if (save.agency.balance < role.hiringCostEgp) return failure(save,"رصيد الوكالة لا يكفي تكلفة التعيين.");
  if (state.ledger.length >= MAX_LEDGER_ENTRIES) return failure(save,"سجل المصروفات ممتلئ؛ لا يمكن تسجيل تعيين جديد.");
  const employee = {
    id:"agency-staff-" + state.nextStaffSequence, roleId, name:role.name, hiredDate:currentDate,
    hiringCostEgp:role.hiringCostEgp, weeklySalaryEgp:role.weeklySalaryEgp,
    status:"active", terminatedDate:null
  };
  let next = { ...state, nextStaffSequence:state.nextStaffSequence + 1, staff:[employee,...state.staff] };
  next = appendLedger(next,{
    date:currentDate,type:"hiring",referenceId:employee.id,amountEgp:role.hiringCostEgp,
    paidEgp:role.hiringCostEgp,arrearsAfterEgp:state.arrearsEgp,note:"تكلفة تعيين " + role.name
  });
  return {
    changed:true,employee,
    save:{...save,agency:{...save.agency,balance:save.agency.balance-role.hiringCostEgp,management:next}}
  };
}

export function dismissAgencyEmployee(save, employeeId, currentDate = save?.world?.currentDate) {
  const state = resolveManagement(save,currentDate);
  if (!state) return failure(save,"بيانات إدارة الوكالة أو التاريخ غير صالحة.");
  const employee = state.staff.find((item) => item.id === employeeId && item.status === "active");
  if (!employee) return failure(save,"الموظف غير موجود أو تم إنهاء تعاقده بالفعل.");
  const next = {...state,staff:state.staff.map((item) => item.id === employeeId
    ? {...item,status:"terminated",terminatedDate:currentDate}:item)};
  return {changed:true,employeeId,save:{...save,agency:{...save.agency,management:next}}};
}

export function openAgencyBranch(save, locationId, currentDate = save?.world?.currentDate) {
  const state = resolveManagement(save,currentDate);
  if (!state) return failure(save,"بيانات إدارة الوكالة أو التاريخ غير صالحة.");
  const location = AGENCY_BRANCH_LOCATIONS.find((item) => item.id === locationId);
  if (!location) return failure(save,"موقع الفرع المطلوب غير متاح.");
  if (state.branches.some((item) => item.locationId === locationId && item.status === "active"))
    return failure(save,"لدى الوكالة فرع نشط بالفعل في هذه المدينة.");
  if (state.branches.filter((item) => item.status === "active").length >= MAX_ACTIVE_BRANCHES)
    return failure(save,"وصلت الوكالة إلى الحد الأقصى للفروع النشطة.");
  if (save.agency.balance < location.setupCostEgp) return failure(save,"رصيد الوكالة لا يكفي تكلفة افتتاح الفرع.");
  if (state.ledger.length >= MAX_LEDGER_ENTRIES) return failure(save,"سجل المصروفات ممتلئ؛ لا يمكن تسجيل فرع جديد.");
  const branch = {
    id:"agency-branch-" + state.nextBranchSequence,locationId,name:location.name,region:location.region,
    openedDate:currentDate,setupCostEgp:location.setupCostEgp,weeklyRentEgp:location.weeklyRentEgp,
    isHeadquarters:false,status:"active",closedDate:null
  };
  let next = {...state,nextBranchSequence:state.nextBranchSequence+1,branches:[branch,...state.branches]};
  next = appendLedger(next,{
    date:currentDate,type:"branch-opening",referenceId:branch.id,amountEgp:location.setupCostEgp,
    paidEgp:location.setupCostEgp,arrearsAfterEgp:state.arrearsEgp,note:"تكلفة افتتاح فرع " + location.name
  });
  return {
    changed:true,branch,
    save:{...save,agency:{...save.agency,balance:save.agency.balance-location.setupCostEgp,management:next}}
  };
}

export function closeAgencyBranch(save, branchId, currentDate = save?.world?.currentDate) {
  const state = resolveManagement(save,currentDate);
  if (!state) return failure(save,"بيانات إدارة الوكالة أو التاريخ غير صالحة.");
  const branch = state.branches.find((item) => item.id === branchId && item.status === "active");
  if (!branch || branch.isHeadquarters) return failure(save,"لا يمكن إغلاق المقر الرئيسي أو فرع غير نشط.");
  const next = {...state,branches:state.branches.map((item) => item.id === branchId
    ? {...item,status:"closed",closedDate:currentDate}:item)};
  return {changed:true,branchId,save:{...save,agency:{...save.agency,management:next}}};
}

/** Settles payroll and branch rent every in-game Monday. Unpaid costs remain as arrears. */
export function advanceAgencyManagementDay(save, currentDate = save?.world?.currentDate) {
  const state = resolveManagement(save,currentDate);
  if (!state) return {changed:false,save,error:"بيانات إدارة الوكالة أو التاريخ غير صالحة."};
  if (new Date(currentDate + "T00:00:00.000Z").getUTCDay() !== 1 || state.lastPayrollDate === currentDate)
    return {changed:false,save,processed:false};
  const weeklyCost = getAgencyManagementSummary(save).weeklyCostsEgp;
  const totalDue = state.arrearsEgp + weeklyCost;
  if (totalDue > 0 && state.ledger.length >= MAX_LEDGER_ENTRIES)
    return {changed:false,save,processed:false,error:"سجل المصروفات ممتلئ؛ لم تتم تسوية الالتزامات."};
  const paidEgp = Math.min(save.agency.balance,totalDue);
  const arrearsAfterEgp = totalDue-paidEgp;
  let next = {...state,lastPayrollDate:currentDate,arrearsEgp:arrearsAfterEgp};
  if (totalDue > 0) next = appendLedger(next,{
    date:currentDate,type:"weekly-operations",referenceId:null,amountEgp:totalDue,
    paidEgp,arrearsAfterEgp,note:"رواتب الفريق وإيجارات الفروع للأسبوع"
  });
  return {
    changed:true,processed:true,dueEgp:totalDue,paidEgp,arrearsEgp:arrearsAfterEgp,
    save:{...save,agency:{...save.agency,balance:save.agency.balance-paidEgp,management:next}}
  };
}
