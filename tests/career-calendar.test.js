import test from "node:test";
import assert from "node:assert/strict";
import { createInitialSave } from "../src/core/storage.js";
import {
  advanceCareerDay,
  completeCareerTask,
  markCareerMessageRead,
  filterCareerEvents
} from "../src/engines/career-calendar.js";
import { isValidSave } from "../src/core/storage.js";

test("advances the date, day and week without mutating the original save", () => {
  const save = createInitialSave();
  save.career.day = 6;
  save.career.week = 1;
  const next = advanceCareerDay(save);

  assert.equal(next.world.currentDate, "2026-07-02");
  assert.equal(next.career.day, 7);
  assert.equal(next.career.week, 1);
  assert.equal(save.world.currentDate, "2026-07-01");
  assert.equal(save.career.day, 6);
  assert.equal(next.agency, save.agency);
});

test("starts a weekly briefing, inbox message and actionable task on Monday", () => {
  const save = createInitialSave();
  save.world.currentDate = "2026-07-05";
  save.career.day = 5;

  const next = advanceCareerDay(save);
  assert.equal(next.world.currentDate, "2026-07-06");
  assert.equal(next.world.events.length, 1);
  assert.equal(next.world.events[0].type, "weekly-briefing");
  assert.equal(next.world.inbox[0].eventId, next.world.events[0].id);
  assert.equal(next.world.inbox[0].read, false);
  assert.equal(next.world.tasks[0].id, "task-2026-07-06-weekly-review");
  assert.equal(next.world.tasks[0].dueDate, "2026-07-12");
});

test("creates monthly reports on the first day of a month", () => {
  const save = createInitialSave();
  save.world.currentDate = "2026-07-31";
  const next = advanceCareerDay(save);

  assert.equal(next.world.currentDate, "2026-08-01");
  assert.ok(next.world.events.some((event) => event.type === "monthly-market"));
  assert.ok(next.world.inbox.some((message) => message.title === "تقرير السوق الشهري"));
});

test("starts a new season on July 1 and creates a season planning task", () => {
  const save = createInitialSave();
  save.world.currentDate = "2027-06-30";
  save.career.season = 1;
  const next = advanceCareerDay(save);

  assert.equal(next.world.currentDate, "2027-07-01");
  assert.equal(next.career.season, 2);
  assert.ok(next.world.events.some((event) => event.type === "season-opening"));
  assert.ok(next.world.tasks.some((task) => task.category === "season-planning"));
});

test("completes a task once and keeps unknown or completed tasks unchanged", () => {
  const save = createInitialSave();
  save.world.currentDate = "2026-07-05";
  const next = advanceCareerDay(save);
  const taskId = next.world.tasks[0].id;

  const completed = completeCareerTask(next, taskId);
  assert.equal(completed.changed, true);
  assert.equal(completed.save.world.tasks[0].status, "completed");
  assert.equal(completed.save.world.tasks[0].completedDate, "2026-07-06");
  assert.equal(next.world.tasks[0].status, "open");

  assert.equal(completeCareerTask(completed.save, taskId).changed, false);
  assert.equal(completeCareerTask(next, "missing-task").changed, false);
});

test("marks an inbox message read without changing other messages", () => {
  const save = createInitialSave();
  save.world.currentDate = "2026-07-05";
  const next = advanceCareerDay(save);
  const messageId = next.world.inbox[0].id;

  const result = markCareerMessageRead(next, messageId);
  assert.equal(result.changed, true);
  assert.equal(result.save.world.inbox[0].read, true);
  assert.equal(next.world.inbox[0].read, false);
  assert.equal(markCareerMessageRead(result.save, messageId).changed, false);
});

test("rejects an invalid calendar date instead of silently advancing it", () => {
  const save = createInitialSave();
  save.world.currentDate = "2026-02-30";
  assert.throws(() => advanceCareerDay(save), /تاريخ المسيرة غير صالح/);
});


test("marks expired open tasks overdue once and creates a linked high-priority reminder", () => {
  const save = createInitialSave();
  const task = { ...save.world.tasks[0], dueDate: "2026-07-01" };
  save.world.tasks = [task];
  const next = advanceCareerDay(save);

  assert.equal(next.world.tasks[0].status, "overdue");
  assert.equal(next.world.tasks[0].overdueDate, "2026-07-02");
  const event = next.world.events.find((item) => item.type === "task-overdue");
  const message = next.world.inbox.find((item) => item.eventId === event.id);
  assert.equal(event.priority, "high");
  assert.equal(message.read, false);
  assert.equal(isValidSave(next), true);
  assert.equal(advanceCareerDay(next).world.events.filter((item) => item.type === "task-overdue").length, 1);
});

test("allows a late task to be completed and records that it missed its due date", () => {
  const save = createInitialSave();
  save.world.tasks[0] = { ...save.world.tasks[0], status: "overdue", overdueDate: "2026-07-02" };
  const result = completeCareerTask(save, save.world.tasks[0].id);
  assert.equal(result.changed, true);
  assert.equal(result.save.world.tasks[0].status, "completed");
  assert.equal(result.save.world.tasks[0].completedLate, true);
  assert.equal(result.save.world.tasks[0].completedDate, "2026-07-01");
  assert.equal(isValidSave(result.save), true);
});

test("filters event history by type and Arabic or date search in newest-first order", () => {
  const save = createInitialSave();
  save.world.currentDate = "2026-07-05";
  const monday = advanceCareerDay(save);
  const events = [
    { id: "z", date: "2026-07-07", type: "monthly-market", title: "تقرير السوق", description: "مراجعة الأندية", priority: "normal" },
    ...monday.world.events,
    { id: "a", date: "2026-07-06", type: "weekly-briefing", title: "إحاطة أخرى", description: "الأولويات", priority: "normal" }
  ];
  assert.equal(filterCareerEvents(events, { type: "weekly-briefing" }).length, 2);
  assert.equal(filterCareerEvents(events, { query: "الأندية" }).length, 1);
  assert.equal(filterCareerEvents(events, { query: "2026-07-07" }).length, 1);
  const sorted = filterCareerEvents(events);
  assert.equal(sorted[0].date, "2026-07-07");
  assert.equal(sorted.at(-1).date, "2026-07-06");
});

test("keeps the calendar stable across three complete season openings and leap day", () => {
  let save = createInitialSave();
  for (let day = 0; day < 1096; day += 1) save = advanceCareerDay(save);
  assert.equal(save.world.currentDate, "2029-07-01");
  assert.equal(save.career.season, 4);
  assert.equal(save.career.day, 1097);
  assert.equal(isValidSave(save), true);

  const leapSave = createInitialSave();
  leapSave.world.currentDate = "2028-02-28";
  const leapDay = advanceCareerDay(leapSave);
  const march = advanceCareerDay(leapDay);
  assert.equal(leapDay.world.currentDate, "2028-02-29");
  assert.equal(march.world.currentDate, "2028-03-01");
});
