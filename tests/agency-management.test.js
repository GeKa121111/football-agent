import test from "node:test";
import assert from "node:assert/strict";
import { createInitialSave, isValidSave } from "../src/core/storage.js";
import {
  AGENCY_BRANCH_LOCATIONS, AGENCY_JOB_ROLES, advanceAgencyManagementDay, closeAgencyBranch,
  dismissAgencyEmployee, getAgencyManagementSummary, hireAgencyEmployee,
  isValidAgencyManagementState, openAgencyBranch
} from "../src/engines/agency-management.js";

test("creates a valid operations record with a permanent headquarters", () => {
  const save=createInitialSave();
  assert.equal(isValidAgencyManagementState(save.agency.management,save.world.currentDate),true);
  assert.equal(save.agency.management.branches.length,1);
  assert.equal(save.agency.management.branches[0].isHeadquarters,true);
  assert.equal(isValidSave(save),true);
});

test("hires staff, charges setup cost and enforces role capacity", () => {
  const save=createInitialSave();
  const role=AGENCY_JOB_ROLES.find((item)=>item.id==="negotiator");
  const first=hireAgencyEmployee(save,role.id);
  assert.equal(first.changed,true,first.error);
  assert.equal(first.employee.weeklySalaryEgp,role.weeklySalaryEgp);
  assert.equal(first.save.agency.balance,save.agency.balance-role.hiringCostEgp);
  const second=hireAgencyEmployee(first.save,role.id);
  assert.equal(second.changed,true,second.error);
  const third=hireAgencyEmployee(second.save,role.id);
  assert.equal(third.changed,false);
  assert.equal(isValidSave(second.save),true);
});

test("rejects unaffordable hiring and branch expansion without changing the save", () => {
  const save=createInitialSave();
  const poor={...save,agency:{...save.agency,balance:1}};
  const hire=hireAgencyEmployee(poor,"legal");
  const branch=openAgencyBranch(poor,"london");
  assert.equal(hire.changed,false); assert.equal(branch.changed,false);
  assert.equal(hire.save,poor); assert.equal(branch.save,poor);
  assert.equal(isValidSave(poor),true);
});

test("opens and closes branches while protecting headquarters", () => {
  const save=createInitialSave();
  const opened=openAgencyBranch(save,"alexandria");
  assert.equal(opened.changed,true,opened.error);
  assert.equal(opened.save.agency.balance,save.agency.balance-AGENCY_BRANCH_LOCATIONS[0].setupCostEgp);
  assert.equal(isValidSave(opened.save),true);
  assert.equal(openAgencyBranch(opened.save,"alexandria").changed,false);
  assert.equal(closeAgencyBranch(opened.save,"agency-branch-hq").changed,false);
  const closed=closeAgencyBranch(opened.save,opened.branch.id);
  assert.equal(closed.changed,true);
  assert.equal(getAgencyManagementSummary(closed.save).activeBranches,1);
  assert.equal(isValidSave(closed.save),true);
});

test("dismisses staff without deleting employment history", () => {
  const hired=hireAgencyEmployee(createInitialSave(),"analyst");
  const dismissed=dismissAgencyEmployee(hired.save,hired.employee.id);
  assert.equal(dismissed.changed,true);
  assert.equal(dismissed.save.agency.management.staff[0].status,"terminated");
  assert.equal(dismissed.save.agency.management.staff[0].terminatedDate,"2026-07-01");
  assert.equal(getAgencyManagementSummary(dismissed.save).activeStaff,0);
  assert.equal(isValidSave(dismissed.save),true);
});

test("settles weekly payroll and branch rent once every Monday, retaining unpaid arrears", () => {
  let save=createInitialSave();
  const hired=hireAgencyEmployee(save,"analyst");
  save=openAgencyBranch(hired.save,"alexandria").save;
  assert.equal(advanceAgencyManagementDay(save,"2026-07-05").processed,false);
  const weekly=AGENCY_JOB_ROLES.find((item)=>item.id==="analyst").weeklySalaryEgp+
    AGENCY_BRANCH_LOCATIONS.find((item)=>item.id==="alexandria").weeklyRentEgp;
  const due=advanceAgencyManagementDay(save,"2026-07-06");
  assert.equal(due.processed,true); assert.equal(due.dueEgp,weekly);
  assert.equal(due.paidEgp,weekly); assert.equal(due.arrearsEgp,0);
  assert.equal(due.save.agency.balance,save.agency.balance-weekly);
  assert.equal(isValidSave(due.save),true);
  const repeat=advanceAgencyManagementDay(due.save,"2026-07-06");
  assert.equal(repeat.processed,false); assert.equal(repeat.save,due.save);

  const insolvent={...save,agency:{...save.agency,balance:100}};
  const shortfall=advanceAgencyManagementDay(insolvent,"2026-07-06");
  assert.equal(shortfall.paidEgp,100); assert.equal(shortfall.arrearsEgp,weekly-100);
  assert.equal(shortfall.save.agency.balance,0); assert.equal(isValidSave(shortfall.save),true);
});

test("rejects tampered operations, staff, branch and ledger data", () => {
  const hired=hireAgencyEmployee(createInitialSave(),"media");
  const badStaff=structuredClone(hired.save);
  badStaff.agency.management.staff[0].weeklySalaryEgp+=1;
  assert.equal(isValidSave(badStaff),false);
  const badBranch=structuredClone(hired.save);
  badBranch.agency.management.branches[0].status="closed";
  assert.equal(isValidSave(badBranch),false);
  const badLedger=structuredClone(hired.save);
  badLedger.agency.management.ledger[0].paidEgp+=1;
  assert.equal(isValidSave(badLedger),false);
  const badArrears=structuredClone(hired.save);
  badArrears.agency.management.arrearsEgp=-1;
  assert.equal(isValidSave(badArrears),false);
});
