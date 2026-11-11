import test from "node:test";
import assert from "node:assert/strict";
import { createInitialSave } from "../src/core/storage.js";
import { advanceCareerDay, completeCareerTask, getUnreadMessageCount, markInboxMessageRead } from "../src/engines/calendar-engine.js";

test("advances the date and records a daily event", () => {
  const initial = createInitialSave();
  const next = advanceCareerDay(initial);
  assert.equal(next.world.currentDate, "2026-07-02");
  assert.equal(next.career.totalDays, 2);
  assert.equal(next.career.day, 2);
  assert.equal(next.career.week, 1);
  assert.equal(next.career.season, 1);
  assert.ok(next.world.events.some((event) => event.id === "day:2026-07-02"));
  assert.equal(initial.world.currentDate, "2026-07-01");
});

test("creates one weekly event and inbox message after seven career days", () => {
  let save = createInitialSave();
  for (let day = 0; day < 6; day += 1) save = advanceCareerDay(save);
  assert.equal(save.career.totalDays, 7);
  assert.equal(save.career.week, 1);
  assert.equal(save.world.events.filter((event) => event.type === "weekly").length, 1);
  assert.equal(save.world.inbox.filter((message) => message.type === "weekly").length, 1);
});

test("rolls into a new 90-day season without breaking the calendar counters", () => {
  let save = createInitialSave();
  for (let day = 0; day < 90; day += 1) save = advanceCareerDay(save);
  assert.equal(save.career.totalDays, 91);
  assert.equal(save.career.season, 2);
  assert.equal(save.career.day, 1);
  assert.equal(save.career.week, 1);
  assert.equal(save.world.currentDate, "2026-09-29");
  assert.equal(save.world.events.filter((event) => event.type === "season").length, 1);
  assert.equal(save.world.inbox.filter((message) => message.type === "season").length, 1);
});

test("completes a task once and logs its completion", () => {
  const initial = createInitialSave();
  const completed = completeCareerTask(initial, "task-review-players");
  assert.equal(completed.world.tasks[0].status, "completed");
  assert.equal(completed.world.tasks[0].completedAt, "2026-07-01");
  assert.equal(completed.world.events.filter((event) => event.type === "task-completed").length, 1);
  assert.equal(completeCareerTask(completed, "task-review-players"), null);
  assert.equal(completeCareerTask(initial, "missing-task"), null);
});

test("marks inbox messages read once and reports unread count", () => {
  const initial = createInitialSave();
  assert.equal(getUnreadMessageCount(initial), 1);
  const read = markInboxMessageRead(initial, initial.world.inbox[0].id);
  assert.equal(read.world.inbox[0].read, true);
  assert.equal(getUnreadMessageCount(read), 0);
  assert.equal(markInboxMessageRead(read, initial.world.inbox[0].id), read);
});

test("marks overdue tasks once and creates a matching reminder", () => {
  let save = createInitialSave();
  for (let day = 0; day < 7; day += 1) save = advanceCareerDay(save);
  assert.equal(save.world.tasks.find((task) => task.id === "task-review-players").status, "overdue");
  assert.equal(save.world.inbox.filter((message) => message.type === "task-overdue").length, 1);
  save = advanceCareerDay(save);
  assert.equal(save.world.inbox.filter((message) => message.type === "task-overdue").length, 1);
});
