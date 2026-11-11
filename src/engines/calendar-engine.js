export const DAYS_PER_WEEK = 7;
export const DAYS_PER_SEASON = 90;
const MAX_EVENTS = 120;
const MAX_MESSAGES = 100;

function isCalendarDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function addCalendarDays(value, amount = 1) {
  if (!isCalendarDate(value) || !Number.isInteger(amount)) throw new TypeError("تاريخ التقويم أو عدد الأيام غير صالح.");
  const date = new Date(value + "T12:00:00.000Z");
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function createInitialCalendarRecords(currentDate) {
  if (!isCalendarDate(currentDate)) throw new TypeError("تاريخ بداية المسيرة غير صالح.");
  return {
    events: [{
      id: "career-start:" + currentDate, type: "milestone", title: "بداية مسيرتك",
      description: "بدأت رحلتك كوكيل لاعبي كرة قدم. كل يوم جديد يفتح فرصة لبناء اسم وكالتك.", date: currentDate
    }],
    inbox: [{
      id: "welcome:" + currentDate, type: "welcome", title: "مرحبًا بك في Football Agent",
      body: "أهلًا بك في عالم الوكالة. راجع مهامك اليومية وتابع الأحداث مع تقدم الوقت.", date: currentDate, read: false
    }],
    tasks: [{
      id: "task-review-players", title: "استكشف قاعدة اللاعبين",
      description: "راجع ملفات المواهب وتعرّف على اللاعبين المتاحين في عالمك.",
      createdAt: currentDate, dueDate: addCalendarDays(currentDate, 6), status: "active", completedAt: null
    }, {
      id: "task-agency-profile", title: "راجع ملف وكالتك",
      description: "تعرّف على رصيد الوكالة وسمعتها وبياناتها الأساسية.",
      createdAt: currentDate, dueDate: addCalendarDays(currentDate, 13), status: "active", completedAt: null
    }]
  };
}

function makeEvent(id, type, title, description, date) {
  return { id, type, title, description, date };
}
function makeMessage(id, type, title, body, date) {
  return { id, type, title, body, date, read: false };
}
function appendRecent(items, additions, limit) {
  return [...items, ...additions].slice(-limit);
}

export function advanceCareerDay(save) {
  if (!save?.career || !save?.world || !Array.isArray(save.world.events)
    || !Array.isArray(save.world.inbox) || !Array.isArray(save.world.tasks)) {
    throw new TypeError("بيانات دورة اللعب غير مكتملة.");
  }
  const currentDate = addCalendarDays(save.world.currentDate, 1);
  const totalDays = save.career.totalDays + 1;
  const day = ((totalDays - 1) % DAYS_PER_SEASON) + 1;
  const week = Math.floor((day - 1) / DAYS_PER_WEEK) + 1;
  const season = Math.floor((totalDays - 1) / DAYS_PER_SEASON) + 1;
  const events = [makeEvent("day:" + currentDate, "daily", "يوم جديد في الوكالة",
    "بدأ يوم جديد. راجع مهامك وتابع آخر مستجدات عالمك.", currentDate)];
  const messages = [];

  if (totalDays % DAYS_PER_WEEK === 0) {
    const weeklyId = "week-review:" + Math.floor(totalDays / DAYS_PER_WEEK);
    events.push(makeEvent(weeklyId, "weekly", "مراجعة نهاية الأسبوع",
      "انتهى أسبوع جديد من مسيرتك. راجع ما أنجزته واستعد للأسبوع القادم.", currentDate));
    messages.push(makeMessage("message:" + weeklyId, "weekly", "ملخص الأسبوع",
      "وصلت إلى نهاية أسبوع جديد في مسيرتك. راجع المهام المفتوحة وحدد أولوياتك.", currentDate));
  }
  if (season > save.career.season) {
    const seasonId = "season-start:" + season;
    events.push(makeEvent(seasonId, "season", "انطلاق موسم جديد",
      "بدأ الموسم " + season + ". تبدأ دورة جديدة من التخطيط وبناء مستقبل الوكالة.", currentDate));
    messages.push(makeMessage("message:" + seasonId, "season", "عام جديد في مسيرتك",
      "انطلق الموسم " + season + ". راجع أهداف وكالتك واستعد للتحديات الجديدة.", currentDate));
  }

  const overdueTasks = [];
  const tasks = save.world.tasks.map((task) => {
    if (task.status === "active" && task.dueDate < currentDate) {
      const updated = { ...task, status: "overdue" };
      overdueTasks.push(updated);
      return updated;
    }
    return task;
  });
  for (const task of overdueTasks) {
    const overdueId = "task-overdue:" + task.id;
    events.push(makeEvent(overdueId, "task-overdue", "مهمة متأخرة: " + task.title,
      "انتهى الموعد المحدد للمهمة. يمكنك إنجازها لاحقًا، لكن تأخيرها مسجل في سجل الوكالة.", currentDate));
    messages.push(makeMessage("message:" + overdueId, "task-overdue", "تذكير بمهمة متأخرة",
      "تأخرت مهمة «" + task.title + "». افتح قائمة المهام لإنجازها.", currentDate));
  }

  return {
    ...save,
    career: { ...save.career, day, week, season, totalDays },
    world: {
      ...save.world, currentDate,
      events: appendRecent(save.world.events, events, MAX_EVENTS),
      inbox: appendRecent(save.world.inbox, messages, MAX_MESSAGES),
      tasks
    }
  };
}

export function completeCareerTask(save, taskId, completedOn = save?.world?.currentDate) {
  if (!save?.world || !Array.isArray(save.world.tasks) || typeof taskId !== "string") return null;
  const task = save.world.tasks.find((item) => item.id === taskId);
  if (!task || task.status === "completed") return null;
  if (!isCalendarDate(completedOn)) throw new TypeError("تاريخ إنجاز المهمة غير صالح.");
  return {
    ...save,
    world: {
      ...save.world,
      tasks: save.world.tasks.map((item) => item.id === taskId
        ? { ...item, status: "completed", completedAt: completedOn } : item),
      events: appendRecent(save.world.events, [makeEvent("task-completed:" + taskId, "task-completed",
        "تم إنجاز مهمة", "أنجزت المهمة: " + task.title, completedOn)], MAX_EVENTS)
    }
  };
}

export function markInboxMessageRead(save, messageId) {
  if (!save?.world || !Array.isArray(save.world.inbox) || typeof messageId !== "string") return save;
  const message = save.world.inbox.find((item) => item.id === messageId);
  if (!message || message.read) return save;
  return {
    ...save,
    world: {
      ...save.world,
      inbox: save.world.inbox.map((item) => item.id === messageId ? { ...item, read: true } : item)
    }
  };
}

export function getUnreadMessageCount(save) {
  return Array.isArray(save?.world?.inbox) ? save.world.inbox.filter((message) => !message.read).length : 0;
}
