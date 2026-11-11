import {
  createInitialSave,
  readSave,
  writeSave,
  readWatchlist,
  writeWatchlist
} from "./core/storage.js";
import { WORLD_DATABASE, getWorldPlayerProfiles, getWorldSummary } from "./data/world-database.js";
import {
  getUpcomingFootballFixtures,
  getRecentFootballResults,
  getCompetitionStandings
} from "./engines/football-season.js";
import {
  TRAINING_FOCUSES,
  setPlayerTrainingPlan as setPlayerTrainingPlanInEngine,
  getPlayerDevelopmentRecord
} from "./engines/player-development.js";
import {
  SCOUTING_MISSION_TYPES,
  SCOUTING_SOURCES,
  advanceScoutingMissions,
  getPlayerScoutingHistory,
  getScoutingCandidates,
  getScoutingSourceLabel,
  getScoutingDaysRemaining,
  getScoutingRoster,
  getScoutingRecruitmentOptions,
  getScoutingScoutFit,
  signScoutingContract as signScoutingContractInEngine,
  renewScoutingContract as renewScoutingContractInEngine,
  startScoutingMission
} from "./engines/scouting.js";
import { createPlayerPortrait } from "./ui/player-portrait.js";
import {
  getTalentProspect,
  upsertTalentProspect,
  recordTalentProspectContact,
  completeTalentProspectFollowUp,
  assignTalentProspectStaff,
  handoffTalentProspectToClientManagement,
  MAX_PROSPECTS_PER_SCOUT
} from "./engines/talent-pipeline.js";
import {
  createRepresentationOffer as createRepresentationOfferInEngine,
  evaluateRepresentationOffer as evaluateRepresentationOfferInEngine,
  acceptRepresentationCounterOffer as acceptRepresentationCounterOfferInEngine,
  submitRepresentationCounterOffer as submitRepresentationCounterOfferInEngine,
  createRepresentationRenewalOffer as createRepresentationRenewalOfferInEngine,
  rejectRepresentationOffer as rejectRepresentationOfferInEngine,
  terminateRepresentationContract as terminateRepresentationContractInEngine,
  getPlayerRepresentationProfile,
  getRepresentationContractExpiry,
  getRepresentationContractCommission,
  getRepresentationContractType,
  getRepresentationRelationshipLabel,
  getAgencyReputationScore,
  createRepresentationInteraction as createRepresentationInteractionInEngine,
  completeRepresentationMeeting as completeRepresentationMeetingInEngine,
  advanceRepresentationState
} from "./engines/representation.js";

import {
  createTransferOffer as createTransferOfferInEngine,
  evaluateTransferOffer as evaluateTransferOfferInEngine,
  submitTransferCounterOffer as submitTransferCounterOfferInEngine,
  acceptTransferCounterOffer as acceptTransferCounterOfferInEngine,
  rejectTransferOffer as rejectTransferOfferInEngine,
  completeTransfer as completeTransferInEngine,
  advanceTransferState,
  getTransferWindow,
  getPlayerCurrentClubId
} from "./engines/transfers.js";
import {
  advanceCareerDay,
  advanceCareerDays,
  completeCareerTask as completeTaskInEngine,
  markCareerMessageRead,
  filterCareerEvents,
  getCareerEventTypeLabel,
  getCareerEventPriorityLabel,
  getUpcomingCareerEvents,
  filterCareerTasks,
  filterCareerMessages
} from "./engines/career-calendar.js";

const WORLD_PLAYERS = getWorldPlayerProfiles();
const WORLD_COUNTS = getWorldSummary();

import { NAV_ITEMS } from "./ui/layout/navigation.js";
import { createAppShell } from "./ui/layout/app-shell.js";

let modalSequence = 0;

function node(tag, className = "", text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined && text !== null) element.textContent = String(text);
  return element;
}

function actionButton(label, className, callback, title = "") {
  const button = node("button", className, label);
  button.type = "button";
  if (title) button.title = title;
  button.addEventListener("click", callback);
  return button;
}

function formatMoney(amount) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 0
  }).format(Number(amount) || 0);
}

function formatEuroMoney(amount) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0
  }).format(Number(amount) || 0);
}

function playerArt(player, featured = false) {
  return createPlayerPortrait(player, { featured });
}

function clubCrest(player) {
  const clubId = typeof player.clubId === "string" ? player.clubId : "unknown-club";
  const clubColor = /^#[0-9a-f]{6}$/i.test(player.clubColor) ? player.clubColor : "#344d78";
  const accentColor = /^#[0-9a-f]{6}$/i.test(player.kitLight) ? player.kitLight : "#f2f0e9";
  const crest = node("span", "club-crest");
  crest.dataset.clubId = clubId;
  crest.dataset.clubColor = clubColor;
  crest.title = "رمز ألوان " + (player.club || "النادي") + " — تصميم داخل اللعبة وليس الشعار الرسمي";
  crest.setAttribute("role", "img");
  crest.setAttribute("aria-label", crest.title);
  crest.style.setProperty("--club-color", clubColor);
  crest.style.setProperty("--club-accent", accentColor);

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "club-crest-svg");
  svg.setAttribute("viewBox", "0 0 32 36");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");

  const add = (tag, attributes) => {
    const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, String(value)));
    svg.append(element);
    return element;
  };
  add("path", {
    d: "M4 3 H28 V18 C28 25 22 31 16 34 C10 31 4 25 4 18 Z",
    fill: clubColor,
    stroke: accentColor,
    "stroke-width": 1.4,
    "stroke-linejoin": "round"
  });
  add("path", {
    d: "M7 7 H25 V14 H7 Z",
    fill: accentColor,
    opacity: 0.92
  });
  add("path", {
    d: "M9 18 L16 26 L23 18",
    fill: "none",
    stroke: accentColor,
    "stroke-width": 2.1,
    "stroke-linecap": "round",
    "stroke-linejoin": "round"
  });
  add("circle", {
    cx: 16, cy: 11, r: 2.1, fill: clubColor, stroke: clubColor, "stroke-width": 0.5
  });
  crest.append(svg);
  return crest;
}

function playerCard(player, onDetails) {
  const card = node("article", "player-card");
  card.dataset.playerId = player.id;
  const visual = node("div", "player-card-visual");
  visual.append(playerArt(player));

  const rating = node("div", "player-rating");
  rating.append(
    node("strong", "", player.rating),
    node("span", "", "OVR")
  );
  const position = node("span", "player-position-tag", player.position);
  const countryBadge = node("span", "player-nationality-tag", player.country);
  visual.append(rating, position, countryBadge);

  const info = node("div", "player-card-info");
  info.append(
    node("p", "player-country", player.age + " سنة · " + (player.foot === "left" ? "قدم يسرى" : "قدم يمنى")),
    node("h3", "player-name", player.name)
  );
  const clubLine = node("div", "player-club-line");
  clubLine.append(
    clubCrest(player),
    node("p", "player-club", player.club + " · " + player.league)
  );
  info.append(clubLine);

  const potential = node("div", "player-potential-row");
  potential.append(
    node("span", "", "الإمكانيات"),
    node("strong", "", String(player.potential) + " POT")
  );
  const potentialTrack = node("div", "player-potential-track");
  const potentialFill = node("span", "player-potential-fill");
  potentialFill.style.width = Math.max(0, Math.min(100, Number(player.potential) || 0)) + "%";
  potentialTrack.append(potentialFill);
  info.append(potential, potentialTrack);

  const stats = node("div", "player-card-stats");
  stats.append(
    statMini("القيمة السوقية", player.value),
    statMini("العمر", player.age),
    statMini("التقييم", player.rating)
  );
  info.append(stats);

  const footer = node("div", "player-card-footer");
  footer.append(
    node("span", "scout-status", player.status),
    actionButton("ملف اللاعب", "text-button", () => onDetails(player))
  );
  card.append(visual, info, footer);
  return card;
}

function statMini(label, value) {
  const wrapper = node("div", "mini-stat");
  wrapper.append(node("span", "", label), node("strong", "", value));
  return wrapper;
}

function sectionHeading(title, subtitle, actionLabel, callback) {
  const heading = node("div", "section-heading");
  const copy = node("div", "");
  copy.append(node("h2", "", title), node("p", "", subtitle));
  heading.append(copy);
  if (actionLabel && callback) {
    heading.append(actionButton(actionLabel, "text-button", callback));
  }
  return heading;
}

function metricCard(label, value, footnote, icon, tone = "purple") {
  const card = node("article", "metric-card metric-" + tone);
  const top = node("div", "metric-top");
  top.append(node("span", "metric-icon", icon), node("span", "metric-label", label));
  card.append(top, node("strong", "metric-value", value), node("span", "metric-footnote", footnote));
  return card;
}

function formatHomeDate(value) {
  const date = new Date(value + "T12:00:00");
  return new Intl.DateTimeFormat("ar-EG", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(date);
}

function shiftCalendarDate(value, days) {
  const date = new Date(value + "T12:00:00.000Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}


function formatSeasonLabel(value) {
  const date = new Date(value + "T12:00:00Z");
  if (!Number.isFinite(date.getTime())) return "2026 / 2027";
  const startYear = date.getUTCMonth() >= 6
    ? date.getUTCFullYear()
    : date.getUTCFullYear() - 1;
  return startYear + " / " + (startYear + 1);
}

function formatHomeNumber(value) {
  return new Intl.NumberFormat("ar-EG").format(Number(value) || 0);
}

function homeTile(context, icon, title, subtitle, tone, destination) {
  const tile = actionButton("", "home-tile tile-" + tone, () => {
    if (destination) {
      context.navigate(destination);
      return;
    }
    context.openModal(title, [
      node("p", "modal-copy", "قسم " + title + " جزء من عالم الوكالة، وسيُضاف ضمن مراحل التطوير القادمة."),
      node("p", "modal-note", "الأقسام المتاحة حاليًا: اللاعبون، الكشافون، سوق الانتقالات، والوكالة.")
    ], "تمام");
  }, title);
  tile.append(
    node("span", "home-tile-icon", icon),
    node("strong", "home-tile-title", title),
    node("span", "home-tile-subtitle", subtitle)
  );
  return tile;
}


function renderCareerOperations(context) {
  const section = node("section", "career-operations");
  const tasksPanel = node("section", "career-operations-panel");
  const openTasks = context.save.world.tasks
    .filter((task) => task.status === "open" || task.status === "overdue")
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "overdue" ? -1 : 1;
      return a.dueDate.localeCompare(b.dueDate);
    });
  const overdueCount = openTasks.filter((task) => task.status === "overdue").length;
  const tasksHeading = node("div", "career-operations-heading");
  tasksHeading.append(
    node("h2", "", "مهام الوكالة"),
    node("span", "career-count", formatHomeNumber(openTasks.length - overdueCount) + " معلقة · " + formatHomeNumber(overdueCount) + " متأخرة"),
    actionButton("سجل المهام", "career-history-button", context.openTaskHistory)
  );
  tasksPanel.append(tasksHeading);

  if (openTasks.length === 0) {
    tasksPanel.append(node("p", "career-activity-empty", "مفيش مهام معلقة حاليًا. هتظهر مهام جديدة مع بداية الأسابيع والمواسم."));
  } else {
    const taskList = node("div", "career-task-list");
    openTasks.slice(0, 4).forEach((task) => {
      const row = node("article", task.status === "overdue" ? "career-task-row is-overdue" : "career-task-row");
      const copy = node("div", "career-activity-copy");
      copy.append(
        node("strong", "", task.title),
        node("span", "", task.description),
        node("small", "", task.status === "overdue" ? "متأخرة منذ: " + formatHomeDate(task.overdueDate) : "موعد التسليم: " + formatHomeDate(task.dueDate))
      );
      row.append(copy, actionButton("إنجاز", "task-complete-button", () => context.completeTask(task.id)));
      taskList.append(row);
    });
    tasksPanel.append(taskList);
  }

  const inboxPanel = node("section", "career-operations-panel");
  const messages = [...context.save.world.inbox].slice(-4).reverse();
  const unread = context.save.world.inbox.filter((message) => !message.read).length;
  const inboxHeading = node("div", "career-operations-heading");
  inboxHeading.append(
    node("h2", "", "صندوق الوارد"),
    node("span", "career-count", formatHomeNumber(unread) + " غير مقروءة"),
    actionButton("عرض كل الرسائل", "inbox-archive-button", context.openInbox)
  );
  inboxPanel.append(inboxHeading);

  if (messages.length === 0) {
    inboxPanel.append(node("p", "career-activity-empty", "لسه مفيش رسائل. الإحاطات والتقارير هتوصلك مع تقدم التقويم."));
  } else {
    const messageList = node("div", "career-message-list");
    messages.forEach((message) => {
      const row = node("article", message.read ? "career-message-row is-read" : "career-message-row is-unread");
      const copy = node("div", "career-activity-copy");
      copy.append(
        node("strong", "", message.title),
        node("span", "", message.body),
        node("small", "", formatHomeDate(message.date))
      );
      row.append(copy);
      if (!message.read) {
        row.append(actionButton("مقروءة", "message-read-button", () => context.markMessageRead(message.id)));
      } else {
        row.append(node("span", "message-read-state", "تمت القراءة"));
      }
      messageList.append(row);
    });
    inboxPanel.append(messageList);
  }

  const historyPanel = node("section", "career-operations-panel career-history-panel");
  const historyHeading = node("div", "career-operations-heading");
  historyHeading.append(
    node("h2", "", "سجل الأحداث"),
    actionButton("عرض السجل الكامل", "career-history-button", context.openEventHistory)
  );
  historyPanel.append(historyHeading);
  const recentEvents = [...context.save.world.events].slice(-5).reverse();
  if (recentEvents.length === 0) {
    historyPanel.append(node("p", "career-activity-empty", "لسه مفيش أحداث مسجلة. هتظهر هنا الإحاطات والتقارير وتغييرات المسيرة."));
  } else {
    const eventList = node("div", "career-event-list");
    recentEvents.forEach((event) => {
      const row = node("article", "career-event-row");
      const copy = node("div", "career-activity-copy");
      copy.append(
        node("strong", "", event.title),
        node("span", "", event.description),
        node("small", "", formatHomeDate(event.date))
      );
      row.append(copy);
      eventList.append(row);
    });
    historyPanel.append(eventList);
  }

  const calendarPanel = node("section", "career-operations-panel career-calendar-panel");
  const calendarHeading = node("div", "career-operations-heading");
  const upcoming = context.upcomingEvents ?? [];
  calendarHeading.append(
    node("h2", "", "تقويم الموسم القادم"),
    actionButton("عرض تقويم السنة القادمة", "career-history-button", context.openSeasonCalendar)
  );
  calendarPanel.append(calendarHeading);
  if (upcoming.length === 0) {
    calendarPanel.append(node("p", "career-activity-empty", "لا توجد مواعيد مجدولة ضمن الفترة القادمة."));
  } else {
    const calendarList = node("div", "career-calendar-list");
    upcoming.slice(0, 4).forEach((event) => {
      const row = node("article", "career-calendar-row");
      const copy = node("div", "career-activity-copy");
      copy.append(
        node("strong", "", event.title),
        node("span", "", event.description),
        node("small", "", formatHomeDate(event.date) + " · بعد " + formatHomeNumber(event.daysUntil) + " يوم")
      );
      row.append(copy);
      calendarList.append(row);
    });
    calendarPanel.append(calendarList);
  }

  section.append(tasksPanel, inboxPanel, calendarPanel, historyPanel);
  return section;
}

function renderDashboard(context) {
  const page = node("div", "page-content home-dashboard rebuild-dashboard");
  const agency = context.save.agency;
  const career = context.save.career;
  const clients = agency.clients.length;
  const reputation = Math.max(0, Math.min(100, Number(agency.reputation) || 0));
  const balance = formatMoney(agency.balance);
  const unreadMessages = context.save.world.inbox.filter((message) => !message.read).length;

  const intro = node("section", "dashboard-intro");
  const introCopy = node("div", "dashboard-intro-copy");
  introCopy.append(
    node("span", "dashboard-eyebrow", "FOOTBALL AGENT · CAREER MODE"),
    node("h1", "dashboard-heading", "إدارة وكالتك تبدأ من هنا"),
    node("p", "dashboard-subtitle", "تابع عملاءك، اكتشف فرصًا جديدة، واتخذ قراراتك اليومية من مركز واحد.")
  );
  const introActions = node("div", "dashboard-intro-actions");
  introActions.append(
    actionButton("ابدأ يوم جديد", "day-advance-button", context.advanceDay),
    actionButton("تقدم أسبوعًا", "week-advance-button", context.advanceWeek)
  );
  intro.append(introCopy, introActions);

  const overview = node("section", "dashboard-overview");
  const agencyCard = node("article", "dashboard-agency-card");
  const agencyTop = node("div", "dashboard-agency-top");
  const monogram = node("span", "dashboard-agency-monogram", "FA");
  const identity = node("div", "dashboard-agency-identity");
  identity.append(
    node("small", "", "ملف الوكالة · المستوى 1"),
    node("strong", "agent-name", agency.name)
  );
  agencyTop.append(monogram, identity, node("span", "dashboard-agency-status", "وكالتك نشطة"));

  const agencyStats = node("div", "dashboard-agency-stats");
  [
    ["الرصيد المتاح", balance],
    ["العملاء", formatHomeNumber(clients)],
    ["الرسائل الجديدة", formatHomeNumber(unreadMessages)]
  ].forEach(([label, value]) => {
    const stat = node("div", "dashboard-stat");
    stat.append(node("span", "", label), node("strong", "", value));
    agencyStats.append(stat);
  });
  const reputationHead = node("div", "dashboard-reputation");
  reputationHead.append(node("span", "", "سمعة الوكالة"), node("strong", "", formatHomeNumber(reputation) + " / 100"));
  const reputationTrack = node("div", "dashboard-reputation-track");
  const reputationFill = node("span", "dashboard-reputation-fill");
  reputationFill.style.width = reputation + "%";
  reputationTrack.append(reputationFill);
  agencyCard.append(agencyTop, agencyStats, reputationHead, reputationTrack);

  const dayCard = node("article", "dashboard-day-card");
  const dayHead = node("div", "dashboard-day-head");
  dayHead.append(
    node("span", "", formatHomeDate(context.save.world.currentDate)),
    node("strong", "", "الموسم " + formatHomeNumber(career.season))
  );
  const dayMetrics = node("div", "dashboard-day-metrics");
  [
    ["اليوم", formatHomeNumber(career.day)],
    ["الأسبوع", formatHomeNumber(career.week)],
    ["الوارد", formatHomeNumber(unreadMessages)]
  ].forEach(([label, value]) => {
    const metric = node("div", "dashboard-day-metric");
    metric.append(node("small", "", label), node("strong", "", value));
    dayMetrics.append(metric);
  });
  dayCard.append(
    dayHead,
    dayMetrics,
    node("p", "dashboard-day-note", "تقدم الزمن يعالج الأحداث والمواعيد والمهام بالتتابع، ويحفظ التغييرات في مسيرتك.")
  );
  overview.append(agencyCard, dayCard);

  const quickSection = node("section", "dashboard-section");
  const quickHeading = node("div", "dashboard-section-head");
  quickHeading.append(
    node("div", ""),
    node("span", "", "")
  );
  quickHeading.children[0].append(
    node("h2", "", "اختصارات العمل"),
    node("p", "", "انتقل مباشرة إلى الأنظمة المتاحة حاليًا.")
  );
  const quickActions = node("div", "dashboard-quick-actions");
  [
    ["◉", "قاعدة اللاعبين", "استعرض ملفات المواهب", "players"],
    ["⌕", "عمليات الكشافين", "ابدأ بعثة أو راجع تقريرًا", "scouting"],
    ["▦", "إدارة العملاء", "العقود والعلاقات الحالية", "agency"]
  ].forEach(([icon, title, description, destination]) => {
    const button = actionButton("", "dashboard-quick-action", () => context.navigate(destination));
    const copy = node("span", "dashboard-quick-copy");
    copy.append(node("strong", "", title), node("small", "", description));
    button.append(node("span", "dashboard-quick-icon", icon), copy);
    quickActions.append(button);
  });
  quickSection.append(quickHeading, quickActions);

  const prospectSection = node("section", "dashboard-section");
  const prospectHeading = node("div", "dashboard-section-head");
  const prospectHeadingCopy = node("div", "");
  prospectHeadingCopy.append(
    node("h2", "", "مواهب من عالم اللعبة"),
    node("p", "", "عينة من قاعدة اللاعبين الخيالية — افتح الملف لمعرفة التفاصيل.")
  );
  prospectHeading.append(
    prospectHeadingCopy,
    actionButton("عرض قاعدة اللاعبين", "text-button", () => context.navigate("players"))
  );
  const prospects = node("div", "dashboard-prospects");
  const featuredPlayers = [...context.players]
    .sort((a, b) => (Number(b.potential) || 0) - (Number(a.potential) || 0))
    .slice(0, 3);
  featuredPlayers.forEach((player) => {
    const card = node("article", "dashboard-prospect");
    const art = node("div", "dashboard-prospect-art");
    art.append(playerArt(player));
    const copy = node("div", "dashboard-prospect-copy");
    copy.append(
      node("small", "", player.position + " · " + player.age + " سنة"),
      node("strong", "", player.name),
      node("span", "", "الإمكانيات " + player.potential + " · التقييم " + player.rating),
      actionButton("فتح الملف", "", () => context.openPlayer(player))
    );
    card.append(art, copy);
    prospects.append(card);
  });
  prospectSection.append(prospectHeading, prospects);

  page.append(
    intro,
    overview,
    quickSection,
    prospectSection,
    renderCareerOperations(context)
  );
  return page;
}

function activityRow(icon, title, detail, time, tone) {
  const row = node("div", "activity-row");
  row.append(
    node("span", "activity-icon tone-" + tone, icon),
    node("div", "activity-copy"),
    node("span", "activity-time", time)
  );
  row.children[1].append(node("strong", "", title), node("span", "", detail));
  return row;
}

function emptyResults(title, description, actionLabel, callback) {
  const empty = node("section", "empty-results");
  empty.setAttribute("role", "status");
  empty.append(
    node("span", "empty-results-icon", "⌕"),
    node("h2", "", title),
    node("p", "", description)
  );
  if (actionLabel && callback) {
    empty.append(actionButton(actionLabel, "button-outline empty-results-action", callback));
  }
  return empty;
}

function renderPlayers(context) {
  const page = node("div", "page-content rebuild-screen players-screen");
  page.append(
    node("p", "eyebrow rebuild-page-kicker", "إدارة المواهب"),
    node("h1", "page-title rebuild-page-title", "قاعدة اللاعبين"),
    node("p", "page-subtitle rebuild-page-subtitle", "ابحث في قاعدة العالم، قارن مستوى اللاعب بإمكانياته، وافتح ملفه قبل اتخاذ قرار المتابعة أو التمثيل. البيانات الحالية خيالية ومخصصة للمحاكاة.")
  );

  const worldStats = node("div", "metrics-grid world-metrics");
  worldStats.append(
    metricCard("الدول", WORLD_COUNTS.countries, "دول موصولة بقاعدة العالم", "◎", "purple"),
    metricCard("الدوريات", WORLD_COUNTS.leagues, "دوريات مرجعية", "▤", "cyan"),
    metricCard("الأندية", WORLD_COUNTS.clubs, "أندية مرتبطة بالدوريات", "♜", "gold"),
    metricCard("المسابقات", WORLD_COUNTS.competitions, "محلية وقارية", "🏆", "cyan"),
    metricCard("اللاعبون", WORLD_COUNTS.players, "مواهب قابلة للاستكشاف", "⚽", "purple"),
    metricCard("قوائم الأندية", WORLD_COUNTS.rosterPlayers, "18 لاعبًا في كل نادٍ", "◈", "cyan"),
    metricCard("أصول الصور", WORLD_COUNTS.portraitAssets, "هويات المواهب الرسومية", "▧", "gold")
  );

  const toolbar = node("div", "player-library-toolbar");
  const search = node("input", "search-input");
  search.type = "search";
  search.placeholder = "ابحث بالاسم أو النادي أو المركز أو البلد...";
  search.setAttribute("aria-label", "البحث عن لاعب");

  const role = node("select", "filter-select");
  role.setAttribute("aria-label", "تصفية حسب مركز اللاعب");
  [
    ["all", "كل المراكز"],
    ["هجوم", "الهجوم"],
    ["وسط", "الوسط"],
    ["دفاع", "الدفاع"],
    ["حراسة", "حراسة المرمى"]
  ].forEach(([value, label]) => {
    const option = node("option", "", label);
    option.value = value;
    role.append(option);
  });

  const country = node("select", "filter-select");
  country.setAttribute("aria-label", "تصفية حسب الجنسية");
  const allCountries = node("option", "", "كل الجنسيات");
  allCountries.value = "all";
  country.append(allCountries);
  [...new Map(WORLD_PLAYERS.map((player) => [player.country, player.country])).keys()]
    .sort((a, b) => a.localeCompare(b, "ar"))
    .forEach((name) => {
      const option = node("option", "", name);
      option.value = name;
      country.append(option);
    });

  const league = node("select", "filter-select");
  league.setAttribute("aria-label", "تصفية حسب الدوري");
  const allLeagues = node("option", "", "كل الدوريات");
  allLeagues.value = "all";
  league.append(allLeagues);
  [...new Map(WORLD_PLAYERS.map((player) => [player.leagueId, player.league])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1], "ar"))
    .forEach(([id, name]) => {
      const option = node("option", "", name);
      option.value = id;
      league.append(option);
    });

  const sort = node("select", "filter-select");
  sort.setAttribute("aria-label", "ترتيب اللاعبين");
  [
    ["potential", "الأعلى إمكانيات"],
    ["rating", "الأعلى تقييمًا"],
    ["youngest", "الأصغر سنًا"],
    ["value", "الأعلى قيمة سوقية"]
  ].forEach(([value, label]) => {
    const option = node("option", "", label);
    option.value = value;
    sort.append(option);
  });
  const count = node("span", "result-count player-library-count", "");
  count.setAttribute("aria-live", "polite");
  toolbar.append(search, role, country, league, sort, count);

  const grid = node("div", "players-grid players-grid-large");
  const refresh = () => {
    const query = search.value.trim().toLocaleLowerCase("ar");
    const selectedRole = role.value;
    const selectedCountry = country.value;
    const selectedLeague = league.value;
    const filtered = WORLD_PLAYERS.filter((player) => {
      const matchesText = [player.name, player.club, player.position, player.country, player.league]
        .some((value) => String(value ?? "").toLocaleLowerCase("ar").includes(query));
      const matchesRole = selectedRole === "all" || player.role === selectedRole;
      const matchesCountry = selectedCountry === "all" || player.country === selectedCountry;
      const matchesLeague = selectedLeague === "all" || player.leagueId === selectedLeague;
      return matchesText && matchesRole && matchesCountry && matchesLeague;
    });

    const sorted = [...filtered].sort((a, b) => {
      if (sort.value === "rating") return b.rating - a.rating || b.potential - a.potential;
      if (sort.value === "youngest") return a.age - b.age || b.potential - a.potential;
      if (sort.value === "value") return b.marketValueEur - a.marketValueEur || b.rating - a.rating;
      return b.potential - a.potential || b.rating - a.rating;
    });
    count.textContent = formatHomeNumber(sorted.length) + " من " + formatHomeNumber(WORLD_PLAYERS.length) + " لاعب";
    if (sorted.length === 0) {
      grid.replaceChildren(emptyResults(
        "مفيش لاعبين مطابقين للبحث",
        "جرّب تغيير المركز أو الجنسية أو كلمات البحث.",
        "مسح البحث",
        () => {
          search.value = "";
          role.value = "all";
          country.value = "all";
          league.value = "all";
          sort.value = "potential";
          refresh();
          search.focus();
        }
      ));
      return;
    }
    grid.replaceChildren(...sorted.map((player) => playerCard(player, context.openPlayer)));
  };

  search.addEventListener("input", refresh);
  role.addEventListener("change", refresh);
  country.addEventListener("change", refresh);
  league.addEventListener("change", refresh);
  sort.addEventListener("change", refresh);
  refresh();
  page.append(worldStats, toolbar, grid);
  return page;
}

function renderFootball(context) {
  const page = node("div", "page-content rebuild-screen football-screen");
  page.append(
    node("p", "eyebrow rebuild-page-kicker", "محاكاة الموسم"),
    node("h1", "page-title rebuild-page-title", "المباريات وتطور اللاعبين"),
    node("p", "page-subtitle rebuild-page-subtitle", "تابع جدول المسابقات ونتائج المباريات، واضبط خطة تدريب لاعبي قاعدة العالم. التشكيلات المساعدة موضحة كبيانات محاكاة وليست ملفات لاعبين إضافية.")
  );

  const football = context.save.world.football;
  const clubById = new Map(WORLD_DATABASE.clubs.map((club) => [club.id, club]));
  const fixtures = getUpcomingFootballFixtures(football, context.save.world.currentDate, 12);
  const results = getRecentFootballResults(football, 8);
  const developmentPlayers = football.playerDevelopment.players;
  const summary = node("div", "football-summary-grid");
  [
    ["مباريات الموسم", football.fixtures.length],
    ["مباريات لُعبت", football.results.length],
    ["مواعيد قادمة", fixtures.length],
    ["لاعبون قابلون للتطوير", developmentPlayers.length]
  ].forEach(([label, value]) => {
    const card = node("article", "football-summary-card");
    card.append(node("small", "", label), node("strong", "", formatHomeNumber(value)));
    summary.append(card);
  });

  const schedulePanel = node("section", "surface-card football-panel");
  const scheduleHeading = node("div", "football-panel-heading");
  scheduleHeading.append(
    node("h2", "", "المواعيد القادمة"),
    node("span", "representation-count", formatHomeNumber(fixtures.length) + " مباراة ظاهرة")
  );
  schedulePanel.append(scheduleHeading);
  if (fixtures.length === 0) {
    schedulePanel.append(node("p", "representation-empty", "لا توجد مباريات قادمة في الجدول الحالي."));
  } else {
    const fixtureList = node("div", "football-fixture-grid");
    fixtures.forEach((fixture) => {
      const home = clubById.get(fixture.homeClubId);
      const away = clubById.get(fixture.awayClubId);
      const card = node("article", "football-fixture-card");
      const top = node("div", "football-fixture-meta");
      top.append(
        node("span", "", fixture.competitionName),
        node("small", "", "الجولة " + formatHomeNumber(fixture.round))
      );
      const teams = node("div", "football-fixture-teams");
      teams.append(
        node("strong", "", home?.shortName ?? fixture.homeClubId),
        node("span", "", "VS"),
        node("strong", "", away?.shortName ?? fixture.awayClubId)
      );
      card.append(
        top,
        teams,
        node("small", "football-fixture-date", formatHomeDate(fixture.date) + " · مباراة مجدولة")
      );
      fixtureList.append(card);
    });
    schedulePanel.append(fixtureList);
  }

  const standingsPanel = node("section", "surface-card football-panel");
  const standingsHeading = node("div", "football-panel-heading");
  const standingsTitle = node("h2", "", "جدول الترتيب");
  const competitionSelect = node("select", "filter-select");
  competitionSelect.setAttribute("aria-label", "اختيار المسابقة للترتيب");
  [...WORLD_DATABASE.competitions]
    .sort((a, b) => a.nameAr.localeCompare(b.nameAr, "ar"))
    .forEach((competition) => {
      const option = node("option", "", competition.nameAr);
      option.value = competition.id;
      competitionSelect.append(option);
    });
  standingsHeading.append(standingsTitle, competitionSelect);
  standingsPanel.append(standingsHeading);
  const standingsTable = node("div", "football-standings-table");
  const renderStandings = () => {
    const standings = getCompetitionStandings(football, competitionSelect.value);
    const header = node("div", "football-standings-row is-header");
    ["#", "النادي", "لعب", "ف", "ت", "خ", "له", "عليه", "النقاط"].forEach((label) => {
      header.append(node("span", "", label));
    });
    const rows = standings.map((club) => {
      const row = node("div", "football-standings-row");
      [
        club.position,
        club.clubName,
        club.played,
        club.wins,
        club.draws,
        club.losses,
        club.goalsFor,
        club.goalsAgainst,
        club.points
      ].forEach((value, index) => {
        row.append(node("span", index === 1 ? "football-standings-club" : "",
          index === 1 ? String(value) : formatHomeNumber(value)));
      });
      return row;
    });
    standingsTable.replaceChildren(header, ...rows);
    if (standings.every((club) => club.played === 0)) {
      standingsTable.append(node("p", "representation-empty", "الترتيب هيتحدث تلقائيًا بعد لعب أول مباراة في المسابقة."));
    }
  };
  competitionSelect.addEventListener("change", renderStandings);
  renderStandings();
  standingsPanel.append(standingsTable);

  const resultsPanel = node("section", "surface-card football-panel");
  const resultsHeading = node("div", "football-panel-heading");
  resultsHeading.append(
    node("h2", "", "نتائج المباريات"),
    node("span", "representation-count", formatHomeNumber(results.length) + " نتيجة حديثة")
  );
  resultsPanel.append(resultsHeading);
  if (results.length === 0) {
    resultsPanel.append(node("p", "representation-empty", "نتائج أولى المباريات هتظهر هنا بمجرد تقدم تاريخ المسيرة إلى مواعيدها."));
  } else {
    const resultList = node("div", "football-result-list");
    results.forEach((result) => {
      const row = node("article", "football-result-row");
      const meta = node("small", "", result.competitionName + " · " + formatHomeDate(result.date));
      const score = node("strong", "football-result-score",
        result.home.name + "  " + result.home.goals + " - " + result.away.goals + "  " + result.away.name);
      const actions = node("div", "football-result-actions");
      actions.append(
        node("span", "football-result-badge", result.result === "draw" ? "تعادل" : "انتهت"),
        actionButton("تفاصيل المباراة", "button-outline football-match-details-button", () => {
          const report = node("div", "football-match-report");
          const headline = node("h3", "football-match-report-score",
            result.home.name + " " + result.home.goals + " - " + result.away.goals + " " + result.away.name);
          report.append(
            headline,
            node("p", "modal-note", result.competitionName + " · " + formatHomeDate(result.date) +
              " · " + result.durationMinutes + " دقيقة"),
            node("p", "modal-copy", "الاستحواذ " + result.home.possession + "% مقابل " + result.away.possession +
              "% · التسديدات " + result.home.shots + " مقابل " + result.away.shots +
              " · على المرمى " + result.home.shotsOnTarget + " مقابل " + result.away.shotsOnTarget)
          );
          const eventList = node("div", "football-match-events");
          result.events.forEach((event) => {
            const eventLabels = {
              goal: "هدف",
              "yellow-card": "بطاقة صفراء",
              injury: "إصابة"
            };
            const item = node("div", "football-match-event");
            item.append(
              node("strong", "", formatHomeNumber(event.minute) + "′ · " + (eventLabels[event.type] ?? "حدث")),
              node("span", "", event.playerName + (event.assistPlayerName ? " · صناعة " + event.assistPlayerName : "") +
                (event.daysOut ? " · غياب " + event.daysOut + " أيام" : ""))
            );
            eventList.append(item);
          });
          report.append(node("h4", "", "أحداث المباراة"), eventList);
          const topPlayers = [...result.playerPerformances]
            .sort((a, b) => b.rating - a.rating || b.goals - a.goals)
            .slice(0, 5);
          const performers = node("div", "football-performers-list");
          topPlayers.forEach((player) => {
            const item = node("div", "football-performer-row");
            item.append(
              node("span", "", player.playerName + (player.simulationOnly ? " · لاعب محاكاة" : "")),
              node("strong", "", formatHomeNumber(player.rating) + " / 10")
            );
            performers.append(item);
          });
          report.append(node("h4", "", "أفضل تقييمات اللاعبين"), performers,
            node("p", "player-profile-disclaimer", "التشكيلة تستخدم لاعبي قاعدة العالم المتاحين، مع لاعبين مجهولين مولّدين للمحاكاة لإكمال 11 لاعبًا. هؤلاء لا يُضافون إلى قاعدة المواهب.")
          );
          context.openModal("تقرير المباراة", [report], "إغلاق");
        })
      );
      row.append(meta, score, actions);
      resultList.append(row);
    });
    resultsPanel.append(resultList);
  }

  const trainingPanel = node("section", "surface-card football-panel football-training-panel");
  const trainingHeading = node("div", "football-panel-heading");
  trainingHeading.append(
    node("h2", "", "خطط التدريب وتطور اللاعبين"),
    node("span", "representation-count", "تدريب أسبوعي")
  );
  trainingPanel.append(
    trainingHeading,
    node("p", "football-training-intro", "تتطبق جلسة التدريب تلقائيًا يوم الاثنين داخل المسيرة. اختار تركيز كل لاعب وشدة التدريب؛ الحمل العالي يرفع الإرهاق وقد يؤخر التطور لو اللياقة منخفضة.")
  );

  const form = node("div", "football-training-form");
  const playerSelect = node("select", "filter-select");
  playerSelect.setAttribute("aria-label", "لاعب خطة التدريب");
  developmentPlayers.forEach((player) => {
    const worldProfile = WORLD_PLAYERS.find((item) => item.id === player.playerId);
    const option = node("option", "", player.playerName + " · " + (worldProfile?.club ?? player.clubId));
    option.value = player.playerId;
    playerSelect.append(option);
  });
  const focusSelect = node("select", "filter-select");
  focusSelect.setAttribute("aria-label", "تركيز التدريب");
  Object.entries(TRAINING_FOCUSES).forEach(([value, definition]) => {
    const option = node("option", "", definition.label);
    option.value = value;
    focusSelect.append(option);
  });
  const intensitySelect = node("select", "filter-select");
  intensitySelect.setAttribute("aria-label", "شدة التدريب");
  [
    ["light", "خفيف"],
    ["normal", "طبيعي"],
    ["intense", "مكثف"]
  ].forEach(([value, label]) => {
    const option = node("option", "", label);
    option.value = value;
    intensitySelect.append(option);
  });
  form.append(playerSelect, focusSelect, intensitySelect);

  const playerDetails = node("div", "football-development-detail");
  const refreshPlayerDetails = () => {
    const player = getPlayerDevelopmentRecord(football.playerDevelopment, playerSelect.value);
    if (!player) {
      playerDetails.replaceChildren(node("p", "representation-empty", "ملف التطور غير متاح."));
      return;
    }
    focusSelect.value = player.trainingFocus;
    intensitySelect.value = player.trainingIntensity;
    [...focusSelect.options].forEach((option) => {
      option.disabled = option.value === "goalkeeping" && player.role !== "حراسة";
    });
    const metrics = node("div", "football-player-metrics");
    [
      ["التقييم", formatHomeNumber(player.rating)],
      ["الإمكانيات", player.potential],
      ["العمر", player.age + " سنة"],
      ["المشاركات", player.appearances],
      ["الدقائق", formatHomeNumber(player.minutesPlayed)],
      ["الأهداف", player.goals],
      ["التمريرات الحاسمة", player.assists],
      ["اللياقة", player.fitness + "%"],
      ["الإرهاق", player.fatigue + "%"],
      ["الإصابة", player.injuryDays > 0 ? player.injuryDays + " يوم" : "سليم"]
    ].forEach(([label, value]) => {
      const item = node("div", "football-player-metric");
      item.append(node("small", "", label), node("strong", "", String(value)));
      metrics.append(item);
    });
    const skills = node("div", "football-skill-list");
    const skillLabels = {
      finishing: "إنهاء",
      pace: "سرعة",
      passing: "تمرير",
      dribbling: "مراوغة",
      defending: "دفاع",
      stamina: "تحمل",
      handling: "إمساك",
      reflexes: "رد فعل",
      positioning: "تمركز"
    };
    Object.entries(player.skills).forEach(([key, value]) => {
      if (value <= 20 && player.role !== "حراسة") return;
      const item = node("div", "football-skill-item");
      const line = node("div", "football-skill-line");
      line.append(node("span", "", skillLabels[key] ?? key), node("strong", "", formatHomeNumber(value)));
      const track = node("div", "football-skill-track");
      const fill = node("span", "football-skill-fill");
      fill.style.width = value + "%";
      track.append(fill);
      item.append(line, track);
      skills.append(item);
    });
    const history = football.playerDevelopment.trainingHistory
      .filter((session) => session.playerId === player.playerId)
      .slice(-5)
      .reverse();
    const historyPanel = node("div", "football-training-history");
    historyPanel.append(node("strong", "", "آخر جلسات التدريب"));
    if (history.length === 0) {
      historyPanel.append(node("small", "", "لم تبدأ جلسة تدريب لهذا اللاعب بعد."));
    } else {
      history.forEach((session) => {
        historyPanel.append(node("small", "", formatHomeDate(session.date) + " · " +
          TRAINING_FOCUSES[session.focus].label + " · " +
          (session.improvement > 0 ? "+" : "") + session.improvement));
      });
    }
    playerDetails.replaceChildren(metrics, node("h3", "", "المهارات"), skills, historyPanel);
  };
  playerSelect.addEventListener("change", refreshPlayerDetails);
  refreshPlayerDetails();

  const savePlanButton = actionButton("حفظ خطة التدريب", "button-primary football-training-save", () => {
    context.updatePlayerTrainingPlan(playerSelect.value, focusSelect.value, intensitySelect.value);
  });
  trainingPanel.append(form, savePlanButton, playerDetails);
  page.append(summary, schedulePanel, standingsPanel, resultsPanel, trainingPanel);
  return page;
}

function renderScouting(context) {
  const page = node("div", "page-content rebuild-screen scouting-screen");
  const scouting = context.scouting;
  const activeMissions = scouting.activeMissions;
  const reports = scouting.reports;
  page.append(
    node("p", "eyebrow rebuild-page-kicker", "شبكة اكتشاف المواهب"),
    node("h1", "page-title rebuild-page-title", "الكشافون"),
    node("p", "page-subtitle rebuild-page-subtitle", "أطلق بعثات بميزانية ومدة ودقة مختلفة، ثم راجع تقارير المواهب وأسباب ترشيح كل لاعب.")
  );

  const summary = node("div", "metrics-grid scouting-metrics");
  summary.append(
    metricCard("بعثات نشطة", activeMissions.length + " / 3", "الحد الأقصى المتزامن", "⌕", "cyan"),
    metricCard("تقارير مكتملة", reports.length, "تقارير محفوظة في المسيرة", "▤", "purple"),
    metricCard("ميزانية الوكالة", formatMoney(context.save.agency.balance), "الرصيد المتاح للبعثات", "◈", "gold")
  );

  const scoutBanner = node("section", "scout-banner");
  const bannerCopy = node("div", "scout-banner-copy");
  bannerCopy.append(
    node("h2", "", "عينك على المستقبل"),
    node("p", "", "قاعدة البحث الحالية تضم " + WORLD_PLAYERS.length + " ملفًا خياليًا من " + WORLD_COUNTS.countries + " دولة. نتائج الكشافين تقديرات داخل المحاكاة وليست بيانات لاعبين حقيقية.")
  );
  scoutBanner.append(
    node("div", "scout-symbol", "⌕"),
    bannerCopy,
    actionButton("＋ إطلاق بعثة كشف", "button-primary scout-launch-button", context.openScoutingMission)
  );

  const teamPanel = node("section", "scout-team-panel");
  const teamHeading = node("div", "scout-operations-heading");
  const roster = getScoutingRoster(scouting, context.save.world.currentDate);
  teamHeading.append(
    node("h2", "", "طاقم الكشافين"),
    node("span", "scout-count", roster.filter((scout) => !scout.isBusy && !scout.isContractExpired).length + " متاح من " + roster.length)
  );
  const teamGrid = node("div", "scout-team-grid");
  const levelThresholds = [0, 60, 140, 250, 400];
  roster.forEach((scout) => {
    const card = node("article", "scout-staff-card");
    const top = node("div", "scout-staff-topline");
    top.append(
      node("strong", "", scout.name),
      node("span", "scout-staff-status" + (scout.isContractExpired ? " is-expired" : scout.isBusy ? " is-busy" : " is-available"), scout.isContractExpired ? "عقد منتهٍ" : scout.isBusy ? "في مهمة" : "متاح")
    );
    const nextThreshold = levelThresholds[scout.level] ?? null;
    const currentThreshold = levelThresholds[scout.level - 1] ?? 0;
    const progress = nextThreshold === null
      ? 100
      : Math.max(0, Math.min(100, ((scout.experience - currentThreshold) / (nextThreshold - currentThreshold)) * 100));
    const track = node("div", "scout-staff-progress-track");
    const bar = node("span", "scout-staff-progress-bar");
    bar.style.width = progress + "%";
    track.append(bar);
    card.append(
      top,
      node("p", "scout-staff-region", scout.region + " · المستوى " + scout.level),
      node("strong", "scout-staff-specialty", scout.specialty),
      node("p", "scout-staff-roles", (scout.roles.includes("all") ? "كل المراكز" : scout.roles.join(" · ")) + " · " + scout.experience + " نقطة خبرة"),
      track,
      node("small", "scout-staff-record", scout.missionsCompleted + " بعثة مكتملة"),
      node("small", "scout-staff-record", scout.isContracted ? (scout.isContractExpired ? "انتهى العقد في " + formatHomeDate(scout.contractExpiresOn) : "ينتهي في " + formatHomeDate(scout.contractExpiresOn) + " · متبقي " + scout.contractDaysRemaining + " يوم") : "عضو أساسي دائم")
    );
    if (scout.canRenewContract) card.append(actionButton(scout.isContractExpired ? "تجديد العقد" : "تجديد مبكر", "button-outline scout-contract-renew-button", () => context.renewScoutingContract(scout.id)));
    teamGrid.append(card);
  });
  teamPanel.append(teamHeading, teamGrid);

  const recruitOptions = getScoutingRecruitmentOptions(scouting);
  const recruitmentPanel = node("section", "scout-team-panel scout-recruitment-panel");
  if (recruitOptions.length > 0) {
    const recruitHeading = node("div", "scout-operations-heading");
    recruitHeading.append(node("h2", "", "كشافون متاحون للتعاقد"), node("span", "scout-count", recruitOptions.length + " مرشح"));
    const recruitGrid = node("div", "scout-team-grid");
    recruitOptions.forEach((candidate) => {
      const card = node("article", "scout-staff-card scout-recruit-card");
      const top = node("div", "scout-staff-topline");
      top.append(node("strong", "", candidate.name), node("span", "scout-staff-status is-available", "متاح للتعاقد"));
      card.append(top, node("p", "scout-staff-region", candidate.region), node("strong", "scout-staff-specialty", candidate.specialty),
        node("p", "scout-staff-roles", candidate.roles.join(" · ") + " · " + candidate.countryIds.length + " نطاق جغرافي"),
        node("small", "scout-staff-record", "عقد سنوي " + candidate.contractDays + " يومًا · مقدم " + formatMoney(candidate.contractCost)),
        node("small", "scout-staff-record", "رسوم التجديد " + formatMoney(candidate.renewalCost)),
        actionButton("توقيع عقد سنوي", "button-outline scout-sign-contract-button", () => context.signScoutingContract(candidate.id)));
      recruitGrid.append(card);
    });
    recruitmentPanel.append(recruitHeading, recruitGrid);
  }

  const operations = node("div", "scout-operations-grid");
  const activePanel = node("section", "scout-operations-panel");
  const activeHeading = node("div", "scout-operations-heading");
  activeHeading.append(
    node("h2", "", "البعثات الجارية"),
    node("span", "scout-count", activeMissions.length + " نشطة")
  );
  activePanel.append(activeHeading);
  const activeList = node("div", "scout-mission-list");
  if (activeMissions.length === 0) {
    activeList.append(node("p", "scout-empty", "مفيش بعثات شغالة حاليًا. اختار الدولة والمستوى وابدأ أول مهمة كشف."));
  } else {
    activeMissions.forEach((mission) => {
      const remaining = getScoutingDaysRemaining(mission, context.save.world.currentDate) ?? 0;
      const progress = Math.round(((mission.durationDays - remaining) / mission.durationDays) * 100);
      const row = node("article", "scout-mission-row");
      const heading = node("div", "scout-mission-topline");
      heading.append(
        node("strong", "", mission.name),
        node("span", "scout-mission-status", "قيد التنفيذ")
      );
      const scope = WORLD_DATABASE.countries.find((country) => country.id === mission.countryId)?.nameAr ?? "كل الدول";
      const roleLabel = mission.role === "all" ? "كل المراكز" : mission.role;
      const assignment = mission.scoutName ? " · الكشاف " + mission.scoutName + " (مستوى " + mission.scoutLevel + ")" : "";
      const details = node("p", "scout-mission-details", scope + " · " + roleLabel + " · " + getScoutingSourceLabel(mission.sourceId ?? "all") + " · " + mission.targetCount + " لاعب محتمل" + assignment);
      const track = node("div", "scout-progress-track");
      const bar = node("span", "scout-progress-bar");
      bar.style.width = progress + "%";
      track.append(bar);
      const footer = node("div", "scout-mission-footer");
      footer.append(
        node("span", "", "الموعد: " + formatHomeDate(mission.dueDate)),
        node("span", "", remaining === 0 ? "بانتظار التقرير" : "متبقي " + remaining + " يوم"),
        node("span", "", "الدقة المستهدفة " + Math.round(mission.accuracy * 100) + "%")
      );
      row.append(heading, details, track, footer);
      activeList.append(row);
    });
  }
  activePanel.append(activeList);

  const reportsPanel = node("section", "scout-operations-panel");
  const reportsHeading = node("div", "scout-operations-heading");
  reportsHeading.append(
    node("h2", "", "تقارير الاستكشاف"),
    node("span", "scout-count", reports.length + " تقرير")
  );
  reportsPanel.append(reportsHeading);
  const reportList = node("div", "scout-report-list");
  if (reports.length === 0) {
    reportList.append(node("p", "scout-empty", "أول تقرير هيظهر هنا بعد انتهاء مدة بعثتك."));
  } else {
    reports.slice(0, 8).forEach((report) => {
      const row = node("article", "scout-report-row");
      const copy = node("div", "scout-report-copy");
      copy.append(
        node("strong", "", report.missionName),
        node("span", "", formatHomeDate(report.completedDate) + " · " + getScoutingSourceLabel(report.sourceId ?? "all") + " · " + report.candidateCount + " موهبة · دقة " + Math.round(report.accuracy * 100) + "%" + (report.scoutName ? " · " + report.scoutName : ""))
      );
      row.append(copy, actionButton("عرض التقرير", "button-outline scout-report-button", () => context.openScoutingReport(report)));
      reportList.append(row);
    });
  }
  reportsPanel.append(reportList);
  operations.append(activePanel, reportsPanel);

  const toolbar = node("div", "list-toolbar");
  const search = node("input", "search-input");
  search.type = "search";
  search.placeholder = "ابحث عن اسم أو مركز أو نادٍ أو بلد...";
  search.setAttribute("aria-label", "البحث في المواهب");
  const position = node("select", "filter-select");
  position.setAttribute("aria-label", "تصفية حسب المركز");
  [["all", "كل المراكز"], ["هجوم", "الهجوم"], ["وسط", "الوسط"], ["دفاع", "الدفاع"], ["حراسة", "حراسة المرمى"]].forEach(([value, label]) => {
    const option = node("option", "", label);
    option.value = value;
    position.append(option);
  });
  const count = node("span", "result-count", WORLD_PLAYERS.length + " نتائج");
  count.setAttribute("aria-live", "polite");
  toolbar.append(search, position, count);

  const grid = node("div", "players-grid players-grid-large");
  const refresh = () => {
    const query = search.value.trim().toLocaleLowerCase("ar");
    const role = position.value;
    const filtered = WORLD_PLAYERS.filter((player) => {
      const matchesText = [player.name, player.club, player.position, player.country].some((value) =>
        value.toLocaleLowerCase("ar").includes(query)
      );
      const matchesRole = role === "all" || player.role === role;
      return matchesText && matchesRole;
    });

    count.textContent = filtered.length + " نتائج";
    if (filtered.length === 0) {
      grid.replaceChildren(emptyResults(
        "مفيش مواهب مطابقة",
        "وسّع البحث أو اختار كل المراكز علشان تشوف اقتراحات تانية.",
        "إعادة ضبط البحث",
        () => {
          search.value = "";
          position.value = "all";
          refresh();
          search.focus();
        }
      ));
      return;
    }

    grid.replaceChildren(...filtered.map((player) => {
      const card = playerCard(player, context.openPlayer);
      const alreadyWatched = context.watchlist.has(player.id);
      const follow = actionButton(
        alreadyWatched ? "✓  في قائمة المتابعة" : "＋  أضف للمتابعة",
        alreadyWatched ? "watch-button is-active" : "watch-button",
        () => {
          if (context.addToWatchlist(player)) {
            follow.textContent = "✓  في قائمة المتابعة";
            follow.classList.add("is-active");
            follow.disabled = context.watchlist.has(player.id);
          }
        }
      );
      follow.disabled = alreadyWatched;
      follow.setAttribute("aria-pressed", String(alreadyWatched));
      card.append(follow);
      return card;
    }));
  };

  search.addEventListener("input", refresh);
  position.addEventListener("change", refresh);
  refresh();
  page.append(summary, scoutBanner, teamPanel);
  if (recruitOptions.length > 0) page.append(recruitmentPanel);
  page.append(operations, toolbar, grid);
  return page;
}

function renderMarket(context) {
  const page = node("div", "page-content rebuild-screen market-screen");
  const currentDate = context.save.world.currentDate;
  const transferState = context.transferState;
  const windowInfo = getTransferWindow(currentDate);
  const activeContracts = context.save.agency.representation.contracts.filter((contract) =>
    contract.status === "active" && getRepresentationContractExpiry(contract) > currentDate
  );
  const representedPlayers = activeContracts.map((contract) => ({
    contract,
    player: context.players.find((player) => player.id === contract.playerId)
  })).filter((item) => item.player);
  const openOffers = transferState.offers.filter((offer) => ["pending", "countered", "agreed"].includes(offer.status));
  const completedMoves = transferState.moves;

  page.append(
    node("p", "eyebrow rebuild-page-kicker", "حركة الأندية والصفقات"),
    node("h1", "page-title rebuild-page-title", "سوق الانتقالات"),
    node("p", "page-subtitle rebuild-page-subtitle", "قدّم عروض الانتقال والإعارة لعملائك، تفاوض مع الأندية، وسجّل الصفقات والعمولات.")
  );

  const windowCard = node("section", "transfer-window-card" + (windowInfo.active ? " is-open" : " is-closed"));
  const windowCopy = node("div", "transfer-window-copy");
  const windowTitle = windowInfo.active
    ? (windowInfo.window.type === "summer" ? "النافذة الصيفية مفتوحة" : "النافذة الشتوية مفتوحة")
    : "نافذة الانتقالات مغلقة";
  windowCopy.append(
    node("span", "transfer-window-kicker", "حالة السوق · " + formatHomeDate(currentDate)),
    node("h2", "", windowTitle),
    node("p", "", windowInfo.active
      ? "متبقي " + windowInfo.window.daysRemaining + " يومًا على إغلاق النافذة."
      : "النافذة القادمة تبدأ في " + formatHomeDate(windowInfo.nextWindow.startDate) + ".")
  );
  windowCard.append(node("span", "transfer-window-icon", "⇄"), windowCopy);
  windowCard.append(node("span", "transfer-window-status", windowInfo.active ? "OPEN" : "CLOSED"));

  const summary = node("div", "market-summary transfer-summary");
  summary.append(
    metricCard("نافذة السوق", windowInfo.active ? "مفتوحة" : "مغلقة", windowInfo.active ? windowInfo.window.type === "summer" ? "صيفية" : "شتوية" : "تبدأ " + formatHomeDate(windowInfo.nextWindow.startDate), "⇄", "purple"),
    metricCard("تفاوض نشط", formatHomeNumber(openOffers.length), "عروض تنتظر قرارًا", "◷", "cyan"),
    metricCard("عمولات مكتسبة", formatEuroMoney(transferState.earnedCommissionEur), "إجمالي مسجل باليورو", "€", "gold")
  );

  const proposalPanel = node("section", "surface-card transfer-proposal-panel");
  proposalPanel.append(sectionHeading("فتح ملف انتقال جديد", "كل صفقة مرتبطة بعقد تمثيل نشط، وبنادي وجهة، وشروط مالية محددة."));

  const field = (label, control) => {
    const wrapper = node("label", "transfer-form-field");
    wrapper.append(node("span", "", label), control);
    return wrapper;
  };

  if (representedPlayers.length === 0) {
    const emptyClients = node("div", "transfer-empty-clients");
    emptyClients.append(
      node("strong", "", "لا توجد صفقات عملاء جاهزة"),
      node("p", "", "لازم يكون اللاعب عميلًا بعقد تمثيل نشط قبل ما تقدر تتفاوض على انتقاله أو إعارته."),
      actionButton("إدارة العملاء والعقود", "button-primary", () => context.navigate("agency"))
    );
    proposalPanel.append(emptyClients);
  } else if (!windowInfo.active) {
    proposalPanel.append(node("p", "transfer-window-hint", "تقدر تراجع عروضك الحالية، لكن إرسال عروض جديدة أو تنفيذ اتفاقات مؤجل حتى افتتاح النافذة القادمة."));
  } else {
    const proposalForm = node("form", "transfer-proposal-form");
    const playerSelect = node("select", "search-input transfer-player-select");
    playerSelect.setAttribute("aria-label", "لاعب الانتقال");
    representedPlayers.forEach(({ player }) => {
      const option = node("option", "", player.name + " · " + player.club + " · " + player.position);
      option.value = player.id;
      playerSelect.append(option);
    });

    const clubSelect = node("select", "search-input transfer-club-select");
    clubSelect.setAttribute("aria-label", "النادي المستهدف");
    const typeSelect = node("select", "search-input transfer-type-select");
    [["permanent", "انتقال نهائي"], ["loan", "إعارة"]].forEach(([value, label]) => {
      const option = node("option", "", label);
      option.value = value;
      typeSelect.append(option);
    });

    const amountInput = node("input", "search-input");
    amountInput.type = "number";
    amountInput.min = "0";
    amountInput.step = "1000";
    amountInput.required = true;
    amountInput.value = String(representedPlayers[0].player.marketValueEur ?? 0);

    const wageInput = node("input", "search-input");
    wageInput.type = "number";
    wageInput.min = "0";
    wageInput.step = "100";
    wageInput.required = true;
    wageInput.value = "10000";

    const bonusInput = node("input", "search-input");
    bonusInput.type = "number";
    bonusInput.min = "0";
    bonusInput.step = "1000";
    bonusInput.value = "0";

    const periodSelect = node("select", "search-input");
    const optionInput = node("input", "search-input");
    optionInput.type = "number";
    optionInput.min = "0";
    optionInput.step = "1000";
    optionInput.value = "0";
    const amountField = field("قيمة الصفقة / رسوم الإعارة", amountInput);
    const periodField = field("مدة العقد / الإعارة", periodSelect);
    const amountLabel = amountField.querySelector("span");
    const periodLabel = periodField.querySelector("span");
    const optionField = field("بند أحقية الشراء باليورو", optionInput);

    const refreshDestinationClubs = () => {
      const selectedPlayer = representedPlayers.find((item) => item.player.id === playerSelect.value)?.player;
      const fromClubId = selectedPlayer
        ? getPlayerCurrentClubId(selectedPlayer.id, selectedPlayer.clubId, transferState, currentDate)
        : null;
      clubSelect.replaceChildren();
      WORLD_DATABASE.clubs.filter((club) => club.id !== fromClubId).forEach((club) => {
        const option = node("option", "", club.nameAr);
        option.value = club.id;
        clubSelect.append(option);
      });
    };
    const refreshTerms = () => {
      const isLoan = typeSelect.value === "loan";
      amountLabel.textContent = isLoan ? "رسوم الإعارة باليورو" : "قيمة الانتقال باليورو";
      periodLabel.textContent = isLoan ? "مدة الإعارة" : "مدة العقد الجديد";
      periodSelect.replaceChildren();
      (isLoan ? [3, 6, 9, 12, 18, 24] : [1, 2, 3, 4, 5]).forEach((value) => {
        const option = node("option", "", isLoan ? value + " شهر" : value + " سنة");
        option.value = String(value);
        if (value === (isLoan ? 6 : 3)) option.selected = true;
        periodSelect.append(option);
      });
      optionField.hidden = !isLoan;
      const player = representedPlayers.find((item) => item.player.id === playerSelect.value)?.player;
      const marketValue = player?.marketValueEur ?? 0;
      amountInput.value = String(isLoan ? Math.round(marketValue * 0.02) : marketValue);
    };
    playerSelect.addEventListener("change", () => {
      refreshDestinationClubs();
      refreshTerms();
    });
    typeSelect.addEventListener("change", refreshTerms);
    refreshDestinationClubs();
    refreshTerms();

    proposalForm.append(
      field("اللاعب العميل", playerSelect),
      field("النادي المستهدف", clubSelect),
      field("نوع الصفقة", typeSelect),
      amountField,
      field("الراتب الأسبوعي باليورو", wageInput),
      field("مكافأة التوقيع باليورو", bonusInput),
      periodField,
      optionField
    );
    const submit = actionButton("إرسال العرض للنادي", "button-primary transfer-submit-button", () => {});
    submit.type = "submit";
    proposalForm.append(submit);
    proposalForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const type = typeSelect.value;
      const common = { weeklyWageEur: Number(wageInput.value), signingBonusEur: Number(bonusInput.value) };
      const terms = type === "loan"
        ? { ...common, loanFeeEur: Number(amountInput.value), loanMonths: Number(periodSelect.value), optionToBuyEur: Number(optionInput.value) }
        : { ...common, feeEur: Number(amountInput.value), contractYears: Number(periodSelect.value) };
      context.createTransferProposal(playerSelect.value, clubSelect.value, type, terms);
    });
    proposalPanel.append(proposalForm);
  }

  const listPanel = node("section", "surface-card transfer-list-panel");
  listPanel.append(sectionHeading("ملفات التفاوض", "العروض المرسلة، ردود الأندية، والاتفاقات التي تنتظر التنفيذ."));
  const offerList = node("div", "transfer-deal-list");
  if (transferState.offers.length === 0) {
    offerList.append(node("p", "transfer-history-empty", "لسه مفيش عروض انتقال أو إعارة. اختار عميلًا وابدأ أول تفاوض من النموذج."));
  } else {
    transferState.offers.slice(0, 30).forEach((offer) => {
      const card = node("article", "transfer-deal-card transfer-status-" + offer.status);
      const details = node("div", "transfer-deal-details");
      const labels = { pending: "بانتظار رد النادي", countered: "النادي أرسل عرضًا مضادًا",
        agreed: "اتفاق مبدئي · جاهز للتنفيذ", completed: "تم تنفيذ الصفقة",
        rejected: "مرفوض / ملغي", expired: "انتهت الصلاحية" };
      const terms = ["agreed", "completed"].includes(offer.status) ? offer.agreedTerms : offer.terms;
      const price = offer.type === "loan"
        ? "رسوم الإعارة " + formatEuroMoney(terms.loanFeeEur) + " · خيار الشراء " + formatEuroMoney(terms.optionToBuyEur)
        : "قيمة الانتقال " + formatEuroMoney(terms.feeEur);
      details.append(
        node("div", "transfer-deal-title", offer.playerName + " · " + (offer.type === "loan" ? "إعارة" : "انتقال نهائي")),
        node("p", "", offer.fromClubId + " ← " + offer.toClubName),
        node("p", "", price + " · راتب أسبوعي " + formatEuroMoney(terms.weeklyWageEur)),
        node("small", "", "الجولة " + offer.round + " من 4 · أُرسل " + formatHomeDate(offer.createdDate)),
        node("span", "transfer-deal-status", labels[offer.status] ?? offer.status)
      );
      card.append(details);

      if (offer.status === "pending") {
        card.append(actionButton("محاكاة رد النادي", "button-primary", () => context.evaluateTransferOffer(offer.id)));
        card.append(actionButton("إلغاء", "button-outline", () => context.rejectTransferOffer(offer.id)));
      } else if (offer.status === "countered" && offer.counterOffer) {
        card.append(actionButton("قبول شروط النادي", "button-primary", () => context.acceptTransferCounterOffer(offer.id)));
        const counterForm = node("form", "transfer-counter-form");
        const counterAmount = node("input", "search-input");
        counterAmount.type = "number"; counterAmount.min = "0"; counterAmount.step = "1000"; counterAmount.required = true;
        counterAmount.value = String(offer.type === "loan" ? offer.counterOffer.loanFeeEur : offer.counterOffer.feeEur);
        const counterWage = node("input", "search-input");
        counterWage.type = "number"; counterWage.min = "0"; counterWage.step = "100"; counterWage.required = true;
        counterWage.value = String(offer.counterOffer.weeklyWageEur);
        const counterBonus = node("input", "search-input");
        counterBonus.type = "number"; counterBonus.min = "0"; counterBonus.step = "1000";
        counterBonus.value = String(offer.counterOffer.signingBonusEur);
        const counterPeriod = node("select", "search-input");
        (offer.type === "loan" ? [3, 6, 9, 12, 18, 24] : [1, 2, 3, 4, 5]).forEach((value) => {
          const option = node("option", "", offer.type === "loan" ? value + " شهر" : value + " سنة");
          option.value = String(value);
          if (value === (offer.type === "loan" ? offer.counterOffer.loanMonths : offer.counterOffer.contractYears)) option.selected = true;
          counterPeriod.append(option);
        });
        const counterOption = node("input", "search-input");
        counterOption.type = "number"; counterOption.min = "0"; counterOption.step = "1000";
        counterOption.value = String(offer.counterOffer.optionToBuyEur ?? 0);
        counterForm.append(
          field(offer.type === "loan" ? "رسوم الإعارة المضادة (€)" : "قيمة الانتقال المضادة (€)", counterAmount),
          field("الراتب الأسبوعي (€)", counterWage),
          field("مكافأة التوقيع (€)", counterBonus),
          field(offer.type === "loan" ? "مدة الإعارة" : "مدة العقد", counterPeriod)
        );
        if (offer.type === "loan") counterForm.append(field("خيار الشراء (€)", counterOption));
        const counterSubmit = actionButton("إرسال عرض مضاد", "button-outline", () => {});
        counterSubmit.type = "submit";
        counterForm.append(counterSubmit);
        counterForm.addEventListener("submit", (event) => {
          event.preventDefault();
          const common = { weeklyWageEur: Number(counterWage.value), signingBonusEur: Number(counterBonus.value) };
          const counterTerms = offer.type === "loan"
            ? { ...common, loanFeeEur: Number(counterAmount.value), loanMonths: Number(counterPeriod.value), optionToBuyEur: Number(counterOption.value) }
            : { ...common, feeEur: Number(counterAmount.value), contractYears: Number(counterPeriod.value) };
          context.submitTransferCounterOffer(offer.id, counterTerms);
        });
        card.append(counterForm, actionButton("رفض التفاوض", "button-outline", () => context.rejectTransferOffer(offer.id)));
      } else if (offer.status === "agreed") {
        card.append(actionButton("تنفيذ الصفقة", "button-primary", () => context.completeTransfer(offer.id)));
        card.append(actionButton("إلغاء الاتفاق", "button-outline", () => context.rejectTransferOffer(offer.id)));
      }
      offerList.append(card);
    });
  }
  listPanel.append(offerList);

  const movesPanel = node("section", "surface-card transfer-moves-panel");
  movesPanel.append(sectionHeading("سجل الانتقالات والإعارات", "حركة اللاعبين التي تم تنفيذها بالفعل، مع تاريخ نهاية الإعارة عند وجودها."));
  if (completedMoves.length === 0) {
    movesPanel.append(node("p", "transfer-history-empty", "لا توجد انتقالات منفذة حتى الآن."));
  } else {
    const clubNames = new Map(WORLD_DATABASE.clubs.map((club) => [club.id, club.nameAr]));
    const moveList = node("div", "transfer-move-list");
    completedMoves.slice(0, 20).forEach((move) => {
      const row = node("article", "transfer-move-row");
      row.append(
        node("strong", "", move.playerName),
        node("span", "", (clubNames.get(move.fromClubId) ?? move.fromClubId) + " ← " + (clubNames.get(move.toClubId) ?? move.toClubId)),
        node("small", "", (move.type === "loan" ? "إعارة" : "انتقال نهائي") + " · " + formatHomeDate(move.effectiveDate) +
          (move.type === "loan" ? " · عودة " + formatHomeDate(move.returnDate) + (move.status === "returned" ? " · عاد" : " · نشطة") : "")),
        node("small", "", move.type === "loan" ? "رسوم الإعارة " + formatEuroMoney(move.loanFeeEur) : "رسوم الانتقال " + formatEuroMoney(move.feeEur))
      );
      moveList.append(row);
    });
    movesPanel.append(moveList);
  }

  page.append(windowCard, summary, proposalPanel, listPanel, movesPanel,
    node("p", "transfer-market-disclaimer", "مواعيد النوافذ الصيفية والشتوية هنا قواعد موحدة للمحاكاة داخل اللعبة؛ تختلف النوافذ الفعلية بين الاتحادات والدوريات. القيم والميزانيات افتراضية وليست عروضًا رسمية."));
  return page;
}

function getTalentPipelineRecords(context) {
  const records = new Map();
  const representation = context.save.agency.representation;
  const pipeline = context.save.agency.talentPipeline;
  const add = (playerId, sourceId) => {
    const savedEntry = (pipeline?.entries ?? []).find((entry) => entry.playerId === playerId);
    const offerSnapshot = representation.offers.find((item) => item.playerId === playerId);
    const contractSnapshot = representation.contracts.find((item) => item.playerId === playerId);
    const sourcePlayer = context.players?.find((candidate) => candidate.id === playerId) ?? WORLD_PLAYERS.find((candidate) => candidate.id === playerId);
    const snapshot = savedEntry ?? offerSnapshot ?? contractSnapshot;
    const player = sourcePlayer ?? (snapshot ? {
      id: playerId,
      name: snapshot.name ?? snapshot.playerName,
      age: snapshot.age,
      club: snapshot.club,
      position: snapshot.position,
      rating: snapshot.rating,
      potential: snapshot.potential,
      country: snapshot.country ?? "غير محدد",
      league: snapshot.league ?? "غير محدد",
      value: snapshot.value ?? "غير متاح",
      role: snapshot.role ?? "غير محدد",
      status: "ملف محفوظ"
    } : null);
    if (!player || typeof player.name !== "string" || !player.name.trim()) return;
    let record = records.get(playerId);
    if (!record) {
      record = { player, sourceIds: new Set(), entry: null };
      records.set(playerId, record);
    } else if (!sourcePlayer && snapshot) {
      record.player = player;
    }
    if (sourceId) record.sourceIds.add(sourceId);
  };

  const scouting = context.save.world.scouting;
  const scoutingRoster = getScoutingRoster(scouting, context.save.world.currentDate);
  (scouting?.reports ?? []).forEach((report) => {
    (report.findings ?? []).forEach((finding) => add(finding.playerId, "scouting"));
  });
  (scouting?.observations ?? []).forEach((observation) => add(observation.playerId, "scouting"));
  context.watchlist.forEach((playerId) => add(playerId, "watchlist"));

  representation.offers
    .filter((offer) => ["pending", "countered"].includes(offer.status))
    .forEach((offer) => add(offer.playerId, "manual"));
  representation.contracts
    .filter((contract) => contract.status === "active")
    .forEach((contract) => add(contract.playerId, "manual"));
  context.save.agency.clients.forEach((playerId) => add(playerId, "manual"));

  (pipeline?.entries ?? []).forEach((entry) => {
    add(entry.playerId, null);
    const record = records.get(entry.playerId);
    if (record) {
      record.entry = entry;
      entry.sourceIds.forEach((sourceId) => record.sourceIds.add(sourceId));
    }
  });

  return [...records.values()].map((record) => {
    const playerId = record.player.id;
    const offer = representation.offers.find((item) =>
      item.playerId === playerId && ["pending", "countered"].includes(item.status)
    );
    const contract = representation.contracts.find((item) =>
      item.playerId === playerId && item.status === "active"
    );
    const isClient = context.save.agency.clients.includes(playerId) || Boolean(contract);
    const stage = isClient
      ? "client"
      : offer
        ? "negotiating"
        : record.entry?.stage ?? (record.sourceIds.has("watchlist") ? "shortlisted" : "discovered");
    const sourceLabels = [];
    if (record.sourceIds.has("scouting")) sourceLabels.push("تقارير الكشافين");
    if (record.sourceIds.has("watchlist")) sourceLabels.push("قائمة المتابعة");
    if (offer) sourceLabels.push("عرض تمثيل مفتوح");
    if (isClient) sourceLabels.push("عميل حالي");
    if (record.entry?.sourceIds.includes("manual")) sourceLabels.push("متابعة الوكالة");
    return {
      ...record,
      offer,
      contract,
      isClient,
      stage,
      sourceLabels: [...new Set(sourceLabels)],
      nextFollowUpDate: record.entry?.nextFollowUpDate ?? null,
      lastContactDate: record.entry?.lastContactDate ?? null,
      activity: record.entry?.activity ?? [],
      note: record.entry?.note ?? "",
      assignedScoutId: record.entry?.assignedScoutId ?? null,
      assignedScout: scoutingRoster.find((scout) => scout.id === record.entry?.assignedScoutId) ?? null
    };
  }).sort((a, b) => {
    const order = { negotiating: 0, contacted: 1, shortlisted: 2, discovered: 3, client: 4, archived: 5 };
    return order[a.stage] - order[b.stage] ||
      (b.player.potential - a.player.potential) ||
      a.player.name.localeCompare(b.player.name, "ar");
  });
}

function renderAgencyStaffAssignments(context) {
  const records = getTalentPipelineRecords(context);
  const roster = getScoutingRoster(context.save.world.scouting, context.save.world.currentDate);
  const assignedRecords = records.filter((item) =>
    item.assignedScoutId && !item.isClient && item.stage !== "archived"
  );
  const unassignedCount = records.filter((item) =>
    !item.isClient && item.stage !== "archived" && !item.assignedScoutId
  ).length;
  const panel = node("section", "surface-card representation-panel talent-staff-panel");
  const heading = node("div", "representation-heading");
  heading.append(
    node("div", "talent-pipeline-heading-copy"),
    node("span", "representation-count", assignedRecords.length + " ملف مكلف · " + unassignedCount + " بدون مسؤول")
  );
  heading.children[0].append(
    node("h2", "", "إدارة طاقم الاستقطاب"),
    node("p", "", "وزّع ملفات المواهب على الكشافين النشطين. الحد الأقصى لكل كشاف 6 ملفات حتى تظل المتابعة قابلة للإدارة.")
  );
  panel.append(heading);

  const rosterGrid = node("div", "talent-staff-grid");
  roster.forEach((scout) => {
    const assigned = assignedRecords.filter((item) => item.assignedScoutId === scout.id);
    const load = Math.min(100, Math.round((assigned.length / MAX_PROSPECTS_PER_SCOUT) * 100));
    const status = scout.isContractExpired
      ? "عقد منتهٍ"
      : scout.isBusy ? "في بعثة كشف" : assigned.length >= MAX_PROSPECTS_PER_SCOUT ? "مكتمل الملفات" : "متاح للتكليف";
    const card = node("article", "talent-staff-card");
    const top = node("div", "talent-staff-card-top");
    top.append(
      node("strong", "", scout.name),
      node("span", "talent-staff-status" + (scout.isContractExpired ? " is-expired" : scout.isBusy ? " is-busy" : ""), status)
    );
    const copy = node("div", "talent-staff-card-copy");
    copy.append(
      node("span", "", scout.region + " · مستوى " + scout.level),
      node("small", "", scout.specialty)
    );
    const track = node("div", "talent-staff-load-track");
    const fill = node("span", "talent-staff-load-fill");
    fill.style.width = load + "%";
    track.append(fill);
    const work = node("div", "talent-staff-workload");
    work.append(
      node("strong", "", assigned.length + " / " + MAX_PROSPECTS_PER_SCOUT + " ملفات"),
      node("small", "", scout.missionsCompleted + " بعثة مكتملة")
    );
    card.append(top, copy, work, track);
    if (assigned.length > 0) {
      const assignedList = node("div", "talent-staff-assigned-list");
      assigned.slice(0, 3).forEach((item) => {
        assignedList.append(node("span", "", item.player.name));
      });
      if (assigned.length > 3) {
        assignedList.append(node("small", "", "و " + (assigned.length - 3) + " ملفات أخرى"));
      }
      card.append(assignedList);
    } else {
      card.append(node("p", "talent-staff-empty", "لا توجد ملفات مواهب مكلف بها حاليًا."));
    }
    rosterGrid.append(card);
  });
  if (roster.length === 0) {
    rosterGrid.append(node("p", "representation-empty", "لا يوجد كشافون في طاقم الوكالة حاليًا."));
  }
  panel.append(rosterGrid);
  return panel;
}

function renderTalentPipeline(context) {
  const records = getTalentPipelineRecords(context);
  const panel = node("section", "surface-card representation-panel talent-pipeline-panel");
  const heading = node("div", "representation-heading");
  heading.append(
    node("div", "talent-pipeline-heading-copy"),
    node("span", "representation-count", records.length + " ملف موحّد")
  );
  heading.children[0].append(
    node("h2", "", "صندوق المواهب"),
    node("p", "", "كل لاعب اكتشفته أو أضفته للمتابعة أو بدأت معه تفاوضًا يظهر هنا مرة واحدة.")
  );
  panel.append(heading);

  const counts = node("div", "talent-pipeline-counts");
  [
    ["مكتشف", records.filter((item) => item.stage === "discovered").length],
    ["متابعة", records.filter((item) => ["shortlisted", "contacted"].includes(item.stage)).length],
    ["تفاوض", records.filter((item) => item.stage === "negotiating").length],
    ["عملاء", records.filter((item) => item.stage === "client").length]
  ].forEach(([label, value]) => {
    const item = node("div", "talent-pipeline-count");
    item.append(node("small", "", label), node("strong", "", String(value)));
    counts.append(item);
  });
  panel.append(counts);

  const toolbar = node("div", "talent-pipeline-toolbar");
  const search = node("input", "search-input");
  search.type = "search";
  search.placeholder = "ابحث باللاعب أو النادي أو المركز...";
  search.setAttribute("aria-label", "البحث في صندوق المواهب");
  const filter = node("select", "filter-select");
  filter.setAttribute("aria-label", "تصفية مرحلة المواهب");
  [
    ["active", "كل المواهب النشطة"],
    ["discovered", "مكتشف حديثًا"],
    ["shortlisted", "قائمة المتابعة"],
    ["contacted", "تم التواصل"],
    ["negotiating", "قيد التفاوض"],
    ["client", "عملاء الوكالة"],
    ["archived", "مؤرشفة"]
  ].forEach(([value, label]) => {
    const option = node("option", "", label);
    option.value = value;
    filter.append(option);
  });
  filter.value = "active";
  const resultCount = node("span", "representation-count", "");
  resultCount.setAttribute("aria-live", "polite");
  toolbar.append(search, filter, resultCount);
  panel.append(toolbar);

  const grid = node("div", "talent-pipeline-grid");
  panel.append(grid);
  const stageLabels = {
    discovered: "مكتشف",
    shortlisted: "قائمة المتابعة",
    contacted: "تم التواصل",
    negotiating: "قيد التفاوض",
    client: "عميل حالي",
    archived: "مؤرشف"
  };
  const contactKindLabels = { call: "مكالمة", message: "رسالة", meeting: "اجتماع" };
  const contactOutcomeLabels = {
    pending: "بانتظار الرد",
    positive: "رد إيجابي",
    neutral: "رد محايد",
    negative: "رد سلبي",
    no_response: "لا يوجد رد"
  };
  const refresh = () => {
    const query = search.value.trim().toLocaleLowerCase("ar");
    const selectedStage = filter.value;
    const filtered = records.filter((item) => {
      const matchesStage = selectedStage === "active"
        ? item.stage !== "archived"
        : item.stage === selectedStage;
      const matchesQuery = [
        item.player.name, item.player.club, item.player.position,
        item.player.country, item.player.league
      ].some((value) => String(value ?? "").toLocaleLowerCase("ar").includes(query));
      return matchesStage && matchesQuery;
    });
    resultCount.textContent = filtered.length + " نتيجة";
    if (filtered.length === 0) {
      grid.replaceChildren(emptyResults(
        "صندوق المواهب فاضي حاليًا",
        "ابدأ ببعثة كشف أو أضف لاعبًا لقائمة المتابعة، وهتلاقي كل الملفات هنا.",
        "افتح شبكة الكشافين",
        () => context.navigate("scouting")
      ));
      return;
    }
    grid.replaceChildren(...filtered.map((item) => {
      const player = item.player;
      const card = node("article", "talent-pipeline-card");
      const portrait = node("div", "talent-pipeline-portrait");
      portrait.append(playerArt(player));
      const copy = node("div", "talent-pipeline-copy");
      copy.append(
        node("strong", "", player.name),
        node("span", "", player.position + " · " + player.club + " · " + player.age + " سنة"),
        node("small", "", "تقييم " + player.rating + " · إمكانيات " + player.potential),
        node("small", "talent-pipeline-sources", item.sourceLabels.join(" · ") || "متابعة الوكالة"),
        node("small", "talent-pipeline-owner", "مسؤول الملف: " + (item.assignedScout?.name ?? (item.assignedScoutId ? "موظف سابق" : "لم يتم التعيين")))
      );
      const state = node("span", "talent-pipeline-stage stage-" + item.stage, stageLabels[item.stage]);
      const followUpTask = item.entry
        ? context.save.world.tasks.find((task) =>
          task.category === "talent-follow-up" &&
          task.prospectId === item.entry.id &&
          ["open", "overdue"].includes(task.status)
        )
        : null;
      if (item.nextFollowUpDate) {
        const overdue = item.nextFollowUpDate < context.save.world.currentDate;
        const dueToday = item.nextFollowUpDate === context.save.world.currentDate;
        const followUpClass = overdue ? "is-overdue" : dueToday ? "is-due" : "";
        const followUpLabel = overdue
          ? "متابعة متأخرة منذ "
          : dueToday ? "موعد المتابعة اليوم " : "المتابعة القادمة ";
        copy.append(node("small", "talent-pipeline-followup " + followUpClass,
          followUpLabel + formatHomeDate(item.nextFollowUpDate)));
      }
      const lastContact = [...item.activity].reverse().find((event) => event.type === "contact");
      if (lastContact) {
        copy.append(node("small", "talent-pipeline-last-contact",
          "آخر تواصل: " + contactKindLabels[lastContact.kind] + " · " + contactOutcomeLabels[lastContact.outcome] +
          " · " + formatHomeDate(lastContact.date)));
      }
      if (item.note) copy.append(node("small", "talent-pipeline-note", item.note));
      const actions = node("div", "talent-pipeline-actions");
      actions.append(
        actionButton("ملف اللاعب", "button-outline talent-pipeline-profile-button", () => context.openPlayer(player)),
        actionButton(item.entry ? "إدارة المتابعة" : "إضافة لصندوق المواهب", "button-primary talent-pipeline-manage-button",
          () => context.manageTalentProspect(player))
      );
      if (followUpTask) {
        actions.append(actionButton(
          followUpTask.status === "overdue" ? "تأكيد مراجعة المتابعة المتأخرة" : "تأكيد مراجعة المتابعة",
          "button-outline talent-pipeline-complete-followup-button",
          () => context.completeTask(followUpTask.id)
        ));
      }
      if (!item.isClient && !item.offer) {
        actions.append(actionButton(lastContact ? "تسجيل تواصل" : "تواصل أولي",
          "button-outline talent-pipeline-contact-button",
          () => context.manageTalentContact(player, [...item.sourceIds])));
        if (lastContact?.outcome === "positive") {
          actions.append(actionButton("بدء تفاوض التمثيل", "button-primary talent-pipeline-offer-button",
            () => context.openRepresentationOffer(player)));
        }
      }
      if (item.activity.length > 0) {
        actions.append(actionButton("سجل النشاط", "button-outline talent-pipeline-history-button",
          () => context.openTalentProspectHistory(player)));
      }
      card.append(portrait, copy, state, actions);
      return card;
    }));
  };
  search.addEventListener("input", refresh);
  filter.addEventListener("change", refresh);
  refresh();
  return panel;
}

function renderAgency(context) {
  const page = node("div", "page-content rebuild-screen agency-screen");
  page.append(
    node("p", "eyebrow rebuild-page-kicker", "إدارة أعمالك"),
    node("h1", "page-title rebuild-page-title", "الوكالة"),
    node("p", "page-subtitle rebuild-page-subtitle", "ابنِ قائمة عملائك، تفاوض على شروط التمثيل، واهتم بالثقة والتواصل والمواعيد.")
  );

  const agency = context.save.agency;
  const representation = agency.representation;
  const activeContracts = representation.contracts.filter((contract) => contract.status === "active");
  const openOffers = representation.offers.filter((offer) => ["pending", "countered"].includes(offer.status));
  const interactions = Array.isArray(representation.interactions) ? representation.interactions : [];
  const openInteractions = interactions.filter((item) => ["pending_response", "scheduled"].includes(item.status));
  const prospects = context.players
    .filter((player) => !agency.clients.includes(player.id) &&
      !openOffers.some((offer) => offer.playerId === player.id))
    .sort((a, b) => b.potential - a.potential || b.rating - a.rating);

  const personalityLabels = {
    ambitious: "طموح",
    loyal: "وفيّ",
    pragmatic: "عملي",
    cautious: "حذر",
    professional: "احترافي"
  };

  const overview = node("section", "agency-overview");
  const monogram = node("div", "agency-monogram", "FA");
  const summary = node("div", "agency-summary");
  summary.append(
    node("span", "agency-label", "وكالتك"),
    node("h2", "", agency.name),
    node("p", "", "وكالة مستقلة · إدارة التمثيل والعلاقات")
  );
  overview.append(monogram, summary, actionButton("حفظ التقدم", "button-primary", context.saveCareer));

  const cards = node("div", "metrics-grid agency-metrics");
  cards.append(
    metricCard("الرصيد", formatMoney(agency.balance), "الأموال المتاحة", "◈", "purple"),
    metricCard("العملاء", agency.clients.length, "لاعبون ممثلون", "◎", "cyan"),
    metricCard("العقود النشطة", activeContracts.length, "عقود تمثيل سارية", "▤", "gold"),
    metricCard("سمعة الوكالة", getAgencyReputationScore(representation) + "/100", "سمعة الوكالة بين اللاعبين", "★", "cyan")
  );

  const talentPipelinePanel = renderTalentPipeline(context);
  const staffAssignmentsPanel = renderAgencyStaffAssignments(context);

  const contractsPanel = node("section", "surface-card representation-panel");
  const contractsHeading = node("div", "representation-heading");
  const contractsCount = node("span", "representation-count", activeContracts.length + " عقد نشط");
  contractsHeading.append(node("h2", "", "عملاء الوكالة"), contractsCount);
  contractsPanel.append(contractsHeading);

  const clientToolbar = node("div", "representation-client-toolbar");
  const clientSearch = node("input", "search-input");
  clientSearch.type = "search";
  clientSearch.placeholder = "ابحث عن عميل بالاسم أو النادي أو المركز...";
  clientSearch.setAttribute("aria-label", "البحث في عملاء الوكالة");
  clientToolbar.append(clientSearch);
  const contractList = node("div", "representation-list");
  const renderContracts = () => {
    const query = clientSearch.value.trim().toLocaleLowerCase("ar");
    const filteredContracts = activeContracts.filter((contract) =>
      [contract.playerName, contract.position, contract.club]
        .some((value) => String(value ?? "").toLocaleLowerCase("ar").includes(query))
    );
    contractsCount.textContent = filteredContracts.length + " من " + activeContracts.length + " عقد نشط";
    if (activeContracts.length === 0) {
      contractList.replaceChildren(node("p", "representation-empty", "لسه مفيش عقود تمثيل موقعة. اختار لاعب من قائمة الاستقطاب وابدأ التفاوض."));
      return;
    }
    if (filteredContracts.length === 0) {
      contractList.replaceChildren(emptyResults(
        "مش لاقيين عميل مطابق",
        "جرّب اسم لاعب أو نادي أو مركز مختلف.",
        "مسح البحث",
        () => {
          clientSearch.value = "";
          renderContracts();
          clientSearch.focus();
        }
      ));
      return;
    }
    contractList.replaceChildren(...filteredContracts.map((contract) => {
      const row = node("article", "representation-row representation-contract-row");
      const copy = node("div", "representation-copy");
      const effectiveExpiry = getRepresentationContractExpiry(contract);
      const commissionRate = getRepresentationContractCommission(contract, context.save.world.currentDate);
      const representationType = getRepresentationContractType(contract, context.save.world.currentDate);
      const relationshipLabel = getRepresentationRelationshipLabel(contract.relationshipScore);
      const remainingDays = Math.round((Date.parse(effectiveExpiry + "T00:00:00.000Z") -
        Date.parse(context.save.world.currentDate + "T00:00:00.000Z")) / 86400000);
      const hasOpenRenewal = openOffers.some((offer) =>
        offer.kind === "renewal" && offer.renewalContractId === contract.id
      );
      copy.append(
        node("strong", "", contract.playerName),
        node("span", "", contract.position + " · " + contract.club + " · " + contract.age + " سنة"),
        node("small", "", (representationType === "exclusive" ? "تمثيل حصري" : "تمثيل غير حصري") +
          " · عمولتك " + commissionRate + "% · حتى " + formatHomeDate(effectiveExpiry)),
        node("small", "", "الثقة " + contract.relationshipScore + "/100 · العلاقة " + relationshipLabel),
        node("small", "", hasOpenRenewal
          ? "يوجد تفاوض تجديد مفتوح"
          : remainingDays <= 90
            ? "متبقي " + Math.max(0, remainingDays) + " يومًا · متاح للتجديد"
            : "متبقي " + remainingDays + " يومًا على العقد")
      );
      const actions = node("div", "representation-actions");
      actions.append(actionButton("ملف العميل", "button-outline representation-client-dossier-button", () => context.openRepresentationClientDossier(contract.id)));
      actions.append(actionButton("رسالة", "button-outline representation-message-button", () => context.sendRepresentationInteraction(contract.id, "message")));
      actions.append(actionButton("اتصال", "button-outline representation-call-button", () => context.sendRepresentationInteraction(contract.id, "call")));
      actions.append(actionButton("اجتماع", "button-outline representation-meeting-button", () => context.openRepresentationMeeting(contract.id)));
      if (remainingDays >= 1 && remainingDays <= 90 && !hasOpenRenewal) {
        actions.append(actionButton("تجديد العقد", "button-primary representation-renew-button", () => context.openRepresentationRenewal(contract.id)));
      }
      actions.append(actionButton("إنهاء التمثيل", "button-outline representation-terminate-button", () => context.terminateRepresentationContract(contract.id)));
      row.append(copy, actions);
      return row;
    }));
  };
  clientSearch.addEventListener("input", renderContracts);
  renderContracts();
  contractsPanel.append(clientToolbar, contractList);

  const interactionsPanel = node("section", "surface-card representation-panel representation-interactions-panel");
  const interactionsHeading = node("div", "representation-heading");
  interactionsHeading.append(
    node("h2", "", "الرسائل والمواعيد"),
    node("span", "representation-count", openInteractions.length + " متابعة مفتوحة")
  );
  interactionsPanel.append(interactionsHeading);
  if (openInteractions.length === 0) {
    interactionsPanel.append(node("p", "representation-empty", "مفيش رسائل مستنية رد أو اجتماعات مجدولة. ابعت رسالة أو حدد اجتماع من بطاقة العميل."));
  } else {
    const followupList = node("div", "representation-list");
    openInteractions.forEach((interaction) => {
      const row = node("article", "representation-row representation-interaction-row");
      const copy = node("div", "representation-copy");
      const kindLabel = interaction.kind === "meeting" ? "اجتماع" : interaction.kind === "call" ? "مكالمة" : "رسالة";
      const stateLabel = interaction.kind === "meeting"
        ? "موعد الاجتماع " + formatHomeDate(interaction.dueDate)
        : "موعد الرد المتوقع " + formatHomeDate(interaction.dueDate);
      copy.append(
        node("strong", "", interaction.playerName + " · " + kindLabel),
        node("span", "", stateLabel),
        node("small", "", interaction.status === "scheduled"
          ? "الاجتماع متحدد؛ سجل نتيجته من يوم الموعد وحتى 7 أيام بعده."
          : "بانتظار رد اللاعب. الرد هيتسجل تلقائيًا عند تقدم التاريخ.")
      );
      row.append(copy);
      if (interaction.kind === "meeting" && context.save.world.currentDate >= interaction.dueDate) {
        row.append(actionButton("تسجيل نتيجة الاجتماع", "button-primary representation-meeting-complete-button", () => context.openRepresentationMeetingOutcome(interaction.id)));
      }
      followupList.append(row);
    });
    interactionsPanel.append(followupList);
  }
  const recentInteractions = interactions.filter((item) => item.status === "resolved" || item.status === "missed").slice(0, 5);
  if (recentInteractions.length > 0) {
    interactionsPanel.append(node("p", "representation-intro", "آخر التفاعلات"));
    const recentList = node("div", "representation-history-list");
    recentInteractions.forEach((interaction) => {
      const outcomeLabel = interaction.status === "missed"
        ? "اجتماع فائت"
        : interaction.kind === "meeting"
          ? interaction.outcome === "positive" ? "اجتماع ناجح" : interaction.outcome === "neutral" ? "اجتماع محايد" : "اجتماع سلبي"
          : interaction.outcome === "positive" ? "رد إيجابي" : interaction.outcome === "neutral" ? "رد محايد" : "رد سلبي";
      const row = node("div", "representation-history-row");
      row.append(
        node("strong", "", outcomeLabel),
        node("span", "", interaction.playerName + " · " + formatHomeDate(interaction.resolvedDate))
      );
      recentList.append(row);
    });
    interactionsPanel.append(recentList);
  }

  const offersPanel = node("section", "surface-card representation-panel");
  const offersHeading = node("div", "representation-heading");
  offersHeading.append(
    node("h2", "", "التفاوض والعروض"),
    node("span", "representation-count", openOffers.length + " عرض مفتوح")
  );
  offersPanel.append(offersHeading);
  const offerList = node("div", "representation-list");
  if (openOffers.length === 0) {
    offerList.append(node("p", "representation-empty", "لا توجد عروض معلقة. العروض الجديدة هتظهر هنا لمتابعة رد اللاعب."));
  } else {
    openOffers.forEach((offer) => {
      const row = node("article", offer.status === "countered"
        ? "representation-row representation-offer-row is-countered"
        : "representation-row representation-offer-row");
      const copy = node("div", "representation-copy");
      const profile = offer.playerPreferences ?? getPlayerRepresentationProfile({
        id: offer.playerId, age: offer.age, rating: offer.rating, potential: offer.potential
      });
      const personality = personalityLabels[profile.personality] ?? "متوازن";
      copy.append(
        node("strong", "", offer.playerName + (offer.kind === "renewal" ? " · تجديد عقد" : "")),
        node("span", "", "عرض الوكالة: عمولة " + offer.commissionRate + "% · " + Math.round(offer.termDays / 365) + " سنة"),
        node("small", "", offer.status === "countered"
          ? "اللاعب يطلب: عمولة " + offer.counterOffer.commissionRate + "% · " + Math.round(offer.counterOffer.termDays / 365) + " سنة"
          : "بانتظار رد اللاعب · صالح حتى " + formatHomeDate(offer.expiresDate)),
        node("small", "", "شخصية " + personality + " · الجولة " + offer.round + " من 3")
      );
      const actions = node("div", "representation-actions");
      if (offer.status === "pending") {
        actions.append(actionButton("متابعة رد اللاعب", "button-outline representation-evaluate-button", () => context.evaluateRepresentationOffer(offer.id)));
        actions.append(actionButton("سحب العرض", "button-outline representation-reject-button", () => context.rejectRepresentationOffer(offer.id)));
      } else {
        actions.append(actionButton(offer.kind === "renewal" ? "قبول شروط التجديد" : "قبول شروط اللاعب", "button-primary representation-accept-button", () => context.acceptRepresentationCounter(offer.id)));
        actions.append(actionButton("عرض مضاد", "button-outline representation-counter-button", () => context.openRepresentationCounter(offer.id)));
        actions.append(actionButton("رفض العرض", "button-outline representation-reject-button", () => context.rejectRepresentationOffer(offer.id)));
      }
      row.append(copy, actions);
      offerList.append(row);
    });
  }
  offersPanel.append(offerList);

  const prospectsPanel = node("section", "surface-card representation-panel");
  const prospectsHeading = node("div", "representation-heading");
  prospectsHeading.append(
    node("h2", "", "استقطاب لاعبين"),
    node("span", "representation-count", prospects.length + " لاعب متاح")
  );
  prospectsPanel.append(
    prospectsHeading,
    node("p", "representation-intro", "كل لاعب له شخصية وطموح وولاء واحترافية تؤثر على عمولته والمدة التي يقبلها.")
  );
  const prospectToolbar = node("div", "representation-prospect-toolbar");
  const prospectSearch = node("input", "search-input");
  prospectSearch.type = "search";
  prospectSearch.placeholder = "ابحث عن لاعب بالاسم أو النادي أو المركز...";
  prospectSearch.setAttribute("aria-label", "البحث عن لاعب لضمّه");
  const prospectSort = node("select", "filter-select");
  prospectSort.setAttribute("aria-label", "ترتيب اللاعبين المتاحين");
  [
    ["potential", "الأعلى إمكانيات"],
    ["rating", "الأعلى تقييمًا"],
    ["youngest", "الأصغر سنًا"]
  ].forEach(([value, label]) => {
    const option = node("option", "", label);
    option.value = value;
    prospectSort.append(option);
  });
  const prospectCount = node("span", "representation-count", "");
  prospectCount.setAttribute("aria-live", "polite");
  prospectToolbar.append(prospectSearch, prospectSort, prospectCount);

  const prospectGrid = node("div", "representation-prospect-grid");
  const renderProspects = () => {
    const query = prospectSearch.value.trim().toLocaleLowerCase("ar");
    const filtered = prospects.filter((player) =>
      [player.name, player.club, player.position, player.country, player.league]
        .some((value) => String(value ?? "").toLocaleLowerCase("ar").includes(query))
    );
    filtered.sort((a, b) => {
      if (prospectSort.value === "rating") return b.rating - a.rating || b.potential - a.potential;
      if (prospectSort.value === "youngest") return a.age - b.age || b.potential - a.potential;
      return b.potential - a.potential || b.rating - a.rating;
    });
    prospectCount.textContent = formatHomeNumber(filtered.length) + " لاعب";
    if (filtered.length === 0) {
      prospectGrid.replaceChildren(emptyResults(
        "مش لاقيين لاعب مطابق",
        "غيّر كلمة البحث أو امسحها لعرض كل اللاعبين المتاحين.",
        "مسح البحث",
        () => {
          prospectSearch.value = "";
          renderProspects();
          prospectSearch.focus();
        }
      ));
      return;
    }
    prospectGrid.replaceChildren(...filtered.map((player) => {
      const profile = getPlayerRepresentationProfile(player);
      const card = node("article", "representation-prospect-card");
      const portrait = node("div", "representation-prospect-portrait");
      portrait.append(playerArt(player));
      const copy = node("div", "representation-copy");
      copy.append(
        node("strong", "", player.name),
        node("span", "", player.position + " · " + player.club),
        node("small", "", player.age + " سنة · تقييم " + player.rating + " · إمكانيات " + player.potential),
        node("small", "", "شخصية " + personalityLabels[profile.personality] +
          " · طموح " + profile.ambition + "/5 · ولاء " + profile.loyalty + "/5"),
        node("small", "", "احترافية " + profile.professionalism + "/5")
      );
      card.append(
        portrait,
        copy,
        actionButton("عرض تمثيل", "button-primary representation-offer-button", () => context.openRepresentationOffer(player))
      );
      return card;
    }));
  };
  prospectSearch.addEventListener("input", renderProspects);
  prospectSort.addEventListener("change", renderProspects);
  renderProspects();
  prospectsPanel.append(prospectToolbar, prospectGrid);

  const historyPanel = node("section", "surface-card representation-panel");
  const historyHeading = node("div", "representation-heading");
  historyHeading.append(
    node("h2", "", "سجل التعاملات"),
    node("span", "representation-count", representation.history.length + " سجل")
  );
  historyPanel.append(historyHeading);
  if (representation.history.length === 0) {
    historyPanel.append(node("p", "representation-empty", "كل عرض أو تفاوض أو توقيع هيتسجل هنا."));
  } else {
    const historyList = node("div", "representation-history-list");
    historyPanel.append(historyList);
    representation.history.slice(0, 10).forEach((entry) => {
      const row = node("div", "representation-history-row");
      const labels = {
        "offer-sent": "إرسال عرض",
        "player-countered": "عرض مضاد من اللاعب",
        "agency-countered": "عرض مضاد من الوكالة",
        "offer-accepted": "قبول العرض",
        "offer-rejected": "رفض العرض",
        "offer-expired": "انتهاء صلاحية العرض",
        "contract-signed": "توقيع عقد",
        "contract-renewed": "تجديد عقد",
        "renewal-offer-sent": "إرسال عرض تجديد",
        "message-sent": "إرسال رسالة",
        "message-replied": "رد اللاعب",
        "meeting-scheduled": "تحديد اجتماع",
        "meeting-completed": "إنهاء اجتماع",
        "meeting-missed": "اجتماع فائت",
        "contract-terminated": "إنهاء عقد",
        "contract-expired": "انتهاء عقد"
      };
      row.append(
        node("strong", "", labels[entry.type] ?? entry.type),
        node("span", "", entry.playerName + " · " + formatHomeDate(entry.date)),
        node("small", "", entry.note)
      );
      historyList.append(row);
    });
  }

  const roadmap = node("section", "surface-card roadmap-card");
  roadmap.append(
    node("h2", "", "تطور الوكالة"),
    roadmapRow("تأسيس الوكالة", "تم إعداد البنية الأساسية", true),
    roadmapRow("اكتشاف المواهب", "شبكة الكشافين والبعثات معتمدة", true),
    roadmapRow("عقود التمثيل", "المرحلة الحالية", true),
    roadmapRow("سوق الانتقالات والتفاوض مع الأندية", "المرحلة الثامنة", false)
  );
  page.append(overview, cards, talentPipelinePanel, staffAssignmentsPanel, contractsPanel, interactionsPanel, offersPanel, prospectsPanel, historyPanel, roadmap);
  return page;
}

function roadmapRow(title, detail, active) {
  const row = node("div", "roadmap-row");
  row.append(node("span", active ? "roadmap-dot is-active" : "roadmap-dot"), node("div", "roadmap-copy"));
  row.children[1].append(node("strong", "", title), node("span", "", detail));
  return row;
}

export function mountApp(root) {
  const loaded = readSave();
  const save = loaded.status === "loaded" ? loaded.save : createInitialSave();
  const loadedWatchlist = readWatchlist();
  const state = {
    view: "dashboard",
    save,
    isSaved: loaded.status === "loaded" && !loaded.migrated,
    canWrite: loaded.status === "new" || loaded.status === "loaded",
    watchlist: new Set(loadedWatchlist.ids),
    canPersistWatchlist: loadedWatchlist.status === "new" || loadedWatchlist.status === "loaded",
    toastMessage: "",
    toastTimer: null
  };

  function toast(message) {
    state.toastMessage = message;
    let toastElement = root.querySelector(".toast-message");
    if (!toastElement) {
      toastElement = node("div", "toast-message");
      toastElement.setAttribute("role", "status");
      toastElement.setAttribute("aria-live", "polite");
      root.append(toastElement);
    }
    toastElement.textContent = message;
    if (state.toastTimer) clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => {
      state.toastMessage = "";
      root.querySelector(".toast-message")?.remove();
    }, 2800);
  }

  function addToWatchlist(player) {
    if (state.watchlist.has(player.id)) return true;
    state.watchlist.add(player.id);

    if (!state.canPersistWatchlist) {
      toast("تمت الإضافة لهذه الجلسة فقط؛ لم نكتب فوق ملف قائمة متابعة غير صالح أو غير متاح.");
      return true;
    }

    try {
      writeWatchlist([...state.watchlist]);
      toast("تمت إضافة " + player.name + " لقائمة المتابعة.");
      return true;
    } catch (error) {
      state.watchlist.delete(player.id);
      toast("تعذر حفظ قائمة المتابعة: " + error.message);
      return false;
    }
  }

  function signScoutingContract(scoutId) {
    if (!state.canWrite) { toast("ملف الحفظ غير قابل للتعديل؛ لم نوقّع عقدًا."); return; }
    const previousSave = state.save;
    const result = signScoutingContractInEngine(state.save, scoutId);
    if (!result.changed) { toast(result.error); return; }
    state.save = result.save;
    if (saveCareer()) { render(); toast("تم توقيع العقد السنوي مقابل " + formatMoney(result.fee) + " حتى " + formatHomeDate(result.contractExpiresOn) + "."); } else state.save = previousSave;
  }

  function manageTalentProspect(player) {
    if (!state.canWrite) { toast("ملف الحفظ غير قابل للتعديل؛ لم نغيّر صندوق المواهب."); return; }
    const existing = getTalentProspect(state.save.agency.talentPipeline, player.id);
    const form = node("div", "talent-prospect-form");
    const intro = node("p", "modal-copy", "سجّل مرحلة اللاعب وملاحظاتك وموعد المتابعة القادم. الملف يظل مرتبطًا بمعرّف اللاعب نفسه.");
    const stage = node("select", "filter-select");
    stage.setAttribute("aria-label", "مرحلة متابعة اللاعب");
    [
      ["discovered", "مكتشف"],
      ["shortlisted", "قائمة المتابعة"],
      ["contacted", "تم التواصل"],
      ["archived", "أرشفة الملف"]
    ].forEach(([value, label]) => {
      const option = node("option", "", label);
      option.value = value;
      stage.append(option);
    });
    stage.value = existing?.stage ?? "shortlisted";
    const assignedStaff = node("select", "filter-select");
    assignedStaff.setAttribute("aria-label", "مسؤول ملف اللاعب");
    const unassignedOption = node("option", "", "بدون مسؤول استقطاب");
    unassignedOption.value = "";
    assignedStaff.append(unassignedOption);
    const roster = getScoutingRoster(state.save.world.scouting, state.save.world.currentDate);
    const pipelineEntries = state.save.agency.talentPipeline?.entries ?? [];
    const activeClientIds = new Set(state.save.agency.clients);
    state.save.agency.representation.contracts
      .filter((contract) => contract.status === "active")
      .forEach((contract) => activeClientIds.add(contract.playerId));
    roster.forEach((scout) => {
      const load = pipelineEntries.filter((entry) =>
        entry.assignedScoutId === scout.id &&
        entry.playerId !== player.id &&
        entry.stage !== "archived" &&
        !activeClientIds.has(entry.playerId)
      ).length;
      const option = node("option", "", scout.name + " · " + load + "/" + MAX_PROSPECTS_PER_SCOUT +
        (scout.isContractExpired ? " · عقد منتهٍ" : scout.isBusy ? " · في بعثة" : ""));
      option.value = scout.id;
      option.disabled = scout.isContractExpired || (load >= MAX_PROSPECTS_PER_SCOUT && existing?.assignedScoutId !== scout.id);
      assignedStaff.append(option);
    });
    assignedStaff.value = existing?.assignedScoutId ?? "";
    assignedStaff.disabled = stage.value === "archived";
    const note = node("textarea", "search-input");
    note.setAttribute("aria-label", "ملاحظات الوكالة");
    note.maxLength = 500;
    note.rows = 3;
    note.value = existing?.note ?? "";
    note.placeholder = "اكتب ملخص المكالمة أو المطلوب في الخطوة القادمة...";
    const followUp = node("input", "search-input");
    followUp.type = "date";
    followUp.setAttribute("aria-label", "موعد المتابعة القادمة");
    followUp.min = state.save.world.currentDate;
    followUp.value = existing?.nextFollowUpDate ?? "";
    const addField = (label, control) => {
      const wrapper = node("label", "scout-form-field representation-form-field");
      wrapper.append(node("span", "", label), control);
      form.append(wrapper);
    };
    addField("مرحلة اللاعب", stage);
    addField("مسؤول ملف اللاعب", assignedStaff);
    addField("موعد المتابعة القادمة", followUp);
    addField("ملاحظات الوكالة", note);
    stage.addEventListener("change", () => {
      if (stage.value === "archived") assignedStaff.value = "";
      assignedStaff.disabled = stage.value === "archived";
    });
    const saveButton = actionButton("حفظ متابعة المواهب", "button-primary talent-prospect-save-button", () => {
      const sourceIds = [...(existing?.sourceIds ?? [])];
      const hasScoutingRecord = (state.save.world.scouting?.reports ?? [])
        .some((report) => (report.findings ?? []).some((finding) => finding.playerId === player.id)) ||
        (state.save.world.scouting?.observations ?? []).some((item) => item.playerId === player.id);
      if (hasScoutingRecord) sourceIds.push("scouting");
      if (state.watchlist.has(player.id)) sourceIds.push("watchlist");
      if (sourceIds.length === 0) sourceIds.push("manual");
      const previousSave = state.save;
      const result = upsertTalentProspect(state.save, player, {
        sourceIds: [...new Set(sourceIds)],
        stage: stage.value,
        note: note.value,
        nextFollowUpDate: followUp.value || null
      });
      if (!result.changed) { toast(result.error); return; }
      const assignment = assignTalentProspectStaff(
        result.save,
        player.id,
        stage.value === "archived" ? null : (assignedStaff.value || null)
      );
      if (assignment.error) { toast(assignment.error); return; }
      state.save = assignment.changed ? assignment.save : result.save;
      if (saveCareer()) {
        root.querySelector(".modal-overlay .icon-button")?.click();
        render();
        toast("تم حفظ متابعة " + player.name + " في صندوق المواهب.");
      } else state.save = previousSave;
    });
    form.append(intro, saveButton);
    openModal("متابعة لاعب في صندوق المواهب", [form], "إلغاء");
  }


  function manageTalentContact(player, sourceIds = []) {
    if (!state.canWrite) { toast("ملف الحفظ غير قابل للتعديل؛ لم نسجل التواصل."); return; }
    const existing = getTalentProspect(state.save.agency.talentPipeline, player.id);
    const form = node("div", "talent-prospect-form talent-contact-form");
    form.append(node("p", "modal-copy",
      "سجّل مكالمة أو رسالة أو اجتماعًا أوليًا. ده نشاط متابعة فقط، ومش بيحوّل اللاعب لعميل أو ينشئ عقد تمثيل."));
    const kind = node("select", "filter-select");
    kind.setAttribute("aria-label", "طريقة التواصل");
    [["message", "رسالة"], ["call", "مكالمة"], ["meeting", "اجتماع أولي"]].forEach(([value, label]) => {
      const option = node("option", "", label);
      option.value = value;
      kind.append(option);
    });
    const outcome = node("select", "filter-select");
    outcome.setAttribute("aria-label", "نتيجة التواصل");
    [
      ["pending", "بانتظار الرد"],
      ["positive", "رد إيجابي"],
      ["neutral", "رد محايد"],
      ["negative", "رد سلبي"],
      ["no_response", "لم يرد"]
    ].forEach(([value, label]) => {
      const option = node("option", "", label);
      option.value = value;
      outcome.append(option);
    });
    const followUp = node("input", "search-input");
    followUp.type = "date";
    followUp.setAttribute("aria-label", "موعد المتابعة القادمة");
    followUp.min = state.save.world.currentDate;
    followUp.value = shiftCalendarDate(state.save.world.currentDate, 3);
    const note = node("textarea", "search-input");
    note.setAttribute("aria-label", "ملخص التواصل");
    note.maxLength = 500;
    note.rows = 3;
    note.value = "";
    note.placeholder = "اكتب رد اللاعب أو ملخص المكالمة والخطوة التالية...";
    const addField = (label, control) => {
      const wrapper = node("label", "scout-form-field representation-form-field");
      wrapper.append(node("span", "", label), control);
      form.append(wrapper);
    };
    addField("طريقة التواصل", kind);
    addField("نتيجة التواصل", outcome);
    addField("موعد المتابعة القادمة", followUp);
    addField("ملخص التواصل", note);
    const updateFollowUpRequirement = () => {
      followUp.required = outcome.value === "pending";
      followUp.disabled = outcome.value === "no_response" && !followUp.value;
      if (outcome.value === "pending" && !followUp.value) {
        followUp.value = shiftCalendarDate(state.save.world.currentDate, 3);
      }
    };
    outcome.addEventListener("change", updateFollowUpRequirement);
    updateFollowUpRequirement();
    const saveButton = actionButton("حفظ التواصل في سجل اللاعب", "button-primary talent-prospect-save-button", () => {
      const previousSave = state.save;
      const inferredSources = [...(existing?.sourceIds ?? []), ...sourceIds];
      const hasScoutingRecord = (state.save.world.scouting?.reports ?? [])
        .some((report) => (report.findings ?? []).some((finding) => finding.playerId === player.id)) ||
        (state.save.world.scouting?.observations ?? []).some((item) => item.playerId === player.id);
      if (hasScoutingRecord) inferredSources.push("scouting");
      if (state.watchlist.has(player.id)) inferredSources.push("watchlist");
      const result = recordTalentProspectContact(state.save, player, {
        sourceIds: [...new Set(inferredSources.length ? inferredSources : ["manual"])],
        kind: kind.value,
        outcome: outcome.value,
        followUpDate: followUp.value || null,
        note: note.value
      });
      if (!result.changed) { toast(result.error); return; }
      state.save = result.save;
      if (saveCareer()) {
        root.querySelector(".modal-overlay .icon-button")?.click();
        render();
        toast("تم تسجيل " + (kind.value === "call" ? "المكالمة" : kind.value === "meeting" ? "الاجتماع" : "الرسالة") + " مع " + player.name + ".");
      } else state.save = previousSave;
    });
    form.append(saveButton);
    openModal("تواصل أولي مع " + player.name, [form], "إلغاء");
  }

  function openTalentProspectHistory(player) {
    const entry = getTalentProspect(state.save.agency.talentPipeline, player.id);
    const activity = [...(entry?.activity ?? [])].reverse();
    const stageLabels = {
      discovered: "مكتشف",
      shortlisted: "قائمة المتابعة",
      contacted: "تم التواصل",
      archived: "مؤرشف"
    };
    const kindLabels = { call: "مكالمة", message: "رسالة", meeting: "اجتماع أولي" };
    const outcomeLabels = {
      pending: "بانتظار الرد",
      positive: "رد إيجابي",
      neutral: "رد محايد",
      negative: "رد سلبي",
      no_response: "لم يرد"
    };
    const staffRoster = getScoutingRoster(state.save.world.scouting, state.save.world.currentDate);
    const staffName = (staffId) => staffRoster.find((scout) => scout.id === staffId)?.name ?? "عضو سابق";
    const body = node("div", "talent-activity-history");
    if (!entry || activity.length === 0) {
      body.append(node("p", "representation-empty", "لا يوجد نشاط مسجل لهذا اللاعب حتى الآن."));
    } else {
      activity.forEach((event) => {
        const row = node("article", "talent-activity-row");
        const title = event.type === "stage"
          ? "تغيير المرحلة: " + (stageLabels[event.fromStage] ?? "بداية الملف") + " ← " + stageLabels[event.toStage]
          : event.type === "assignment"
            ? "تغيير مسؤول الملف: " + (event.fromScoutId ? staffName(event.fromScoutId) : "بدون مسؤول") +
              " ← " + (event.toScoutId ? staffName(event.toScoutId) : "بدون مسؤول")
            : event.type === "follow-up-reviewed"
              ? "إتمام مراجعة المتابعة"
              : event.type === "contact"
                ? "تواصل " + kindLabels[event.kind] + " · " + outcomeLabels[event.outcome]
                : "نشاط الوكالة";
        row.append(
          node("strong", "", title),
          node("small", "", formatHomeDate(event.date))
        );
        if (event.note) row.append(node("p", "", event.note));
        if (event.type === "contact" && event.followUpDate) {
          row.append(node("small", "talent-pipeline-followup", "المتابعة القادمة " + formatHomeDate(event.followUpDate)));
        }
        body.append(row);
      });
    }
    openModal("سجل نشاط " + player.name, [body], "إغلاق");
  }

  function openRepresentationOffer(player) {
    if (!state.canWrite) { toast("ملف الحفظ غير قابل للتعديل؛ لم نرسل عرضًا."); return; }
    const form = node("div", "representation-offer-form");
    const intro = node("p", "modal-copy", "عرض تمثيل للاعب " + player.name + ". العمولة نسبة من دخل اللاعب المستقبلي، وليست خصمًا فوريًا من رصيد الوكالة.");
    const commission = node("select", "filter-select");
    commission.setAttribute("aria-label", "نسبة العمولة");
    for (let rate = 5; rate <= 15; rate += 1) {
      const option = node("option", "", rate + "%");
      option.value = String(rate);
      commission.append(option);
    }
    commission.value = "10";
    const duration = node("select", "filter-select");
    duration.setAttribute("aria-label", "مدة العقد");
    [[365, "سنة واحدة"], [730, "سنتان"], [1095, "ثلاث سنوات"]].forEach(([days, label]) => {
      const option = node("option", "", label);
      option.value = String(days);
      duration.append(option);
    });
    duration.value = player.age <= 20 ? "365" : "730";
    const representationType = node("select", "filter-select");
    representationType.setAttribute("aria-label", "نوع التمثيل");
    [["exclusive", "تمثيل حصري"], ["non-exclusive", "تمثيل غير حصري"]].forEach(([value, label]) => {
      const option = node("option", "", label);
      option.value = value;
      representationType.append(option);
    });
    representationType.value = getPlayerRepresentationProfile(player).prefersExclusive ? "exclusive" : "non-exclusive";
    const addField = (label, control) => {
      const wrapper = node("label", "scout-form-field representation-form-field");
      wrapper.append(node("span", "", label), control);
      form.append(wrapper);
    };
    addField("نسبة عمولة الوكالة", commission);
    addField("مدة التمثيل", duration);
    addField("نوع التمثيل", representationType);
    form.append(
      intro,
      node("p", "representation-form-note", "سيتم تسجيل العرض، وبعدها تقدر تراجع رد اللاعب أو شروطه المضادة. لا توجد عمولة محصلة قبل وجود دخل فعلي للاعب.")
    );
    const submit = actionButton("إرسال عرض التمثيل", "scout-confirm-button representation-send-button", () => {
      const previousSave = state.save;
      const result = createRepresentationOfferInEngine(state.save, player, {
        commissionRate: Number(commission.value),
        termDays: Number(duration.value),
        representationType: representationType.value
      });
      if (!result.changed) { toast(result.error); return; }
      state.save = result.save;
      if (saveCareer()) {
        render();
        toast("تم إرسال عرض التمثيل إلى " + player.name + ".");
      } else state.save = previousSave;
    });
    form.append(submit);
    openModal("عرض تمثيل جديد", [form], "إغلاق");
  }

  function openRepresentationCounter(offerId) {
    if (!state.canWrite) { toast("ملف الحفظ غير قابل للتعديل؛ لا يمكن إرسال عرض مضاد."); return; }
    const offer = state.save.agency.representation.offers.find((item) => item.id === offerId);
    if (!offer || offer.status !== "countered") { toast("عرض التفاوض لم يعد مفتوحًا."); return; }
    const form = node("div", "representation-offer-form");
    const commission = node("select", "filter-select");
    commission.setAttribute("aria-label", "نسبة العمولة في العرض المضاد");
    for (let rate = 5; rate <= 15; rate += 1) {
      const option = node("option", "", rate + "%");
      option.value = String(rate);
      commission.append(option);
    }
    commission.value = String(offer.commissionRate);
    const duration = node("select", "filter-select");
    duration.setAttribute("aria-label", "مدة العرض المضاد");
    [[365, "سنة واحدة"], [730, "سنتان"], [1095, "ثلاث سنوات"]].forEach(([days, label]) => {
      const option = node("option", "", label);
      option.value = String(days);
      duration.append(option);
    });
    duration.value = String(offer.counterOffer.termDays);
    const representationType = node("select", "filter-select");
    representationType.setAttribute("aria-label", "نوع التمثيل في العرض المضاد");
    [["exclusive", "تمثيل حصري"], ["non-exclusive", "تمثيل غير حصري"]].forEach(([value, label]) => {
      const option = node("option", "", label);
      option.value = value;
      representationType.append(option);
    });
    representationType.value = offer.counterOffer.representationType ?? offer.representationType ?? "exclusive";
    const addField = (label, control) => {
      const wrapper = node("label", "scout-form-field representation-form-field");
      wrapper.append(node("span", "", label), control);
      form.append(wrapper);
    };
    addField("العمولة المقترحة من الوكالة", commission);
    addField("مدة العقد المقترحة", duration);
    addField("نوع التمثيل المقترح", representationType);
    form.append(
      node("p", "representation-form-note", "دي الجولة " + offer.round + " من 3. اللاعب ممكن يقبل أو يرد بعرض أخير أو يرفض التفاوض.")
    );
    form.append(actionButton("إرسال العرض المضاد", "scout-confirm-button representation-send-button", () => {
      const previousSave = state.save;
      const result = submitRepresentationCounterOfferInEngine(state.save, offer.id, {
        commissionRate: Number(commission.value),
        termDays: Number(duration.value),
        representationType: representationType.value
      });
      if (!result.changed) { toast(result.error); return; }
      state.save = result.save;
      if (saveCareer()) {
        render();
        toast(result.status === "signed"
          ? "وافق اللاعب وتم توقيع عقد التمثيل."
          : result.status === "renewed"
            ? "وافق اللاعب وتم تجديد عقد التمثيل."
            : result.status === "rejected"
              ? "رفض اللاعب العرض المضاد الأخير."
              : "اللاعب رد بعرض جديد. راجع شروطه.");
      } else state.save = previousSave;
    }));
    openModal("التفاوض على الشروط", [form], "إغلاق");
  }

  function openRepresentationRenewal(contractId) {
    if (!state.canWrite) { toast("ملف الحفظ غير قابل للتعديل؛ لا يمكن فتح التجديد."); return; }
    const contract = state.save.agency.representation.contracts.find((item) => item.id === contractId);
    if (!contract || contract.status !== "active") { toast("العقد لم يعد نشطًا."); return; }
    const form = node("div", "representation-offer-form");
    const commission = node("select", "filter-select");
    commission.setAttribute("aria-label", "عمولة التجديد");
    for (let rate = 5; rate <= 15; rate += 1) {
      const option = node("option", "", rate + "%");
      option.value = String(rate);
      commission.append(option);
    }
    commission.value = String(getRepresentationContractCommission(contract, state.save.world.currentDate));
    const duration = node("select", "filter-select");
    duration.setAttribute("aria-label", "مدة التجديد");
    [[365, "سنة إضافية"], [730, "سنتان إضافيتان"], [1095, "ثلاث سنوات إضافية"]].forEach(([days, label]) => {
      const option = node("option", "", label);
      option.value = String(days);
      duration.append(option);
    });
    duration.value = "730";
    const representationType = node("select", "filter-select");
    representationType.setAttribute("aria-label", "نوع التمثيل بعد التجديد");
    [["exclusive", "تمثيل حصري"], ["non-exclusive", "تمثيل غير حصري"]].forEach(([value, label]) => {
      const option = node("option", "", label);
      option.value = value;
      representationType.append(option);
    });
    representationType.value = getRepresentationContractType(contract, state.save.world.currentDate);
    form.append(
      node("p", "modal-copy", "تجديد عقد " + contract.playerName + ". مدة التجديد تبدأ بعد نهاية المدة الحالية ولا تلغي تاريخ العقد الأصلي."),
    );
    const addField = (label, control) => {
      const wrapper = node("label", "scout-form-field representation-form-field");
      wrapper.append(node("span", "", label), control);
      form.append(wrapper);
    };
    addField("عمولة التجديد", commission);
    addField("مدة التجديد", duration);
    addField("نوع التمثيل بعد التجديد", representationType);
    form.append(actionButton("إرسال عرض التجديد", "scout-confirm-button representation-send-button", () => {
      const previousSave = state.save;
      const result = createRepresentationRenewalOfferInEngine(state.save, contract.id, {
        commissionRate: Number(commission.value),
        termDays: Number(duration.value),
        representationType: representationType.value
      });
      if (!result.changed) { toast(result.error); return; }
      state.save = result.save;
      if (saveCareer()) {
        render();
        toast("تم إرسال عرض تجديد عقد " + contract.playerName + ".");
      } else state.save = previousSave;
    }));
    openModal("تجديد عقد التمثيل", [form], "إغلاق");
  }

  function openRepresentationClientDossier(contractId) {
    const representation = state.save.agency.representation;
    const contract = representation.contracts.find((item) => item.id === contractId);
    if (!contract) { toast("ملف العميل غير موجود في سجل الوكالة."); return; }

    const currentDate = state.save.world.currentDate;
    const offer = representation.offers.find((item) => item.id === contract.offerId);
    const activeType = getRepresentationContractType(contract, currentDate);
    const activeCommission = getRepresentationContractCommission(contract, currentDate);
    const expiryDate = getRepresentationContractExpiry(contract);
    const remainingDays = Math.max(0, Math.round((Date.parse(expiryDate + "T00:00:00.000Z") -
      Date.parse(currentDate + "T00:00:00.000Z")) / 86400000));
    const interactions = (representation.interactions ?? [])
      .filter((item) => item.contractId === contract.id);
    const pendingInteractions = interactions.filter((item) =>
      ["pending_response", "scheduled"].includes(item.status)
    );
    const renewals = contract.renewals ?? [];
    const playerHistory = representation.history
      .filter((entry) => entry.playerId === contract.playerId)
      .slice(0, 12);

    const content = node("div", "representation-client-dossier");
    const hero = node("section", "representation-dossier-hero");
    hero.append(
      node("span", "agency-label", "ملف عميل الوكالة"),
      node("h3", "", contract.playerName),
      node("p", "", contract.position + " · " + contract.club + " · " + contract.age + " سنة"),
      node("p", "representation-dossier-status", (contract.status === "active" ? "عميل نشط" : "عقد مؤرشف") +
        " · " + (activeType === "exclusive" ? "تمثيل حصري" : "تمثيل غير حصري"))
    );
    content.append(hero);

    const relationship = node("section", "representation-dossier-section");
    relationship.append(
      node("h3", "", "العلاقة والثقة"),
      node("div", "representation-dossier-trust", contract.relationshipScore + "/100"),
      node("p", "representation-intro", "حالة العلاقة: " + getRepresentationRelationshipLabel(contract.relationshipScore)),
      node("p", "representation-intro", "سمعة الوكالة: " + getAgencyReputationScore(representation) + "/100")
    );
    content.append(relationship);

    const termsPanel = node("section", "representation-dossier-section");
    termsPanel.append(node("h3", "", "العقد الحالي"));
    const termsGrid = node("div", "representation-dossier-grid");
    const termCards = [
      ["العمولة السارية", activeCommission + "%"],
      ["تاريخ التوقيع", formatHomeDate(contract.signedOn)],
      ["نهاية العقد", formatHomeDate(expiryDate)],
      ["المتبقي", remainingDays + " يوم"],
      ["نوع التفويض", activeType === "exclusive" ? "حصري" : "غير حصري"],
      ["مدة العقد الأصلية", Math.round(contract.termDays / 365) + " سنة"]
    ];
    termCards.forEach(([label, value]) => {
      const tile = node("div", "representation-dossier-stat");
      tile.append(node("span", "", label), node("strong", "", value));
      termsGrid.append(tile);
    });
    termsPanel.append(termsGrid);
    if (offer) {
      termsPanel.append(node("p", "representation-intro",
        "عرض التمثيل الأصلي: عمولة " + offer.commissionRate + "% · " +
        Math.round(offer.termDays / 365) + " سنة · " + formatHomeDate(offer.createdDate)));
    }
    content.append(termsPanel);

    const renewalsPanel = node("section", "representation-dossier-section");
    renewalsPanel.append(
      node("h3", "", "تاريخ التجديدات"),
      node("span", "representation-count", renewals.length + " تمديد")
    );
    if (renewals.length === 0) {
      renewalsPanel.append(node("p", "representation-empty", "لم يتم تجديد العقد حتى الآن."));
    } else {
      const renewalList = node("div", "representation-history-list");
      renewals.forEach((renewal, index) => {
        const row = node("div", "representation-history-row");
        row.append(
          node("strong", "", "التجديد " + (index + 1)),
          node("span", "", formatHomeDate(renewal.signedOn) + " · يبدأ " + formatHomeDate(renewal.startsOn)),
          node("small", "", (renewal.representationType === "non-exclusive" ? "غير حصري" : "حصري") +
            " · عمولة " + renewal.commissionRate + "% · حتى " + formatHomeDate(renewal.expiresOn))
        );
        renewalList.append(row);
      });
      renewalsPanel.append(renewalList);
    }
    content.append(renewalsPanel);

    const followupsPanel = node("section", "representation-dossier-section");
    followupsPanel.append(
      node("h3", "", "الرسائل والاجتماعات"),
      node("span", "representation-count", pendingInteractions.length + " متابعة مفتوحة")
    );
    if (interactions.length === 0) {
      followupsPanel.append(node("p", "representation-empty", "لسه مفيش رسائل أو مكالمات أو اجتماعات مسجلة."));
    } else {
      const interactionList = node("div", "representation-history-list");
      interactions.slice(0, 12).forEach((interaction) => {
        const kindLabel = interaction.kind === "meeting" ? "اجتماع" : interaction.kind === "call" ? "مكالمة" : "رسالة";
        const statusLabel = interaction.status === "pending_response" ? "بانتظار الرد"
          : interaction.status === "scheduled" ? "موعد مجدول"
            : interaction.status === "missed" ? "موعد فائت"
              : interaction.outcome === "positive" ? "نتيجة إيجابية"
                : interaction.outcome === "neutral" ? "نتيجة محايدة" : "نتيجة سلبية";
        const row = node("div", "representation-history-row");
        row.append(
          node("strong", "", kindLabel + " · " + statusLabel),
          node("span", "", formatHomeDate(interaction.createdDate) + " · الموعد " + formatHomeDate(interaction.dueDate)),
          node("small", "", interaction.resolvedDate
            ? "أُغلقت في " + formatHomeDate(interaction.resolvedDate)
            : "لم تُغلق بعد")
        );
        interactionList.append(row);
      });
      followupsPanel.append(interactionList);
    }
    content.append(followupsPanel);

    const historyPanel = node("section", "representation-dossier-section");
    historyPanel.append(
      node("h3", "", "سجل العلاقة"),
      node("span", "representation-count", playerHistory.length + " حدث حديث")
    );
    if (playerHistory.length === 0) {
      historyPanel.append(node("p", "representation-empty", "لا توجد أحداث محفوظة لهذا العميل."));
    } else {
      const historyList = node("div", "representation-history-list");
      const historyLabels = {
        "offer-sent": "إرسال عرض تمثيل",
        "player-countered": "عرض مضاد من اللاعب",
        "agency-countered": "عرض مضاد من الوكالة",
        "offer-accepted": "قبول الشروط",
        "offer-rejected": "رفض العرض",
        "offer-expired": "انتهاء صلاحية العرض",
        "contract-signed": "توقيع العقد",
        "contract-renewed": "تجديد العقد",
        "renewal-offer-sent": "عرض تجديد",
        "message-sent": "إرسال رسالة",
        "message-replied": "رد اللاعب",
        "meeting-scheduled": "تحديد اجتماع",
        "meeting-completed": "اجتماع مكتمل",
        "meeting-missed": "اجتماع فائت",
        "contract-terminated": "إنهاء التمثيل",
        "contract-expired": "انتهاء العقد"
      };
      playerHistory.forEach((entry) => {
        const row = node("div", "representation-history-row");
        row.append(
          node("strong", "", historyLabels[entry.type] ?? entry.type),
          node("span", "", formatHomeDate(entry.date)),
          node("small", "", entry.note)
        );
        historyList.append(row);
      });
      historyPanel.append(historyList);
    }
    content.append(historyPanel);

    openModal("ملف العميل", [content], "إغلاق");
  }

  function sendRepresentationInteraction(contractId, kind) {
    if (!state.canWrite) { toast("ملف الحفظ غير قابل للتعديل؛ لم نسجل التواصل."); return; }
    const previousSave = state.save;
    const result = createRepresentationInteractionInEngine(state.save, contractId, kind);
    if (!result.changed) { toast(result.error); return; }
    state.save = result.save;
    if (saveCareer()) {
      render();
      toast(kind === "message" ? "تم إرسال رسالة للاعب." : "تم تسجيل المكالمة، والرد هيوصل مع تقدم الأيام.");
    } else state.save = previousSave;
  }

  function openRepresentationMeeting(contractId) {
    if (!state.canWrite) { toast("ملف الحفظ غير قابل للتعديل؛ لا يمكن تحديد اجتماع."); return; }
    const currentDate = state.save.world.currentDate;
    const start = new Date(currentDate + "T00:00:00.000Z");
    const addDays = (days) => {
      const value = new Date(start);
      value.setUTCDate(value.getUTCDate() + days);
      return value.toISOString().slice(0, 10);
    };
    const meetingDate = node("input", "filter-select");
    meetingDate.type = "date";
    meetingDate.setAttribute("aria-label", "موعد الاجتماع");
    meetingDate.min = addDays(1);
    meetingDate.max = addDays(30);
    meetingDate.value = addDays(3);
    const form = node("div", "representation-offer-form");
    const wrapper = node("label", "scout-form-field representation-form-field");
    wrapper.append(node("span", "", "تاريخ الاجتماع"), meetingDate);
    form.append(
      node("p", "modal-copy", "اختار موعد خلال 30 يومًا. لو الاجتماع اتفوت بأكثر من أسبوع، ثقة اللاعب وسمعة الوكالة هيتأثروا."),
      wrapper,
      actionButton("تأكيد الموعد", "scout-confirm-button representation-send-button", () => {
        const previousSave = state.save;
        const result = createRepresentationInteractionInEngine(state.save, contractId, "meeting", meetingDate.value);
        if (!result.changed) { toast(result.error); return; }
        state.save = result.save;
        if (saveCareer()) {
          render();
          toast("تم تحديد الاجتماع يوم " + formatHomeDate(meetingDate.value) + ".");
        } else state.save = previousSave;
      })
    );
    openModal("تحديد اجتماع مع اللاعب", [form], "إغلاق");
  }

  function openRepresentationMeetingOutcome(interactionId) {
    if (!state.canWrite) { toast("ملف الحفظ غير قابل للتعديل؛ لا يمكن تسجيل نتيجة الاجتماع."); return; }
    const interaction = (state.save.agency.representation.interactions ?? []).find((item) => item.id === interactionId);
    if (!interaction || interaction.status !== "scheduled") { toast("الاجتماع لم يعد مجدولًا."); return; }
    const outcome = node("select", "filter-select");
    outcome.setAttribute("aria-label", "نتيجة الاجتماع");
    [["positive", "اجتماع ناجح — زادت الثقة"], ["neutral", "اجتماع عادي — تحسن بسيط"], ["negative", "اجتماع سيئ — تراجعت الثقة"]].forEach(([value, label]) => {
      const option = node("option", "", label);
      option.value = value;
      outcome.append(option);
    });
    const form = node("div", "representation-offer-form");
    const wrapper = node("label", "scout-form-field representation-form-field");
    wrapper.append(node("span", "", "نتيجة اللقاء"), outcome);
    form.append(
      node("p", "modal-copy", "سجل نتيجة اجتماع " + interaction.playerName + ". الاختيار هيؤثر على مستوى الثقة وسمعة الوكالة."),
      wrapper,
      actionButton("حفظ نتيجة الاجتماع", "scout-confirm-button representation-send-button", () => {
        const previousSave = state.save;
        const result = completeRepresentationMeetingInEngine(state.save, interactionId, outcome.value);
        if (!result.changed) { toast(result.error); return; }
        state.save = result.save;
        if (saveCareer()) {
          render();
          toast("تم تسجيل نتيجة الاجتماع وتحديث العلاقة مع اللاعب.");
        } else state.save = previousSave;
      })
    );
    openModal("نتيجة اجتماع اللاعب", [form], "إغلاق");
  }

  function handoffProspectToClientManagement(save, result) {
    if (result.status !== "signed" || !result.contract?.playerId ||
        !getTalentProspect(save.agency.talentPipeline, result.contract.playerId)) return result.save;
    const handoff = handoffTalentProspectToClientManagement(result.save, result.contract.playerId);
    return handoff.changed ? handoff.save : result.save;
  }

  function evaluateRepresentationOffer(offerId) {
    if (!state.canWrite) { toast("ملف الحفظ غير قابل للتعديل؛ لم نتابع التفاوض."); return; }
    const previousSave = state.save;
    const result = evaluateRepresentationOfferInEngine(state.save, offerId);
    if (!result.changed) { toast(result.error); return; }
    state.save = handoffProspectToClientManagement(result.save, result);
    if (saveCareer()) {
      render();
      toast(result.status === "countered"
        ? "اللاعب قدم عرضًا مضادًا. راجع شروطه في قسم التفاوض."
        : result.status === "expired"
          ? "انتهت صلاحية العرض وتم أرشفته."
          : result.status === "renewed"
            ? "اللاعب وافق وتم تجديد عقد التمثيل."
            : "اللاعب وافق، وتم توقيع عقد التمثيل.");
    } else state.save = previousSave;
  }

  function acceptRepresentationCounter(offerId) {
    if (!state.canWrite) { toast("ملف الحفظ غير قابل للتعديل؛ لم نقبل العرض المضاد."); return; }
    const previousSave = state.save;
    const result = acceptRepresentationCounterOfferInEngine(state.save, offerId);
    if (!result.changed) { toast(result.error); return; }
    state.save = handoffProspectToClientManagement(result.save, result);
    if (saveCareer()) {
      render();
      toast(result.status === "renewed"
        ? "تم قبول شروط اللاعب وتجديد عقد التمثيل."
        : "تم قبول شروط اللاعب وتوقيع عقد التمثيل.");
    } else state.save = previousSave;
  }

  function rejectRepresentationOffer(offerId) {
    if (!state.canWrite) { toast("ملف الحفظ غير قابل للتعديل؛ لم نرفض العرض."); return; }
    const previousSave = state.save;
    const result = rejectRepresentationOfferInEngine(state.save, offerId);
    if (!result.changed) { toast(result.error); return; }
    state.save = result.save;
    if (saveCareer()) {
      render();
      toast("تم إغلاق عرض التمثيل دون إضافة عميل.");
    } else state.save = previousSave;
  }

  function terminateRepresentationContract(contractId) {
    if (!state.canWrite) { toast("ملف الحفظ غير قابل للتعديل؛ لم ننهِ العقد."); return; }
    const previousSave = state.save;
    const result = terminateRepresentationContractInEngine(state.save, contractId);
    if (!result.changed) { toast(result.error); return; }
    state.save = result.save;
    if (saveCareer()) {
      render();
      toast("تم إنهاء عقد التمثيل وحفظه في سجل التعاملات.");
    } else state.save = previousSave;
  }

  function renewScoutingContract(scoutId) {
    if (!state.canWrite) { toast("ملف الحفظ غير قابل للتعديل؛ لم نجدد العقد."); return; }
    const previousSave = state.save;
    const result = renewScoutingContractInEngine(state.save, scoutId);
    if (!result.changed) { toast(result.error); return; }
    state.save = result.save;
    if (saveCareer()) { render(); toast("تم تجديد العقد مقابل " + formatMoney(result.fee) + " حتى " + formatHomeDate(result.contractExpiresOn) + "."); } else state.save = previousSave;
  }

  function openScoutingMission() {
    const form = node("div", "scout-launch-form");
    const typeSelect = node("select", "filter-select");
    typeSelect.setAttribute("aria-label", "مستوى البعثة");
    Object.entries(SCOUTING_MISSION_TYPES).forEach(([value, config]) => {
      const option = node("option", "", config.label + " · " + formatMoney(config.cost) + " · " + config.durationDays + " أيام · دقة أساسية " + Math.round(config.accuracy * 100) + "%");
      option.value = value;
      typeSelect.append(option);
    });

    const sourceSelect = node("select", "filter-select");
    sourceSelect.setAttribute("aria-label", "مصدر المواهب");
    SCOUTING_SOURCES.forEach((source) => {
      const option = node("option", "", source.label);
      option.value = source.id;
      sourceSelect.append(option);
    });

    const countrySelect = node("select", "filter-select");
    countrySelect.setAttribute("aria-label", "الدولة المستهدفة");
    const allCountries = node("option", "", "كل الدول");
    allCountries.value = "all";
    countrySelect.append(allCountries);
    WORLD_DATABASE.countries.forEach((country) => {
      const option = node("option", "", country.nameAr);
      option.value = country.id;
      countrySelect.append(option);
    });

    const roleSelect = node("select", "filter-select");
    roleSelect.setAttribute("aria-label", "المركز المستهدف");
    [["all", "كل المراكز"], ["هجوم", "الهجوم"], ["وسط", "الوسط"], ["دفاع", "الدفاع"], ["حراسة", "حراسة المرمى"]].forEach(([value, label]) => {
      const option = node("option", "", label);
      option.value = value;
      roleSelect.append(option);
    });

    const scoutSelect = node("select", "filter-select");
    scoutSelect.setAttribute("aria-label", "الكشاف المكلف");
    const scoutRoster = getScoutingRoster(state.save.world.scouting, state.save.world.currentDate);
    scoutRoster.forEach((scout) => {
      const status = scout.isContractExpired ? " (العقد منتهي)" : scout.isBusy ? " (مشغول)" : "";
      const option = node("option", "", scout.name + " · مستوى " + scout.level + " · " + scout.region + status);
      option.value = scout.id;
      option.disabled = scout.isBusy || scout.isContractExpired;
      scoutSelect.append(option);
    });
    const firstAvailableScout = scoutRoster.find((scout) => !scout.isBusy && !scout.isContractExpired);
    if (firstAvailableScout) scoutSelect.value = firstAvailableScout.id;

    const preview = node("div", "scout-launch-preview");
    const addField = (label, control) => {
      const wrapper = node("label", "scout-form-field");
      wrapper.append(node("span", "", label), control);
      form.append(wrapper);
    };
    addField("مستوى الاستثمار", typeSelect);
    addField("مصدر المواهب", sourceSelect);
    addField("الدولة", countrySelect);
    addField("المركز", roleSelect);
    addField("الكشاف المكلف", scoutSelect);

    let canLaunch = false;
    let confirm = null;
    const refreshPreview = () => {
      const config = SCOUTING_MISSION_TYPES[typeSelect.value];
      const targets = getScoutingCandidates(WORLD_PLAYERS, {
        countryId: countrySelect.value,
        role: roleSelect.value,
        sourceId: sourceSelect.value
      });
      const fit = getScoutingScoutFit(
        scoutSelect.value,
        state.save.world.scouting,
        countrySelect.value,
        roleSelect.value,
        config.accuracy,
        state.save.world.currentDate
      );
      preview.replaceChildren(
        node("strong", "", "تكلفة " + formatMoney(config.cost)),
        node("span", "", "مدة " + config.durationDays + " أيام · الدقة الأساسية " + Math.round(config.accuracy * 100) + "%"),
        node("span", "", targets.length + " لاعب ضمن نطاق البحث · رصيدك " + formatMoney(state.save.agency.balance)),
        node("span", "", "قناة الاكتشاف: " + getScoutingSourceLabel(sourceSelect.value))
      );
      if (fit) {
        preview.append(
          node("span", "", "الكشاف: " + fit.name + " · مستوى " + fit.level + " · " + fit.specialty),
          node("span", "scout-preview-accuracy", "الدقة بعد خبرة الكشاف: " + Math.round(fit.accuracy * 100) + "%")
        );
      }
      canLaunch = Boolean(fit && !fit.isBusy && targets.length > 0 && state.save.agency.balance >= config.cost);
      if (targets.length === 0) {
        preview.append(node("small", "scout-preview-warning", "لا توجد ملفات لاعبين مطابقة لهذا النطاق."));
      } else if (state.save.agency.balance < config.cost) {
        preview.append(node("small", "scout-preview-warning", "رصيد الوكالة لا يكفي لهذا المستوى."));
      } else if (!fit || fit.isBusy || fit.isContractExpired) {
        preview.append(node("small", "scout-preview-warning", "الكشاف غير متاح؛ راجع حالة العقد أو اختار عضوًا آخر من الشبكة."));
      }
      if (confirm) confirm.disabled = !state.canWrite || !canLaunch;
    };
    [typeSelect, sourceSelect, countrySelect, roleSelect, scoutSelect].forEach((control) => control.addEventListener("change", refreshPreview));
    refreshPreview();

    confirm = actionButton("تأكيد إطلاق البعثة", "button-primary scout-confirm-button", () => {
      if (!state.canWrite) {
        toast("ملف الحفظ غير قابل للتعديل؛ لم نبدأ بعثة.");
        return;
      }
      const previousSave = state.save;
      const result = startScoutingMission(state.save, {
        type: typeSelect.value,
        countryId: countrySelect.value,
        role: roleSelect.value,
        sourceId: sourceSelect.value,
        scoutId: scoutSelect.value
      }, WORLD_PLAYERS);
      if (!result.changed) {
        toast(result.error);
        return;
      }
      state.save = result.save;
      if (saveCareer()) {
        root.querySelector(".modal-overlay .icon-button")?.click();
        render();
        toast("بدأت " + result.mission.name + " مع الكشاف " + result.mission.scoutName + ". موعد التقرير " + formatHomeDate(result.mission.dueDate) + ".");
      } else {
        state.save = previousSave;
      }
    });
    confirm.disabled = !state.canWrite || !canLaunch;
    form.append(preview, confirm);
    openModal("إطلاق بعثة كشف", [
      node("p", "modal-copy", "كل كشاف له خبرة وتخصص مختلف؛ الكشاف المشغول لا يمكن تكليفه ببعثة ثانية. لا يمكن تشغيل أكثر من 3 بعثات في نفس الوقت."),
      form
    ], "إلغاء");
  }

  function openScoutingHistory(playerId) {
    const history = getPlayerScoutingHistory(state.save.world.scouting, playerId);
    const content = node("div", "scout-history-content");
    const overview = node("div", "scout-report-overview");
    overview.append(
      node("strong", "", history.playerName || "ملف اللاعب"),
      node("span", "", history.totalObservations + " مشاهدة محفوظة"),
      node("span", "", history.firstObservedAt ? "أول مشاهدة: " + formatHomeDate(history.firstObservedAt) : "لا توجد مشاهدات سابقة")
    );
    content.append(overview);
    const list = node("div", "scout-history-list");
    if (history.observations.length === 0) {
      list.append(node("p", "scout-empty", "لا يوجد سجل رصد محفوظ لهذا اللاعب حتى الآن."));
    } else {
      history.observations.forEach((observation, index) => {
        const row = node("article", "scout-history-observation");
        const heading = node("div", "scout-finding-heading");
        heading.append(
          node("strong", "", "مشاهدة " + (index + 1) + " · " + formatHomeDate(observation.observedAt)),
          node("span", "scout-recommendation", observation.recommendation)
        );
        const sources = node("p", "scout-finding-sources", "قناة الاكتشاف: " + observation.sourceLabels.join(" · "));
        const scout = node("p", "scout-history-scout", "الكشاف: " + (observation.scoutName ?? "غير مسجل"));
        const stats = node("div", "scout-finding-stats");
        stats.append(
          statMini("التقييم المقدر", observation.estimatedRating),
          statMini("الإمكانيات المقدرة", observation.estimatedPotential),
          statMini("الثقة", observation.confidence + "%")
        );
        const delta = observation.ratingDelta === null
          ? "أول مشاهدة محفوظة."
          : "فرق التقدير عن المشاهدة السابقة: التقييم " +
            (observation.ratingDelta > 0 ? "+" : "") + observation.ratingDelta +
            " · الإمكانيات " + (observation.potentialDelta > 0 ? "+" : "") + observation.potentialDelta;
        row.append(heading, sources, scout, stats, node("p", "scout-history-delta", delta));
        list.append(row);
      });
    }
    content.append(list, node("p", "modal-note", "فروق الأرقام تقارن تقديرات الكشافين فقط؛ لا تعني أن مستوى اللاعب الحقيقي ارتفع أو انخفض."));
    openModal("سجل رصد اللاعب", [content], "إغلاق السجل");
  }

  function openScoutingReport(report) {
    const content = node("div", "scout-report-content");
    const overview = node("div", "scout-report-overview");
    overview.append(
      node("strong", "", report.missionName),
      node("span", "", "تاريخ الإكمال: " + formatHomeDate(report.completedDate)),
      node("span", "", "التكلفة: " + formatMoney(report.cost) + " · المدة: " + report.durationDays + " أيام"),
      node("span", "", "دقة البعثة: " + Math.round(report.accuracy * 100) + "% · ملفات في النطاق: " + report.candidateCount),
      node("span", "", "مصدر المواهب: " + getScoutingSourceLabel(report.sourceId ?? "all"))
    );
    if (report.scoutName) {
      overview.append(node("span", "", "الكشاف المسؤول: " + report.scoutName + " · المستوى " + report.scoutLevel));
    }
    if (report.experienceAwarded) {
      overview.append(node("span", "", "خبرة مكتسبة للكشاف: +" + report.experienceAwarded + " نقطة"));
    }
    content.append(overview);
    const list = node("div", "scout-report-findings");
    if (report.findings.length === 0) {
      list.append(node("p", "scout-empty", "لم ينتج عن البعثة ملفات كافية لإعداد ترشيحات."));
    } else {
      report.findings.forEach((finding) => {
        const row = node("article", "scout-finding-row");
        const heading = node("div", "scout-finding-heading");
        heading.append(
          node("strong", "", finding.playerName),
          node("span", "scout-recommendation", finding.recommendation)
        );
        const subline = node("p", "scout-finding-subline", finding.position + " · " + finding.club + " · " + finding.country + " · " + finding.age + " سنة");
        const sourceLabels = (finding.discoverySourceIds ?? []).map(getScoutingSourceLabel);
        const sources = node("p", "scout-finding-sources", "قنوات متاحة: " + (sourceLabels.join(" · ") || "غير محددة"));
        const stats = node("div", "scout-finding-stats");
        stats.append(
          statMini("التقييم المقدر", finding.estimatedRating),
          statMini("الإمكانيات المقدرة", finding.estimatedPotential),
          statMini("الثقة", finding.confidence + "%")
        );
        const history = getPlayerScoutingHistory(state.save.world.scouting, finding.playerId);
        const player = WORLD_PLAYERS.find((candidate) => candidate.id === finding.playerId);
        const representation = state.save.agency.representation;
        const isClient = state.save.agency.clients.includes(finding.playerId) ||
          representation.contracts.some((contract) => contract.playerId === finding.playerId && contract.status === "active");
        const openOffer = representation.offers.find((offer) =>
          offer.playerId === finding.playerId && ["pending", "countered"].includes(offer.status)
        );
        const findingActions = node("div", "scout-finding-actions");
        if (player) {
          findingActions.append(actionButton("إضافة لصندوق المواهب", "button-outline scout-finding-pipeline-button", () => {
            root.querySelector(".modal-overlay .icon-button")?.click();
            manageTalentProspect(player);
          }));
          findingActions.append(actionButton("فتح ملف اللاعب", "button-outline scout-finding-profile-button", () => {
            root.querySelector(".modal-overlay .icon-button")?.click();
            openPlayer(player);
          }));
          if (isClient) {
            findingActions.append(node("span", "scout-finding-state", "عميل حالي في الوكالة"));
          } else if (openOffer) {
            findingActions.append(actionButton("متابعة عرض التمثيل", "button-outline scout-finding-followup-button", () => {
              root.querySelector(".modal-overlay .icon-button")?.click();
              navigate("agency");
            }));
          } else {
            findingActions.append(actionButton("بدء عرض تمثيل", "button-primary scout-finding-representation-button", () => {
              root.querySelector(".modal-overlay .icon-button")?.click();
              openRepresentationOffer(player);
            }));
          }
        } else {
          findingActions.append(node("span", "scout-finding-state", "ملف اللاعب غير متاح في قاعدة العالم الحالية"));
        }
        row.append(
          heading,
          subline,
          sources,
          stats,
          node("p", "scout-finding-rationale", finding.rationale),
          actionButton("سجل الرصد (" + history.totalObservations + ")", "button-outline scout-history-button", () => openScoutingHistory(finding.playerId)),
          findingActions
        );
        list.append(row);
      });
    }
    content.append(list);
    openModal("تقرير الكشافين", [content], "إغلاق التقرير");
  }

  function saveCareer() {
    if (!state.canWrite) {
      toast(loaded.status === "unsupported" ? "ملف الحفظ من إصدار أحدث؛ لم نغيّره." : "ملف الحفظ غير صالح؛ لم نكتب فوقه.");
      return false;
    }
    try {
      state.save = writeSave(state.save);
      state.isSaved = true;
      root.querySelectorAll(".save-chip, .save-button").forEach((button) => {
        button.textContent = "✓  محفوظ";
      });
      toast("تم حفظ مسيرتك بنجاح.");
      return true;
    } catch (error) {
      toast("تعذر الحفظ: " + error.message);
      return false;
    }
  }

  function advanceDay() {
    if (!state.canWrite) {
      toast(loaded.status === "unsupported"
        ? "ملف الحفظ من إصدار أحدث؛ لا يمكن بدء يوم جديد."
        : "ملف الحفظ غير صالح أو غير متاح؛ لم نغيّره.");
      return;
    }

    const previousSave = state.save;
    try {
      const advancedSave = advanceCareerDay(state.save);
      const scoutingResult = advanceScoutingMissions(advancedSave, WORLD_PLAYERS);
      const representationResult = advanceRepresentationState(scoutingResult.save, scoutingResult.save.world.currentDate);
      const transferResult = advanceTransferState(representationResult.save, representationResult.save.world.currentDate);
      state.save = transferResult.save;
      if (saveCareer()) {
        render();
        if (scoutingResult.completedReports.length > 0) {
          toast("اكتملت بعثة كشف ووصل تقرير جديد إلى مكتبك.");
        } else if (representationResult.expiredContracts.length > 0 || representationResult.expiredOffers.length > 0) {
          toast("انتهت صلاحية عقد أو عرض تمثيل وتم تحديث سجل الوكالة.");
        }
      } else state.save = previousSave;
    } catch (error) {
      toast("تعذر تقدم التقويم: " + error.message);
    }
  }

  function advanceWeek() {
    if (!state.canWrite) {
      toast(loaded.status === "unsupported"
        ? "ملف الحفظ من إصدار أحدث؛ لا يمكن تقدم أسبوع."
        : "ملف الحفظ غير صالح أو غير متاح؛ لم نغيّره.");
      return;
    }

    const previousSave = state.save;
    try {
      const advancedSave = advanceCareerDays(state.save, 7);
      const scoutingResult = advanceScoutingMissions(advancedSave, WORLD_PLAYERS);
      const representationResult = advanceRepresentationState(scoutingResult.save, scoutingResult.save.world.currentDate);
      const transferResult = advanceTransferState(representationResult.save, representationResult.save.world.currentDate);
      state.save = transferResult.save;
      if (saveCareer()) {
        render();
        toast(scoutingResult.completedReports.length > 0
          ? "تم تقدم أسبوع واكتمل تقرير بعثة كشف جديدة."
          : representationResult.expiredContracts.length > 0 || representationResult.expiredOffers.length > 0
            ? "تم تقدم 7 أيام وأُرشف عقد أو عرض انتهت صلاحيته."
            : "تم تقدم 7 أيام بالترتيب، مع معالجة المواعيد والأحداث والمهام اليومية.");
      } else {
        state.save = previousSave;
      }
    } catch (error) {
      toast("تعذر تقدم الأسبوع: " + error.message);
    }
  }

  function commitTransferResult(result, successMessage) {
    if (!state.canWrite) {
      toast("ملف الحفظ غير قابل للتعديل؛ لم نغيّر أي صفقة.");
      return;
    }
    if (!result.changed) {
      toast(result.error || "تعذر تحديث ملف الانتقال.");
      return;
    }
    const previousSave = state.save;
    state.save = result.save;
    if (saveCareer()) {
      render();
      toast(successMessage);
    } else {
      state.save = previousSave;
    }
  }

  function createTransferProposal(playerId, destinationClubId, type, terms) {
    commitTransferResult(createTransferOfferInEngine(state.save, playerId, destinationClubId, type, terms), "تم إرسال عرض الانتقال إلى النادي.");
  }
  function evaluateTransferOffer(offerId) {
    const result = evaluateTransferOfferInEngine(state.save, offerId);
    const message = result.status === "agreed" ? "وافق النادي على العرض؛ الصفقة جاهزة للتنفيذ."
      : result.status === "countered" ? "النادي أرسل شروطًا مضادة. راجعها ورد عليها."
        : result.status === "rejected" ? "النادي رفض التفاوض." : "تم تحديث رد النادي.";
    commitTransferResult(result, message);
  }
  function submitTransferCounterOffer(offerId, terms) {
    commitTransferResult(submitTransferCounterOfferInEngine(state.save, offerId, terms), "تم إرسال الشروط المضادة للنادي.");
  }
  function acceptTransferCounterOffer(offerId) {
    commitTransferResult(acceptTransferCounterOfferInEngine(state.save, offerId), "تم قبول شروط النادي. الصفقة جاهزة للتنفيذ.");
  }
  function rejectTransferOffer(offerId) {
    commitTransferResult(rejectTransferOfferInEngine(state.save, offerId), "تم إغلاق ملف التفاوض.");
  }
  function completeTransfer(offerId) {
    commitTransferResult(completeTransferInEngine(state.save, offerId), "اكتملت الصفقة وتم تسجيل العمولة المستحقة باليورو.");
  }

  function completeTask(taskId) {
    if (!state.canWrite) {
      toast("ملف الحفظ غير قابل للتعديل؛ لم نغيّره.");
      return;
    }
    const result = completeTaskInEngine(state.save, taskId);
    if (!result.changed) return;
    const followUpResult = completeTalentProspectFollowUp(result.save, taskId);
    const previousSave = state.save;
    state.save = followUpResult.changed ? followUpResult.save : result.save;
    if (saveCareer()) render();
    else state.save = previousSave;
  }

  function updatePlayerTrainingPlan(playerId, focus, intensity) {
    if (!state.canWrite) {
      toast("ملف الحفظ غير قابل للتعديل؛ لم نغيّر خطة التدريب.");
      return false;
    }
    const previousSave = state.save;
    const result = setPlayerTrainingPlanInEngine(
      state.save.world.football.playerDevelopment,
      playerId,
      focus,
      intensity
    );
    if (!result.changed) {
      const messages = {
        "invalid-plan": "اختار تركيز وشدة تدريب صالحين.",
        "player-not-found": "ملف اللاعب غير موجود في سجل التطور.",
        "role-mismatch": "تدريب حراسة المرمى متاح لحراس المرمى فقط."
      };
      toast(messages[result.reason] ?? "تعذر تحديث خطة التدريب.");
      return false;
    }
    state.save = {
      ...state.save,
      world: {
        ...state.save.world,
        football: {
          ...state.save.world.football,
          playerDevelopment: result.state
        }
      }
    };
    if (saveCareer()) {
      render();
      toast("تم حفظ خطة التدريب. هتتطبق في جلسة يوم الاثنين القادمة.");
      return true;
    }
    state.save = previousSave;
    return false;
  }

  function markMessageRead(messageId, shouldRender = true) {
    if (!state.canWrite) {
      toast("ملف الحفظ غير قابل للتعديل؛ لم نغيّره.");
      return false;
    }
    const result = markCareerMessageRead(state.save, messageId);
    if (!result.changed) return false;
    const previousSave = state.save;
    state.save = result.save;
    if (!saveCareer()) {
      state.save = previousSave;
      return false;
    }
    if (shouldRender) render();
    return true;
  }

  function openSeasonCalendar() {
    const currentDate = state.save.world.currentDate;
    const currentDateTime = Date.parse(currentDate + "T00:00:00.000Z");
    const horizonTime = currentDateTime + 365 * 86400000;
    const followUpEvents = (state.save.world.tasks ?? [])
      .filter((task) =>
        task.category === "talent-follow-up" &&
        task.status === "open" &&
        task.dueDate >= currentDate &&
        Date.parse(task.dueDate + "T00:00:00.000Z") <= horizonTime
      )
      .map((task) => ({
        id: task.id,
        date: task.dueDate,
        type: "talent-follow-up-due",
        title: task.title,
        description: task.description,
        daysUntil: Math.round((Date.parse(task.dueDate + "T00:00:00.000Z") - currentDateTime) / 86400000)
      }));
    const events = [
      ...getUpcomingCareerEvents(currentDate, state.save.career.season, 365),
      ...followUpEvents
    ].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    const content = node("div", "season-calendar-content");
    const intro = node("p", "modal-copy", "مواعيد الوكالة المجدولة خلال الـ365 يومًا القادمة. المواعيد تنظيمية داخل اللعبة، وليست جداول مباريات أو نوافذ انتقالات رسمية.");
    const list = node("div", "season-calendar-list");
    const labels = {
      "weekly-briefing": "إحاطة أسبوعية",
      "monthly-market": "تقرير شهري",
      "season-opening": "بداية الموسم",
      "preseason-review": "مراجعة ما قبل الموسم",
      "midseason-review": "مراجعة منتصف الموسم",
      "season-review": "تقييم نهاية الموسم",
      "season-closing": "ختام الموسم",
      "talent-follow-up-due": "متابعة موهبة"
    };
    if (events.length === 0) {
      list.append(node("p", "career-activity-empty", "لا توجد أحداث مستقبلية في هذه الفترة."));
    } else {
      events.forEach((event) => {
        const row = node("article", "season-calendar-row");
        const date = node("span", "season-calendar-date", formatHomeDate(event.date));
        const copy = node("div", "career-activity-copy");
        copy.append(
          node("strong", "", event.title),
          node("span", "", event.description),
          node("small", "", [
            labels[event.type] ?? event.type,
            Number.isInteger(event.season) ? "الموسم " + formatHomeNumber(event.season) : null,
            Number.isInteger(event.daysUntil) ? (event.daysUntil === 0 ? "اليوم" : "بعد " + formatHomeNumber(event.daysUntil) + " يوم") : null
          ].filter(Boolean).join(" · "))
        );
        row.append(date, copy);
        list.append(row);
      });
    }
    content.append(intro, list);
    openModal("تقويم الوكالة — السنة القادمة", [content], "إغلاق");
  }

  function openEventHistory() {
    const events = state.save.world.events ?? [];
    const controls = node("div", "event-history-controls");
    const search = node("input", "event-history-search");
    search.type = "search";
    search.placeholder = "ابحث في عنوان الحدث أو تفاصيله...";
    search.setAttribute("aria-label", "البحث في سجل الأحداث");
    const typeFilter = node("select", "event-history-filter");
    typeFilter.setAttribute("aria-label", "تصفية نوع الحدث");
    const allOption = node("option", "", "كل الأحداث");
    allOption.value = "all";
    typeFilter.append(allOption);
    [...new Set(events.map((event) => event.type))].sort().forEach((type) => {
      const option = node("option", "", getCareerEventTypeLabel(type));
      option.value = type;
      typeFilter.append(option);
    });
    controls.append(search, typeFilter);

    const count = node("p", "event-history-count");
    const list = node("div", "event-history-results");
    const content = node("div", "event-history-content");
    content.append(controls, count, list);
    const refresh = () => {
      const filtered = filterCareerEvents(events, { type: typeFilter.value, query: search.value });
      count.textContent = formatHomeNumber(filtered.length) + " حدث";
      list.replaceChildren();
      if (filtered.length === 0) {
        list.append(node("p", "career-activity-empty", "مفيش أحداث مطابقة للبحث."));
        return;
      }
      filtered.forEach((event) => {
        const row = node("article", "event-history-row");
        const copy = node("div", "career-activity-copy");
        copy.append(
          node("strong", "", event.title),
          node("span", "", event.description),
          node("small", "", formatHomeDate(event.date) + " · " + getCareerEventTypeLabel(event.type))
        );
        const priority = node("small", "event-history-priority priority-" + event.priority,
          "الأولوية: " + getCareerEventPriorityLabel(event.priority));
        priority.setAttribute("aria-label", "أولوية الحدث: " + getCareerEventPriorityLabel(event.priority));
        copy.append(priority);
        row.append(copy);
        list.append(row);
      });
    };
    search.addEventListener("input", refresh);
    typeFilter.addEventListener("change", refresh);
    refresh();
    openModal("سجل الأحداث", [content], "إغلاق");
    search.focus();
  }

  function openTaskHistory() {
    const tasks = state.save.world.tasks ?? [];
    const controls = node("div", "event-history-controls");
    const search = node("input", "event-history-search");
    search.type = "search";
    search.placeholder = "ابحث في اسم المهمة أو تفاصيلها...";
    search.setAttribute("aria-label", "البحث في سجل المهام");

    const statusFilter = node("select", "event-history-filter");
    statusFilter.setAttribute("aria-label", "تصفية حالة المهمة");
    [
      ["all", "كل الحالات"],
      ["open", "مفتوحة"],
      ["overdue", "متأخرة"],
      ["completed", "مكتملة"]
    ].forEach(([value, label]) => {
      const option = node("option", "", label);
      option.value = value;
      statusFilter.append(option);
    });
    controls.append(search, statusFilter);

    const count = node("p", "event-history-count");
    const list = node("div", "event-history-results");
    const content = node("div", "event-history-content");
    const statusLabels = { open: "مفتوحة", overdue: "متأخرة", completed: "مكتملة" };
    content.append(controls, count, list);

    const refresh = () => {
      const filtered = filterCareerTasks(tasks, { status: statusFilter.value, query: search.value });
      count.textContent = formatHomeNumber(filtered.length) + " مهمة";
      list.replaceChildren();
      if (filtered.length === 0) {
        list.append(node("p", "career-activity-empty", "مفيش مهام مطابقة للبحث أو التصفية."));
        return;
      }
      filtered.forEach((task) => {
        const row = node("article", "event-history-row task-history-row");
        const copy = node("div", "career-activity-copy");
        const detail = task.status === "completed"
          ? "أُنجزت في: " + formatHomeDate(task.completedDate) + (task.completedLate ? " · أُنجزت متأخرًا" : " · أُنجزت في الموعد")
          : task.status === "overdue"
            ? "متأخرة منذ: " + formatHomeDate(task.overdueDate)
            : "موعد التسليم: " + formatHomeDate(task.dueDate);
        copy.append(
          node("strong", "", task.title),
          node("span", "", task.description),
          node("small", "", "أُنشئت: " + formatHomeDate(task.createdDate) + " · " + detail)
        );
        const status = node("span", "task-history-status status-" + task.status, statusLabels[task.status] ?? task.status);
        if (task.status === "completed" && task.completedLate) status.textContent = "مكتملة — متأخرًا";
        row.append(copy, status);
        list.append(row);
      });
    };

    search.addEventListener("input", refresh);
    statusFilter.addEventListener("change", refresh);
    refresh();
    openModal("سجل المهام", [content], "إغلاق");
    search.focus();
  }

  function openInbox() {
    let messages = [...(state.save.world.inbox ?? [])];
    const controls = node("div", "event-history-controls");
    const search = node("input", "event-history-search");
    search.type = "search";
    search.placeholder = "ابحث في عنوان الرسالة أو محتواها...";
    search.setAttribute("aria-label", "البحث في صندوق الوارد");

    const statusFilter = node("select", "event-history-filter");
    statusFilter.setAttribute("aria-label", "تصفية حالة الرسالة");
    [
      ["all", "كل الرسائل"],
      ["unread", "غير مقروءة"],
      ["read", "مقروءة"]
    ].forEach(([value, label]) => {
      const option = node("option", "", label);
      option.value = value;
      statusFilter.append(option);
    });
    controls.append(search, statusFilter);

    const count = node("p", "event-history-count");
    const list = node("div", "event-history-results");
    const content = node("div", "event-history-content");
    content.append(controls, count, list);

    const refresh = () => {
      const filtered = filterCareerMessages(messages, {
        status: statusFilter.value,
        query: search.value
      });
      count.textContent = formatHomeNumber(filtered.length) + " رسالة";
      list.replaceChildren();
      if (filtered.length === 0) {
        list.append(node("p", "career-activity-empty", "مفيش رسائل مطابقة للبحث أو التصفية."));
        return;
      }

      filtered.forEach((message) => {
        const item = node("article", message.read ? "inbox-modal-item is-read" : "inbox-modal-item is-unread");
        item.append(
          node("strong", "", message.title),
          node("p", "modal-copy", message.body),
          node("span", "modal-note", formatHomeDate(message.date))
        );
        if (!message.read) {
          item.append(actionButton("تحديد كمقروء", "message-read-button", () => {
            if (markMessageRead(message.id, false)) {
              messages = [...state.save.world.inbox];
              refresh();
            }
          }));
        } else {
          item.append(node("span", "message-read-state", "تمت القراءة"));
        }
        list.append(item);
      });
    };

    search.addEventListener("input", refresh);
    statusFilter.addEventListener("change", refresh);
    refresh();
    openModal("صندوق الوارد", [content], "إغلاق");
    search.focus();
  }

  function navigate(view) {
    state.view = view;
    render({ focusMain: true });
  }

  function openModal(title, children, closeLabel = "إغلاق") {
    const previousFocus = document.activeElement;
    const overlay = node("div", "modal-overlay");
    const close = () => {
      if (!overlay.isConnected) return;
      overlay.remove();
      if (previousFocus && typeof previousFocus.focus === "function") previousFocus.focus();
    };
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) close();
    });

    const dialog = node("section", "modal-dialog");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    const titleId = "modal-title-" + (++modalSequence);
    dialog.setAttribute("aria-labelledby", titleId);
    dialog.setAttribute("tabindex", "-1");
    dialog.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...dialog.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
      )];
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });

    const head = node("div", "modal-heading");
    const titleElement = node("h2", "", title);
    titleElement.id = titleId;
    head.append(titleElement, actionButton("×", "icon-button", close, "إغلاق"));
    const body = node("div", "modal-body");
    body.append(...children);
    dialog.append(head, body, actionButton(closeLabel, "button-primary modal-close", close));
    overlay.append(dialog);
    root.append(overlay);
    dialog.querySelector(".icon-button").focus();
  }

  function openPlayer(player) {
    const art = playerArt(player, true);
    art.classList.add("modal-player-art");

    const identity = node("div", "player-profile-identity");
    identity.append(
      node("span", "player-profile-kicker", "PLAYER DOSSIER · ملف اللاعب"),
      node("h3", "", player.name),
      node("p", "", player.position + " · " + player.club),
      node("span", "player-profile-status", player.status)
    );

    const profileClubLine = node("div", "player-profile-club-line");
    profileClubLine.append(
      clubCrest(player),
      node("span", "", player.club + " · " + player.league)
    );
    identity.append(profileClubLine);

    const hero = node("div", "player-profile-hero");
    hero.append(art, identity);

    const ratingCards = node("div", "player-profile-stats");
    [
      ["التقييم الحالي", player.rating, "OVR"],
      ["الإمكانيات", player.potential, "POT"],
      ["العمر", player.age, "سنة"],
      ["القيمة السوقية", player.value, "EUR"]
    ].forEach(([label, value, suffix]) => {
      const item = node("article", "player-profile-stat");
      item.append(
        node("small", "", label),
        node("strong", "", String(value)),
        node("span", "", suffix)
      );
      ratingCards.append(item);
    });

    const details = node("div", "player-profile-details");
    [
      ["الجنسية", player.country],
      ["النادي", player.club],
      ["الدوري", player.league],
      ["القدم المفضلة", player.foot === "left" ? "اليسرى" : "اليمنى"],
      ["المركز العام", player.role],
      ["نهاية عقد النادي", player.contractUntil ? formatHomeDate(player.contractUntil) : "غير متاح"]
    ].forEach(([label, value]) => {
      const row = node("div", "player-profile-detail");
      row.append(node("small", "", label), node("strong", "", String(value)));
      details.append(row);
    });

    const growth = node("section", "player-profile-growth");
    const growthHeading = node("div", "player-profile-growth-heading");
    growthHeading.append(
      node("strong", "", "مساحة التطور"),
      node("span", "", "فرق " + Math.max(0, player.potential - player.rating) + " نقطة")
    );
    const growthTrack = node("div", "player-profile-growth-track");
    const growthFill = node("span", "player-profile-growth-fill");
    growthFill.style.width = Math.max(0, Math.min(100, Number(player.potential) || 0)) + "%";
    growthTrack.append(growthFill);
    growth.append(growthHeading, growthTrack);

    const content = node("div", "player-profile-content");
    content.append(hero, ratingCards, details, growth,
      node("p", "player-profile-disclaimer", "هذا ملف لاعب خيالي من قاعدة العالم التجريبية. القيمة السوقية تقدير داخل اللعبة وليست عرض انتقال رسميًا.")
    );

    const isWatched = state.watchlist.has(player.id);
    const actions = node("div", "player-profile-actions");
    const watchButton = actionButton(
      isWatched ? "✓  تمت إضافته للمتابعة" : "＋  أضف لقائمة المتابعة",
      isWatched ? "button-outline player-profile-watch is-active" : "button-outline player-profile-watch",
      () => {
        if (addToWatchlist(player)) {
          watchButton.textContent = "✓  تمت إضافته للمتابعة";
          watchButton.classList.add("is-active");
          watchButton.disabled = true;
          watchButton.setAttribute("aria-pressed", "true");
        }
      }
    );
    watchButton.disabled = isWatched;
    watchButton.setAttribute("aria-pressed", String(isWatched));
    actions.append(
      watchButton,
      actionButton("بدء عرض تمثيل", "button-primary player-profile-representation", () => {
        root.querySelector(".modal-overlay .icon-button")?.click();
        openRepresentationOffer(player);
      })
    );

    openModal("ملف اللاعب", [content, actions]);
  }

  function render({ focusMain = false } = {}) {
    const currentPlayers = WORLD_PLAYERS.map((player) => {
      const clubId = getPlayerCurrentClubId(player.id, player.clubId, state.save.world.transfers, state.save.world.currentDate);
      const club = WORLD_DATABASE.clubs.find((item) => item.id === clubId);
      return club ? { ...player, clubId, club: club.nameAr, clubShortName: club.shortName, clubColor: club.primaryColor } : player;
    });
    const context = {
      save: state.save,
      navigate,
      openPlayer,
      openModal,
      openInbox,
      openEventHistory,
      openTaskHistory,
      openSeasonCalendar,
      upcomingEvents: getUpcomingCareerEvents(state.save.world.currentDate, state.save.career.season, 365),
      saveCareer,
      advanceDay,
      advanceWeek,
      completeTask,
      markMessageRead,
      toast,
      watchlist: state.watchlist,
      scouting: state.save.world.scouting,
      openScoutingMission,
      openScoutingReport,
      signScoutingContract,
      renewScoutingContract,
      addToWatchlist,
      players: currentPlayers,
      transferState: state.save.world.transfers,
      createTransferProposal,
      evaluateTransferOffer,
      submitTransferCounterOffer,
      acceptTransferCounterOffer,
      rejectTransferOffer,
      completeTransfer,
      updatePlayerTrainingPlan,
      openRepresentationOffer,
      manageTalentProspect,
      manageTalentContact,
      openTalentProspectHistory,
      openRepresentationCounter,
      openRepresentationRenewal,
      openRepresentationClientDossier,
      sendRepresentationInteraction,
      openRepresentationMeeting,
      openRepresentationMeetingOutcome,
      evaluateRepresentationOffer,
      acceptRepresentationCounter,
      submitRepresentationCounterOffer: (offerId, terms) => {
        if (!state.canWrite) { toast("ملف الحفظ غير قابل للتعديل؛ لم نرسل ردًا."); return; }
        const previousSave = state.save;
        const result = submitRepresentationCounterOfferInEngine(state.save, offerId, terms);
        if (!result.changed) { toast(result.error); return; }
        state.save = handoffProspectToClientManagement(result.save, result);
        if (saveCareer()) { render(); toast("تم تحديث نتيجة التفاوض."); } else state.save = previousSave;
      },
      rejectRepresentationOffer,
      terminateRepresentationContract
    };
    const views = {
      dashboard: renderDashboard,
      players: renderPlayers,
      scouting: renderScouting,
      market: renderMarket,
      football: renderFootball,
      agency: renderAgency
    };
    const page = views[state.view] ? views[state.view](context) : renderDashboard(context);
    const shell = createAppShell({
      node,
      actionButton,
      view: state.view,
      seasonLabel: "موسم " + formatSeasonLabel(state.save.world.currentDate),
      dateLabel: formatHomeDate(state.save.world.currentDate),
      saveLabel: state.isSaved ? "✓ محفوظ" : "حفظ المسيرة",
      onSave: saveCareer,
      onNavigate: navigate,
      agencyName: state.save.agency.name,
      page
    });
    root.replaceChildren(shell);
    if (loadedWatchlist.status === "corrupt" || loadedWatchlist.status === "unavailable") {
      const warning = node("div", "save-warning");
      warning.textContent = loadedWatchlist.status === "corrupt"
        ? "تنبيه: ملف قائمة المتابعة غير صالح. لن نستبدله تلقائيًا."
        : "تنبيه: قائمة المتابعة غير متاحة في هذه الجلسة.";
      root.append(warning);
    }
    if (loaded.status === "corrupt" || loaded.status === "unsupported" || loaded.status === "unavailable") {
      const warning = node("div", "save-warning");
      warning.textContent = loaded.status === "unsupported"
        ? "تنبيه: ملف الحفظ من إصدار أحدث. وضع المعاينة فقط."
        : loaded.status === "corrupt"
          ? "تنبيه: ملف الحفظ الحالي غير صالح. لم يتم استبداله."
          : "تنبيه: التخزين المحلي غير متاح في هذه الجلسة.";
      root.append(warning);
    }
    if (state.toastMessage) {
      root.append(node("div", "toast-message", state.toastMessage));
    }
    if (focusMain) {
      root.querySelector(".main-stage")?.focus();
    }
  }

  render();
  return {
    navigate,
    render,
    destroy() {
      if (state.toastTimer) clearTimeout(state.toastTimer);
      state.toastTimer = null;
      root.replaceChildren();
    }
  };
}
