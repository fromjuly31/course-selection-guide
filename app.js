(async () => {
  "use strict";

  const store = window.DatabaseStore;
  const root = document.querySelector("#app-root");
  const detailDialog = document.querySelector("#record-dialog");
  const detailContent = document.querySelector("[data-record-dialog-content]");
  const toast = document.querySelector("[data-app-toast]");

  // 학교의 엑셀 정책이 달라지면 이 별칭 목록만 수정하면 된다.
  // 첫 번째 항목은 관리자 화면에 표시할 표준 열 이름이다.
  const REQUIRED_COLUMN_ALIASES = {
    "학과": ["학과", "학과명", "전공", "전공명"],
    "반영과목": ["반영과목", "반영 과목", "권장 선택과목", "선택과목"]
  };
  const COLUMN_ALIASES = {
    department: REQUIRED_COLUMN_ALIASES["학과"],
    subjects: REQUIRED_COLUMN_ALIASES["반영과목"],
    category: ["계열", "분야", "영역", "교과"],
    science: ["과학 권장과목", "과학권장과목", "권장과학과목"],
    university: ["대학명", "대학교", "학교명"],
    description: ["안내", "설명", "비고", "상세내용"]
  };
  const MULTI_VALUE_COLUMNS = /(반영\s*과목|권장\s*과목|선택\s*과목|관련\s*진로|키워드)/i;
  const NUMERIC_COLUMNS = /^(학점|단위수|선택가능수|정원|모집인원|입학년도|학년도)$/i;
  const FILE_SIZE_LIMIT = 100 * 1024 * 1024;
  const LARGE_FILE_NOTICE = 20 * 1024 * 1024;
  const PREVIEW_PAGE_SIZE = 25;
  const VIEW_PAGE_SIZE = 18;

  const requestedTab = new URLSearchParams(location.search).get("tab");
  const allowedTabs = ["subjects", "departments", "recommend", "simulation", "admin"];
  const initialTab = requestedTab === "view" ? "departments" : requestedTab;
  const savedSettings = store.getSettings();
  const state = {
    tab: allowedTabs.includes(initialTab) ? initialTab : "subjects",
    dataset: { meta: {}, columns: [], rows: [] },
    notices: [],
    subjectSearch: "",
    search: "",
    category: "전체",
    recommendCategory: "",
    simulationSubjects: Array.isArray(savedSettings.simulationSubjects) ? savedSettings.simulationSubjects : [],
    viewPage: 1,
    pendingImport: null,
    workbook: null,
    selectedSheet: "",
    importStatus: "idle",
    importMessage: "",
    busy: false,
    settings: savedSettings
  };

  let toastTimer;
  let searchTimer;

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function icon(name, extraClass = "") {
    return `<svg class="icon ${extraClass}" aria-hidden="true"><use href="icons.svg#${name}"></use></svg>`;
  }

  function showToast(message, duration = 2800) {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add("is-visible");
    toastTimer = setTimeout(() => toast.classList.remove("is-visible"), duration);
  }

  function normalizedKey(value) {
    return String(value ?? "").replace(/^\uFEFF/, "").replace(/\s+/g, "").toLocaleLowerCase("ko");
  }

  function findColumn(columns, aliases) {
    const targets = aliases.map(normalizedKey);
    return columns.find((column) => targets.includes(normalizedKey(column))) || "";
  }

  function isBlank(value) {
    return value === null || value === undefined || (typeof value === "string" && !value.trim());
  }

  function displayValue(value) {
    if (Array.isArray(value)) return value.join("; ");
    if (value === true) return "예";
    if (value === false) return "아니요";
    return String(value ?? "");
  }

  function parseMultiValue(value) {
    if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
    return String(value ?? "")
      .split(/[;,，|·\n]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  // 숫자·문자 혼합 값을 억지로 형 변환하지 않아 원본 정보 손실을 막는다.
  // 다중 값 열에서는 쉼표와 줄바꿈을 세미콜론으로 통일해 이후 배열 변환을 쉽게 한다.
  function normalizeData(value, columnName = "") {
    if (value === null || value === undefined) return "";
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
    if (typeof value === "number") return Number.isFinite(value) ? value : "";
    if (typeof value === "boolean") return value;

    let text = String(value).replace(/\r\n?/g, "\n").trim();
    if (MULTI_VALUE_COLUMNS.test(columnName)) {
      text = parseMultiValue(text).join(";");
    }
    return text;
  }

  function formatDate(value) {
    if (!value) return "기록 없음";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(date);
  }

  function sourceLabel(meta = state.dataset.meta) {
    if (meta.sourceType === "admin") return "관리자 업로드 데이터";
    if (meta.sourceType === "fallback") return "내장 비상 데이터";
    return "기본 database.json";
  }

  function renderNotices() {
    if (!state.notices.length) return "";
    return `<div class="notice-stack">${state.notices.map((message) => `<aside class="screen-notice">${icon("help")}<span>${escapeHtml(message)}</span></aside>`).join("")}</div>`;
  }

  function pageHead(title, description, count, countLabel) {
    const eyebrow = {
      subjects: "COURSE DATABASE",
      departments: "DEPARTMENT DATABASE",
      recommend: "PERSONAL RECOMMENDATION",
      simulation: "COURSE SIMULATION",
      admin: "DATABASE ADMIN"
    }[state.tab];
    return `
      <header class="data-page-head">
        <div>
          <p class="page-eyebrow">${eyebrow} · ${escapeHtml(sourceLabel())}</p>
          <h1>${escapeHtml(title)}</h1>
          <p>${escapeHtml(description)}</p>
        </div>
        <div class="page-count"><strong>${Number(count).toLocaleString("ko-KR")}</strong><span>${escapeHtml(countLabel)}</span></div>
      </header>`;
  }

  function updateChrome() {
    document.querySelectorAll("[data-db-count]").forEach((node) => { node.textContent = state.dataset.rows.length.toLocaleString("ko-KR"); });
    document.querySelectorAll("[data-source-state]").forEach((node) => { node.textContent = sourceLabel(); });
    document.querySelectorAll("[data-tab]").forEach((link) => {
      if (link.dataset.tab === state.tab) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    const titles = { subjects: "과목 안내", departments: "학과 안내", recommend: "과목 추천", simulation: "시뮬레이션", admin: "데이터 관리" };
    document.title = `${titles[state.tab]} · 우리학교 선택과목 안내`;
  }

  function valueAt(row, aliases) {
    const column = findColumn(state.dataset.columns, aliases);
    return column ? row[column] : "";
  }

  function filteredViewRows() {
    const categoryColumn = findColumn(state.dataset.columns, COLUMN_ALIASES.category);
    const query = state.search.trim().toLocaleLowerCase("ko");
    return state.dataset.rows
      .map((row, originalIndex) => ({ row, originalIndex }))
      .filter(({ row }) => {
        const categoryMatches = state.category === "전체" || displayValue(row[categoryColumn]) === state.category;
        if (!categoryMatches) return false;
        if (!query) return true;
        return state.dataset.columns.some((column) => displayValue(row[column]).toLocaleLowerCase("ko").includes(query));
      });
  }

  function recordCard(row, originalIndex) {
    const department = valueAt(row, COLUMN_ALIASES.department) || displayValue(row[state.dataset.columns[0]]) || "이름 없는 데이터";
    const category = valueAt(row, COLUMN_ALIASES.category) || "분류 없음";
    const university = valueAt(row, COLUMN_ALIASES.university);
    const subjects = parseMultiValue(valueAt(row, COLUMN_ALIASES.subjects));
    const science = parseMultiValue(valueAt(row, COLUMN_ALIASES.science));
    const description = valueAt(row, COLUMN_ALIASES.description);
    const chips = [...subjects, ...science].slice(0, 5);

    return `
      <article class="record-card">
        <div class="record-card-top"><span class="record-category">${escapeHtml(category)}</span>${university ? `<span class="record-university">${escapeHtml(university)}</span>` : ""}</div>
        <h2>${escapeHtml(department)}</h2>
        <p>${escapeHtml(description || (subjects.length ? `권장 과목: ${subjects.join(", ")}` : "상세 데이터를 확인해 보세요."))}</p>
        <div class="record-tags">${chips.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
        <button class="record-detail-button" type="button" data-record-index="${originalIndex}">전체 정보 보기 ${icon("arrow")}</button>
      </article>`;
  }

  function paginationMarkup(page, totalPages, scope) {
    if (totalPages <= 1) return "";
    return `
      <nav class="pagination" aria-label="페이지 이동">
        <button type="button" data-page-scope="${scope}" data-page="${page - 1}" ${page <= 1 ? "disabled" : ""}>이전</button>
        <span><strong>${page}</strong> / ${totalPages.toLocaleString("ko-KR")}</span>
        <button type="button" data-page-scope="${scope}" data-page="${page + 1}" ${page >= totalPages ? "disabled" : ""}>다음</button>
      </nav>`;
  }

  function subjectCatalog() {
    const subjectColumn = findColumn(state.dataset.columns, COLUMN_ALIASES.subjects);
    const scienceColumn = findColumn(state.dataset.columns, COLUMN_ALIASES.science);
    const catalog = new Map();
    const addSubject = (subject, role, row) => {
      if (!catalog.has(subject)) {
        catalog.set(subject, { name: subject, roles: new Set(), departments: new Set(), categories: new Set(), universities: new Set() });
      }
      const item = catalog.get(subject);
      item.roles.add(role);
      const department = valueAt(row, COLUMN_ALIASES.department);
      const category = valueAt(row, COLUMN_ALIASES.category);
      const university = valueAt(row, COLUMN_ALIASES.university);
      if (department) item.departments.add(displayValue(department));
      if (category) item.categories.add(displayValue(category));
      if (university) item.universities.add(displayValue(university));
    };

    state.dataset.rows.forEach((row) => {
      parseMultiValue(subjectColumn ? row[subjectColumn] : "").forEach((subject) => addSubject(subject, "반영과목", row));
      parseMultiValue(scienceColumn ? row[scienceColumn] : "").forEach((subject) => addSubject(subject, "과학 권장", row));
    });
    return [...catalog.values()].sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }

  function renderSubjects() {
    const query = state.subjectSearch.trim().toLocaleLowerCase("ko");
    const subjects = subjectCatalog().filter((item) => {
      if (!query) return true;
      return [item.name, ...item.roles, ...item.departments, ...item.categories, ...item.universities]
        .some((value) => value.toLocaleLowerCase("ko").includes(query));
    });
    root.innerHTML = `
      ${renderNotices()}
      ${pageHead("과목 안내", "선택과목이 어떤 계열과 학과에서 반영되거나 권장되는지 살펴보세요.", subjects.length, "안내 과목")}
      <section class="toolbar" aria-label="과목 검색">
        <label class="search-field"><span class="sr-only">과목 검색</span>${icon("search")}<input type="search" value="${escapeHtml(state.subjectSearch)}" placeholder="과목명, 계열 또는 관련 학과 검색" data-subject-search autocomplete="off"></label>
      </section>
      <div class="results-head"><h2>선택과목 목록</h2><span>학과 DB의 반영·권장과목 기준</span></div>
      <section class="record-grid" aria-live="polite">
        ${subjects.length ? subjects.map((item) => {
          const selected = state.simulationSubjects.includes(item.name);
          return `<article class="record-card subject-guide-card"><div class="record-card-top"><span class="record-category">${escapeHtml([...item.roles].join(" · "))}</span><span class="record-university">관련 학과 ${item.departments.size}</span></div><h2>${escapeHtml(item.name)}</h2><p>${escapeHtml([...item.categories].slice(0, 4).join(" · ") || "계열 정보 없음")} 계열의 ${item.departments.size.toLocaleString("ko-KR")}개 학과에서 확인할 수 있습니다.</p><div class="record-tags">${[...item.departments].slice(0, 5).map((department) => `<span>${escapeHtml(department)}</span>`).join("")}</div><button class="record-detail-button" type="button" data-simulation-add="${escapeHtml(item.name)}">${selected ? "시뮬레이션에서 빼기" : "시뮬레이션에 추가"} ${icon("arrow")}</button></article>`;
        }).join("") : `<div class="empty-state"><span class="empty-icon">${icon("book")}</span><h2>검색 결과가 없습니다.</h2><p>다른 과목명이나 계열을 검색해 보세요.</p></div>`}
      </section>`;
  }

  function renderView() {
    const categoryColumn = findColumn(state.dataset.columns, COLUMN_ALIASES.category);
    const categories = categoryColumn
      ? ["전체", ...new Set(state.dataset.rows.map((row) => displayValue(row[categoryColumn])).filter(Boolean))]
      : ["전체"];
    if (!categories.includes(state.category)) state.category = "전체";
    const matches = filteredViewRows();
    const totalPages = Math.max(1, Math.ceil(matches.length / VIEW_PAGE_SIZE));
    state.viewPage = Math.min(state.viewPage, totalPages);
    const start = (state.viewPage - 1) * VIEW_PAGE_SIZE;
    const visible = matches.slice(start, start + VIEW_PAGE_SIZE);

    root.innerHTML = `
      ${renderNotices()}
      ${pageHead("학과 안내", "학과명, 대학명, 계열 또는 반영과목으로 필요한 정보를 빠르게 찾아보세요.", matches.length, "검색 결과")}
      <section class="toolbar" aria-label="데이터 검색과 필터">
        <label class="search-field">
          <span class="sr-only">전체 데이터 검색</span>${icon("search")}
          <input type="search" value="${escapeHtml(state.search)}" placeholder="학과, 대학, 과목을 검색하세요" data-view-search autocomplete="off">
        </label>
        ${categories.length > 1 ? `<div class="filter-chips" role="group" aria-label="계열 필터">${categories.map((category) => `<button class="filter-chip ${state.category === category ? "is-active" : ""}" type="button" data-view-category="${escapeHtml(category)}">${escapeHtml(category)}</button>`).join("")}</div>` : ""}
      </section>
      <div class="results-head"><h2>안내 데이터</h2><span>현재 DB ${state.dataset.rows.length.toLocaleString("ko-KR")}건 · ${escapeHtml(sourceLabel())}</span></div>
      <section class="record-grid" data-record-grid aria-live="polite">
        ${visible.length ? visible.map(({ row, originalIndex }) => recordCard(row, originalIndex)).join("") : `<div class="empty-state"><span class="empty-icon">${icon("search")}</span><h2>검색 결과가 없습니다.</h2><p>검색어 또는 계열 필터를 바꿔 보세요.</p></div>`}
      </section>
      ${paginationMarkup(state.viewPage, totalPages, "view")}`;
  }

  function availableCategories() {
    const categoryColumn = findColumn(state.dataset.columns, COLUMN_ALIASES.category);
    return categoryColumn
      ? [...new Set(state.dataset.rows.map((row) => displayValue(row[categoryColumn])).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko"))
      : [];
  }

  function renderRecommend() {
    const categories = availableCategories();
    if (state.recommendCategory && !categories.includes(state.recommendCategory)) state.recommendCategory = "";
    const categoryColumn = findColumn(state.dataset.columns, COLUMN_ALIASES.category);
    const recommendations = state.recommendCategory
      ? state.dataset.rows
        .map((row, originalIndex) => ({ row, originalIndex }))
        .filter(({ row }) => displayValue(row[categoryColumn]) === state.recommendCategory)
      : [];

    root.innerHTML = `
      ${renderNotices()}
      ${pageHead("관심 계열 과목 추천", "관심 있는 계열을 선택하면 관련 학과와 준비하면 좋은 선택과목을 한눈에 보여드립니다.", recommendations.length, "추천 결과")}
      <section class="recommend-panel">
        <p class="section-kicker">STEP 01 · INTEREST</p>
        <h2>어떤 분야에 관심이 있나요?</h2>
        <p>계열 하나를 선택하세요. 현재 DB의 학과와 반영과목을 기준으로 추천합니다.</p>
        <div class="recommend-options" role="group" aria-label="관심 계열 선택">
          ${categories.map((category) => `<button class="recommend-option ${state.recommendCategory === category ? "is-active" : ""}" type="button" data-recommend-category="${escapeHtml(category)}" aria-pressed="${state.recommendCategory === category}">${icon("sparkles")}<span>${escapeHtml(category)}</span></button>`).join("")}
        </div>
      </section>
      <div class="results-head"><h2>추천 학과와 과목</h2><span>${state.recommendCategory ? `${escapeHtml(state.recommendCategory)} · ${recommendations.length.toLocaleString("ko-KR")}건` : "관심 계열 선택 후 표시"}</span></div>
      <section class="record-grid" aria-live="polite">
        ${recommendations.length ? recommendations.map(({ row, originalIndex }) => recordCard(row, originalIndex)).join("") : `<div class="empty-state"><span class="empty-icon">${icon("compass")}</span><h2>${categories.length ? "관심 계열을 선택해 주세요." : "계열 데이터가 없습니다."}</h2><p>${categories.length ? "선택한 계열에 맞는 학과와 권장 과목을 추천합니다." : "데이터 관리에서 계열 열이 포함된 엑셀을 업로드해 주세요."}</p></div>`}
      </section>`;
  }

  function allSubjects() {
    const subjectColumn = findColumn(state.dataset.columns, COLUMN_ALIASES.subjects);
    const scienceColumn = findColumn(state.dataset.columns, COLUMN_ALIASES.science);
    const values = state.dataset.rows.flatMap((row) => [
      ...parseMultiValue(subjectColumn ? row[subjectColumn] : ""),
      ...parseMultiValue(scienceColumn ? row[scienceColumn] : "")
    ]);
    return [...new Set(values)].sort((a, b) => a.localeCompare(b, "ko"));
  }

  function simulationResults() {
    if (!state.simulationSubjects.length) return [];
    const selected = new Set(state.simulationSubjects);
    return state.dataset.rows.map((row, originalIndex) => {
      const required = parseMultiValue(valueAt(row, COLUMN_ALIASES.subjects));
      const recommendedScience = parseMultiValue(valueAt(row, COLUMN_ALIASES.science));
      const target = [...new Set([...required, ...recommendedScience])];
      const completed = target.filter((subject) => selected.has(subject));
      const missing = target.filter((subject) => !selected.has(subject));
      const score = target.length ? Math.round((completed.length / target.length) * 100) : 0;
      return { row, originalIndex, target, completed, missing, score };
    }).sort((a, b) => b.score - a.score || b.completed.length - a.completed.length).slice(0, 12);
  }

  function renderSimulation() {
    const subjects = allSubjects();
    state.simulationSubjects = state.simulationSubjects.filter((subject) => subjects.includes(subject));
    const results = simulationResults();

    root.innerHTML = `
      ${renderNotices()}
      ${pageHead("과목 선택 시뮬레이션", "이수했거나 이수할 과목을 선택하고 학과별 준비 현황과 부족한 과목을 확인해 보세요.", state.simulationSubjects.length, "선택 과목")}
      <section class="simulation-panel">
        <div class="simulation-panel-head"><div><p class="section-kicker">STEP 01 · MY COURSES</p><h2>나의 선택과목</h2><p>과목을 누르면 선택하거나 해제할 수 있습니다.</p></div><button class="text-action" type="button" data-clear-simulation ${state.simulationSubjects.length ? "" : "disabled"}>전체 해제</button></div>
        <div class="subject-selector" role="group" aria-label="과목 선택">
          ${subjects.length ? subjects.map((subject) => `<button class="subject-toggle ${state.simulationSubjects.includes(subject) ? "is-active" : ""}" type="button" data-simulation-subject="${escapeHtml(subject)}" aria-pressed="${state.simulationSubjects.includes(subject)}"><span>${state.simulationSubjects.includes(subject) ? "✓" : "+"}</span>${escapeHtml(subject)}</button>`).join("") : '<p class="selector-empty">반영과목 데이터가 없습니다.</p>'}
        </div>
      </section>
      <div class="results-head"><h2>학과별 준비 현황</h2><span>${state.simulationSubjects.length ? "일치율이 높은 순" : "과목 선택 후 표시"}</span></div>
      <section class="simulation-grid" aria-live="polite">
        ${results.length ? results.map((item) => {
          const department = valueAt(item.row, COLUMN_ALIASES.department) || "이름 없는 학과";
          const university = valueAt(item.row, COLUMN_ALIASES.university);
          return `<article class="simulation-result-card">
            <div class="simulation-score"><span style="--score:${item.score}%"><strong>${item.score}</strong><small>%</small></span></div>
            <div class="simulation-result-copy"><p>${escapeHtml(university || valueAt(item.row, COLUMN_ALIASES.category) || "학과 정보")}</p><h3>${escapeHtml(department)}</h3><div class="simulation-status"><strong>선택 완료 ${item.completed.length}</strong><span>남은 과목 ${item.missing.length}</span></div>${item.missing.length ? `<div class="missing-subjects"><small>추가로 살펴볼 과목</small><p>${item.missing.slice(0, 4).map((subject) => `<span>${escapeHtml(subject)}</span>`).join("")}</p></div>` : '<p class="simulation-complete">현재 DB의 권장 과목을 모두 선택했습니다.</p>'}<button type="button" data-record-index="${item.originalIndex}">전체 정보 보기 ${icon("arrow")}</button></div>
          </article>`;
        }).join("") : `<div class="empty-state"><span class="empty-icon">${icon("route")}</span><h2>과목을 선택해 주세요.</h2><p>선택 결과를 학과별 반영과목과 비교해 준비 현황을 계산합니다.</p></div>`}
      </section>`;
  }

  function validationSummaryMarkup(validation) {
    if (!validation) return "";
    const stats = validation.stats;
    return `
      <div class="validation-summary" aria-label="검증 요약">
        <div><span>전체 행</span><strong>${stats.totalRows.toLocaleString("ko-KR")}</strong></div>
        <div class="is-success"><span>정상 데이터</span><strong>${stats.validRows.toLocaleString("ko-KR")}</strong></div>
        <div class="${stats.errorRows ? "is-danger" : "is-success"}"><span>오류 데이터</span><strong>${stats.errorRows.toLocaleString("ko-KR")}</strong></div>
        <div class="${stats.emptyCells ? "is-warning" : ""}"><span>빈 셀</span><strong>${stats.emptyCells.toLocaleString("ko-KR")}</strong></div>
      </div>`;
  }

  function previewRows() {
    const pending = state.pendingImport;
    if (!pending?.validation) return { rows: [], page: 1, totalPages: 1, total: 0 };
    const query = pending.previewSearch.trim().toLocaleLowerCase("ko");
    const rowErrors = pending.validation.rowErrors;
    const filtered = pending.entries.filter((entry) => {
      if (pending.errorOnly && !rowErrors.has(entry.rowNumber)) return false;
      if (!query) return true;
      return pending.columns.some((column) => displayValue(entry.data[column]).toLocaleLowerCase("ko").includes(query));
    });
    const totalPages = Math.max(1, Math.ceil(filtered.length / PREVIEW_PAGE_SIZE));
    pending.previewPage = Math.min(pending.previewPage, totalPages);
    const start = (pending.previewPage - 1) * PREVIEW_PAGE_SIZE;
    return {
      rows: filtered.slice(start, start + PREVIEW_PAGE_SIZE),
      page: pending.previewPage,
      totalPages,
      total: filtered.length
    };
  }

  // 최대 25행만 DOM에 렌더링해 수만 행 파일에서도 화면이 무거워지지 않도록 한다.
  function previewData() {
    const pending = state.pendingImport;
    if (!pending?.validation) return "";
    const validation = pending.validation;
    const preview = previewRows();
    const fatalMarkup = validation.fatalErrors.length
      ? `<div class="fatal-callout"><strong>DB를 적용할 수 없습니다.</strong><ul>${validation.fatalErrors.map((message) => `<li>${escapeHtml(message)}</li>`).join("")}</ul></div>`
      : "";
    const issueItems = validation.issues.slice(0, 30);

    return `
      <section class="preview-card">
        <div class="admin-section-head">
          <div><p class="section-kicker">STEP 04 · PREVIEW</p><h2>검증 및 데이터 미리보기</h2></div>
          <span>${escapeHtml(pending.fileName)} · ${escapeHtml(pending.sheetName)}</span>
        </div>
        ${validationSummaryMarkup(validation)}
        ${fatalMarkup}
        <div class="preview-toolbar">
          <label class="compact-search">${icon("search")}<input type="search" value="${escapeHtml(pending.previewSearch)}" placeholder="미리보기 검색" data-preview-search></label>
          <label class="toggle-field"><input type="checkbox" data-error-only ${pending.errorOnly ? "checked" : ""}><span>오류 행만 보기</span></label>
          <span class="preview-count">${preview.total.toLocaleString("ko-KR")}건 표시 대상</span>
        </div>
        <div class="preview-table-wrap">
          <table class="preview-table">
            <thead><tr><th class="row-number-cell">엑셀 행</th>${pending.columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr></thead>
            <tbody>
              ${preview.rows.length ? preview.rows.map((entry) => {
                const errors = validation.rowErrors.get(entry.rowNumber) || [];
                return `<tr class="${errors.length ? "has-error" : ""}" title="${escapeHtml(errors.join(" / "))}"><td class="row-number-cell">${entry.rowNumber}${errors.length ? '<span class="error-dot" aria-label="오류 있음"></span>' : ""}</td>${pending.columns.map((column) => `<td>${escapeHtml(displayValue(entry.data[column])) || '<span class="empty-cell">비어 있음</span>'}</td>`).join("")}</tr>`;
              }).join("") : `<tr><td colspan="${Math.max(1, pending.columns.length + 1)}" class="table-empty">조건에 맞는 행이 없습니다.</td></tr>`}
            </tbody>
          </table>
        </div>
        ${paginationMarkup(preview.page, preview.totalPages, "preview")}
        <div class="issue-panel">
          <div class="admin-section-head"><h3>검증 메시지</h3><span>${validation.issues.length.toLocaleString("ko-KR")}건${validation.issues.length > issueItems.length ? ` 중 ${issueItems.length}건 표시` : ""}</span></div>
          ${issueItems.length ? `<ul class="validation-list">${issueItems.map((issue) => `<li class="validation-item ${issue.type === "error" ? "is-error" : "is-warning"}"><strong>${issue.row ? `${issue.row}행` : "전체"}</strong><span>${escapeHtml(issue.message)}</span></li>`).join("")}</ul>` : `<p class="all-clear">${icon("check")} 오류 없이 검증을 통과했습니다.</p>`}
        </div>
      </section>`;
  }

  function workflowMarkup() {
    const statusOrder = ["idle", "reading", "analyzing", "validating", "ready"];
    const current = Math.max(0, statusOrder.indexOf(state.importStatus));
    const labels = ["업로드", "파일 읽기", "시트 분석", "데이터 검증", "미리보기"];
    return `<ol class="workflow-steps">${labels.map((label, index) => `<li class="${index < current || state.importStatus === "ready" ? "is-done" : ""} ${index === current && state.importStatus !== "idle" ? "is-active" : ""}"><span>${index < current || state.importStatus === "ready" ? "✓" : index + 1}</span><small>${label}</small></li>`).join("")}</ol>`;
  }

  function currentDatabaseMarkup() {
    const meta = state.dataset.meta || {};
    return `
      <section class="admin-card current-db-card">
        <div class="admin-section-head"><div><p class="section-kicker">ACTIVE DATABASE</p><h2>현재 적용 데이터</h2></div><span class="source-badge ${meta.sourceType === "admin" ? "is-admin" : ""}">${escapeHtml(sourceLabel(meta))}</span></div>
        <div class="dataset-meta">
          <div class="meta-row"><span>현재 DB</span><strong>${escapeHtml(sourceLabel(meta))}</strong></div>
          <div class="meta-row"><span>데이터 수</span><strong>${state.dataset.rows.length.toLocaleString("ko-KR")}행 · ${state.dataset.columns.length}열</strong></div>
          <div class="meta-row"><span>원본</span><strong>${escapeHtml(meta.sourceName || "data/database.json")}</strong></div>
          <div class="meta-row"><span>마지막 업데이트</span><strong>${escapeHtml(formatDate(meta.updatedAt))}</strong></div>
        </div>
        <div class="admin-button-row">
          <button class="secondary-action" type="button" data-export-json>${icon("download", "button-icon")}JSON 다운로드</button>
          <button class="danger-action" type="button" data-reset-database>현재 DB 초기화</button>
          <button class="secondary-action" type="button" data-restore-default>기본 DB로 복원</button>
        </div>
        <p class="button-help">초기화는 업로드 DB와 화면 설정을 함께 지우고, 복원은 화면 설정을 유지한 채 최신 기본 JSON을 다시 읽습니다.</p>
      </section>`;
  }

  function renderAdmin() {
    const pending = state.pendingImport;
    const validation = pending?.validation;
    root.innerHTML = `
      ${renderNotices()}
      ${pageHead("데이터 관리", "엑셀을 올리고 오류를 확인한 뒤 적용하면 현재 브라우저의 DB가 안전하게 교체됩니다.", state.dataset.rows.length, "현재 DB 행")}
      <aside class="admin-notice">${icon("help")}<span><strong>이 브라우저에만 저장됩니다.</strong> GitHub Pages에는 서버가 없으므로 관리자가 적용한 DB는 현재 기기의 IndexedDB에 저장됩니다. 모든 사용자에게 배포하려면 JSON을 내려받아 저장소의 <code>data/database.json</code>을 교체하세요.</span></aside>
      <div class="admin-layout">
        <section class="admin-card upload-card" aria-busy="${state.busy}">
          <div class="admin-section-head"><div><p class="section-kicker">EXCEL IMPORT</p><h2>엑셀 DB 업로드</h2></div><span>.xlsx · .xls</span></div>
          ${workflowMarkup()}
          <label class="upload-zone ${state.busy ? "is-busy" : ""}" data-upload-zone>
            <input type="file" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" data-excel-input ${state.busy ? "disabled" : ""}>
            <span class="upload-icon">${icon("upload")}</span>
            <strong>${state.busy ? "엑셀 데이터를 처리하고 있습니다" : "파일을 선택하거나 여기로 드래그"}</strong>
            <small>첫 행은 열 이름으로 사용 · 20MB 이하 권장 · 최대 100MB</small>
          </label>
          ${state.importMessage ? `<p class="import-message ${state.importStatus === "error" ? "is-error" : ""}" role="status">${escapeHtml(state.importMessage)}</p>` : ""}
          ${state.workbook ? `<div class="sheet-picker"><label for="sheet-select">사용할 시트</label><select id="sheet-select" data-sheet-select ${state.busy ? "disabled" : ""}>${state.workbook.SheetNames.map((name) => `<option value="${escapeHtml(name)}" ${name === state.selectedSheet ? "selected" : ""}>${escapeHtml(name)}</option>`).join("")}</select><span>기본값은 첫 번째 시트입니다.</span></div>` : ""}
          <div class="admin-button-row">
            <button class="secondary-action" type="button" data-run-validation ${!pending || state.busy ? "disabled" : ""}>${icon("check", "button-icon")}데이터 검증</button>
            <button class="primary-action" type="button" data-apply-database ${!validation?.canApply || state.busy ? "disabled" : ""}>DB 적용</button>
            <button class="secondary-action" type="button" data-export-json ${!pending?.validation?.canApply && !state.dataset.rows.length ? "disabled" : ""}>${icon("download", "button-icon")}JSON 다운로드</button>
            ${pending ? '<button class="text-action" type="button" data-clear-preview>미리보기 닫기</button>' : ""}
          </div>
          ${validation?.canApply && validation.stats.errorRows ? `<p class="apply-note">DB 적용 시 오류 ${validation.stats.errorRows.toLocaleString("ko-KR")}행은 제외하고 정상 ${validation.stats.validRows.toLocaleString("ko-KR")}행만 저장합니다.</p>` : ""}
        </section>
        ${currentDatabaseMarkup()}
      </div>
      ${previewData()}
      <section class="admin-card schema-card">
        <div class="admin-section-head"><div><p class="section-kicker">COLUMN GUIDE</p><h2>엑셀 작성 기준</h2></div><span>열 순서는 자유롭게 변경 가능</span></div>
        <div class="schema-grid">
          <div><strong>필수 열</strong><p><code>학과</code>, <code>반영과목</code></p><small>학과명/전공명, 권장 선택과목 같은 별칭도 인식합니다.</small></div>
          <div><strong>다중 값</strong><p><code>미적분;기하;확률과 통계</code></p><small>쉼표·세미콜론·줄바꿈은 내부에서 세미콜론으로 정규화합니다.</small></div>
          <div><strong>중복 기준</strong><p><code>대학명 + 학과</code></p><small>대학명 열이 없으면 학과명만으로 중복을 검사합니다.</small></div>
        </div>
      </section>`;
  }

  function render() {
    updateChrome();
    if (state.tab === "admin") renderAdmin();
    else if (state.tab === "recommend") renderRecommend();
    else if (state.tab === "simulation") renderSimulation();
    else if (state.tab === "departments") renderView();
    else renderSubjects();
  }

  async function loadDatabase(options = {}) {
    const result = await store.loadDatabase(options);
    state.dataset = result.database;
    state.notices = result.notices;
    return result.database;
  }

  // SheetJS는 첫 행을 헤더 배열로 읽는다. 실제 값이 있는 열의 빈/중복 헤더를 구조 오류로 기록한다.
  function convertExcelToJson(workbook, sheetName) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) throw new Error(`'${sheetName}' 시트를 찾을 수 없습니다.`);
    const matrix = window.XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
      raw: true,
      blankrows: false
    });
    if (!matrix.length) {
      return { columns: [], entries: [], structuralErrors: ["선택한 시트가 비어 있습니다."] };
    }

    const firstRow = Array.isArray(matrix[0]) ? matrix[0] : [];
    const maxLength = matrix.reduce((maximum, row) => Math.max(maximum, Array.isArray(row) ? row.length : 0), 0);
    const activeIndexes = [];
    for (let columnIndex = 0; columnIndex < maxLength; columnIndex += 1) {
      const hasData = matrix.some((row) => !isBlank(Array.isArray(row) ? row[columnIndex] : ""));
      if (hasData) activeIndexes.push(columnIndex);
    }

    const columns = [];
    const structuralErrors = [];
    const headerCounts = new Map();
    activeIndexes.forEach((columnIndex) => {
      const header = String(firstRow[columnIndex] ?? "").replace(/^\uFEFF/, "").trim().replace(/\s+/g, " ");
      if (!header) {
        structuralErrors.push(`${columnIndex + 1}번째 열의 첫 행에 컬럼명이 없습니다.`);
        return;
      }
      const key = normalizedKey(header);
      headerCounts.set(key, (headerCounts.get(key) || 0) + 1);
      if (headerCounts.get(key) > 1) structuralErrors.push(`컬럼명 '${header}'이(가) 중복되었습니다.`);
      columns.push({ name: header, index: columnIndex });
    });

    if (!columns.length) structuralErrors.push("첫 번째 행에서 컬럼명을 찾을 수 없습니다.");
    const entries = [];
    matrix.slice(1).forEach((row, index) => {
      const data = {};
      columns.forEach(({ name, index: columnIndex }) => {
        data[name] = normalizeData(Array.isArray(row) ? row[columnIndex] : "", name);
      });
      if (Object.values(data).some((value) => !isBlank(value))) entries.push({ rowNumber: index + 2, data });
    });

    return {
      columns: columns.map(({ name }) => name),
      entries,
      structuralErrors: [...new Set(structuralErrors)]
    };
  }

  // 행 단위 오류를 Map으로 보관해 표 강조와 '오류 행만 보기'가 빠르게 동작한다.
  async function validateExcelData(converted) {
    const fatalErrors = [...converted.structuralErrors];
    const issues = [];
    const rowErrors = new Map();
    const actualRequiredColumns = {};

    Object.entries(REQUIRED_COLUMN_ALIASES).forEach(([standardName, aliases]) => {
      const actual = findColumn(converted.columns, aliases);
      actualRequiredColumns[standardName] = actual;
      if (!actual) fatalErrors.push(`필수 열 '${standardName}'을(를) 찾을 수 없습니다.`);
    });
    if (!converted.entries.length) fatalErrors.push("헤더 아래에 데이터 행이 없습니다.");

    const departmentColumn = actualRequiredColumns["학과"];
    const universityColumn = findColumn(converted.columns, COLUMN_ALIASES.university);
    const duplicateKeys = new Map();
    let emptyCells = 0;
    let duplicateRows = 0;
    let formatErrors = 0;

    function addRowError(rowNumber, message) {
      if (!rowErrors.has(rowNumber)) rowErrors.set(rowNumber, []);
      rowErrors.get(rowNumber).push(message);
      issues.push({ row: rowNumber, type: "error", message });
    }

    for (let index = 0; index < converted.entries.length; index += 1) {
      const entry = converted.entries[index];
      const row = entry.data;
      Object.entries(actualRequiredColumns).forEach(([standardName, actualColumn]) => {
        if (actualColumn && isBlank(row[actualColumn])) addRowError(entry.rowNumber, `${standardName} 값이 없습니다.`);
      });

      converted.columns.forEach((column) => {
        const value = row[column];
        if (isBlank(value)) emptyCells += 1;
        if (typeof value === "string" && /^#(REF!|VALUE!|DIV\/0!|N\/A|NAME\?|NUM!|NULL!)/i.test(value)) {
          formatErrors += 1;
          addRowError(entry.rowNumber, `${column}에 엑셀 오류 값(${value})이 있습니다.`);
        } else if (NUMERIC_COLUMNS.test(column) && !isBlank(value) && !Number.isFinite(Number(String(value).replaceAll(",", "")))) {
          formatErrors += 1;
          addRowError(entry.rowNumber, `${column} 값 '${displayValue(value)}'은(는) 숫자 형식이 아닙니다.`);
        }
      });

      if (departmentColumn && !isBlank(row[departmentColumn])) {
        const uniqueParts = universityColumn
          ? [row[universityColumn], row[departmentColumn]]
          : [row[departmentColumn]];
        const duplicateKey = uniqueParts.map((value) => normalizedKey(value)).join("::");
        if (duplicateKeys.has(duplicateKey)) {
          duplicateRows += 1;
          addRowError(entry.rowNumber, `동일한 ${universityColumn ? "대학명·학과" : "학과"} 데이터가 중복되었습니다. (최초 ${duplicateKeys.get(duplicateKey)}행)`);
        } else {
          duplicateKeys.set(duplicateKey, entry.rowNumber);
        }
      }

      // 긴 파일 검증 중 브라우저가 클릭과 화면 그리기를 처리할 시간을 준다.
      if (index > 0 && index % 2000 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    }

    if (emptyCells) issues.unshift({ row: null, type: "warning", message: `선택한 데이터 범위에 빈 셀이 ${emptyCells.toLocaleString("ko-KR")}개 있습니다.` });
    fatalErrors.forEach((message) => issues.unshift({ row: 1, type: "error", message }));
    const errorRows = rowErrors.size;
    const validEntries = converted.entries.filter((entry) => !rowErrors.has(entry.rowNumber));
    return {
      fatalErrors: [...new Set(fatalErrors)],
      issues,
      rowErrors,
      validEntries,
      canApply: !fatalErrors.length && validEntries.length > 0,
      stats: {
        totalRows: converted.entries.length,
        validRows: validEntries.length,
        errorRows,
        emptyCells,
        duplicateRows,
        formatErrors
      }
    };
  }

  async function analyzeSelectedSheet() {
    if (!state.workbook || !state.selectedSheet) return;
    state.busy = true;
    state.importStatus = "analyzing";
    state.importMessage = `'${state.selectedSheet}' 시트의 열과 데이터를 분석하고 있습니다.`;
    renderAdmin();
    await new Promise((resolve) => setTimeout(resolve, 0));

    try {
      const converted = convertExcelToJson(state.workbook, state.selectedSheet);
      state.importStatus = "validating";
      state.importMessage = `${converted.entries.length.toLocaleString("ko-KR")}개 행을 검증하고 있습니다.`;
      renderAdmin();
      await new Promise((resolve) => setTimeout(resolve, 0));
      const validation = await validateExcelData(converted);
      state.pendingImport = {
        fileName: state.pendingImport?.fileName || "업로드 파일",
        sheetName: state.selectedSheet,
        columns: converted.columns,
        entries: converted.entries,
        validation,
        previewSearch: "",
        errorOnly: false,
        previewPage: 1
      };
      state.importStatus = "ready";
      state.importMessage = validation.canApply
        ? `검증 완료: 정상 ${validation.stats.validRows.toLocaleString("ko-KR")}행을 DB에 적용할 수 있습니다.`
        : "검증 완료: 필수 구조 오류를 수정한 뒤 다시 업로드해 주세요.";
      showToast(validation.canApply ? "엑셀 검증이 완료되었습니다." : "적용을 막는 오류가 있습니다.");
    } catch (error) {
      console.error("시트 변환 또는 검증 실패:", error);
      state.pendingImport = null;
      state.importStatus = "error";
      state.importMessage = `시트를 변환하지 못했습니다. ${error.message || "엑셀 구조를 확인해 주세요."}`;
      showToast("엑셀 데이터 변환에 실패했습니다.", 4000);
    } finally {
      state.busy = false;
      renderAdmin();
    }
  }

  async function readExcelFile(file) {
    if (!file) return;
    const extension = file.name.split(".").pop()?.toLocaleLowerCase();
    if (!["xlsx", "xls"].includes(extension)) {
      state.importStatus = "error";
      state.importMessage = "엑셀 파일(.xlsx 또는 .xls)만 업로드할 수 있습니다.";
      renderAdmin();
      return;
    }
    if (!file.size) {
      state.importStatus = "error";
      state.importMessage = "파일이 비어 있습니다. 다른 엑셀 파일을 선택해 주세요.";
      renderAdmin();
      return;
    }
    if (file.size > FILE_SIZE_LIMIT) {
      state.importStatus = "error";
      state.importMessage = "100MB를 초과한 파일은 브라우저 안정성을 위해 처리하지 않습니다.";
      renderAdmin();
      return;
    }
    if (!window.XLSX) {
      state.importStatus = "error";
      state.importMessage = "SheetJS 모듈을 불러오지 못했습니다. 페이지를 새로고침해 주세요.";
      renderAdmin();
      return;
    }

    state.busy = true;
    state.importStatus = "reading";
    state.importMessage = file.size > LARGE_FILE_NOTICE
      ? "큰 파일을 읽는 중입니다. 이 탭을 닫지 말고 잠시 기다려 주세요."
      : "엑셀 파일을 안전하게 읽고 있습니다.";
    state.pendingImport = { fileName: file.name };
    // File 객체를 가진 input을 렌더링으로 제거하기 전에 먼저 바이트를 읽는다.
    // 일부 브라우저는 input이 DOM에서 사라지면 File.arrayBuffer()를 완료하지 못한다.
    const currentZone = root.querySelector("[data-upload-zone]");
    currentZone?.classList.add("is-busy");
    currentZone?.setAttribute("aria-busy", "true");
    const currentTitle = currentZone?.querySelector("strong");
    if (currentTitle) currentTitle.textContent = state.importMessage;

    try {
      const buffer = await file.arrayBuffer();
      renderAdmin();
      await new Promise((resolve) => setTimeout(resolve, 0));
      const workbook = window.XLSX.read(buffer, {
        type: "array",
        cellDates: true,
        dense: true
      });
      if (!workbook.SheetNames?.length) throw new Error("엑셀 파일에서 시트를 찾을 수 없습니다.");
      state.workbook = workbook;
      state.selectedSheet = workbook.SheetNames[0];
      state.pendingImport = { fileName: file.name };
      state.busy = false;
      await analyzeSelectedSheet();
    } catch (error) {
      console.error("SheetJS 파일 읽기 실패:", error);
      state.workbook = null;
      state.pendingImport = null;
      state.busy = false;
      state.importStatus = "error";
      state.importMessage = `파일을 읽지 못했습니다. ${error.message || "손상된 파일인지 확인해 주세요."}`;
      renderAdmin();
      showToast("엑셀 파일을 읽지 못했습니다.", 4000);
    }
  }

  function buildPendingDatabase() {
    const pending = state.pendingImport;
    if (!pending?.validation?.canApply) return null;
    return {
      meta: {
        title: "학과별 선택과목 안내",
        sourceType: "admin",
        sourceName: pending.fileName,
        sheetName: pending.sheetName,
        updatedAt: new Date().toISOString(),
        importedRows: pending.validation.stats.validRows,
        excludedRows: pending.validation.stats.errorRows
      },
      columns: [...pending.columns],
      rows: pending.validation.validEntries.map((entry) => ({ ...entry.data }))
    };
  }

  async function saveDatabase() {
    const database = buildPendingDatabase();
    if (!database) {
      showToast("검증을 통과한 데이터가 없습니다.");
      return;
    }
    const excluded = state.pendingImport.validation.stats.errorRows;
    if (excluded && !confirm(`오류 ${excluded.toLocaleString("ko-KR")}행을 제외하고 정상 데이터만 적용할까요?`)) return;
    state.busy = true;
    renderAdmin();
    try {
      state.dataset = await store.saveDatabase(database);
      state.notices = [];
      state.importMessage = "DB 적용을 완료했습니다. 조회 화면에 즉시 반영됩니다.";
      showToast(`${database.rows.length.toLocaleString("ko-KR")}개 데이터를 DB에 적용했습니다.`);
    } catch (error) {
      console.error("IndexedDB 저장 실패:", error);
      state.importMessage = `DB 저장에 실패했습니다. 브라우저 저장 공간 또는 개인정보 보호 설정을 확인해 주세요. (${error.message || "알 수 없는 오류"})`;
      state.importStatus = "error";
      showToast("브라우저 DB 저장에 실패했습니다.", 4500);
    } finally {
      state.busy = false;
      renderAdmin();
      updateChrome();
    }
  }

  function exportJson() {
    const database = buildPendingDatabase() || state.dataset;
    if (!database?.rows?.length) {
      showToast("내보낼 데이터가 없습니다.");
      return;
    }
    try {
      const json = JSON.stringify(database, null, 2);
      const blob = new Blob([json], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "database.json";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast("database.json 다운로드를 시작했습니다.");
    } catch (error) {
      console.error("JSON 내보내기 실패:", error);
      showToast("JSON 파일을 만들지 못했습니다.", 4000);
    }
  }

  async function resetDatabase({ clearUiSettings = true } = {}) {
    try {
      await store.deleteUploadedDatabase();
      if (clearUiSettings) {
        store.clearSettings();
        state.settings = {};
        state.simulationSubjects = [];
      }
      state.pendingImport = null;
      state.workbook = null;
      state.importStatus = "idle";
      state.importMessage = "";
      await loadDatabase({ forceDefault: true, cacheBust: true });
      state.category = "전체";
      state.search = "";
      state.viewPage = 1;
      render();
      showToast("브라우저 DB를 지우고 기본 DB를 불러왔습니다.");
    } catch (error) {
      console.error("DB 초기화 실패:", error);
      showToast("현재 DB를 초기화하지 못했습니다.", 4000);
    }
  }

  function openRecord(index) {
    const row = state.dataset.rows[index];
    if (!row) return;
    const title = valueAt(row, COLUMN_ALIASES.department) || displayValue(row[state.dataset.columns[0]]) || "상세 정보";
    detailContent.innerHTML = `
      <p class="dialog-kicker">DATABASE RECORD</p>
      <h2 id="record-dialog-title">${escapeHtml(title)}</h2>
      <dl class="record-detail-list">${state.dataset.columns.map((column) => `<div><dt>${escapeHtml(column)}</dt><dd>${escapeHtml(displayValue(row[column])) || '<span class="empty-cell">정보 없음</span>'}</dd></div>`).join("")}</dl>`;
    if (!detailDialog.open) detailDialog.showModal();
  }

  root.addEventListener("click", async (event) => {
    const category = event.target.closest("[data-view-category]");
    if (category) {
      state.category = category.dataset.viewCategory;
      state.viewPage = 1;
      renderView();
      return;
    }

    const recommendCategory = event.target.closest("[data-recommend-category]");
    if (recommendCategory) {
      state.recommendCategory = recommendCategory.dataset.recommendCategory;
      renderRecommend();
      return;
    }

    const simulationAdd = event.target.closest("[data-simulation-add]");
    if (simulationAdd) {
      const subject = simulationAdd.dataset.simulationAdd;
      const wasSelected = state.simulationSubjects.includes(subject);
      state.simulationSubjects = wasSelected
        ? state.simulationSubjects.filter((item) => item !== subject)
        : [...state.simulationSubjects, subject];
      state.settings.simulationSubjects = state.simulationSubjects;
      store.saveSettings(state.settings);
      renderSubjects();
      showToast(wasSelected ? "시뮬레이션에서 과목을 제거했습니다." : "시뮬레이션에 과목을 추가했습니다.");
      return;
    }

    const simulationSubject = event.target.closest("[data-simulation-subject]");
    if (simulationSubject) {
      const subject = simulationSubject.dataset.simulationSubject;
      state.simulationSubjects = state.simulationSubjects.includes(subject)
        ? state.simulationSubjects.filter((item) => item !== subject)
        : [...state.simulationSubjects, subject];
      state.settings.simulationSubjects = state.simulationSubjects;
      store.saveSettings(state.settings);
      renderSimulation();
      return;
    }

    if (event.target.closest("[data-clear-simulation]")) {
      state.simulationSubjects = [];
      state.settings.simulationSubjects = [];
      store.saveSettings(state.settings);
      renderSimulation();
      showToast("선택한 과목을 모두 해제했습니다.");
      return;
    }

    const pageButton = event.target.closest("[data-page-scope]");
    if (pageButton && !pageButton.disabled) {
      const page = Math.max(1, Number(pageButton.dataset.page) || 1);
      if (pageButton.dataset.pageScope === "view") {
        state.viewPage = page;
        renderView();
      } else if (state.pendingImport) {
        state.pendingImport.previewPage = page;
        renderAdmin();
        document.querySelector(".preview-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      return;
    }

    const recordButton = event.target.closest("[data-record-index]");
    if (recordButton) {
      openRecord(Number(recordButton.dataset.recordIndex));
      return;
    }
    if (event.target.closest("[data-run-validation]")) {
      await analyzeSelectedSheet();
      return;
    }
    if (event.target.closest("[data-apply-database]")) {
      await saveDatabase();
      return;
    }
    if (event.target.closest("[data-export-json]")) {
      exportJson();
      return;
    }
    if (event.target.closest("[data-clear-preview]")) {
      state.pendingImport = null;
      state.workbook = null;
      state.selectedSheet = "";
      state.importStatus = "idle";
      state.importMessage = "";
      renderAdmin();
      return;
    }
    if (event.target.closest("[data-reset-database]")) {
      if (confirm("관리자 업로드 DB와 이 화면의 작은 설정값을 모두 지우고 기본 DB로 돌아갈까요?")) await resetDatabase({ clearUiSettings: true });
      return;
    }
    if (event.target.closest("[data-restore-default]")) {
      if (confirm("현재 업로드 DB를 제거하고 저장소의 최신 data/database.json으로 복원할까요?")) await resetDatabase({ clearUiSettings: false });
    }
  });

  root.addEventListener("input", (event) => {
    if (event.target.matches("[data-subject-search]")) {
      const value = event.target.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.subjectSearch = value;
        renderSubjects();
        const input = root.querySelector("[data-subject-search]");
        input?.focus();
        input?.setSelectionRange(value.length, value.length);
      }, 120);
    }
    if (event.target.matches("[data-view-search]")) {
      const value = event.target.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.search = value;
        state.viewPage = 1;
        renderView();
        const input = root.querySelector("[data-view-search]");
        input?.focus();
        input?.setSelectionRange(value.length, value.length);
      }, 120);
    }
    if (event.target.matches("[data-preview-search]") && state.pendingImport) {
      const value = event.target.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.pendingImport.previewSearch = value;
        state.pendingImport.previewPage = 1;
        renderAdmin();
        const input = root.querySelector("[data-preview-search]");
        input?.focus();
        input?.setSelectionRange(value.length, value.length);
      }, 120);
    }
  });

  root.addEventListener("change", async (event) => {
    if (event.target.matches("[data-excel-input]") && event.target.files?.[0]) {
      await readExcelFile(event.target.files[0]);
    }
    if (event.target.matches("[data-sheet-select]")) {
      state.selectedSheet = event.target.value;
      state.settings.lastSheet = state.selectedSheet;
      store.saveSettings(state.settings);
      await analyzeSelectedSheet();
    }
    if (event.target.matches("[data-error-only]") && state.pendingImport) {
      state.pendingImport.errorOnly = event.target.checked;
      state.pendingImport.previewPage = 1;
      renderAdmin();
    }
  });

  ["dragenter", "dragover"].forEach((type) => root.addEventListener(type, (event) => {
    const zone = event.target.closest("[data-upload-zone]");
    if (!zone || state.busy) return;
    event.preventDefault();
    zone.classList.add("is-dragging");
  }));

  ["dragleave", "drop"].forEach((type) => root.addEventListener(type, async (event) => {
    const zone = event.target.closest("[data-upload-zone]");
    if (!zone || state.busy) return;
    event.preventDefault();
    zone.classList.remove("is-dragging");
    if (type === "drop" && event.dataTransfer?.files?.[0]) await readExcelFile(event.dataTransfer.files[0]);
  }));

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-dialog-close]")) detailDialog.close();
  });

  detailDialog.addEventListener("click", (event) => {
    const bounds = detailDialog.getBoundingClientRect();
    const inside = event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
    if (!inside) detailDialog.close();
  });

  // QA와 향후 Firebase/Supabase 어댑터 연결을 위해 핵심 함수를 명시적으로 노출한다.
  window.DatabaseApp = {
    readExcelFile,
    validateExcelData,
    normalizeData,
    parseMultiValue,
    convertExcelToJson,
    previewData,
    saveDatabase,
    loadDatabase,
    exportJson,
    resetDatabase,
    getState: () => state
  };

  try {
    await loadDatabase();
  } catch (error) {
    console.error("앱 초기화 실패:", error);
    state.notices = ["데이터베이스를 시작하지 못했습니다. 페이지를 새로고침해 주세요."];
  }
  render();
  state.notices.forEach((message) => showToast(message, 4500));
})();