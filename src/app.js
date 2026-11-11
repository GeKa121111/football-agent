import {
  createInitialSave,
  readSave,
  writeSave,
  readWatchlist,
  writeWatchlist
} from "./core/storage.js";
import { DEMO_PLAYERS } from "./data/demo-players.js";

const NAV_ITEMS = [
  { id: "dashboard", label: "الرئيسية", icon: "⌂" },
  { id: "players", label: "اللاعبون", icon: "◉" },
  { id: "scouting", label: "الكشافون", icon: "⌕" },
  { id: "market", label: "الانتقالات", icon: "⇄" },
  { id: "agency", label: "الوكالة", icon: "▦" }
];

const MARKET_ITEMS = [
  { id: "deal-01", player: "آدم منصور", age: 21, position: "جناح أيمن", from: "نادي العاصمة", to: "مفتوح للعروض", fee: "€1.8M", note: "عقده ينتهي خلال 12 شهرًا", accent: "gold" },
  { id: "deal-02", player: "مالك شريف", age: 19, position: "وسط هجومي", from: "أكاديمية النخبة", to: "إعارة متاحة", fee: "€650K", note: "النادي يبحث عن فرصة مشاركة", accent: "cyan" },
  { id: "deal-03", player: "سيف حمدي", age: 24, position: "مدافع", from: "المدينة الرياضي", to: "قابل للتفاوض", fee: "€2.4M", note: "مراقب من عدة أندية", accent: "purple" }
];

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

function playerArt(player, featured = false) {
  const art = node("div", featured ? "player-art player-art-featured" : "player-art");
  art.style.setProperty("--skin", player.skin);
  art.style.setProperty("--hair", player.hair);
  art.style.setProperty("--kit", player.kit);
  art.style.setProperty("--kit-light", player.kitLight);
  art.style.setProperty("--art-glow", player.glow);
  art.setAttribute("aria-label", "رسم توضيحي للاعب " + player.name);
  art.setAttribute("role", "img");

  const stadium = node("span", "art-stadium-lines");
  const figure = node("span", "player-figure " + player.hairStyle);
  const head = node("span", "figure-head");
  const hair = node("span", "figure-hair");
  const neck = node("span", "figure-neck");
  const torso = node("span", "figure-torso");
  const number = node("span", "figure-number", player.shirtNumber);
  figure.append(head, hair, neck, torso, number);
  art.append(stadium, figure);
  return art;
}

function playerCard(player, onDetails) {
  const card = node("article", "player-card");
  const visual = node("div", "player-card-visual");
  visual.append(playerArt(player));

  const rating = node("div", "player-rating");
  rating.append(
    node("strong", "", player.rating),
    node("span", "", "OVR")
  );
  visual.append(rating, node("span", "player-position-tag", player.position));
  const info = node("div", "player-card-info");
  info.append(
    node("p", "player-country", player.country + "  ·  " + player.age + " سنة"),
    node("h3", "player-name", player.name),
    node("p", "player-club", player.club)
  );

  const stats = node("div", "player-card-stats");
  stats.append(
    statMini("POT", player.potential),
    statMini("القيمة", player.value),
    statMini("العمر", player.age)
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

function renderDashboard(context) {
  const page = node("div", "page-content home-dashboard");
  const agency = context.save.agency;
  const career = context.save.career;
  const clients = agency.clients.length;
  const reputation = Math.max(0, Math.min(100, Number(agency.reputation) || 0));
  const balance = formatMoney(agency.balance);

  const stadium = node("section", "home-stadium");
  stadium.setAttribute("aria-label", "ملعب كرة قدم");
  stadium.append(
    node("span", "stadium-lights stadium-light-left"),
    node("span", "stadium-lights stadium-light-right"),
    node("span", "stadium-stands"),
    node("span", "stadium-pitch"),
    node("span", "stadium-center-line"),
    node("span", "stadium-center-circle"),
    node("span", "stadium-goal stadium-goal-left"),
    node("span", "stadium-goal stadium-goal-right")
  );
  const stadiumLabel = node("div", "stadium-label");
  stadiumLabel.append(node("span", "stadium-live-dot"), node("span", "", "عالم الوكالة"));
  stadium.append(stadiumLabel);

  const profile = node("section", "agent-profile-card");
  const profileTop = node("div", "agent-profile-top");
  const avatar = node("div", "agent-avatar", "FA");
  avatar.append(node("span", "agent-avatar-star", "✦"));
  const identity = node("div", "agent-identity");
  identity.append(
    node("span", "agent-eyebrow", "ملف الوكيل"),
    node("h1", "agent-name", agency.name),
    node("span", "agent-status", "●  وكالتك نشطة")
  );
  const level = node("span", "agent-level", "المستوى 1");
  profileTop.append(avatar, identity, level);

  const profileStats = node("div", "agent-profile-stats");
  const cash = node("div", "agent-stat-chip");
  cash.append(node("span", "", "رصيد الوكالة"), node("strong", "", balance));
  const reputationChip = node("div", "agent-stat-chip agent-reputation-chip");
  reputationChip.append(node("span", "", "السمعة"), node("strong", "", formatHomeNumber(reputation) + " / 100"));
  profileStats.append(cash, reputationChip);

  const progressHead = node("div", "agent-progress-head");
  progressHead.append(node("span", "", "تقدم سمعة الوكالة"), node("strong", "", formatHomeNumber(reputation) + "%"));
  const progress = node("div", "agent-progress-track");
  progress.setAttribute("role", "progressbar");
  progress.setAttribute("aria-label", "تقدم سمعة الوكالة");
  progress.setAttribute("aria-valuemin", "0");
  progress.setAttribute("aria-valuemax", "100");
  progress.setAttribute("aria-valuenow", String(reputation));
  const progressFill = node("span", "agent-progress-fill");
  progressFill.style.width = reputation + "%";
  progress.append(progressFill);
  profile.append(profileTop, profileStats, progressHead, progress);

  const dayPanel = node("section", "career-day-panel");
  const dayHeading = node("div", "career-day-heading");
  dayHeading.append(
    node("span", "career-date", formatHomeDate(context.save.world.currentDate)),
    node("span", "career-season", "الموسم " + formatHomeNumber(career.season))
  );
  const dayStats = node("div", "career-day-stats");
  [
    ["اليوم", formatHomeNumber(career.day)],
    ["الأسبوع", formatHomeNumber(career.week)],
    ["العملاء", formatHomeNumber(clients)]
  ].forEach(([label, value]) => {
    const stat = node("div", "career-day-stat");
    stat.append(node("span", "", label), node("strong", "", value));
    dayStats.append(stat);
  });
  const dayAction = actionButton("⚽  ابدأ يوم جديد", "day-advance-button", context.advanceDay);
  const dayFoot = node("div", "career-day-foot");
  dayFoot.append(node("span", "day-foot-dot"), node("span", "", "تقدم يومك يحدّث تاريخ المسيرة ويحفظه تلقائيًا"));
  dayPanel.append(dayHeading, dayStats, dayAction, dayFoot);

  const featureGrid = node("div", "home-feature-grid");
  const playersFeature = actionButton("", "home-feature-card feature-players", () => context.navigate("players"));
  playersFeature.append(
    node("span", "feature-card-icon", "⚽"),
    node("span", "feature-card-copy"),
    node("span", "feature-card-arrow", "‹")
  );
  playersFeature.children[1].append(
    node("strong", "", "اللاعبون"),
    node("small", "", "اكتشف ملفات المواهب")
  );
  const newsFeature = actionButton("", "home-feature-card feature-news", () => context.openModal("أخبار الوكالة", [
    node("p", "modal-copy", "هنا هتظهر أخبار اللاعبين والأندية والانتقالات والأحداث المؤثرة في عالمك."),
    node("p", "modal-note", "مركز الأخبار قيد التطوير.")
  ], "تمام"));
  newsFeature.append(
    node("span", "feature-card-icon", "▤"),
    node("span", "feature-card-copy"),
    node("span", "feature-news-count", "3")
  );
  newsFeature.children[1].append(
    node("strong", "", "الأخبار"),
    node("small", "", "آخر مستجدات عالم الكرة")
  );
  featureGrid.append(playersFeature, newsFeature);

  const storeBanner = actionButton("", "home-store-banner", () => context.openModal("متجر الوكالة", [
    node("p", "modal-copy", "المتجر هيضم أدوات وتطويرات تساعدك توسّع وكالتك وتدير مسيرتك."),
    node("p", "modal-note", "المتجر لم يُفعّل بعد، ومفيش مشتريات أو مدفوعات في النسخة الحالية.")
  ], "تمام"));
  storeBanner.append(
    node("span", "store-banner-icon", "♛"),
    node("span", "store-banner-copy"),
    node("span", "store-banner-arrow", "←")
  );
  storeBanner.children[1].append(
    node("strong", "", "متجر الوكالة"),
    node("small", "", "تطويرات ومزايا مستقبلية")
  );

  const menuHeading = node("div", "home-menu-heading");
  menuHeading.append(
    node("h2", "", "أقسام الوكالة"),
    node("span", "", "اختر وجهتك")
  );
  const menu = node("div", "home-menu-grid");
  const tiles = [
    ["⚽", "اللاعبون", "ملفات المواهب", "violet", "players"],
    ["▤", "الأخبار", "عالم كرة القدم", "orange", null],
    ["⌂", "المكتب", "إدارة الوكالة", "blue", "agency"],
    ["▥", "البنك", "الأرصدة", "teal", "agency"],
    ["◈", "المالية", "حسابات الوكالة", "green", "agency"],
    ["⌕", "الكشافون", "اكتشاف المواهب", "gold", "scouting"],
    ["🏆", "البطولات", "إنجازات مستقبلية", "yellow", null],
    ["▦", "الدوريات", "المسابقات", "indigo", null],
    ["⇄", "الانتقالات", "سوق الصفقات", "orange", "market"],
    ["▧", "العقود", "اتفاقيات اللاعبين", "cyan", null],
    ["◎", "الاستثمارات", "توسيع الأعمال", "blue", null],
    ["▤", "الصحافة", "التغطية الإعلامية", "pink", null],
    ["♜", "مجلس الإدارة", "قرارات الوكالة", "purple", "agency"],
    ["↗", "المسيرة", "تطور الوكالة", "rose", "agency"],
    ["▣", "المهام", "أهدافك القادمة", "gold", null],
    ["✦", "الرعاة", "الشراكات التجارية", "green", null],
    ["◉", "التقارير", "أداء الوكالة", "teal", "agency"],
    ["⚙", "الإعدادات", "تفضيلات اللعبة", "slate", null]
  ];
  tiles.forEach(([icon, title, subtitle, tone, destination]) => {
    menu.append(homeTile(context, icon, title, subtitle, tone, destination));
  });

  const saveFooter = node("section", "home-save-footer");
  const saveCopy = node("div", "home-save-copy");
  saveCopy.append(
    node("strong", "", "مسيرتك في أمان"),
    node("span", "", "احفظ تقدمك على هذا الجهاز")
  );
  saveFooter.append(
    node("span", "home-save-icon", "▣"),
    saveCopy,
    actionButton("حفظ", "home-save-button", context.saveCareer)
  );

  page.append(stadium, profile, dayPanel, featureGrid, storeBanner, menuHeading, menu, saveFooter);
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

function renderPlayers(context) {
  const page = node("div", "page-content");
  page.append(
    node("p", "eyebrow", "إدارة المواهب"),
    node("h1", "page-title", "اللاعبون"),
    node("p", "page-subtitle", "تابع الملفات والمهارات والإمكانيات. البيانات الظاهرة هنا أمثلة تصميمية مؤقتة.")
  );
  const toolbar = node("div", "list-toolbar");
  const search = node("input", "search-input");
  search.type = "search";
  search.placeholder = "ابحث باسم اللاعب أو النادي...";
  search.setAttribute("aria-label", "البحث عن لاعب");
  toolbar.append(search, node("span", "result-count", DEMO_PLAYERS.length + " ملفات تجريبية"));
  const grid = node("div", "players-grid players-grid-large");
  DEMO_PLAYERS.forEach((player) => grid.append(playerCard(player, context.openPlayer)));
  search.addEventListener("input", () => {
    const query = search.value.trim().toLocaleLowerCase("ar");
    const filtered = DEMO_PLAYERS.filter((player) =>
      [player.name, player.club, player.position, player.country].some((value) =>
        value.toLocaleLowerCase("ar").includes(query)
      )
    );
    grid.replaceChildren(...filtered.map((player) => playerCard(player, context.openPlayer)));
    toolbar.querySelector(".result-count").textContent = filtered.length + " نتائج";
  });
  page.append(toolbar, grid);
  return page;
}

function renderScouting(context) {
  const page = node("div", "page-content");
  page.append(
    node("p", "eyebrow", "شبكة اكتشاف المواهب"),
    node("h1", "page-title", "الكشافون"),
    node("p", "page-subtitle", "ابحث عن لاعبين واعدِين وابدأ تكوين قائمة المتابعة. نظام الكشافين الفعلي سيُبنى في المرحلة الخامسة.")
  );
  const scoutBanner = node("section", "scout-banner");
  scoutBanner.append(
    node("div", "scout-symbol", "⌕"),
    node("div", "scout-banner-copy"),
    node("span", "scout-counter", "03  /  مواهب مقترحة")
  );
  scoutBanner.children[1].append(
    node("h2", "", "عينك على المستقبل"),
    node("p", "", "استخدم البحث للوصول إلى الملف المناسب، ثم أضفه لقائمة المتابعة التجريبية.")
  );

  const toolbar = node("div", "list-toolbar");
  const search = node("input", "search-input");
  search.type = "search";
  search.placeholder = "ابحث عن اسم أو مركز أو نادٍ...";
  search.setAttribute("aria-label", "البحث في المواهب");
  const position = node("select", "filter-select");
  position.setAttribute("aria-label", "تصفية حسب المركز");
  [["all", "كل المراكز"], ["هجوم", "الهجوم"], ["وسط", "الوسط"], ["دفاع", "الدفاع"]].forEach(([value, label]) => {
    const option = node("option", "", label);
    option.value = value;
    position.append(option);
  });
  toolbar.append(search, position);
  const grid = node("div", "players-grid players-grid-large");
  const refresh = () => {
    const q = search.value.trim().toLocaleLowerCase("ar");
    const role = position.value;
    const filtered = DEMO_PLAYERS.filter((player) => {
      const matchesText = [player.name, player.club, player.position].some((value) => value.toLocaleLowerCase("ar").includes(q));
      const matchesRole = role === "all" || player.role === role;
      return matchesText && matchesRole;
    });
    grid.replaceChildren(...filtered.map((player) => {
      const card = playerCard(player, context.openPlayer);
      const follow = actionButton(
        context.watchlist.has(player.id) ? "✓  في قائمة المتابعة" : "＋  أضف للمتابعة",
        context.watchlist.has(player.id) ? "watch-button is-active" : "watch-button",
        () => {
          if (context.addToWatchlist(player)) {
            follow.textContent = "✓  في قائمة المتابعة";
            follow.classList.add("is-active");
          }
        }
      );
      card.append(follow);
      return card;
    }));
  };
  search.addEventListener("input", refresh);
  position.addEventListener("change", refresh);
  refresh();
  page.append(scoutBanner, toolbar, grid);
  return page;
}

function renderMarket(context) {
  const page = node("div", "page-content");
  page.append(
    node("p", "eyebrow", "حركة الأندية والصفقات"),
    node("h1", "page-title", "سوق الانتقالات"),
    node("p", "page-subtitle", "نظرة أولية على فرص السوق. التفاوض وإتمام الصفقات سيُنفذان في المرحلة السادسة.")
  );
  const summary = node("div", "market-summary");
  summary.append(
    metricCard("فرص معروضة", "03", "بيانات توضيحية", "⇄", "purple"),
    metricCard("النافذة الحالية", "صيف", "موسم 2026–2027", "◷", "cyan"),
    metricCard("حالة السوق", "نشط", "واجهة معاينة", "◈", "gold")
  );
  const list = node("div", "market-list");
  MARKET_ITEMS.forEach((item) => {
    const card = node("article", "market-card");
    const badge = node("span", "market-badge badge-" + item.accent, item.to);
    const details = node("div", "market-details");
    details.append(
      node("h3", "", item.player),
      node("p", "", item.position + "  ·  " + item.age + " سنة"),
      node("span", "market-route", item.from + "  ←  " + item.to)
    );
    const value = node("div", "market-value");
    value.append(node("strong", "", item.fee), node("span", "", item.note));
    card.append(badge, details, value, actionButton("التفاصيل", "button-outline", () => {
      context.openModal("فرصة انتقال تجريبية", [
        node("p", "modal-copy", item.player + " — " + item.position),
        node("p", "modal-copy", item.note),
        node("p", "modal-note", "هذه بيانات عرض تجريبية. محرك العروض والتفاوض لم يُفعّل بعد.")
      ], "فهمت");
    }));
    list.append(card);
  });
  page.append(summary, list);
  return page;
}

function renderAgency(context) {
  const page = node("div", "page-content");
  page.append(
    node("p", "eyebrow", "إدارة أعمالك"),
    node("h1", "page-title", "الوكالة"),
    node("p", "page-subtitle", "كل شيء يبدأ من مكتب صغير وسمعة تُبنى صفقة وراء صفقة.")
  );
  const overview = node("section", "agency-overview");
  const monogram = node("div", "agency-monogram", "FA");
  const summary = node("div", "agency-summary");
  summary.append(
    node("span", "agency-label", "وكالتك"),
    node("h2", "", context.save.agency.name),
    node("p", "", "وكالة مستقلة  ·  المستوى التأسيسي")
  );
  overview.append(monogram, summary, actionButton("حفظ التقدم", "button-primary", context.saveCareer));
  const cards = node("div", "metrics-grid agency-metrics");
  cards.append(
    metricCard("الرصيد", formatMoney(context.save.agency.balance), "الأموال المتاحة", "◈", "purple"),
    metricCard("العملاء", context.save.agency.clients.length, "لاعبون متعاقدون", "◎", "cyan"),
    metricCard("السمعة", context.save.agency.reputation + " / 100", "سمعة الوكالة", "✦", "gold")
  );
  const roadmap = node("section", "surface-card roadmap-card");
  roadmap.append(
    node("h2", "", "تطور الوكالة"),
    roadmapRow("تأسيس الوكالة", "تم إعداد البنية الأساسية", true),
    roadmapRow("بناء الهوية البصرية", "المرحلة الحالية", true),
    roadmapRow("تكوين شبكة العملاء", "قيد التطوير", false),
    roadmapRow("التوسع في سوق الانتقالات", "قادم", false)
  );
  page.append(overview, cards, roadmap);
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
    isSaved: loaded.status === "loaded",
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

  function saveCareer() {
    if (!state.canWrite) {
      toast(loaded.status === "unsupported" ? "ملف الحفظ من إصدار أحدث؛ لم نغيّره." : "ملف الحفظ غير صالح؛ لم نكتب فوقه.");
      return;
    }
    try {
      state.save = writeSave(state.save);
      state.isSaved = true;
      root.querySelectorAll(".save-chip, .save-button").forEach((button) => {
        button.textContent = "✓  محفوظ";
      });
      toast("تم حفظ مسيرتك بنجاح.");
    } catch (error) {
      toast("تعذر الحفظ: " + error.message);
    }
  }

  function advanceDay() {
    if (!state.canWrite) {
      toast(loaded.status === "unsupported"
        ? "ملف الحفظ من إصدار أحدث؛ لا يمكن بدء يوم جديد."
        : "ملف الحفظ غير صالح أو غير متاح؛ لم نغيّره.");
      return;
    }

    const currentDate = new Date(state.save.world.currentDate + "T12:00:00Z");
    currentDate.setUTCDate(currentDate.getUTCDate() + 1);
    const day = state.save.career.day + 1;
    state.save = {
      ...state.save,
      career: {
        ...state.save.career,
        day,
        week: Math.ceil(day / 7)
      },
      world: {
        ...state.save.world,
        currentDate: currentDate.toISOString().slice(0, 10)
      }
    };
    saveCareer();
    render();
  }

  function navigate(view) {
    state.view = view;
    render();
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
    dialog.setAttribute("aria-label", title);
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
    head.append(node("h2", "", title), actionButton("×", "icon-button", close, "إغلاق"));
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
    const summary = node("div", "modal-player-summary");
    summary.append(
      node("p", "eyebrow", player.position + "  ·  " + player.country),
      node("h3", "", player.name),
      node("p", "modal-copy", player.club + "  ·  " + player.age + " سنة"),
      node("p", "modal-note", "التقييم " + player.rating + "  |  الإمكانيات " + player.potential + "  |  القيمة " + player.value)
    );
    const wrapper = node("div", "modal-player-layout");
    wrapper.append(art, summary);
    openModal("ملف اللاعب", [
      wrapper,
      node("p", "modal-note", "بطاقة معاينة تصميمية. التعاقد وإدارة الملف ستُفعّل ضمن المراحل القادمة."),
      actionButton(state.watchlist.has(player.id) ? "✓  في قائمة المتابعة" : "＋  أضف لقائمة المتابعة", "watch-button", () => {
        if (addToWatchlist(player)) {
          root.querySelector(".modal-overlay .icon-button")?.click();
        }
      })
    ]);
  }

  function render() {
    const shell = node("div", state.view === "dashboard" ? "app-shell dashboard-shell" : "app-shell");
    const header = node("header", "topbar");
    const brand = node("div", "brand-lockup");
    brand.append(node("span", "brand-mark", "FA"), node("span", "brand-name", "FOOTBALL AGENT"));
    const season = node("span", "season-pill", "موسم 2026 / 2027");
    const saveButton = actionButton(state.isSaved ? "✓  محفوظ" : "حفظ المسيرة", "save-chip", saveCareer);
    header.append(brand, season, saveButton);

    const layout = node("div", "app-layout");
    const sidebar = node("nav", "sidebar");
    sidebar.setAttribute("aria-label", "القائمة الرئيسية");
    sidebar.append(node("p", "nav-caption", "القائمة"));
    NAV_ITEMS.forEach((item) => {
      const navButton = actionButton("", state.view === item.id ? "nav-link is-active" : "nav-link", () => navigate(item.id));
      navButton.setAttribute("aria-current", state.view === item.id ? "page" : "false");
      navButton.append(node("span", "nav-icon", item.icon), node("span", "nav-label", item.label));
      sidebar.append(navButton);
    });
    const sideBottom = node("div", "sidebar-bottom");
    sideBottom.append(node("span", "online-dot"), node("span", "", "وضع المعاينة"));
    sidebar.append(sideBottom);

    const main = node("main", "main-stage");
    const context = { save: state.save, navigate, openPlayer, openModal, saveCareer, advanceDay, toast, watchlist: state.watchlist, addToWatchlist };
    const views = {
      dashboard: renderDashboard,
      players: renderPlayers,
      scouting: renderScouting,
      market: renderMarket,
      agency: renderAgency
    };
    main.append(views[state.view](context));
    layout.append(sidebar, main);

    const bottomNav = node("nav", "mobile-nav");
    bottomNav.setAttribute("aria-label", "التنقل");
    NAV_ITEMS.forEach((item) => {
      const navButton = actionButton("", state.view === item.id ? "mobile-nav-link is-active" : "mobile-nav-link", () => navigate(item.id));
      navButton.append(node("span", "mobile-nav-icon", item.icon), node("span", "mobile-nav-label", item.label));
      bottomNav.append(navButton);
    });

    shell.append(header, layout, bottomNav);
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
  }

  render();
}
