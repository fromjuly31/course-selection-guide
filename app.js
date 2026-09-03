(async () => {
  "use strict";

  const store = window.DatabaseStore;
  const schoolStore = window.SchoolStore;
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
    courseName: ["과목명", "교과목명", "교과목"],
    courseType: ["과목유형", "과목 유형"],
    department: REQUIRED_COLUMN_ALIASES["학과"],
    subjects: REQUIRED_COLUMN_ALIASES["반영과목"],
    category: ["교과군", "계열", "분야", "영역", "교과"],
    courseClass: ["과목 구분", "과목구분"],
    selectionType: ["선택과목의 종류", "선택과목 종류", "선택 유형"],
    achievement: ["성취도"],
    rankGrade: ["석차등급", "석차 등급"],
    csat: ["수능 출제 여부", "수능출제여부"],
    recommendation: ["이 과목을 누구에게 추천하나요?", "추천 대상", "추천대상"],
    mainContent: ["과목의 주요 내용", "주요 내용", "주요내용"],
    faq1: ["그 외 질문 1"],
    faq2: ["그 외 질문 2"],
    science: ["과학 권장과목", "과학권장과목", "권장과학과목"],
    university: ["대학명", "대학교", "학교명"],
    description: ["이 과목은 어떤 과목인가요?", "안내", "설명", "비고", "상세내용"]
  };
  const MULTI_VALUE_COLUMNS = /(반영\s*과목|권장\s*과목|선택\s*과목|관련\s*진로|키워드)/i;
  const NUMERIC_COLUMNS = /^(학점|단위수|선택가능수|정원|모집인원|입학년도|학년도)$/i;
  const FILE_SIZE_LIMIT = 100 * 1024 * 1024;
  const LARGE_FILE_NOTICE = 20 * 1024 * 1024;
  const PREVIEW_PAGE_SIZE = 25;
  const VIEW_PAGE_SIZE = 18;
  const COURSE_GROUP_ORDER = ["국어", "수학", "영어", "사회(역사/도덕 포함)", "과학", "체육", "예술", "기술･가정", "정보", "제2외국어/한문", "교양"];
  const COURSE_GROUP_PALETTES = [
    ["#00796b", "#e4f5f1"], ["#1565c0", "#e8f1fb"], ["#6a1b9a", "#f2eafb"],
    ["#ef6c00", "#fff0e3"], ["#2e7d32", "#eaf6ea"], ["#c62828", "#fbe9e9"],
    ["#ad1457", "#fbe8f0"], ["#827717", "#f4f3df"], ["#00838f", "#e3f5f6"],
    ["#4527a0", "#ece8f8"], ["#5d4037", "#f2ebe8"]
  ];
  const COURSE_GROUP_ICONS = {
    "국어": "book-open", "수학": "calculator", "영어": "globe", "사회(역사/도덕 포함)": "landmark",
    "과학": "flask", "체육": "sports", "예술": "arts", "기술･가정": "tech-home",
    "정보": "computer", "제2외국어/한문": "languages", "교양": "graduation"
  };

  const requestedTab = new URLSearchParams(location.search).get("tab");
  const allowedTabs = ["subjects", "departments", "recommend", "simulation", "admin"];
  const initialTab = requestedTab === "view" ? "departments" : requestedTab;
  const savedSettings = store.getSettings();
  const state = {
    tab: allowedTabs.includes(initialTab) ? initialTab : "subjects",
    dataset: { meta: {}, columns: [], rows: [] },
    notices: [],
    subjectSearch: new URLSearchParams(location.search).get("q") || "",
    subjectCategory: "전체",
    search: "",
    category: "전체",
    recommendCategory: "",
    simulationSubjects: Array.isArray(savedSettings.simulationSubjects) ? savedSettings.simulationSubjects : [],
    schoolSelections: savedSettings.schoolSelections && typeof savedSettings.schoolSelections === "object" ? savedSettings.schoolSelections : {},
    schoolOnlyCourses: new URLSearchParams(location.search).get("schoolOnly") === "1" || Boolean(savedSettings.schoolOnlyCourses),
    schools: [],
    selectedSchool: null,
    curriculum: null,
    schoolConnection: "local",
    schoolConnectionMessage: "학교 데이터를 준비하고 있습니다.",
    schoolUser: null,
    accessRole: "",
    pendingCurriculum: null,
    curriculumImportMessage: "",
    curriculumBusy: false,
    subjectPage: 1,
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

  function syncSchoolState(snapshot = schoolStore?.getSnapshot?.() || {}) {
    state.schools = Array.isArray(snapshot.schools) ? snapshot.schools : [];
    state.selectedSchool = snapshot.selectedSchool || null;
    state.curriculum = snapshot.curriculum || null;
    state.schoolConnection = snapshot.connection || "local";
    state.schoolConnectionMessage = snapshot.message || "";
    state.schoolUser = snapshot.user || null;
    state.accessRole = snapshot.accessRole || "";
    if (!state.selectedSchool || !state.curriculum) state.schoolOnlyCourses = false;
  }

  function normalizedCourseName(value) {
    return compactText(value).replace(/[･・]/g, "·").toLocaleLowerCase("ko");
  }

  function curriculumGrades() {
    const grades = Array.isArray(state.curriculum?.grades) ? state.curriculum.grades : [];
    return [1, 2, 3].map((grade) => {
      const source = grades.find((item) => Number(item.grade) === grade) || {};
      return {
        grade,
        common: Array.isArray(source.common) ? source.common : [],
        electives: Array.isArray(source.electives) ? source.electives : [],
        options: Array.isArray(source.options) ? source.options.map((option, index) => ({
          id: compactText(option?.id) || `option-${index + 1}`,
          label: compactText(option?.label) || `옵션 ${index + 1}`,
          choose: Math.max(1, Number(option?.choose) || 1),
          courses: Array.isArray(option?.courses) ? option.courses.map(compactText).filter(Boolean) : []
        })).filter((option) => option.courses.length) : []
      };
    });
  }

  function schoolCourseNameSet() {
    const names = new Set();
    curriculumGrades().forEach((grade) => {
      [...grade.common, ...grade.electives].forEach((name) => names.add(normalizedCourseName(name)));
      grade.options.forEach((option) => (option.courses || []).forEach((name) => names.add(normalizedCourseName(name))));
    });
    names.delete("");
    return names;
  }

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

  function compactText(value) {
    return displayValue(value).replace(/\s+/g, " ").trim();
  }

  function normalizeCourseGroup(value) {
    const category = compactText(value);
    if (category === "제2외국어" || category === "한문" || category === "제2외국어/한문") return "제2외국어/한문";
    return category || "교과군 미분류";
  }

  function courseTopics(value) {
    return displayValue(value)
      .split(/\r?\n+/)
      .map((item) => item.replace(/^\s*[•·\-–—]\s*/, "").trim())
      .filter(Boolean);
  }

  function faqParts(value) {
    const text = compactText(value);
    const separator = text.indexOf(":");
    if (separator < 0) return { question: "추가로 알아보기", answer: text };
    return {
      question: text.slice(0, separator).trim(),
      answer: text.slice(separator + 1).trim()
    };
  }

  function courseGroupIcon(category) {
    return COURSE_GROUP_ICONS[category] || "book";
  }

  function courseGroupPalette(category) {
    const groupIndex = COURSE_GROUP_ORDER.indexOf(category);
    return COURSE_GROUP_PALETTES[(groupIndex < 0 ? 0 : groupIndex) % COURSE_GROUP_PALETTES.length];
  }

  function courseVisual(category) {
    const groupIndex = COURSE_GROUP_ORDER.indexOf(category);
    return { iconName: courseGroupIcon(category), variant: (groupIndex < 0 ? 0 : groupIndex) % 6 };
  }

  function courseBadge(row) {
    const courseType = valueAt(row, COLUMN_ALIASES.courseType);
    const courseClass = valueAt(row, COLUMN_ALIASES.courseClass);
    const selectionType = valueAt(row, COLUMN_ALIASES.selectionType);
    if (courseType.includes("전문")) return { label: "전문", className: "is-professional" };
    if (courseClass.includes("공통")) return { label: "공통", className: "is-common" };
    if (selectionType.includes("진로")) return { label: "진로", className: "is-career" };
    if (selectionType.includes("융합")) return { label: "융합", className: "is-convergence" };
    if (selectionType.includes("일반")) return { label: "일반", className: "is-general" };
    return null;
  }

  function courseSeriesName(row, category) {
    const courseName = compactText(valueAt(row, COLUMN_ALIASES.courseName));
    if (category === "제2외국어/한문") {
      const originalCategory = compactText(valueAt(row, COLUMN_ALIASES.category));
      if (originalCategory === "한문" || /한문|한자/.test(courseName)) return "한문";
      const language = [
        ["독일어", /독일/], ["러시아어", /러시아/], ["베트남어", /베트남/], ["스페인어", /스페인/],
        ["아랍어", /아랍/], ["일본어", /일본/], ["중국어", /중국/], ["프랑스어", /프랑스/]
      ].find(([, pattern]) => pattern.test(courseName));
      return language?.[0] || "기타 언어";
    }
    if (category === "예술") {
      const artSeries = [
        ["무용", /무용|안무/], ["문예창작", /문예|문장론|문학|시 창작|소설 창작|극 창작/],
        ["미술", /미술|드로잉|조형/], ["사진", /사진/], ["연극", /연극|연기|무대/],
        ["영화･영상", /영화|영상|촬영|편집|사운드/], ["음악", /음악|시창|청음|합창|합주/]
      ].find(([, pattern]) => pattern.test(courseName));
      return artSeries?.[0] || "기타 예술";
    }
    if (category === "기술･가정") {
      return /생활과학|생애|아동|부모/.test(courseName) ? "가정" : "기술";
    }
    return category;
  }

  function courseTypeRank(row) {
    const label = courseBadge(row)?.label;
    return ({ "공통": 0, "일반": 1, "진로": 2, "융합": 3, "전문": 4 })[label] ?? 5;
  }

  function compareCourseEntries(a, b, categoryOrder) {
    const categoryDifference = categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category);
    if (categoryDifference) return categoryDifference;
    const typeDifference = courseTypeRank(a.row) - courseTypeRank(b.row);
    if (typeDifference) return typeDifference;
    const seriesA = courseSeriesName(a.row, a.category);
    const seriesB = courseSeriesName(b.row, b.category);
    const seriesDifference = a.category === "기술･가정"
      ? ["기술", "가정"].indexOf(seriesA) - ["기술", "가정"].indexOf(seriesB)
      : seriesA.localeCompare(seriesB, "ko");
    return seriesDifference || a.name.localeCompare(b.name, "ko");
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
      subjects: "EXPLORE YOUR COURSES",
      departments: "DISCOVER YOUR MAJOR",
      recommend: "FIND YOUR BEST PATH",
      simulation: "DESIGN YOUR CURRICULUM",
      admin: "CONNECT YOUR SCHOOL"
    }[state.tab];
    return `
      <header class="data-page-head">
        <div>
          <p class="page-eyebrow">${eyebrow}</p>
          <h1>${escapeHtml(title)}</h1>
          <p>${escapeHtml(description)}</p>
        </div>
        <div class="page-count"><strong>${Number(count).toLocaleString("ko-KR")}</strong><span>${escapeHtml(countLabel)}</span></div>
      </header>`;
  }

  function updateChrome() {
    document.querySelectorAll("[data-db-count]").forEach((node) => { node.textContent = state.dataset.rows.length.toLocaleString("ko-KR"); });
    document.querySelectorAll("[data-source-state]").forEach((node) => { node.textContent = sourceLabel(); });
    renderHeaderSchoolPicker();
    document.querySelectorAll("[data-tab]").forEach((link) => {
      if (link.dataset.tab === state.tab) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    const titles = { subjects: "과목 안내", departments: "학과 안내", recommend: "과목 추천", simulation: "시뮬레이션", admin: "데이터 연동" };
    document.title = `${titles[state.tab]} · 과목 선택 안내 플랫폼`;
  }

  function renderHeaderSchoolPicker() {
    const picker = document.querySelector(".header-school-picker");
    const label = picker?.querySelector("[data-school-picker-label]");
    const options = picker?.querySelector("[data-school-options]");
    if (!picker || !label || !options) return;
    label.textContent = state.selectedSchool?.name || "학교 선택";
    picker.classList.toggle("has-selection", Boolean(state.selectedSchool));
    options.innerHTML = state.schools.length
      ? state.schools.map((school) => `<button type="button" class="${state.selectedSchool?.id === school.id ? "is-selected" : ""}" data-school-id="${escapeHtml(school.id)}"><strong>${escapeHtml(school.name)}</strong><small>${escapeHtml(school.region || "학교 편제표 연동")}</small></button>`).join("")
      : `<span class="school-menu-empty">${schoolStore?.isConfigured?.() ? "아직 연동된 학교가 없습니다." : "Supabase 설정 후 학교가 표시됩니다."}</span>`;
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

  function recordCard(row, originalIndex, seriesLabel = "") {
    const courseName = valueAt(row, COLUMN_ALIASES.courseName);
    if (courseName) {
      const category = normalizeCourseGroup(valueAt(row, COLUMN_ALIASES.category));
      const visual = courseVisual(category);
      const badge = courseBadge(row);
      const [accent, soft] = courseGroupPalette(category);
      return `
        <article class="record-card course-record-card course-card-variant-${visual.variant}" style="--group-accent:${accent}; --group-soft:${soft}" role="button" tabindex="0" data-record-index="${originalIndex}" aria-label="${escapeHtml(courseName)} 상세 정보 보기">
          <span class="course-card-symbol" aria-hidden="true">${icon(visual.iconName)}</span>
          <div class="course-card-main"><h3>${escapeHtml(courseName)}</h3><span class="course-card-badges">${badge ? `<span class="course-type-badge ${badge.className}">${badge.label}</span>` : ""}${seriesLabel ? `<span class="course-series-badge">${escapeHtml(seriesLabel)}</span>` : ""}</span></div>
          <span class="course-card-arrow" aria-hidden="true">${icon("arrow")}</span>
        </article>`;
    }

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

  function courseTypeSectionsMarkup(visibleCourses, allCourses, category) {
    const showSeries = ["예술", "기술･가정", "제2외국어/한문"].includes(category);
    const typeGroups = new Map();
    visibleCourses.forEach((course) => {
      const badge = courseBadge(course.row) || { label: "기타", className: "" };
      if (!typeGroups.has(badge.label)) typeGroups.set(badge.label, { badge, courses: [] });
      typeGroups.get(badge.label).courses.push(course);
    });

    return `<div class="course-type-sections">${[...typeGroups.values()].map(({ badge, courses }) => {
      const totalForType = allCourses.filter((course) => (courseBadge(course.row)?.label || "기타") === badge.label).length;
      const cardsMarkup = `<div class="record-grid">${courses.map(({ row, originalIndex }) => recordCard(row, originalIndex, showSeries ? courseSeriesName(row, category) : "")).join("")}</div>`;
      return `<section class="course-type-section"><header class="course-type-head"><div><span class="course-type-badge ${badge.className}">${escapeHtml(badge.label)}</span><h3>${escapeHtml(badge.label)}과목</h3></div><span>총 ${totalForType.toLocaleString("ko-KR")}개</span></header>${cardsMarkup}</section>`;
    }).join("")}</div>`;
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
    const courseNameColumn = findColumn(state.dataset.columns, COLUMN_ALIASES.courseName);
    if (courseNameColumn) {
      const categoryColumn = findColumn(state.dataset.columns, COLUMN_ALIASES.category);
      const completeCourses = state.dataset.rows.map((row, originalIndex) => ({
        row,
        originalIndex,
        name: displayValue(row[courseNameColumn]),
        category: normalizeCourseGroup(categoryColumn ? row[categoryColumn] : "")
      }));
      const openCourseNames = schoolCourseNameSet();
      const allCourses = state.schoolOnlyCourses && state.curriculum
        ? completeCourses.filter(({ name }) => openCourseNames.has(normalizedCourseName(name)))
        : completeCourses;
      const availableCategories = [...new Set(allCourses.map(({ category }) => category))];
      const categoryOrder = [
        ...COURSE_GROUP_ORDER.filter((category) => availableCategories.includes(category)),
        ...availableCategories.filter((category) => !COURSE_GROUP_ORDER.includes(category)).sort((a, b) => a.localeCompare(b, "ko"))
      ];
      if (state.subjectCategory !== "전체" && !availableCategories.includes(state.subjectCategory)) state.subjectCategory = "전체";

      const categoryCounts = new Map(categoryOrder.map((category) => [category, allCourses.filter((course) => course.category === category).length]));
      const matches = allCourses.filter(({ row, category }) => {
        if (query) return state.dataset.columns.some((column) => displayValue(row[column]).toLocaleLowerCase("ko").includes(query));
        return state.subjectCategory === "전체" || category === state.subjectCategory;
      }).sort((a, b) => compareCourseEntries(a, b, categoryOrder));
      const showingCategoryOverview = !query && state.subjectCategory === "전체";
      const totalPages = showingCategoryOverview ? 1 : Math.max(1, Math.ceil(matches.length / VIEW_PAGE_SIZE));
      state.subjectPage = Math.min(state.subjectPage, totalPages);
      const start = (state.subjectPage - 1) * VIEW_PAGE_SIZE;
      const visibleCourses = matches.slice(start, start + VIEW_PAGE_SIZE);
      const emptyMarkup = `<div class="empty-state"><span class="empty-icon">${icon("book")}</span><h2>검색 결과가 없습니다.</h2><p>다른 과목명이나 관심 키워드를 검색해 보세요.</p></div>`;

      const categoryCards = categoryOrder.map((category) => {
        const [accent, soft] = courseGroupPalette(category);
        return `
          <button class="course-group-card" type="button" style="--group-accent:${accent}; --group-soft:${soft}" data-subject-category="${escapeHtml(category)}" aria-label="${escapeHtml(category)} 과목 보기">
            <span class="course-group-card-icon">${icon(courseGroupIcon(category))}</span>
            <span class="course-group-card-copy"><small>교과군</small><strong>${escapeHtml(category)}</strong><span>${Number(categoryCounts.get(category) || 0).toLocaleString("ko-KR")}개 과목</span></span>
            <span class="course-group-card-arrow">${icon("arrow")}</span>
          </button>`;
      }).join("");

      let resultsMarkup = "";
      if (showingCategoryOverview) {
        resultsMarkup = `
          <div class="results-head"><h2>교과군을 선택하세요</h2><span>총 ${allCourses.length.toLocaleString("ko-KR")}개 과목</span></div>
          <section class="course-group-grid" aria-label="교과군 목록">${categoryCards}</section>`;
      } else if (query) {
        resultsMarkup = `
          <div class="results-head"><h2>“${escapeHtml(state.subjectSearch.trim())}” 검색 결과</h2><span>전체 교과군에서 ${matches.length.toLocaleString("ko-KR")}개</span></div>
          <section class="record-grid subject-search-results" aria-live="polite">${visibleCourses.length ? visibleCourses.map(({ row, originalIndex }) => recordCard(row, originalIndex)).join("") : emptyMarkup}</section>
          ${paginationMarkup(state.subjectPage, totalPages, "subjects")}`;
      } else {
        const [accent, soft] = courseGroupPalette(state.subjectCategory);
        resultsMarkup = `
          <button class="subject-group-back" type="button" data-subject-category="전체">${icon("arrow")} 전체 교과군 보기</button>
          <section class="subject-group is-focused" style="--group-accent:${accent}; --group-soft:${soft}" aria-live="polite">
            <header class="subject-group-head">
              <div class="subject-group-title"><span class="subject-group-icon">${icon(courseGroupIcon(state.subjectCategory))}</span><div><p>교과군</p><h2>${escapeHtml(state.subjectCategory)}</h2></div></div>
              <span class="subject-group-count">총 ${matches.length.toLocaleString("ko-KR")}개 과목</span>
            </header>
            ${visibleCourses.length ? courseTypeSectionsMarkup(visibleCourses, matches, state.subjectCategory) : emptyMarkup}
          </section>
          ${paginationMarkup(state.subjectPage, totalPages, "subjects")}`;
      }

      root.innerHTML = `
        ${renderNotices()}
        ${pageHead("과목 안내", state.schoolOnlyCourses && state.selectedSchool ? `${state.selectedSchool.name}에 개설된 과목만 살펴보고 있습니다.` : "교과군을 선택하거나 검색해 2022 개정 교육과정의 과목 정보를 살펴보세요.", showingCategoryOverview ? categoryOrder.length : matches.length, showingCategoryOverview ? "교과군" : "검색 과목")}
        <section class="toolbar subject-toolbar" aria-label="과목 검색과 개설 교과 필터">
          <label class="search-field"><span class="sr-only">과목 검색</span>${icon("search")}<input type="search" value="${escapeHtml(state.subjectSearch)}" placeholder="과목명, 교과군, 관심 분야를 검색하세요" data-subject-search autocomplete="off"></label>
          <button class="school-course-toggle ${state.schoolOnlyCourses ? "is-active" : ""}" type="button" data-school-course-toggle aria-pressed="${state.schoolOnlyCourses}" ${state.curriculum ? "" : "disabled"} title="${state.curriculum ? `${escapeHtml(state.selectedSchool?.name || "선택 학교")}의 개설 교과만 보기` : "먼저 편제표가 연동된 학교를 선택해 주세요."}">${icon("check")}<span><strong>개설 교과</strong><small>${state.selectedSchool?.name ? escapeHtml(state.selectedSchool.name) : "학교 선택 필요"}</small></span></button>
        </section>
        ${resultsMarkup}`;
      return;
    }

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
    if (!categoryColumn) return [];
    const categories = [...new Set(state.dataset.rows.map((row) => normalizeCourseGroup(row[categoryColumn])).filter(Boolean))];
    return [
      ...COURSE_GROUP_ORDER.filter((category) => categories.includes(category)),
      ...categories.filter((category) => !COURSE_GROUP_ORDER.includes(category)).sort((a, b) => a.localeCompare(b, "ko"))
    ];
  }

  function renderRecommend() {
    const categories = availableCategories();
    if (state.recommendCategory && !categories.includes(state.recommendCategory)) state.recommendCategory = "";
    const categoryColumn = findColumn(state.dataset.columns, COLUMN_ALIASES.category);
    const recommendations = state.recommendCategory
      ? state.dataset.rows
        .map((row, originalIndex) => ({ row, originalIndex }))
        .filter(({ row }) => normalizeCourseGroup(row[categoryColumn]) === state.recommendCategory)
      : [];

    root.innerHTML = `
      ${renderNotices()}
      ${pageHead("관심 분야 과목 추천", "관심 있는 교과군을 선택하면 2022 개정 교육과정의 관련 과목을 보여드립니다. 구체적인 진로와 관심사는 우측 하단 챗봇에 질문해 보세요.", recommendations.length, "추천 결과")}
      <section class="recommend-panel">
        <p class="section-kicker">STEP 01 · INTEREST</p>
        <h2>어떤 분야에 관심이 있나요?</h2>
        <p>교과군 하나를 선택하세요. 과목 설명과 추천 대상은 엑셀 과목 DB를 기준으로 안내합니다.</p>
        <div class="recommend-options" role="group" aria-label="관심 계열 선택">
          ${categories.map((category) => `<button class="recommend-option ${state.recommendCategory === category ? "is-active" : ""}" type="button" data-recommend-category="${escapeHtml(category)}" aria-pressed="${state.recommendCategory === category}">${icon("sparkles")}<span>${escapeHtml(category)}</span></button>`).join("")}
        </div>
      </section>
      <div class="results-head"><h2>추천 과목</h2><span>${state.recommendCategory ? `${escapeHtml(state.recommendCategory)} · ${recommendations.length.toLocaleString("ko-KR")}건` : "관심 교과군 선택 후 표시"}</span></div>
      <section class="record-grid" aria-live="polite">
        ${recommendations.length ? recommendations.map(({ row, originalIndex }) => recordCard(row, originalIndex)).join("") : `<div class="empty-state"><span class="empty-icon">${icon("compass")}</span><h2>${categories.length ? "관심 교과군을 선택해 주세요." : "교과군 데이터가 없습니다."}</h2><p>${categories.length ? "선택한 교과군의 과목을 살펴보거나 챗봇에 관심 분야를 질문해 보세요." : "기본 과목 DB가 정상적으로 로드됐는지 확인해 주세요."}</p></div>`}
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

  function schoolSelectionMap() {
    const schoolId = state.selectedSchool?.id;
    if (!schoolId) return {};
    if (!state.schoolSelections[schoolId] || typeof state.schoolSelections[schoolId] !== "object") state.schoolSelections[schoolId] = {};
    return state.schoolSelections[schoolId];
  }

  function curriculumOptionKey(grade, option, index) {
    return `grade-${grade}:${option.id || option.label || index + 1}`;
  }

  function selectedCurriculumSubjects() {
    const map = schoolSelectionMap();
    const selected = [];
    curriculumGrades().forEach((grade) => {
      const optionNames = new Set();
      grade.options.forEach((option, index) => {
        option.courses.forEach((course) => optionNames.add(normalizedCourseName(course)));
        const key = curriculumOptionKey(grade.grade, option, index);
        const allowed = new Set(option.courses);
        (Array.isArray(map[key]) ? map[key] : []).filter((course) => allowed.has(course)).forEach((course) => selected.push(course));
      });
      const standaloneKey = `grade-${grade.grade}:open-electives`;
      const standalone = new Set(grade.electives.filter((course) => !optionNames.has(normalizedCourseName(course))));
      (Array.isArray(map[standaloneKey]) ? map[standaloneKey] : []).filter((course) => standalone.has(course)).forEach((course) => selected.push(course));
    });
    return [...new Set(selected)];
  }

  function saveSchoolSelections() {
    state.settings.schoolSelections = state.schoolSelections;
    state.simulationSubjects = selectedCurriculumSubjects();
    state.settings.simulationSubjects = state.simulationSubjects;
    store.saveSettings(state.settings);
  }

  function gradeCurriculumMarkup(gradeData) {
    const selections = schoolSelectionMap();
    const optionCourseNames = new Set(gradeData.options.flatMap((option) => option.courses || []).map(normalizedCourseName));
    const standalone = gradeData.electives.filter((course) => !optionCourseNames.has(normalizedCourseName(course)));
    const commonMarkup = gradeData.common.length
      ? gradeData.common.map((course) => `<span class="common-course-chip">${icon("check")} ${escapeHtml(course)}</span>`).join("")
      : '<span class="curriculum-empty-copy">입력된 공통 과목이 없습니다.</span>';
    const standaloneKey = `grade-${gradeData.grade}:open-electives`;
    const standaloneSelected = Array.isArray(selections[standaloneKey]) ? selections[standaloneKey] : [];
    const standaloneMarkup = standalone.length
      ? `<section class="curriculum-option-card is-open"><header><div><small>개설 선택과목</small><h3>자유 선택</h3></div><span>선택 제한 없음</span></header><div class="curriculum-course-options">${standalone.map((course) => `<button type="button" class="${standaloneSelected.includes(course) ? "is-selected" : ""}" data-curriculum-choice data-selection-key="${escapeHtml(standaloneKey)}" data-course-name="${escapeHtml(course)}" data-choose="0" aria-pressed="${standaloneSelected.includes(course)}"><span>${standaloneSelected.includes(course) ? "✓" : "+"}</span>${escapeHtml(course)}</button>`).join("")}</div></section>`
      : "";
    const optionsMarkup = gradeData.options.length
      ? gradeData.options.map((option, index) => {
        const key = curriculumOptionKey(gradeData.grade, option, index);
        const selected = Array.isArray(selections[key]) ? selections[key].filter((course) => option.courses.includes(course)) : [];
        const choose = Math.max(1, Number(option.choose) || 1);
        const complete = selected.length === Math.min(choose, option.courses.length);
        return `<section class="curriculum-option-card ${complete ? "is-complete" : ""}">
          <header><div><small>${escapeHtml(option.label || `옵션 ${index + 1}`)}</small><h3>${option.courses.length.toLocaleString("ko-KR")}개 교과 중 택 ${choose}</h3></div><span><strong>${selected.length}</strong> / ${choose} 선택</span></header>
          <div class="curriculum-course-options">${option.courses.map((course) => {
            const isSelected = selected.includes(course);
            const atLimit = !isSelected && selected.length >= choose;
            return `<button type="button" class="${isSelected ? "is-selected" : ""} ${atLimit ? "is-limit" : ""}" data-curriculum-choice data-selection-key="${escapeHtml(key)}" data-course-name="${escapeHtml(course)}" data-choose="${choose}" aria-pressed="${isSelected}" aria-disabled="${atLimit}"><span>${isSelected ? "✓" : "+"}</span>${escapeHtml(course)}</button>`;
          }).join("")}</div>
        </section>`;
      }).join("")
      : '<div class="curriculum-empty-option"><p>이 학년에 입력된 선택 옵션이 없습니다.</p></div>';

    return `<article class="grade-curriculum-card">
      <header class="grade-curriculum-head"><span>${gradeData.grade}</span><div><p>GRADE ${String(gradeData.grade).padStart(2, "0")}</p><h2>${gradeData.grade}학년 편제</h2></div></header>
      <section class="common-course-block"><div><small>COMMON COURSES</small><h3>공통 과목</h3></div><div class="common-course-list">${commonMarkup}</div></section>
      <div class="curriculum-options-grid">${optionsMarkup}${standaloneMarkup}</div>
    </article>`;
  }

  function renderSimulation() {
    if (!state.selectedSchool || !state.curriculum) {
      root.innerHTML = `
        ${renderNotices()}
        ${pageHead("과목 선택 시뮬레이션", "학교 편제표를 기준으로 학년별 공통 과목과 선택 옵션을 구성합니다.", 0, "연동 옵션")}
        <div class="empty-state school-required-state"><span class="empty-icon">${icon("school")}</span><h2>${state.selectedSchool ? "이 학교에 공개된 편제표가 없습니다." : "먼저 학교를 선택해 주세요."}</h2><p>${state.selectedSchool ? "학교 담당자가 데이터 연동 탭에서 편제표를 업로드하면 시뮬레이션이 활성화됩니다." : "화면 상단의 학교 선택을 누르면 연동된 학교 목록을 확인할 수 있습니다."}</p><button class="primary-action" type="button" data-open-school-picker>학교 선택 열기</button></div>`;
      return;
    }

    const grades = curriculumGrades();
    const selectionMap = schoolSelectionMap();
    let optionCount = 0;
    let completedOptions = 0;
    grades.forEach((grade) => grade.options.forEach((option, index) => {
      optionCount += 1;
      const selected = selectionMap[curriculumOptionKey(grade.grade, option, index)] || [];
      if (selected.length === Math.min(Math.max(1, Number(option.choose) || 1), option.courses.length)) completedOptions += 1;
    }));
    const selectedCount = selectedCurriculumSubjects().length;

    root.innerHTML = `
      ${renderNotices()}
      ${pageHead("과목 선택 시뮬레이션", `${state.selectedSchool.name} ${state.curriculum.admissionYear || ""}학년도 입학생 편제표를 기준으로 선택합니다.`, selectedCount, "선택 과목")}
      <section class="simulation-overview">
        <div><p class="section-kicker">SCHOOL CURRICULUM</p><h2>${escapeHtml(state.selectedSchool.name)}</h2><span>${escapeHtml(state.curriculum.admissionYear || "-")}학년도 입학생 · 옵션 ${completedOptions}/${optionCount} 완료</span></div>
        <button class="text-action" type="button" data-clear-school-simulation ${selectedCount ? "" : "disabled"}>선택 초기화</button>
      </section>
      <section class="grade-curriculum-list" aria-live="polite">${grades.map(gradeCurriculumMarkup).join("")}</section>
      <section class="simulation-selection-summary ${optionCount > 0 && completedOptions === optionCount ? "is-complete" : ""}">
        <span>${icon(optionCount > 0 && completedOptions === optionCount ? "check" : "route")}</span>
        <div><small>선택 현황</small><h2>${optionCount ? `${optionCount}개 옵션 중 ${completedOptions}개 완료` : "선택 옵션이 아직 없습니다."}</h2><p>${selectedCount ? `현재 ${selectedCount}개 과목을 선택했습니다.` : "각 옵션에서 안내된 개수만큼 과목을 선택해 주세요."}</p></div>
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

  function downloadCurriculumTemplate() {
    if (!window.XLSX) {
      showToast("엑셀 도구를 불러오지 못했습니다. 인터넷 연결 후 다시 시도해 주세요.", 4500);
      return;
    }
    const schoolName = state.selectedSchool?.name || "";
    const region = state.selectedSchool?.region || "";
    const admissionYear = new Date().getFullYear() + 1;
    const curriculumRows = [
      ["학교 편제표 표준 양식", "", "", "", "", ""],
      ["지역", region, "학교명", schoolName, "입학년도", admissionYear],
      [],
      ["학년", "구분", "옵션", "선택 수", "과목명"]
    ];
    [1, 2, 3].forEach((grade) => {
      curriculumRows.push([grade, "공통", "", "", ""]);
      for (let option = 1; option <= 10; option += 1) curriculumRows.push([grade, "선택", `옵션 ${option}`, "", ""]);
    });
    const guideRows = [
      ["학교 편제표 표준 양식 작성 안내", "", "", "", "", ""],
      ["입력은 '편제표' 시트 한 곳에서만 합니다. 이 시트의 아래 예시는 참고용이며 업로드되지 않습니다.", "", "", "", "", ""],
      [],
      ["항목", "작성 방법", "입력 예시"],
      ["학교 정보", "편제표 위쪽에 지역, 학교명, 입학년도를 모두 입력합니다.", "강원특별자치도 / 우리학교 / 2027"],
      ["공통 과목", "학년별 공통 행 하나에 모든 공통 과목을 쉼표(,)로 구분해 입력합니다.", "공통국어1, 공통수학1, 공통영어1"],
      ["선택 옵션", "같은 옵션의 과목은 행을 나누지 않고 과목명 한 칸에 쉼표(,)로 구분해 입력합니다.", "물리학, 화학, 생명과학, 지구과학"],
      ["선택 수", "각 옵션에서 골라야 하는 과목 수를 1~10 사이의 정수로 입력합니다.", "4개 과목 중 2개 선택 → 2"],
      ["빈 옵션", "사용하지 않는 옵션 행은 선택 수와 과목명을 비워 둡니다.", "옵션 4를 사용하지 않으면 빈칸 유지"],
      ["확인 사항", "선택 수는 해당 옵션의 과목 수보다 클 수 없습니다.", "3개 과목이면 선택 수는 최대 3"],
      [],
      ["작성 예시", "", "", "", "", ""],
      ["지역", "강원특별자치도", "학교명", "우리학교", "입학년도", 2027],
      [],
      ["학년", "구분", "옵션", "선택 수", "과목명"],
      [1, "공통", "", "", "공통국어1, 공통수학1, 공통영어1, 한국사1"],
      [1, "선택", "옵션 1", 2, "물리학, 화학, 생명과학, 지구과학"],
      [1, "선택", "옵션 2", 1, "한국지리 탐구, 사회와 문화, 윤리와 사상"],
      [2, "공통", "", "", "공통국어2, 공통수학2, 공통영어2, 한국사2"],
      [2, "선택", "옵션 1", 1, "기하, 미적분Ⅱ, 경제 수학"],
      [3, "공통", "", "", "스포츠 생활1, 음악 연주"],
      [3, "선택", "옵션 1", 2, "고급 물리학, 고급 화학, 고급 생명과학"]
    ];
    const workbook = window.XLSX.utils.book_new();
    const curriculumSheet = window.XLSX.utils.aoa_to_sheet(curriculumRows);
    const guideSheet = window.XLSX.utils.aoa_to_sheet(guideRows);
    curriculumSheet["!cols"] = [{ wch: 9 }, { wch: 11 }, { wch: 13 }, { wch: 11 }, { wch: 68 }, { wch: 14 }];
    curriculumSheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }];
    curriculumSheet["!autofilter"] = { ref: `A4:E${curriculumRows.length}` };
    guideSheet["!cols"] = [{ wch: 16 }, { wch: 76 }, { wch: 48 }, { wch: 12 }, { wch: 68 }, { wch: 14 }];
    guideSheet["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } },
      { s: { r: 11, c: 0 }, e: { r: 11, c: 5 } }
    ];
    window.XLSX.utils.book_append_sheet(workbook, guideSheet, "작성안내");
    window.XLSX.utils.book_append_sheet(workbook, curriculumSheet, "편제표");
    window.XLSX.writeFile(workbook, "학교_편제표_연동_양식.xlsx");
    showToast("학교 편제표 양식 다운로드를 시작했습니다.");
  }

  function sheetMatrix(workbook, sheetName) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return [];
    return window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true, blankrows: true });
  }

  function uniqueCourseNames(values) {
    const result = [];
    const seen = new Set();
    values.forEach((value) => {
      parseMultiValue(value).forEach((course) => {
        const key = normalizedCourseName(course);
        if (key && !seen.has(key)) {
          seen.add(key);
          result.push(course.trim());
        }
      });
    });
    return result;
  }

  async function parseCurriculumFile(file) {
    if (!window.XLSX) throw new Error("엑셀 도구를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.");
    if (!/\.(xlsx|xls)$/i.test(file.name)) throw new Error(".xlsx 또는 .xls 파일만 업로드할 수 있습니다.");
    const workbook = window.XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
    if (!workbook.SheetNames.includes("편제표")) throw new Error("'편제표' 시트를 찾을 수 없습니다. 표준 양식의 시트 이름을 바꾸지 말아 주세요.");
    const matrix = sheetMatrix(workbook, "편제표");
    if (matrix.length < 5) throw new Error("편제표 시트에 학교 정보와 과목 데이터가 없습니다.");
    const headerRowIndex = matrix.findIndex((row) => {
      const cells = row.map(normalizedKey);
      return ["학년", "구분", "옵션", "선택수", "과목명"].every((header) => cells.includes(normalizedKey(header)));
    });
    if (headerRowIndex < 0) throw new Error("편제표 시트에서 학년·구분·옵션·선택 수·과목명 머리글을 찾을 수 없습니다.");
    const info = new Map();
    matrix.slice(0, headerRowIndex).forEach((row) => {
      row.forEach((cell, index) => {
        const key = normalizedKey(cell);
        if (["지역", "학교명", "입학년도"].map(normalizedKey).includes(key)) info.set(key, compactText(row[index + 1]));
      });
    });
    const schoolName = info.get(normalizedKey("학교명")) || "";
    const region = info.get(normalizedKey("지역")) || "";
    const admissionYear = Number(String(info.get(normalizedKey("입학년도")) || "").replace(/[^0-9]/g, ""));
    const headers = matrix[headerRowIndex].map((header) => normalizedKey(header));
    const columnIndex = (aliases) => headers.findIndex((header) => aliases.map(normalizedKey).includes(header));
    const gradeIndex = columnIndex(["학년"]);
    const typeIndex = columnIndex(["구분", "과목 구분"]);
    const optionIndex = columnIndex(["옵션", "선택군"]);
    const chooseIndex = columnIndex(["선택 수", "선택수", "택"]);
    const courseIndex = columnIndex(["과목명", "교과목명", "교과목"]);
    const missing = [[gradeIndex, "학년"], [typeIndex, "구분"], [optionIndex, "옵션"], [chooseIndex, "선택 수"], [courseIndex, "과목명"]].filter(([index]) => index < 0).map(([, name]) => name);
    if (missing.length) throw new Error(`필수 열을 찾을 수 없습니다: ${missing.join(", ")}`);
    if (!region) throw new Error("편제표 시트 위쪽의 지역을 입력해 주세요.");
    if (!schoolName) throw new Error("편제표 시트 위쪽의 학교명을 입력해 주세요.");
    if (!Number.isInteger(admissionYear) || admissionYear < 2022 || admissionYear > 2100) throw new Error("편제표 시트 위쪽의 입학년도를 2022~2100 사이 숫자로 입력해 주세요.");

    const gradeMap = new Map([1, 2, 3].map((grade) => [grade, { grade, common: [], electives: [], optionMap: new Map() }]));
    const errors = [];
    const commonRows = new Set();
    const optionRows = new Set();
    matrix.slice(headerRowIndex + 1).forEach((row, rowIndex) => {
      const courseNames = uniqueCourseNames([row[courseIndex]]);
      if (!courseNames.length) return;
      const excelRow = headerRowIndex + rowIndex + 2;
      const grade = Number(String(row[gradeIndex]).replace(/[^0-9]/g, ""));
      const rawType = compactText(row[typeIndex]);
      const type = rawType.includes("공통") ? "공통" : rawType.includes("선택") ? "선택" : "";
      const rawOption = compactText(row[optionIndex]);
      const optionMatch = rawOption.match(/^(?:옵션|선택군)?\s*(10|[1-9])$/);
      const optionLabel = optionMatch ? `옵션 ${Number(optionMatch[1])}` : "";
      const choose = Number(compactText(row[chooseIndex]));
      if (!gradeMap.has(grade)) errors.push(`${excelRow}행: 학년은 1, 2, 3 중 하나여야 합니다.`);
      if (!type) errors.push(`${excelRow}행: 구분은 공통 또는 선택이어야 합니다.`);
      if (rawOption && !optionLabel) errors.push(`${excelRow}행: 옵션은 옵션 1부터 옵션 10까지만 사용할 수 있습니다.`);
      if (type === "선택" && !optionLabel) errors.push(`${excelRow}행: 선택 과목에는 옵션 1부터 옵션 10까지 중 하나를 입력해 주세요.`);
      if (optionLabel && (!Number.isInteger(choose) || choose < 1 || choose > 10)) errors.push(`${excelRow}행: 옵션 과목의 선택 수를 1~10 사이 숫자로 입력해 주세요.`);
      if (!gradeMap.has(grade) || !type) return;
      const target = gradeMap.get(grade);
      if (type === "공통") {
        if (commonRows.has(grade)) errors.push(`${excelRow}행: ${grade}학년 공통 과목은 한 행에 쉼표로 구분해 입력해 주세요.`);
        commonRows.add(grade);
        if (rawOption || row[chooseIndex] !== "") errors.push(`${excelRow}행: 공통 과목 행의 옵션과 선택 수는 비워 주세요.`);
        target.common.push(...courseNames);
      }
      else {
        target.electives.push(...courseNames);
        if (optionLabel) {
          const optionRowKey = `${grade}-${optionLabel}`;
          if (optionRows.has(optionRowKey)) errors.push(`${excelRow}행: ${grade}학년 ${optionLabel} 과목은 한 행에 쉼표로 구분해 입력해 주세요.`);
          optionRows.add(optionRowKey);
          if (!target.optionMap.has(optionLabel)) target.optionMap.set(optionLabel, { id: `option-${Number(optionMatch[1])}`, label: optionLabel, choose, courses: [] });
          const option = target.optionMap.get(optionLabel);
          option.courses.push(...courseNames);
        }
      }
    });

    const grades = [...gradeMap.values()].map((grade) => {
      const options = [...grade.optionMap.values()].map((option) => ({ ...option, courses: uniqueCourseNames(option.courses) })).sort((a, b) => Number(a.id.replace("option-", "")) - Number(b.id.replace("option-", "")));
      options.forEach((option) => {
        if (option.choose > option.courses.length) errors.push(`${grade.grade}학년 ${option.label}: 선택 수(${option.choose})가 과목 수(${option.courses.length})보다 많습니다.`);
      });
      return { grade: grade.grade, common: uniqueCourseNames(grade.common), electives: uniqueCourseNames(grade.electives), options };
    });
    const courseCount = new Set(grades.flatMap((grade) => [...grade.common, ...grade.electives]).map(normalizedCourseName)).size;
    if (!courseCount) errors.push("편제표에 입력된 과목이 없습니다.");
    if (errors.length) throw new Error(errors.slice(0, 6).join("\n"));
    return { version: 2, fileName: file.name, schoolName, region, admissionYear, grades, courseCount, uploadedAt: new Date().toISOString() };
  }

  function curriculumPreviewMarkup() {
    const pending = state.pendingCurriculum;
    if (!pending) return "";
    const canPublish = Boolean(state.schoolUser && state.accessRole);
    const publishLabel = state.curriculumBusy ? "Supabase에 저장 중" : state.accessRole === "admin" ? "새로 등록 · 기존 내용 수정" : "새 편제표 등록";
    return `<section class="curriculum-upload-preview">
      <header><div><small>UPLOAD PREVIEW</small><h3>${escapeHtml(pending.schoolName)} 편제표</h3></div><span>${pending.admissionYear}학년도 입학생</span></header>
      <div class="curriculum-preview-grades">${pending.grades.map((grade) => `<div><strong>${grade.grade}학년</strong><span>공통 ${grade.common.length} · 선택 ${grade.electives.length} · 옵션 ${grade.options.length}</span></div>`).join("")}</div>
      <p>${escapeHtml(pending.fileName)} · 중복 제외 총 ${pending.courseCount.toLocaleString("ko-KR")}개 교과</p>
      <div class="admin-button-row"><button class="primary-action" type="button" data-publish-curriculum ${state.curriculumBusy || !canPublish ? "disabled" : ""}>${publishLabel}</button><button class="text-action" type="button" data-clear-curriculum-preview>미리보기 닫기</button></div>
      ${!canPublish ? '<small class="preview-help">담당 교사 또는 관리자로 권한을 확인하면 등록할 수 있습니다.</small>' : state.accessRole === "admin" ? '<small class="preview-help">관리자는 새 편제표를 등록하고 같은 학교·입학년도의 기존 내용을 수정할 수 있습니다.</small>' : '<small class="preview-help">담당 교사는 새 편제표만 등록할 수 있으며 기존 내용은 수정할 수 없습니다.</small>'}
    </section>`;
  }

  function schoolAuthMarkup() {
    if (!schoolStore?.isConfigured?.()) return `<div class="connection-empty">${icon("database")}<div><strong>Supabase 설정이 필요합니다.</strong><p><code>supabase-config.js</code>에 Project URL과 Publishable key를 입력하면 등록 권한 확인이 활성화됩니다.</p></div></div>`;
    if (!state.schoolUser || !state.accessRole) return `<div class="school-access-login">
      <form class="school-login-form teacher-login-form" data-teacher-login-form><div><small>TEACHER ACCESS</small><h3>담당 교사 · 새 데이터 등록</h3><p>설정된 관리 비밀번호만 입력하세요.</p></div><label><span>관리 비밀번호</span><input type="password" name="password" autocomplete="current-password" required placeholder="관리 비밀번호"></label><button class="primary-action" type="submit">등록 권한 확인</button></form>
      <form class="school-login-form admin-login-form" data-admin-login-form><div><small>ADMIN ACCESS</small><h3>관리자 · 수정 및 삭제</h3><p>관리자 계정으로 로그인하세요.</p></div><label><span>관리자 이메일</span><input type="email" name="email" autocomplete="username" required placeholder="admin@example.com"></label><label><span>비밀번호</span><input type="password" name="password" autocomplete="current-password" required placeholder="비밀번호"></label><button class="secondary-action" type="submit">관리자 로그인</button></form>
    </div>`;
    const isAdmin = state.accessRole === "admin";
    return `<div class="signed-school-user ${isAdmin ? "is-admin" : "is-teacher"}"><span>${icon("user")}</span><div><small>${isAdmin ? "ADMIN" : "TEACHER"}</small><strong>${isAdmin ? "관리자 권한으로 로그인됨" : "담당 교사 등록 권한 확인됨"}</strong><p>${isAdmin ? "기존 편제표를 수정·삭제하고 새 데이터를 등록할 수 있습니다." : "새 학교·새 입학년도 편제표만 등록할 수 있습니다."}</p></div><button class="text-action" type="button" data-school-signout>로그아웃</button></div>`;
  }

  function renderAdmin() {
    root.innerHTML = `
      ${renderNotices()}
      ${pageHead("데이터 연동", "학교별 편제표 양식을 내려받아 작성하고 Supabase에 연결합니다.", state.schools.length, "연동 학교")}
      <aside class="admin-notice school-connection-notice ${state.schoolConnection === "online" ? "is-online" : state.schoolConnection === "error" ? "is-error" : ""}">${icon(state.schoolConnection === "online" ? "check" : "help")}<span><strong>${state.schoolConnection === "online" ? "Supabase 온라인 연동" : "학교 데이터 연동 준비"}</strong> ${escapeHtml(state.schoolConnectionMessage)}</span></aside>
      <div class="school-integration-layout">
        <section class="admin-card school-upload-card" aria-busy="${state.curriculumBusy}">
          <div class="admin-section-head"><div><p class="section-kicker">SCHOOL CURRICULUM</p><h2>양식 다운로드 · 업로드</h2></div><span>.xlsx · .xls</span></div>
          <div class="template-download-panel"><span>${icon("download")}</span><div><strong>학교 편제표 표준 양식</strong><p>편제표 한 시트에 학교 정보와 학년별 공통·옵션 과목을 작성합니다.</p></div><button class="primary-action" type="button" data-download-curriculum-template>양식 다운로드</button></div>
          ${schoolAuthMarkup()}
          <label class="upload-zone curriculum-upload-zone ${state.curriculumBusy ? "is-busy" : ""}">
            <input type="file" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" data-curriculum-input ${state.curriculumBusy ? "disabled" : ""}>
            <span class="upload-icon">${icon("upload")}</span>
            <strong>${state.curriculumBusy ? "편제표를 처리하고 있습니다" : "작성한 학교 편제표 업로드"}</strong>
            <small>업로드 후 학년별 과목 수와 옵션 규칙을 먼저 검증합니다.</small>
          </label>
          ${state.curriculumImportMessage ? `<p class="import-message ${state.pendingCurriculum ? "" : "is-error"}" role="status">${escapeHtml(state.curriculumImportMessage)}</p>` : ""}
          ${curriculumPreviewMarkup()}
        </section>
        <aside class="admin-card connected-schools-card">
          <div class="admin-section-head"><div><p class="section-kicker">CONNECTED SCHOOLS</p><h2>현재 연동 학교</h2></div><span>${state.schools.length.toLocaleString("ko-KR")}곳</span></div>
          <div class="connected-school-list">${state.schools.length ? state.schools.map((school, index) => `<button type="button" class="${state.selectedSchool?.id === school.id ? "is-selected" : ""}" data-school-id="${escapeHtml(school.id)}"><span>${String(index + 1).padStart(2, "0")}</span><div><strong>${escapeHtml(school.name)}</strong><small>${escapeHtml(school.region || "지역 정보 없음")}</small></div>${icon("arrow")}</button>`).join("") : `<div class="connected-schools-empty">${icon("school")}<strong>연동된 학교가 없습니다.</strong><p>Supabase에서 학교를 등록하면 이 목록과 메인 학교 선택에 자동으로 표시됩니다.</p></div>`}</div>
          ${state.selectedSchool ? `<div class="active-school-summary"><small>현재 선택 학교</small><strong>${escapeHtml(state.selectedSchool.name)}</strong><span>${state.curriculum ? `${escapeHtml(state.curriculum.admissionYear || "-")}학년도 편제표 연동됨` : "공개된 편제표 없음"}</span>${state.accessRole === "admin" && state.curriculum?.id ? `<button class="danger-action" type="button" data-delete-curriculum data-curriculum-id="${escapeHtml(state.curriculum.id)}">현재 편제표 삭제</button>` : ""}</div>` : ""}
        </aside>
      </div>
      <section class="admin-card schema-card">
        <div class="admin-section-head"><div><p class="section-kicker">FORMAT GUIDE</p><h2>편제표 작성 기준</h2></div><span>편제표 시트만 입력</span></div>
        <div class="schema-grid">
          <div><strong>학교 정보</strong><p><code>지역 · 학교명 · 입학년도</code></p><small>편제표 상단의 세 항목을 모두 입력합니다. 별도의 학교정보 시트는 사용하지 않습니다.</small></div>
          <div><strong>과목 입력</strong><p><code>과목명, 과목명, 과목명</code></p><small>학년별 공통은 한 행, 같은 옵션의 과목도 한 행에 쉼표로 구분해 작성합니다.</small></div>
          <div><strong>선택 옵션</strong><p><code>옵션 1~10 · 선택 수 1~10</code></p><small>각 옵션에서 골라야 하는 수를 입력하며, 과목 수보다 크게 입력할 수 없습니다.</small></div>
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
      rows: pending.validation.validEntries.map((entry) => ({ ...entry.data })),
      chatbot: state.dataset.chatbot || { keywordWeights: [], searchSettings: [] },
      sources: state.dataset.sources || []
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
    const courseName = valueAt(row, COLUMN_ALIASES.courseName);
    if (courseName) {
      const description = compactText(valueAt(row, COLUMN_ALIASES.description));
      const recommendation = compactText(valueAt(row, COLUMN_ALIASES.recommendation));
      const topics = courseTopics(valueAt(row, COLUMN_ALIASES.mainContent));
      const faqs = [valueAt(row, COLUMN_ALIASES.faq1), valueAt(row, COLUMN_ALIASES.faq2)].filter((value) => compactText(value)).map(faqParts);
      const category = normalizeCourseGroup(valueAt(row, COLUMN_ALIASES.category));
      const courseType = valueAt(row, COLUMN_ALIASES.courseType);
      const series = displayValue(row["계열"]);
      const courseClass = valueAt(row, COLUMN_ALIASES.courseClass);
      const selectionType = valueAt(row, COLUMN_ALIASES.selectionType);
      const achievement = valueAt(row, COLUMN_ALIASES.achievement);
      const rankGrade = valueAt(row, COLUMN_ALIASES.rankGrade);
      const csat = valueAt(row, COLUMN_ALIASES.csat);

      detailContent.innerHTML = `
        <p class="dialog-kicker">COURSE GUIDE · ${escapeHtml(category || "과목 안내")}</p>
        <h2 id="record-dialog-title">${escapeHtml(courseName)}</h2>
        <div class="course-dialog-badges">${[courseType, series, courseClass, selectionType].filter(Boolean).map((value) => `<span>${escapeHtml(value)}</span>`).join("")}</div>
        <dl class="course-dialog-facts">
          <div><dt>성취도</dt><dd>${escapeHtml(achievement || "정보 없음")}</dd></div>
          <div><dt>석차등급</dt><dd>${escapeHtml(rankGrade || "정보 없음")}</dd></div>
          <div><dt>수능 출제 여부</dt><dd>${escapeHtml(csat || "해당 정보 없음")}</dd></div>
        </dl>
        ${description ? `<section class="course-dialog-section"><h3>이 과목은 어떤 과목인가요?</h3><p>${escapeHtml(description)}</p></section>` : ""}
        ${recommendation ? `<section class="course-dialog-section is-recommendation"><h3>이 과목을 누구에게 추천하나요?</h3><p>${escapeHtml(recommendation)}</p></section>` : ""}
        ${topics.length ? `<section class="course-dialog-section"><h3>과목의 주요 내용</h3><ul>${topics.map((topic) => `<li>${escapeHtml(topic)}</li>`).join("")}</ul></section>` : ""}
        ${faqs.length ? `<section class="course-dialog-section course-dialog-faq"><h3>더 알아보기</h3>${faqs.map((faq) => `<article><h4>${escapeHtml(faq.question)}</h4><p>${escapeHtml(faq.answer)}</p></article>`).join("")}</section>` : ""}`;
      if (!detailDialog.open) detailDialog.showModal();
      return;
    }

    const title = valueAt(row, COLUMN_ALIASES.department) || displayValue(row[state.dataset.columns[0]]) || "상세 정보";
    detailContent.innerHTML = `
      <p class="dialog-kicker">DATABASE RECORD</p>
      <h2 id="record-dialog-title">${escapeHtml(title)}</h2>
      <dl class="record-detail-list">${state.dataset.columns.map((column) => `<div><dt>${escapeHtml(column)}</dt><dd>${escapeHtml(displayValue(row[column])) || '<span class="empty-cell">정보 없음</span>'}</dd></div>`).join("")}</dl>`;
    if (!detailDialog.open) detailDialog.showModal();
  }

  root.addEventListener("click", async (event) => {
    const schoolCard = event.target.closest(".connected-school-list [data-school-id]");
    if (schoolCard && schoolStore) {
      await schoolStore.selectSchool(schoolCard.dataset.schoolId);
      syncSchoolState();
      state.subjectCategory = "전체";
      state.subjectPage = 1;
      render();
      showToast(`${state.selectedSchool?.name || "학교"} 편제표를 연결했습니다.`);
      return;
    }

    if (event.target.closest("[data-school-course-toggle]")) {
      if (!state.curriculum) {
        showToast("먼저 편제표가 연동된 학교를 선택해 주세요.");
        return;
      }
      state.schoolOnlyCourses = !state.schoolOnlyCourses;
      state.settings.schoolOnlyCourses = state.schoolOnlyCourses;
      store.saveSettings(state.settings);
      state.subjectCategory = "전체";
      state.subjectPage = 1;
      renderSubjects();
      showToast(state.schoolOnlyCourses ? `${state.selectedSchool.name} 개설 교과만 표시합니다.` : "전체 교과목을 표시합니다.");
      return;
    }

    const curriculumChoice = event.target.closest("[data-curriculum-choice]");
    if (curriculumChoice) {
      const selections = schoolSelectionMap();
      const key = curriculumChoice.dataset.selectionKey;
      const course = curriculumChoice.dataset.courseName;
      const choose = Math.max(0, Number(curriculumChoice.dataset.choose) || 0);
      const current = Array.isArray(selections[key]) ? [...selections[key]] : [];
      const selectedIndex = current.indexOf(course);
      if (selectedIndex >= 0) current.splice(selectedIndex, 1);
      else if (choose > 0 && current.length >= choose) {
        showToast(`이 옵션에서는 ${choose}개 과목만 선택할 수 있습니다.`);
        return;
      } else current.push(course);
      selections[key] = current;
      saveSchoolSelections();
      renderSimulation();
      return;
    }

    if (event.target.closest("[data-clear-school-simulation]")) {
      if (state.selectedSchool) state.schoolSelections[state.selectedSchool.id] = {};
      saveSchoolSelections();
      renderSimulation();
      showToast("이 학교의 과목 선택을 초기화했습니다.");
      return;
    }

    if (event.target.closest("[data-open-school-picker]")) {
      const picker = document.querySelector(".header-school-picker");
      const menu = picker?.querySelector("[data-school-menu]");
      const trigger = picker?.querySelector("[data-school-trigger]");
      if (menu && trigger) {
        menu.hidden = false;
        trigger.setAttribute("aria-expanded", "true");
        trigger.focus();
      }
      return;
    }

    if (event.target.closest("[data-download-curriculum-template]")) {
      downloadCurriculumTemplate();
      return;
    }

    if (event.target.closest("[data-clear-curriculum-preview]")) {
      state.pendingCurriculum = null;
      state.curriculumImportMessage = "";
      renderAdmin();
      return;
    }

    if (event.target.closest("[data-publish-curriculum]")) {
      if (!state.pendingCurriculum || !schoolStore) return;
      state.curriculumBusy = true;
      state.curriculumImportMessage = "Supabase에 학교 편제표를 저장하고 있습니다.";
      renderAdmin();
      try {
        const result = await schoolStore.publishCurriculum(state.pendingCurriculum);
        syncSchoolState(result);
        state.pendingCurriculum = null;
        const actionLabel = result.action === "updated" ? "수정" : "등록";
        state.curriculumImportMessage = `${state.selectedSchool?.name || "학교"} 편제표를 ${actionLabel}했습니다.`;
        showToast(`학교 편제표가 ${actionLabel}되었습니다.`, 4000);
      } catch (error) {
        console.error("학교 편제표 공개 실패:", error);
        state.curriculumImportMessage = `저장하지 못했습니다. ${error.message || "권한과 연결 상태를 확인해 주세요."}`;
        showToast("학교 편제표를 저장하지 못했습니다.", 4500);
      } finally {
        state.curriculumBusy = false;
        renderAdmin();
        updateChrome();
      }
      return;
    }

    const deleteCurriculumButton = event.target.closest("[data-delete-curriculum]");
    if (deleteCurriculumButton) {
      const schoolName = state.selectedSchool?.name || "선택한 학교";
      const admissionYear = state.curriculum?.admissionYear || "현재";
      if (!confirm(`${schoolName} ${admissionYear}학년도 편제표를 삭제할까요? 삭제한 데이터는 복구할 수 없습니다.`)) return;
      deleteCurriculumButton.disabled = true;
      try {
        const result = await schoolStore?.deleteCurriculum(deleteCurriculumButton.dataset.curriculumId);
        syncSchoolState(result);
        renderAdmin();
        showToast("편제표를 삭제했습니다.", 4000);
      } catch (error) {
        console.error("학교 편제표 삭제 실패:", error);
        showToast(`삭제하지 못했습니다. ${error.message || "관리자 권한을 확인해 주세요."}`, 4500);
        renderAdmin();
      }
      return;
    }

    if (event.target.closest("[data-school-signout]")) {
      try {
        await schoolStore?.signOut();
        syncSchoolState();
        renderAdmin();
        showToast("데이터 연동 권한에서 로그아웃했습니다.");
      } catch (error) {
        showToast(`로그아웃하지 못했습니다. ${error.message || "다시 시도해 주세요."}`, 4000);
      }
      return;
    }

    const subjectCategory = event.target.closest("[data-subject-category]");
    if (subjectCategory) {
      state.subjectCategory = subjectCategory.dataset.subjectCategory;
      state.subjectPage = 1;
      renderSubjects();
      return;
    }

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
      if (pageButton.dataset.pageScope === "subjects") {
        state.subjectPage = page;
        renderSubjects();
      } else if (pageButton.dataset.pageScope === "view") {
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

  root.addEventListener("keydown", (event) => {
    const card = event.target.closest(".course-record-card[data-record-index]");
    if (!card || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    openRecord(Number(card.dataset.recordIndex));
  });

  root.addEventListener("input", (event) => {
    if (event.target.matches("[data-subject-search]")) {
      const value = event.target.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.subjectSearch = value;
        state.subjectPage = 1;
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

  root.addEventListener("submit", async (event) => {
    const teacherForm = event.target.closest("[data-teacher-login-form]");
    const adminForm = event.target.closest("[data-admin-login-form]");
    const form = teacherForm || adminForm;
    if (!form) return;
    event.preventDefault();
    const formData = new FormData(form);
    const button = form.querySelector("button[type='submit']");
    if (button) {
      button.disabled = true;
      button.textContent = "로그인 중";
    }
    try {
      const result = teacherForm
        ? await schoolStore.signInTeacher(String(formData.get("password") || ""))
        : await schoolStore.signInAdmin(String(formData.get("email") || "").trim(), String(formData.get("password") || ""));
      syncSchoolState(result);
      renderAdmin();
      showToast(teacherForm ? "담당 교사 등록 권한을 확인했습니다." : "관리자 권한으로 로그인했습니다.");
    } catch (error) {
      console.error("데이터 연동 권한 확인 실패:", error);
      showToast(`로그인하지 못했습니다. ${error.message || "계정 정보를 확인해 주세요."}`, 4500);
      if (button) {
        button.disabled = false;
        button.textContent = "로그인";
      }
    }
  });

  root.addEventListener("change", async (event) => {
    if (event.target.matches("[data-curriculum-input]") && event.target.files?.[0]) {
      const file = event.target.files[0];
      state.curriculumBusy = true;
      state.pendingCurriculum = null;
      state.curriculumImportMessage = "학교 편제표를 읽고 검증하고 있습니다.";
      renderAdmin();
      try {
        state.pendingCurriculum = await parseCurriculumFile(file);
        state.curriculumImportMessage = `검증 완료: ${state.pendingCurriculum.courseCount.toLocaleString("ko-KR")}개 교과와 학년별 옵션을 확인했습니다.`;
        showToast("학교 편제표 검증이 완료되었습니다.");
      } catch (error) {
        console.error("학교 편제표 분석 실패:", error);
        state.pendingCurriculum = null;
        state.curriculumImportMessage = `편제표를 사용할 수 없습니다. ${error.message || "양식 내용을 확인해 주세요."}`;
        showToast("학교 편제표 검증에 실패했습니다.", 4500);
      } finally {
        state.curriculumBusy = false;
        renderAdmin();
      }
      return;
    }
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

  document.addEventListener("click", async (event) => {
    if (event.target.closest("[data-dialog-close]")) detailDialog.close();
    const picker = document.querySelector(".header-school-picker");
    const trigger = event.target.closest(".header-school-picker [data-school-trigger]");
    const menu = picker?.querySelector("[data-school-menu]");
    if (trigger && menu) {
      const willOpen = menu.hidden;
      menu.hidden = !willOpen;
      trigger.setAttribute("aria-expanded", String(willOpen));
      return;
    }
    const schoolOption = event.target.closest(".header-school-picker [data-school-id]");
    if (schoolOption && schoolStore) {
      schoolOption.disabled = true;
      await schoolStore.selectSchool(schoolOption.dataset.schoolId);
      syncSchoolState();
      state.subjectCategory = "전체";
      state.subjectPage = 1;
      render();
      if (menu) menu.hidden = true;
      showToast(`${state.selectedSchool?.name || "학교"} 편제표를 연결했습니다.`);
      return;
    }
    if (picker && !picker.contains(event.target) && menu) {
      menu.hidden = true;
      picker.querySelector("[data-school-trigger]")?.setAttribute("aria-expanded", "false");
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const picker = document.querySelector(".header-school-picker");
    const menu = picker?.querySelector("[data-school-menu]");
    if (menu) menu.hidden = true;
    picker?.querySelector("[data-school-trigger]")?.setAttribute("aria-expanded", "false");
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
    downloadCurriculumTemplate,
    parseCurriculumFile,
    getState: () => state
  };

  try {
    if (schoolStore) syncSchoolState(await schoolStore.init());
    await loadDatabase();
  } catch (error) {
    console.error("앱 초기화 실패:", error);
    state.notices = ["데이터베이스를 시작하지 못했습니다. 페이지를 새로고침해 주세요."];
  }
  render();
  state.notices.forEach((message) => showToast(message, 4500));
})();
