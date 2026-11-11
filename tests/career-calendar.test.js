import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createInitialSave } from "../src/core/storage.js";
import {
  advanceCareerDay,
  advanceCareerDays,
  completeCareerTask,
  markCareerMessageRead,
  filterCareerEvents,
  getCareerEventTypeLabel,
  getCareerEventPriorityLabel,
  filterCareerTasks,
  filterCareerMessages,
  createInitialCareerCalendar,
  getUpcomingCareerEvents
} from "../src/engines/career-calendar.js";
import { isValidSave } from "../src/core/storage.js";

function makeTask(overrides = {}) {
  return {
    id: "task-unit-overdue",
    title: "مراجعة مهمة الاختبار",
    description: "مهمة لاختبار دورة التسليم.",
    createdDate: "2026-07-01",
    dueDate: "2026-07-01",
    category: "weekly-review",
    status: "open",
    ...overrides
  };
}

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
  save.world.events = [];
  save.world.inbox = [];
  save.world.tasks = [];
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

test("advances a week day-by-day across a deadline and season boundary", () => {
  const save = createInitialSave();
  save.world.currentDate = "2027-06-27";
  save.world.events = [];
  save.world.inbox = [];
  save.world.tasks = [makeTask({ id: "task-weekly-skip", dueDate: "2027-06-28" })];
  save.career.day = 363;
  save.career.week = 52;
  save.career.season = 1;

  const next = advanceCareerDays(save, 7);

  assert.equal(next.world.currentDate, "2027-07-04");
  assert.equal(next.career.day, 370);
  assert.equal(next.career.week, 53);
  assert.equal(next.career.season, 2);
  assert.equal(next.world.tasks[0].status, "overdue");
  assert.equal(next.world.tasks[0].overdueDate, "2027-06-29");
  assert.ok(next.world.events.some((event) => event.id === "event-2027-06-28-weekly-briefing"));
  assert.ok(next.world.events.some((event) => event.id === "event-2027-07-01-monthly-market"));
  assert.ok(next.world.events.some((event) => event.id === "event-2027-07-01-season-opening"));
  assert.ok(next.world.events.some((event) => event.type === "task-overdue" && event.date === "2027-06-29"));
  assert.equal(new Set(next.world.events.map((event) => event.id)).size, next.world.events.length);
  assert.equal(next.world.inbox.every((message) => next.world.events.some((event) => event.id === message.eventId)), true);
  assert.equal(save.world.currentDate, "2027-06-27");
  assert.equal(save.world.tasks[0].status, "open");
  assert.equal(isValidSave(next), true);
});

test("rejects invalid multi-day advances instead of silently changing the save", () => {
  const save = createInitialSave();
  for (const days of [0, -1, 1.5, 32, "7"]) {
    assert.throws(() => advanceCareerDays(save, days), /من يوم واحد إلى 31 يومًا/);
  }
  assert.equal(save.world.currentDate, "2026-07-01");
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
  save.world.tasks = [makeTask()];
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
  save.world.currentDate = "2026-07-03";
  save.world.tasks = [makeTask({ status: "overdue", overdueDate: "2026-07-02" })];
  const result = completeCareerTask(save, save.world.tasks[0].id);
  assert.equal(result.changed, true);
  assert.equal(result.save.world.tasks[0].status, "completed");
  assert.equal(result.save.world.tasks[0].completedLate, true);
  assert.equal(result.save.world.tasks[0].completedDate, "2026-07-03");
  const completionEvent = result.save.world.events.find((event) => event.type === "task-completed");
  assert.ok(completionEvent);
  const completionMessage = result.save.world.inbox.find((message) => message.eventId === completionEvent.id);
  assert.deepEqual(completionMessage, {
    id: "message-" + completionEvent.id,
    eventId: completionEvent.id,
    date: "2026-07-03",
    title: completionEvent.title,
    body: completionEvent.description,
    read: false
  });
  const repeated = completeCareerTask(result.save, save.world.tasks[0].id);
  assert.equal(repeated.changed, false);
  assert.equal(repeated.save.world.inbox.length, result.save.world.inbox.length);
  assert.equal(isValidSave(result.save), true);
});

test("filters event history by type and Arabic or date search in newest-first order", () => {
  const save = createInitialSave();
  save.world.currentDate = "2026-07-05";
  save.world.events = [];
  save.world.inbox = [];
  save.world.tasks = [];
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

test("localizes every calendar event type and priority for archive search", () => {
  const labels = {
    "weekly-briefing": "الإحاطة الأسبوعية",
    "monthly-market": "تقرير السوق الشهري",
    "season-opening": "افتتاح الموسم",
    "preseason-review": "مراجعة ما قبل الموسم",
    "midseason-review": "مراجعة منتصف الموسم",
    "season-review": "تقييم نهاية الموسم",
    "season-closing": "ختام الموسم",
    "task-overdue": "تأخر مهمة",
    "task-completed": "إنجاز مهمة"
  };

  for (const [type, label] of Object.entries(labels)) {
    assert.equal(getCareerEventTypeLabel(type), label);
  }
  assert.equal(getCareerEventTypeLabel("future-system-event"), "حدث آخر");
  assert.equal(getCareerEventPriorityLabel("high"), "عالية");
  assert.equal(getCareerEventPriorityLabel("normal"), "عادية");
  assert.equal(getCareerEventPriorityLabel("low"), "منخفضة");

  const events = [
    { id: "preseason", date: "2026-08-15", type: "preseason-review", title: "مراجعة", description: "ملفات البداية", priority: "high" },
    { id: "completed", date: "2026-08-16", type: "task-completed", title: "إنجاز", description: "اكتمل العمل", priority: "normal" }
  ];
  assert.deepEqual(filterCareerEvents(events, { query: "مراجعة ما قبل الموسم" }).map((event) => event.id), ["preseason"]);
  assert.deepEqual(filterCareerEvents(events, { query: "عالية" }).map((event) => event.id), ["preseason"]);
  assert.deepEqual(filterCareerEvents(events, { query: "إنجاز مهمة" }).map((event) => event.id), ["completed"]);
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


test("keeps inbox references valid when a completion event evicts the oldest history item", () => {
  const save = createInitialSave();
  save.world.events = Array.from({ length: 90 }, (_, index) => ({
    id: "history-" + index,
    date: "2026-07-01",
    type: "weekly-briefing",
    title: "حدث " + index,
    description: "سجل تجريبي",
    priority: "normal"
  }));
  save.world.inbox = [{
    id: "message-oldest",
    eventId: "history-0",
    date: "2026-07-01",
    title: "رسالة قديمة",
    body: "مرتبطة بأقدم حدث.",
    read: false
  }];
  save.world.tasks = [makeTask()];
  const result = completeCareerTask(save, "task-unit-overdue");

  assert.equal(result.changed, true);
  assert.equal(result.save.world.events.length, 90);
  const completionEvent = result.save.world.events.find((event) => event.type === "task-completed");
  assert.ok(completionEvent);
  assert.equal(result.save.world.inbox.length, 1);
  assert.equal(result.save.world.inbox[0].eventId, completionEvent.id);
  assert.equal(result.save.world.inbox[0].read, false);
  assert.equal(isValidSave(result.save), true);
});


test("seeds a new career with the opening-day season and monthly milestones", () => {
  const seed = createInitialCareerCalendar("2026-07-01", 1);
  assert.deepEqual(seed.events.map((event) => event.type), ["monthly-market", "season-opening"]);
  assert.equal(seed.inbox.length, 2);
  assert.equal(seed.inbox.every((message) => seed.events.some((event) => event.id === message.eventId)), true);
  assert.equal(seed.tasks.length, 1);
  assert.equal(seed.tasks[0].category, "season-planning");
  assert.equal(seed.tasks[0].dueDate, "2026-07-14");
});

test("schedules preseason, midseason and season-close milestones with actionable tasks", () => {
  const dates = [
    ["2026-08-15", "preseason-review", "preseason-review"],
    ["2027-01-15", "midseason-review", "midseason-review"],
    ["2027-06-15", "season-review", "season-review"],
    ["2027-06-30", "season-closing", null]
  ];
  for (const [date, eventType, taskCategory] of dates) {
    const save = createInitialSave();
    save.world.currentDate = new Date(Date.parse(date + "T12:00:00.000Z") - 86400000).toISOString().slice(0, 10);
    const next = advanceCareerDay(save);
    assert.ok(next.world.events.some((event) => event.type === eventType), date);
    if (taskCategory) assert.ok(next.world.tasks.some((task) => task.category === taskCategory), date);
  }
});

test("returns the next 365 days of agency milestones in date order across season boundaries", () => {
  const upcoming = getUpcomingCareerEvents("2026-06-30", 1, 365);
  assert.equal(upcoming[0].type, "monthly-market");
  assert.ok(upcoming.some((event) => event.type === "season-opening" && event.season === 2));
  assert.ok(upcoming.some((event) => event.type === "preseason-review" && event.season === 2));
  assert.ok(upcoming.some((event) => event.type === "midseason-review" && event.season === 2));
  assert.ok(upcoming.some((event) => event.type === "season-closing" && event.season === 2));
  assert.ok(upcoming.every((event, index) => index === 0 || upcoming[index - 1].date <= event.date));
  assert.throws(() => getUpcomingCareerEvents("2026-07-01", 1, 0), /نطاق التقويم/);
  assert.throws(() => getUpcomingCareerEvents("2026-07-01", 1, 731), /نطاق التقويم/);
});


test("filters task history by lifecycle status and Arabic/date search without mutating it", () => {
  const tasks = [
    makeTask({ id: "task-open", title: "مراجعة مفتوحة", dueDate: "2026-07-20" }),
    makeTask({ id: "task-overdue", title: "مهمة متأخرة", status: "overdue", overdueDate: "2026-07-03" }),
    makeTask({
      id: "task-completed-late",
      title: "تقرير مكتمل متأخر",
      status: "completed",
      completedDate: "2026-07-09",
      completedLate: true
    }),
    makeTask({
      id: "task-completed-on-time",
      title: "تقرير مكتمل في موعده",
      status: "completed",
      completedDate: "2026-07-08",
      completedLate: false
    })
  ];
  const originalIds = tasks.map((task) => task.id);

  assert.deepEqual(filterCareerTasks(tasks, { status: "completed" }).map((task) => task.id), [
    "task-completed-late",
    "task-completed-on-time"
  ]);
  assert.deepEqual(filterCareerTasks(tasks, { status: "overdue" }).map((task) => task.id), ["task-overdue"]);
  assert.deepEqual(filterCareerTasks(tasks, { query: "متأخر" }).map((task) => task.id), [
    "task-completed-late",
    "task-overdue"
  ]);
  assert.deepEqual(filterCareerTasks(tasks, { query: "2026-07-08" }).map((task) => task.id), ["task-completed-on-time"]);
  assert.deepEqual(filterCareerTasks(tasks, { status: "unknown" }), []);
  assert.deepEqual(tasks.map((task) => task.id), originalIds);
});


test("does not stack a recurring task while an earlier task in its category is actionable", () => {
  const save = createInitialSave();
  save.world.currentDate = "2026-07-05";
  save.world.events = [];
  save.world.inbox = [];
  save.world.tasks = [makeTask({
    id: "task-existing-weekly-review",
    status: "overdue",
    overdueDate: "2026-07-04"
  })];

  const next = advanceCareerDays(save, 28);
  const weeklyEvents = next.world.events.filter((event) => event.type === "weekly-briefing");

  assert.equal(weeklyEvents.length, 4);
  assert.equal(next.world.currentDate, "2026-08-02");
  assert.equal(next.world.tasks.length, 1);
  assert.equal(next.world.tasks[0].id, "task-existing-weekly-review");
  assert.equal(next.world.tasks[0].status, "overdue");
  assert.equal(isValidSave(next), true);
});

test("bounds completed task history without evicting open or overdue work", () => {
  const save = createInitialSave();
  save.world.currentDate = "2026-07-02";
  const completed = Array.from({ length: 65 }, (_, index) => ({
    id: "task-completed-" + String(index).padStart(2, "0"),
    title: "مهمة مكتملة " + index,
    description: "سجل مكتمل للاختبار.",
    createdDate: "2025-12-01",
    dueDate: "2025-12-20",
    completedDate: new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10),
    completedLate: true,
    category: "completed-history",
    status: "completed"
  }));
  const openTask = makeTask({
    id: "task-legacy-open",
    category: "legacy-open",
    createdDate: "2026-06-01",
    dueDate: "2026-07-20",
    status: "open"
  });
  const overdueTask = makeTask({
    id: "task-legacy-overdue",
    category: "legacy-overdue",
    createdDate: "2026-05-01",
    dueDate: "2026-06-01",
    overdueDate: "2026-06-02",
    status: "overdue"
  });
  save.world.tasks = [...completed, openTask, overdueTask];

  const next = advanceCareerDay(save);
  const retainedCompleted = next.world.tasks.filter((task) => task.status === "completed");

  assert.equal(retainedCompleted.length, 60);
  assert.equal(retainedCompleted[0].id, "task-completed-05");
  assert.equal(retainedCompleted.at(-1).id, "task-completed-64");
  assert.ok(next.world.tasks.some((task) => task.id === openTask.id));
  assert.ok(next.world.tasks.some((task) => task.id === overdueTask.id));
  assert.equal(isValidSave(next), true);
});


test("filters the full inbox by read state and Arabic/date search without mutating it", () => {
  const messages = [
    { id: "message-a", eventId: "event-a", date: "2026-07-02", title: "تقرير السوق", body: "حركة الأندية", read: false },
    { id: "message-b", eventId: "event-b", date: "2026-07-03", title: "إحاطة أسبوعية", body: "قائمة المواهب", read: true },
    { id: "message-c", eventId: "event-c", date: "2026-07-03", title: "رسالة الكشاف", body: "موهبة جديدة", read: false }
  ];
  const original = JSON.stringify(messages);

  assert.deepEqual(
    filterCareerMessages(messages, { status: "unread" }).map((message) => message.id),
    ["message-c", "message-a"]
  );
  assert.deepEqual(
    filterCareerMessages(messages, { status: "read" }).map((message) => message.id),
    ["message-b"]
  );
  assert.deepEqual(
    filterCareerMessages(messages, { query: "المواهب" }).map((message) => message.id),
    ["message-b"]
  );
  assert.deepEqual(
    filterCareerMessages(messages, { query: "2026-07-02" }).map((message) => message.id),
    ["message-a"]
  );
  assert.deepEqual(filterCareerMessages(messages, { status: "unknown" }), []);
  assert.equal(JSON.stringify(messages), original);
});


test("keeps five complete season cycles valid with recurring tasks completed and bounded history", () => {
  let save = createInitialSave();
  const originalAgency = structuredClone(save.agency);

  for (let offset = 0; offset < 1825; offset += 1) {
    save = advanceCareerDay(save);

    for (const task of [...save.world.tasks]) {
      if (task.status !== "open" && task.status !== "overdue") continue;
      const result = completeCareerTask(save, task.id);
      assert.equal(result.changed, true, "every actionable task should complete exactly once");
      save = result.save;
    }

    assert.equal(isValidSave(save), true, "save must remain valid on " + save.world.currentDate);

    const eventIds = save.world.events.map((event) => event.id);
    assert.equal(new Set(eventIds).size, eventIds.length, "retained event IDs must be unique");

    const messageIds = save.world.inbox.map((message) => message.id);
    assert.equal(new Set(messageIds).size, messageIds.length, "retained message IDs must be unique");

    const eventsById = new Map(save.world.events.map((event) => [event.id, event]));
    for (const message of save.world.inbox) {
      const linkedEvent = eventsById.get(message.eventId);
      assert.ok(linkedEvent, "every retained message must reference a retained event");
      assert.equal(message.date, linkedEvent.date, "message and event dates must agree");
    }
  }

  assert.equal(save.world.currentDate, "2031-06-30");
  assert.equal(save.career.day, 1826);
  assert.equal(save.career.week, 261);
  assert.equal(save.career.season, 5);
  assert.ok(save.world.events.length <= 90);
  assert.ok(save.world.inbox.length <= 90);
  assert.ok(save.world.tasks.length <= 60);
  assert.ok(save.world.tasks.length > 0);
  assert.ok(save.world.tasks.every((task) => task.status === "completed"));
  assert.deepEqual(save.agency, originalAgency, "calendar simulation must not mutate agency assets");
});

test("uses UTC calendar transitions independently of the host timezone", () => {
  const script = [
    'import { createInitialSave } from "./src/core/storage.js";',
    'import { advanceCareerDays } from "./src/engines/career-calendar.js";',
    "const base = createInitialSave();",
    "const start = (currentDate, season) => ({",
    "  ...base,",
    "  career: { ...base.career, season },",
    "  world: { ...base.world, currentDate, events: [], inbox: [], tasks: [] }",
    "});",
    'const leap = advanceCareerDays(start("2028-02-27", 2), 4);',
    'const year = advanceCareerDays(start("2028-12-30", 2), 4);',
    'const season = advanceCareerDays(start("2029-06-29", 3), 4);',
    "process.stdout.write(JSON.stringify({",
    "  leapDate: leap.world.currentDate,",
    "  yearDate: year.world.currentDate,",
    '  monthlyEvent: year.world.events.some((event) => event.type === "monthly-market" && event.date === "2029-01-01"),',
    "  seasonDate: season.world.currentDate,",
    "  seasonNumber: season.career.season,",
    '  seasonOpening: season.world.events.some((event) => event.type === "season-opening" && event.date === "2029-07-01")',
    "}));"
  ].join("\n");

  const expected = {
    leapDate: "2028-03-02",
    yearDate: "2029-01-03",
    monthlyEvent: true,
    seasonDate: "2029-07-03",
    seasonNumber: 4,
    seasonOpening: true
  };

  for (const timezone of ["UTC", "Africa/Cairo", "America/Los_Angeles", "Pacific/Kiritimati"]) {
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, TZ: timezone }
    });

    assert.equal(result.status, 0, timezone + ": " + result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), expected, "calendar result changed in " + timezone);
  }
});
