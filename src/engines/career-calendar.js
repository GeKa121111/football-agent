const MAX_EVENTS = 90;
const MAX_MESSAGES = 90;
const MAX_TASKS = 60;

function parseCalendarDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new TypeError("تاريخ المسيرة غير صالح.");
  }
  const date = new Date(value + "T00:00:00.000Z");
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new TypeError("تاريخ المسيرة غير صالح.");
  }
  return date;
}

function toDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, amount) {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + amount);
  return result;
}

function scheduledItems(date, season) {
  const dateKey = toDateKey(date);
  const dayOfMonth = date.getUTCDate();
  const weekday = date.getUTCDay();
  const month = date.getUTCMonth();
  const events = [];
  const tasks = [];

  if (dayOfMonth === 1) {
    events.push({
      id: "event-" + dateKey + "-monthly-market",
      date: dateKey,
      type: "monthly-market",
      title: "تقرير السوق الشهري",
      description: "بدأ شهر جديد. راجع حركة السوق واحتياجات الأندية قبل اتخاذ قرارات الوكالة.",
      priority: "normal"
    });
  }

  if (month === 6 && dayOfMonth === 1) {
    events.push({
      id: "event-" + dateKey + "-season-opening",
      date: dateKey,
      type: "season-opening",
      title: "انطلاق موسم جديد",
      description: "بدأ الموسم " + season + ". حدّث أولويات الوكالة وحدد أهدافك للفترة القادمة.",
      priority: "high"
    });
    tasks.push({
      id: "task-" + dateKey + "-season-plan",
      title: "إعداد خطة الموسم",
      description: "حدد أولويات الوكالة وراجع أهدافك للموسم الجديد.",
      createdDate: dateKey,
      dueDate: toDateKey(addDays(date, 13)),
      category: "season-planning",
      status: "open"
    });
  }

  if (weekday === 1) {
    events.push({
      id: "event-" + dateKey + "-weekly-briefing",
      date: dateKey,
      type: "weekly-briefing",
      title: "الإحاطة الأسبوعية للوكالة",
      description: "أسبوع جديد بدأ. راجع ملفات المواهب والفرص المفتوحة وحدد أولويات العمل.",
      priority: "normal"
    });
    tasks.push({
      id: "task-" + dateKey + "-weekly-review",
      title: "مراجعة أسبوع الوكالة",
      description: "راجع قائمة المتابعة والفرص المفتوحة وحدد أهم ثلاث أولويات.",
      createdDate: dateKey,
      dueDate: toDateKey(addDays(date, 6)),
      category: "weekly-review",
      status: "open"
    });
  }

  const messages = events.map((event) => ({
    id: "message-" + dateKey + "-" + event.type,
    eventId: event.id,
    date: dateKey,
    title: event.title,
    body: event.description,
    read: false
  }));

  return { events, messages, tasks };
}

/**
 * Advances one in-game day and deterministically schedules calendar activity.
 * The input save is never mutated; callers decide when to persist the result.
 */
export function advanceCareerDay(save) {
  if (!save?.career || !save?.world) {
    throw new TypeError("ملف المسيرة غير مكتمل.");
  }

  const currentDate = parseCalendarDate(save.world.currentDate);
  const nextDate = addDays(currentDate, 1);
  const dateKey = toDateKey(nextDate);
  const day = save.career.day + 1;
  const seasonStarted = nextDate.getUTCMonth() === 6 && nextDate.getUTCDate() === 1;
  const season = save.career.season + (seasonStarted ? 1 : 0);
  const scheduled = scheduledItems(nextDate, season);

  const overdueTasks = [];
  const currentTasks = (save.world.tasks ?? []).map((task) => {
    if (task.status === "open" && task.dueDate < dateKey) {
      const overdueTask = { ...task, status: "overdue", overdueDate: dateKey };
      overdueTasks.push(overdueTask);
      return overdueTask;
    }
    return task;
  });
  const overdueEvents = overdueTasks.map((task) => ({
    id: "event-" + dateKey + "-task-overdue-" + task.id,
    date: dateKey,
    type: "task-overdue",
    title: "مهمة متأخرة: " + task.title,
    description: "انتهى موعد المهمة في " + task.dueDate + ". أنجزها الآن لتحديث سجل الوكالة.",
    priority: "high"
  }));
  const overdueMessages = overdueEvents.map((event) => ({
    id: "message-" + event.id,
    eventId: event.id,
    date: dateKey,
    title: event.title,
    body: event.description,
    read: false
  }));

  const events = [...(save.world.events ?? []), ...scheduled.events, ...overdueEvents].slice(-MAX_EVENTS);
  const retainedEventIds = new Set(events.map((event) => event.id));
  const inbox = [...(save.world.inbox ?? []), ...scheduled.messages, ...overdueMessages]
    .filter((message) => retainedEventIds.has(message.eventId))
    .slice(-MAX_MESSAGES);
  const tasks = [...currentTasks, ...scheduled.tasks].slice(-MAX_TASKS);

  return {
    ...save,
    career: {
      ...save.career,
      day,
      week: Math.ceil(day / 7),
      season
    },
    world: {
      ...save.world,
      currentDate: dateKey,
      events,
      inbox,
      tasks
    }
  };
}

export function completeCareerTask(save, taskId) {
  if (!save?.world || typeof taskId !== "string") {
    return { save, changed: false };
  }
  const task = (save.world.tasks ?? []).find((item) => item.id === taskId);
  if (!task || !["open", "overdue"].includes(task.status)) {
    return { save, changed: false };
  }

  const completedLate = task.status === "overdue";
  const completionEvent = {
    id: "event-" + save.world.currentDate + "-task-completed-" + taskId,
    date: save.world.currentDate,
    type: "task-completed",
    title: "تم إنجاز مهمة: " + task.title,
    description: completedLate
      ? "اكتملت المهمة بعد موعدها المحدد. تم تسجيل الإنجاز المتأخر في سجل الوكالة."
      : "اكتملت المهمة في موعدها وتم تحديث سجل الوكالة.",
    priority: "normal"
  };
  const events = [...(save.world.events ?? []), completionEvent].slice(-MAX_EVENTS);
  const retainedEventIds = new Set(events.map((event) => event.id));
  const inbox = (save.world.inbox ?? [])
    .filter((message) => retainedEventIds.has(message.eventId))
    .slice(-MAX_MESSAGES);
  return {
    changed: true,
    save: {
      ...save,
      world: {
        ...save.world,
        events,
        inbox,
        tasks: save.world.tasks.map((item) => item.id === taskId
          ? { ...item, status: "completed", completedDate: save.world.currentDate, completedLate }
          : item)
      }
    }
  };
}

export function markCareerMessageRead(save, messageId) {
  if (!save?.world || typeof messageId !== "string") {
    return { save, changed: false };
  }
  const message = (save.world.inbox ?? []).find((item) => item.id === messageId);
  if (!message || message.read) {
    return { save, changed: false };
  }

  return {
    changed: true,
    save: {
      ...save,
      world: {
        ...save.world,
        inbox: save.world.inbox.map((item) => item.id === messageId
          ? { ...item, read: true }
          : item)
      }
    }
  };
}


/**
 * Filters the retained event history without changing the persisted collection.
 * Results are returned newest-first so the same query is stable in every view.
 */
export function filterCareerEvents(events, { type = "all", query = "" } = {}) {
  if (!Array.isArray(events)) return [];
  const normalizedQuery = String(query).trim().toLocaleLowerCase("ar");
  return [...events]
    .filter((event) => type === "all" || event.type === type)
    .filter((event) => {
      if (!normalizedQuery) return true;
      const haystack = [event.title, event.description, event.type, event.date]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("ar");
      return haystack.includes(normalizedQuery);
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}
