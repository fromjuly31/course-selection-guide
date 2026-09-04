(async () => {
  "use strict";

  const store = window.DatabaseStore;
  const schoolStore = window.SchoolStore;
  const root = document.querySelector("#app-root");
  const detailDialog = document.querySelector("#record-dialog");
  const detailContent = document.querySelector("[data-record-dialog-content]");
  const recommendNoticeDialog = document.querySelector("#recommend-notice-dialog");
  const curriculumAlertDialog = document.querySelector("#curriculum-alert-dialog");
  const curriculumAlertTitle = document.querySelector("#curriculum-alert-title");
  const curriculumAlertMessage = document.querySelector("#curriculum-alert-message");
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
  const SCHOOL_REGIONS = Object.freeze(Array.isArray(schoolStore?.regions) ? [...schoolStore.regions] : []);
  const FIRST_GRADE_COMMON_BY_SEMESTER = Object.freeze({
    1: Object.freeze(["공통국어1", "공통수학1", "공통영어1", "한국사1", "통합사회1", "통합과학1", "과학탐구실험1", "체육1"]),
    2: Object.freeze(["공통국어2", "공통수학2", "공통영어2", "한국사2", "통합사회2", "통합과학2", "과학탐구실험2", "체육2"])
  });
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
  const DEPARTMENT_FIELD_VISUALS = {
    "인문": { icon: "book-open", accent: "#6956c8", soft: "#eeebff", description: "언어·문학·역사·철학을 통해 사람과 문화를 탐구합니다." },
    "사회": { icon: "landmark", accent: "#2671a5", soft: "#e7f2fa", description: "사회 현상과 제도, 공동체의 변화를 폭넓게 살펴봅니다." },
    "자연": { icon: "leaf", accent: "#27805d", soft: "#e6f5ed", description: "수학과 기초과학으로 자연의 원리와 생명 현상을 탐구합니다." },
    "공학": { icon: "wrench", accent: "#176a78", soft: "#e2f3f5", description: "과학 원리를 기술과 설계로 연결해 문제를 해결합니다." },
    "의학": { icon: "heart", accent: "#b95362", soft: "#fae9ec", description: "생명과 건강을 이해하고 돌봄과 치료의 길을 탐색합니다." },
    "교육": { icon: "graduation", accent: "#a46b16", soft: "#fbf0dc", description: "배움과 성장을 설계하며 교육 현장의 전문성을 기릅니다." },
    "예체능": { icon: "palette", accent: "#a44f83", soft: "#f8e8f2", description: "감각과 표현, 신체 활동을 창의적인 결과로 발전시킵니다." },
    "기타": { icon: "shapes", accent: "#586c76", soft: "#eaf0f2", description: "여러 학문을 융합해 새롭게 등장하는 진로를 탐색합니다." }
  };

  const pageParams = new URLSearchParams(location.search);
  const requestedTab = pageParams.get("tab");
  const allowedTabs = ["subjects", "departments", "recommend", "simulation", "admin"];
  const initialTab = requestedTab === "view" ? "departments" : requestedTab;
  const savedSettings = store.getSettings();
  const state = {
    tab: allowedTabs.includes(initialTab) ? initialTab : "subjects",
    dataset: { meta: {}, columns: [], rows: [] },
    departmentDataset: { meta: {}, fields: [], departments: [] },
    notices: [],
    subjectSearch: pageParams.get("q") || "",
    subjectCategory: "전체",
    departmentField: initialTab === "departments" ? pageParams.get("field") || "" : "",
    departmentSearch: initialTab === "departments" ? pageParams.get("q") || "" : "",
    departmentCommonOpen: false,
    recommendStep: 1,
    recommendMaxStep: 1,
    recommendField: "",
    recommendDepartmentId: "",
    recommendDepartmentIds: [],
    recommendDepartmentSearch: "",
    recommendKeywords: [],
    recommendSection: initialTab === "recommend" && ["common", "departments"].includes(pageParams.get("section"))
      ? pageParams.get("section")
      : initialTab === "recommend" && pageParams.get("department") ? "departments" : "",
    comparisonIds: (pageParams.get("compare") || "").split(",").filter(Boolean).slice(0, 2),
    comparisonOpen: pageParams.get("comparison") === "1",
    dialogDepartmentId: "",
    dialogSubjectKind: "",
    dialogSubjectName: "",
    dialogRecordIndex: -1,
    dialogReturnToRecommend: false,
    simulationResultOpen: false,
    simulationGradeStep: 1,
    simulationMaxGradeStep: 1,
    simulationResultUnlocked: false,
    simulationSubjects: Array.isArray(savedSettings.simulationSubjects) ? savedSettings.simulationSubjects : [],
    schoolSelections: savedSettings.schoolSelections && typeof savedSettings.schoolSelections === "object" ? savedSettings.schoolSelections : {},
    schoolOnlyCourses: pageParams.get("schoolOnly") === "1" || Boolean(savedSettings.schoolOnlyCourses),
    schools: [],
    selectedSchool: null,
    selectedAdmissionYear: null,
    curriculum: null,
    schoolConnection: "local",
    schoolConnectionMessage: "학교 데이터를 준비하고 있습니다.",
    schoolUser: null,
    accessRole: "",
    pendingCurriculum: null,
    curriculumImportMessage: "",
    curriculumBusy: false,
    subjectPage: 1,
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
  let platformExportBusy = false;
  let majorCourseOrderCache;
  let curriculumDragPayload = null;
  let majorCourseOrderDataset;
  let recommendationCourseIndexCache;
  let recommendationCourseIndexDataset;

  const RECOMMENDATION_COURSE_ALIASES = new Map([
    ["매체와의사소통", "매체 의사소통"],
    ["사화와문화", "사회와 문화"],
    ["소프트웨어생활", "소프트웨어와 생활"],
    ["심화영어독해와직문", "심화 영어 독해와 작문"],
    ["영행지리", "여행지리"],
    ["인공지능기호", "인공지능 기초"],
    ["주제탐구도서", "주제 탐구 독서"]
  ]);

  function syncSchoolState(snapshot = schoolStore?.getSnapshot?.() || {}) {
    const nextSchoolId = snapshot.selectedSchool?.id || "";
    const nextAdmissionYear = Number(snapshot.selectedAdmissionYear) || null;
    const selectionChanged = (state.selectedSchool?.id || "") !== nextSchoolId || state.selectedAdmissionYear !== nextAdmissionYear;
    state.schools = Array.isArray(snapshot.schools) ? snapshot.schools : [];
    state.selectedSchool = snapshot.selectedSchool || null;
    state.selectedAdmissionYear = nextAdmissionYear;
    state.curriculum = snapshot.curriculum || null;
    state.schoolConnection = snapshot.connection || "local";
    state.schoolConnectionMessage = snapshot.message || "";
    state.schoolUser = snapshot.user || null;
    state.accessRole = snapshot.accessRole || "";
    if (selectionChanged) {
      state.simulationResultOpen = false;
      state.simulationGradeStep = 1;
      state.simulationMaxGradeStep = 1;
      state.simulationResultUnlocked = false;
    }
    if (!state.selectedSchool || !state.curriculum) state.schoolOnlyCourses = false;
  }

  function normalizedCourseName(value) {
    return compactText(value).replace(/[･・]/g, "·").toLocaleLowerCase("ko");
  }

  function looseCourseName(value) {
    return compactText(value).normalize("NFKC").toLocaleLowerCase("ko").replace(/[^0-9a-z가-힣]/g, "");
  }

  function curriculumCourseAliasKey(value) {
    const key = looseCourseName(value);
    return key.replace(/([가-힣])(iii|ii|i)$/i, (_match, prefix, numeral) => {
      const number = { i: "1", ii: "2", iii: "3" }[numeral.toLowerCase()];
      return `${prefix}${number}`;
    });
  }

  function recommendationCourseIndex() {
    if (recommendationCourseIndexCache && recommendationCourseIndexDataset === state.dataset) return recommendationCourseIndexCache;
    const courseNameColumn = findColumn(state.dataset.columns, COLUMN_ALIASES.courseName);
    const subjects = courseNameColumn ? state.dataset.rows.map((row, index) => ({
      row,
      index,
      name: compactText(row[courseNameColumn]),
      key: normalizedCourseName(row[courseNameColumn]),
      looseKey: looseCourseName(row[courseNameColumn]),
      category: normalizeCourseGroup(valueAt(row, COLUMN_ALIASES.category))
    })).filter((subject) => subject.name) : [];
    recommendationCourseIndexDataset = state.dataset;
    const byCurriculumAlias = new Map();
    subjects.forEach((subject) => {
      const aliasKey = curriculumCourseAliasKey(subject.name);
      if (!aliasKey) return;
      const existing = byCurriculumAlias.get(aliasKey);
      if (!byCurriculumAlias.has(aliasKey)) byCurriculumAlias.set(aliasKey, subject);
      else if (existing?.key !== subject.key) byCurriculumAlias.set(aliasKey, null);
    });
    recommendationCourseIndexCache = {
      subjects,
      byName: new Map(subjects.map((subject) => [subject.key, subject])),
      byLooseName: new Map(subjects.map((subject) => [subject.looseKey, subject])),
      byCurriculumAlias
    };
    return recommendationCourseIndexCache;
  }

  function curriculumCourseReference(value, index = recommendationCourseIndex()) {
    const name = compactText(value);
    if (!name) return null;
    return index.byName.get(normalizedCourseName(name))
      || index.byLooseName.get(looseCourseName(name))
      || index.byCurriculumAlias.get(curriculumCourseAliasKey(name))
      || null;
  }

  function recommendationCourseReferences(value, index = recommendationCourseIndex()) {
    const name = compactText(value);
    if (!name) return [];
    const direct = curriculumCourseReference(name, index);
    if (direct) return [direct];

    if (/^영어\s*[ⅠI1]\s*[·･・/,]\s*[ⅡI2]+$/i.test(name.normalize("NFKC"))) {
      return ["영어Ⅰ", "영어Ⅱ"].map((courseName) => index.byName.get(normalizedCourseName(courseName))).filter(Boolean);
    }

    const cleanedName = name.replace(/\([^)]*\)/g, " ").replace(/\s+등\s*$/, "").replace(/\s+/g, " ").trim();
    const cleaned = index.byName.get(normalizedCourseName(cleanedName)) || index.byLooseName.get(looseCourseName(cleanedName));
    if (cleaned) return [cleaned];

    const aliasName = RECOMMENDATION_COURSE_ALIASES.get(looseCourseName(name));
    const alias = aliasName && (index.byName.get(normalizedCourseName(aliasName)) || index.byLooseName.get(looseCourseName(aliasName)));
    if (alias) return [alias];

    const selectionMatch = name.match(/(일반|진로|융합)\s*선택\s*전\s*과목/);
    if (selectionMatch) {
      const categories = name.slice(0, selectionMatch.index).split(/[·･・/,]/).map(compactText).filter(Boolean);
      const selectionType = `${selectionMatch[1]}선택`;
      return index.subjects.filter((subject) => categories.includes(subject.category)
        && normalizedKey(valueAt(subject.row, COLUMN_ALIASES.selectionType)) === normalizedKey(selectionType));
    }
    return [];
  }

  function curriculumGrades() {
    const grades = Array.isArray(state.curriculum?.grades) ? state.curriculum.grades : [];
    const admissionYear = Number(state.selectedAdmissionYear || state.curriculum?.admissionYear);
    const usesRevisedFirstGradeCommon = !admissionYear || admissionYear >= 2025;
    return [1, 2, 3].map((grade) => {
      const source = grades.find((item) => Number(item.grade) === grade) || {};
      const hasSemesterData = Array.isArray(source.semesters) && source.semesters.length > 0;
      const semesterSources = [1, 2].map((semester) => {
        if (!hasSemesterData) return semester === 1 ? source : {};
        return source.semesters.find((item) => Number(item?.semester) === semester) || {};
      });
      const semesters = semesterSources.map((semesterSource, semesterIndex) => {
        const semester = semesterIndex + 1;
        const options = Array.isArray(semesterSource.options) ? semesterSource.options.map((option, index) => {
          const baseId = compactText(option?.id) || `option-${index + 1}`;
          const id = hasSemesterData && !baseId.startsWith("semester-") ? `semester-${semester}-${baseId}` : baseId;
          return {
            id,
            label: compactText(option?.label) || `옵션 ${index + 1}`,
            choose: Math.max(1, Number(option?.choose) || 1),
            courses: uniqueCourseNames(Array.isArray(option?.courses) ? option.courses : []),
            semester
          };
        }).filter((option) => option.courses.length) : [];
        return {
          semester,
          common: uniqueCourseNames([
            ...(grade === 1 && usesRevisedFirstGradeCommon ? FIRST_GRADE_COMMON_BY_SEMESTER[semester] : []),
            ...(Array.isArray(semesterSource.common) ? semesterSource.common : [])
          ]),
          electives: uniqueCourseNames(Array.isArray(semesterSource.electives) ? semesterSource.electives : []),
          options
        };
      });
      return {
        grade,
        semesters,
        common: uniqueCourseNames(semesters.flatMap((semester) => semester.common)),
        electives: uniqueCourseNames(semesters.flatMap((semester) => semester.electives)),
        options: semesters.flatMap((semester) => semester.options)
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

  function printActionMarkup(kind, id = "", options = {}) {
    const classes = `${options.compact ? "is-compact" : ""} ${options.iconOnly ? "is-icon-only" : ""}`;
    const idAttribute = id !== "" ? ` data-print-id="${escapeHtml(id)}"` : "";
    if (window.matchMedia?.("(max-width: 820px)").matches) {
      const label = "이미지 저장";
      return `<button class="print-pdf-action ${classes}" type="button" data-image-view="${escapeHtml(kind)}"${idAttribute} aria-label="${label}">${icon("download")}${options.iconOnly ? "" : `<span>${label}</span>`}</button>`;
    }
    const contextLabel = compactText(options.label)
      .replace(/\s*인쇄\s*[·ㆍ]\s*PDF(?:\s*저장)?\s*$/i, "")
      .trim();
    const printLabel = "인쇄";
    const pdfLabel = options.compact ? "PDF" : "PDF 다운로드";
    const printAriaLabel = contextLabel ? `${contextLabel} 인쇄` : printLabel;
    const pdfAriaLabel = contextLabel ? `${contextLabel} PDF 다운로드` : "PDF 다운로드";
    return `<span class="print-action-group ${options.compact ? "is-compact" : ""} ${options.iconOnly ? "is-icon-only" : ""}"><button class="print-pdf-action ${classes}" type="button" data-print-view="${escapeHtml(kind)}"${idAttribute} aria-label="${escapeHtml(printAriaLabel)}">${icon("print")}${options.iconOnly ? "" : `<span>${printLabel}</span>`}</button><button class="print-pdf-action is-pdf-download ${classes}" type="button" data-pdf-view="${escapeHtml(kind)}"${idAttribute} aria-label="${escapeHtml(pdfAriaLabel)}">${icon("download")}${options.iconOnly ? "" : `<span>${pdfLabel}</span>`}</button></span>`;
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

  function showCurriculumAlert(title, message) {
    if (!curriculumAlertDialog || !curriculumAlertTitle || !curriculumAlertMessage) return;
    curriculumAlertTitle.textContent = compactText(title) || "편제표를 확인해 주세요";
    curriculumAlertMessage.textContent = compactText(message) || "편제표 내용을 확인한 뒤 다시 시도해 주세요.";
    if (!curriculumAlertDialog.open) curriculumAlertDialog.showModal();
    requestAnimationFrame(() => curriculumAlertDialog.querySelector(".curriculum-alert-confirm")?.focus({ preventScroll: true }));
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
    document.title = `${titles[state.tab]} · 선택 과목 안내 플랫폼`;
  }

  function renderHeaderSchoolPicker() {
    const picker = document.querySelector(".header-school-picker");
    const label = picker?.querySelector("[data-school-picker-label]");
    const options = picker?.querySelector("[data-school-options]");
    if (!picker || !label || !options) return;
    label.textContent = state.selectedSchool
      ? `${state.selectedSchool.name}${state.selectedAdmissionYear ? ` · ${state.selectedAdmissionYear}` : " · 입학년도 선택"}`
      : "학교 선택";
    picker.classList.toggle("has-selection", Boolean(state.selectedSchool));
    options.innerHTML = state.schools.length
      ? state.schools.map((school) => {
        const selected = state.selectedSchool?.id === school.id;
        const years = schoolAdmissionYears(school);
        return `<button type="button" class="${selected ? "is-selected" : ""}" data-school-id="${escapeHtml(school.id)}"><strong>${escapeHtml(school.name)}</strong><small>${escapeHtml(school.region || "지역 정보 없음")} · ${years.length ? `${years.length}개 입학년도` : "등록 편제표 없음"}</small></button>${selected ? schoolAdmissionYearOptionsMarkup(school) : ""}`;
      }).join("")
      : `<span class="school-menu-empty">${schoolStore?.isConfigured?.() ? "아직 연동된 학교가 없습니다." : "Supabase 설정 후 학교가 표시됩니다."}</span>`;
  }

  function schoolAdmissionYears(school) {
    return [...new Set((Array.isArray(school?.admissionYears) ? school.admissionYears : []).map(Number)
      .filter((year) => Number.isInteger(year)))].sort((a, b) => b - a);
  }

  function schoolAdmissionYearOptionsMarkup(school) {
    const years = schoolAdmissionYears(school);
    return `<div class="school-admission-year-options"><span>입학년도 선택</span><div>${years.length
      ? years.map((year) => `<button type="button" class="${state.selectedAdmissionYear === year ? "is-selected" : ""}" data-school-admission-year="${year}" aria-pressed="${state.selectedAdmissionYear === year}">${year}학년도</button>`).join("")
      : "<em>등록된 편제표가 없습니다.</em>"}</div></div>`;
  }

  function valueAt(row, aliases) {
    const column = findColumn(state.dataset.columns, aliases);
    return column ? row[column] : "";
  }

  function fieldVisual(fieldName) {
    return DEPARTMENT_FIELD_VISUALS[fieldName] || DEPARTMENT_FIELD_VISUALS["기타"];
  }

  function inferredCourseGroupIndex(courseName) {
    const name = compactText(courseName);
    const patterns = [
      /국어|화법|독서|문학|작문|언어생활|매체\s*의사|논술/,
      /수학|대수|미적분|확률|통계|기하/,
      /영어|영미/,
      /사회|역사|지리|윤리|정치|법|경제|철학|종교|심리|문화|국제\s*관계/,
      /과학|물리|화학|생명|지구|역학|에너지|전자기|양자|물질|기후|융합과학/,
      /체육|스포츠|운동/,
      /예술|음악|미술|연극|무용|영화|영상|사진|디자인/,
      /기술|가정|공학|생활과학|지식\s*재산/,
      /정보|데이터|인공지능|소프트웨어|프로그래밍|컴퓨팅|로봇/,
      /외국어|중국어|일본어|러시아어|스페인어|프랑스어|독일어|베트남어|한문|한자/,
      /교양|진로|보건|교육의\s*이해|인간과/
    ];
    const index = patterns.findIndex((pattern) => pattern.test(name));
    return index < 0 ? COURSE_GROUP_ORDER.length : index;
  }

  function majorCourseOrder() {
    if (majorCourseOrderDataset === state.dataset && majorCourseOrderCache) return majorCourseOrderCache;
    const courseNameColumn = findColumn(state.dataset.columns, COLUMN_ALIASES.courseName);
    const categoryColumn = findColumn(state.dataset.columns, COLUMN_ALIASES.category);
    const order = new Map();
    if (courseNameColumn) {
      state.dataset.rows.forEach((row, rowIndex) => {
        const name = normalizedCourseName(row[courseNameColumn]);
        const category = normalizeCourseGroup(categoryColumn ? row[categoryColumn] : "");
        const groupIndex = COURSE_GROUP_ORDER.indexOf(category);
        if (name && !order.has(name)) order.set(name, { groupIndex: groupIndex < 0 ? COURSE_GROUP_ORDER.length : groupIndex, rowIndex });
      });
    }
    majorCourseOrderDataset = state.dataset;
    majorCourseOrderCache = order;
    return order;
  }

  function sortMajorSubjects(subjects) {
    const order = majorCourseOrder();
    return subjects.map((value, sourceIndex) => {
      const name = typeof value === "string" ? value : value.name;
      const match = order.get(normalizedCourseName(name));
      return {
        value,
        name,
        sourceIndex,
        groupIndex: match?.groupIndex ?? inferredCourseGroupIndex(name),
        rowIndex: match?.rowIndex ?? Number.MAX_SAFE_INTEGER
      };
    }).sort((a, b) => a.groupIndex - b.groupIndex || a.rowIndex - b.rowIndex || a.name.localeCompare(b.name, "ko") || a.sourceIndex - b.sourceIndex).map((entry) => entry.value);
  }

  function majorSubjectGroup(subject) {
    const name = typeof subject === "string" ? subject : subject.name;
    const match = majorCourseOrder().get(normalizedCourseName(name));
    const groupIndex = match?.groupIndex ?? inferredCourseGroupIndex(name);
    return {
      index: groupIndex,
      name: COURSE_GROUP_ORDER[groupIndex] || "기타"
    };
  }

  function majorSubjectGroupsMarkup(subjects, renderItem, options = {}) {
    if (!subjects.length) return "";
    const groups = new Map();
    sortMajorSubjects(subjects).forEach((subject) => {
      const group = majorSubjectGroup(subject);
      if (!groups.has(group.index)) groups.set(group.index, { ...group, subjects: [] });
      groups.get(group.index).subjects.push(subject);
    });
    const containerClass = ["major-subject-groups", options.className || ""].filter(Boolean).join(" ");
    const listClass = options.listClass || "major-subject-list";
    return `<div class="${containerClass}">${[...groups.values()].map((group) => {
      const [accent, soft] = group.name === "기타" ? ["#607d8b", "#edf2f4"] : courseGroupPalette(group.name);
      const displayName = group.name === "사회(역사/도덕 포함)" ? "사회" : group.name.replace("･", "·").replace("/", "·");
      return `<section class="major-subject-group" style="--subject-group-accent:${accent}; --subject-group-soft:${soft}"><header title="${escapeHtml(group.name)}"><span>${icon(courseGroupIcon(group.name))}</span><strong>${escapeHtml(displayName)}</strong><em>${group.subjects.length}</em></header><div class="${listClass}">${group.subjects.map(renderItem).join("")}</div></section>`;
    }).join("")}</div>`;
  }

  function departmentById(id) {
    return state.departmentDataset.departments.find((department) => department.id === id) || null;
  }

  function fieldByName(name) {
    return state.departmentDataset.fields.find((field) => field.name === name) || null;
  }

  function departmentsInField(fieldName) {
    return state.departmentDataset.departments.filter((department) => !fieldName || department.field === fieldName);
  }

  function departmentSearchText(department) {
    return [
      department.field,
      department.name,
      department.guide?.overview,
      department.guide?.aptitude,
      ...(department.recommendedBooks || []).flatMap((book) => [book.title, book.author, ...(book.universities || [])]),
      ...(department.relatedSubjects || []),
      ...(department.reflectedSubjects || []).flatMap((subject) => [subject.name, ...(subject.universities || [])]),
      ...(department.scienceRecommendedSubjects || []).flatMap((subject) => [subject.name, ...(subject.universities || [])])
    ].join(" ").toLocaleLowerCase("ko");
  }

  function filteredDepartments() {
    const query = state.departmentSearch.trim().toLocaleLowerCase("ko");
    return departmentsInField(state.departmentField).filter((department) => !query || departmentSearchText(department).includes(query));
  }

  function fieldCardMarkup(field, scope = "departments") {
    const visual = fieldVisual(field.name);
    const active = scope === "recommend" && detailDialog.open && detailDialog.classList.contains("is-recommend-field-dialog") && state.recommendField === field.name;
    const attribute = scope === "recommend" ? "data-recommend-field" : "data-department-field";
    return `
      <button class="major-field-card ${scope === "recommend" ? "is-compact" : ""} ${active ? "is-active" : ""}" type="button" ${attribute}="${escapeHtml(field.name)}" style="--field-accent:${visual.accent}; --field-soft:${visual.soft}" aria-pressed="${active}"${scope === "recommend" ? ` aria-expanded="${active}"` : ""}>
        <span class="major-field-icon">${icon(visual.icon)}</span>
        <span class="major-field-copy"><small>${String(field.departmentCount).padStart(2, "0")} DEPARTMENTS</small><strong>${escapeHtml(field.name)} 분야</strong>${scope === "departments" ? `<span>${escapeHtml(visual.description)}</span>` : ""}</span>
        <span class="major-field-arrow">${icon("arrow")}</span>
      </button>`;
  }

  function departmentCardMarkup(department, scope = "departments") {
    const visual = fieldVisual(department.field);
    const reflectedCount = department.reflectedSubjects?.length || 0;
    const scienceCount = department.scienceRecommendedSubjects?.length || 0;
    const compared = state.comparisonIds.includes(department.id);
    const expanded = false;
    const openAttribute = scope === "recommend" ? "data-recommend-department" : "data-department-open";
    return `
      <article class="major-card ${expanded ? "is-selected" : ""}" style="--field-accent:${visual.accent}; --field-soft:${visual.soft}">
        <button class="major-card-open" type="button" ${openAttribute}="${escapeHtml(department.id)}"${scope === "recommend" ? ` aria-haspopup="dialog"` : ""}>
          <span class="major-card-number">${escapeHtml(department.id.replace("department-", ""))}</span>
          <span class="major-card-heading"><small>${escapeHtml(department.field)} FIELD</small><strong title="${escapeHtml(department.name)}">${escapeHtml(department.name)}</strong></span>
          <span class="major-card-summary">${escapeHtml(department.guide?.overview || "학과 정보와 관련 과목을 확인해 보세요.")}</span>
          <span class="major-card-meta"><i>관련 ${department.relatedSubjects.length}</i>${reflectedCount ? `<i class="is-reflected">반영 ${reflectedCount}</i>` : ""}${scienceCount ? `<i class="is-science">과학 권장 ${scienceCount}</i>` : ""}</span>
        </button>
        <div class="major-card-actions">
          <button type="button" ${openAttribute}="${escapeHtml(department.id)}"${scope === "recommend" ? ` aria-haspopup="dialog"` : ""}>자세히 보기 ${icon("arrow")}</button>
          <button class="compare-card-button ${compared ? "is-added" : ""}" type="button" data-compare-toggle="${escapeHtml(department.id)}" aria-pressed="${compared}">${icon(compared ? "check" : "cart")} ${compared ? "비교에 담김" : "비교 담기"}</button>
          ${printActionMarkup("department", department.id, { compact: true, label: "인쇄·PDF" })}
        </div>
      </article>`;
  }

  function subjectUniversityButton(subject, kind, departmentId) {
    return `<button class="major-subject-chip ${kind === "reflectedSubjects" ? "is-reflected" : "is-science"}" type="button" data-major-subject-universities data-department-id="${escapeHtml(departmentId)}" data-subject-kind="${escapeHtml(kind)}" data-subject-name="${escapeHtml(subject.name)}"><span>${escapeHtml(subject.name)}</span><small>${subject.universities.length.toLocaleString("ko-KR")}개 대학</small></button>`;
  }

  function reflectionStarMarkup() {
    return `<small class="reflection-star" aria-label="반영 과목" title="반영 과목">${icon("solid-star")}</small>`;
  }

  function reflectionMeaningNoteMarkup() {
    return `<p class="reflection-meaning-note">${reflectionStarMarkup()}<span>아이콘은 대학별 핵심 과목, 권장 과목을 의미합니다.</span></p>`;
  }

  function subjectUniversityButtons(subjects, kind, departmentId) {
    return majorSubjectGroupsMarkup(subjects, (subject) => subjectUniversityButton(subject, kind, departmentId));
  }

  function universityRevealMarkup(department, kind, subjectName) {
    if (state.dialogDepartmentId !== department.id || state.dialogSubjectKind !== kind || state.dialogSubjectName !== subjectName) return "";
    const subject = (department[kind] || []).find((item) => item.name === subjectName);
    if (!subject) return "";
    const label = kind === "reflectedSubjects" ? "반영 대학" : "과학 권장 대학";
    return `<aside class="university-reveal" aria-live="polite"><div><small>${escapeHtml(label)}</small><strong>${escapeHtml(subject.name)}</strong><span>DB에 포함된 ${subject.universities.length.toLocaleString("ko-KR")}개 대학</span></div><div class="university-list">${subject.universities.map((university) => `<span>${escapeHtml(university)}</span>`).join("") || "<span>대학 정보 없음</span>"}</div></aside>`;
  }

  function recommendedBookUniversityBadgesMarkup(universities, className = "major-book-universities") {
    const values = [...new Set((universities || []).map((university) => compactText(university)).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "ko"));
    return values.length
      ? `<span class="${className}">${values.map((university) => `<i>${escapeHtml(university)}</i>`).join("")}</span>`
      : "";
  }

  function departmentRecommendedBooksMarkup(books) {
    const entries = [...(books || [])].sort((a, b) => String(a.title || "").localeCompare(String(b.title || ""), "ko") || String(a.author || "").localeCompare(String(b.author || ""), "ko"));
    return `
      <section class="major-book-section">
        <div class="major-course-title"><span>${icon("book-open")}</span><div><small>RECOMMENDED BOOKS</small><h3>권장 도서</h3><p>도서명 순으로 정렬했습니다.</p></div><em>${entries.length}</em></div>
        ${entries.length ? `<div class="major-book-table" role="list" aria-label="학과 권장 도서 목록">${entries.map((book) => `<article class="major-book-row ${(book.universities || []).length ? "has-university" : ""}" role="listitem"><strong class="major-book-title">${escapeHtml(book.title)}</strong><span class="major-book-author">${escapeHtml(book.author || "저자 정보 없음")}</span>${(book.universities || []).length ? `<div class="major-book-university-cell">${recommendedBookUniversityBadgesMarkup(book.universities)}</div>` : ""}</article>`).join("")}</div>` : '<p class="major-book-empty">등록된 권장 도서가 없습니다.</p>'}
      </section>`;
  }

  function openDepartment(id, options = {}) {
    const department = departmentById(id);
    if (!department) return;
    if (!options.keepSubject) {
      state.dialogSubjectKind = "";
      state.dialogSubjectName = "";
      state.dialogReturnToRecommend = Boolean(options.fromRecommend);
    }
    state.dialogDepartmentId = id;
    state.dialogRecordIndex = -1;
    detailDialog.classList.add("is-major-dialog");
    detailDialog.classList.remove("is-recommend-field-dialog", "is-comparison-picker-dialog", "is-comparison-result-dialog");
    const visual = fieldVisual(department.field);
    const reflectedNames = new Set((department.reflectedSubjects || []).map((subject) => subject.name));
    const relatedMarkup = majorSubjectGroupsMarkup(department.relatedSubjects, (subject) => reflectedNames.has(subject)
      ? `<span class="major-subject-chip is-related-reflected"><span>${escapeHtml(subject)}</span>${reflectionStarMarkup()}</span>`
      : `<span class="major-subject-chip is-related"><span>${escapeHtml(subject)}</span></span>`);
    detailContent.innerHTML = `
      ${state.dialogReturnToRecommend && state.recommendField ? `<button class="recommend-dialog-back" type="button" data-return-recommend-field>${icon("arrow")} ${escapeHtml(state.recommendField)} 분야로 돌아가기</button>` : ""}
      <div class="detail-print-row">${printActionMarkup("department", department.id)}</div>
      <div class="major-dialog-head" style="--field-accent:${visual.accent}; --field-soft:${visual.soft}">
        <span>${icon(visual.icon)}</span>
        <div><p class="dialog-kicker">${escapeHtml(department.field)} FIELD · DEPARTMENT GUIDE</p><h2 id="record-dialog-title">${escapeHtml(department.name)}</h2></div>
      </div>
      <div class="major-guide-sections">
        ${department.guide?.overview ? `<section><small>01 · OVERVIEW</small><h3>학과 개요</h3><p>${escapeHtml(department.guide.overview)}</p></section>` : ""}
        ${department.guide?.aptitude ? `<section><small>02 · APTITUDE</small><h3>흥미와 적성</h3><p>${escapeHtml(department.guide.aptitude)}</p></section>` : ""}
        ${department.guide?.careers ? `<section><small>03 · CAREER</small><h3>졸업 후 진출 분야</h3><p class="preserve-lines">${escapeHtml(department.guide.careers)}</p></section>` : ""}
      </div>
      ${departmentRecommendedBooksMarkup(department.recommendedBooks)}
      <section class="major-course-section is-related">
        <div class="major-course-title"><span>${icon("book-open")}</span><div><small>RELATED COURSES</small><h3>관련 과목</h3></div><em>${department.relatedSubjects.length}</em></div>
        ${relatedMarkup}
        ${department.reflectedSubjects.length ? reflectionMeaningNoteMarkup() : ""}
      </section>
      ${department.reflectedSubjects.length ? `<section class="major-course-section is-reflected"><div class="major-course-title"><span class="reflection-section-icon">${icon("solid-star")}</span><div><small>ADMISSION REFLECTION</small><h3>반영 과목 <b>중요</b></h3><p>과목을 누르면 반영 대학을 확인할 수 있습니다.</p></div><em>${department.reflectedSubjects.length}</em></div>${subjectUniversityButtons(department.reflectedSubjects, "reflectedSubjects", department.id)}${universityRevealMarkup(department, "reflectedSubjects", state.dialogSubjectName)}</section>` : ""}
      ${department.scienceRecommendedSubjects.length ? `<section class="major-course-section is-science"><div class="major-course-title"><span>${icon("flask")}</span><div><small>SCIENCE RECOMMENDATION</small><h3>과학 권장 과목</h3><p>학과와 대학에서 권장하는 과학 과목입니다.</p></div><em>${department.scienceRecommendedSubjects.length}</em></div>${subjectUniversityButtons(department.scienceRecommendedSubjects, "scienceRecommendedSubjects", department.id)}${universityRevealMarkup(department, "scienceRecommendedSubjects", state.dialogSubjectName)}</section>` : ""}
      <p class="major-data-note">권장 도서와 대학별 반영·권장 정보는 제공된 엑셀 DB를 기준으로 표시합니다.</p>`;
    if (!detailDialog.open) detailDialog.showModal();
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
          ${printActionMarkup("subject", originalIndex, { compact: true, iconOnly: true, label: `${courseName} 인쇄 · PDF 저장` })}
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
    const fields = state.departmentDataset.fields;
    if (state.departmentField && !fields.some((field) => field.name === state.departmentField)) state.departmentField = "";
    const matches = filteredViewRows();
    const showingFields = !state.departmentField && !state.departmentSearch.trim();
    const selectedVisual = fieldVisual(state.departmentField);

    root.innerHTML = `
      ${renderNotices()}
      ${pageHead("학과 안내", "학과 정보와 관련 과목, 대학별 반영 과목을 차례로 살펴 보세요.", showingFields ? fields.length : matches.length, showingFields ? "전공 분야" : "학과")}
      ${comparisonTrayMarkup()}
      <section class="major-search ${showingFields ? "is-overview" : ""}" aria-label="학과 검색">
        ${state.departmentField ? `<button class="major-back-button" type="button" data-department-back>${icon("arrow")} 전체 분야</button>` : ""}
        <label class="search-field"><span class="sr-only">학과 검색</span>${icon("search")}<input type="search" value="${escapeHtml(state.departmentSearch)}" placeholder="학과명, 과목 또는 대학명 검색" data-department-search autocomplete="off"></label>
      </section>
      ${showingFields ? `<section class="major-field-grid" aria-label="학과 분야 목록">${fields.map((field) => fieldCardMarkup(field)).join("")}</section>` : `
        ${state.departmentField ? departmentCommonDisclosureMarkup(fieldByName(state.departmentField)) : ""}
        <section class="major-browser" style="--field-accent:${selectedVisual.accent}; --field-soft:${selectedVisual.soft}">
          <header class="major-browser-head"><div><span>${icon(state.departmentField ? selectedVisual.icon : "search")}</span><div><small>${state.departmentField ? `${escapeHtml(state.departmentField)} FIELD` : "SEARCH RESULTS"}</small><h2>${state.departmentField ? `${escapeHtml(state.departmentField)} 분야 학과` : `‘${escapeHtml(state.departmentSearch)}’ 검색 결과`}</h2></div></div><em>${matches.length.toLocaleString("ko-KR")}개</em></header>
          <div class="major-grid" aria-live="polite">${matches.length ? matches.map((department) => departmentCardMarkup(department)).join("") : `<div class="empty-state"><span class="empty-icon">${icon("search")}</span><h2>검색 결과가 없습니다.</h2><p>다른 학과명이나 과목, 대학명을 검색해 보세요.</p></div>`}</div>
        </section>`}`;
  }

  function filteredViewRows() {
    return filteredDepartments();
  }

  function recommendDepartmentGridMarkup(departments) {
    return departments.map((department) => departmentCardMarkup(department, "recommend")).join("");
  }

  function comparisonTrayMarkup() {
    const selected = state.comparisonIds.map(departmentById).filter(Boolean);
    const label = selected.length === 2 ? "선택한 두 학과 비교 시작" : `학과 비교 ${selected.length}/2, 학과 카드에서 ${2 - selected.length}개 더 선택`;
    return `<aside class="comparison-tray ${selected.length ? "has-items" : ""}" aria-label="학과 비교">
      <button class="comparison-launcher" type="button" data-start-comparison aria-label="${label}">
        <span>${icon("cart")}</span><strong>학과 비교</strong><em>${selected.length}/2</em>
      </button>
    </aside>`;
  }

  function toggleComparisonSelection(id) {
    if (state.comparisonIds.includes(id)) {
      state.comparisonIds = state.comparisonIds.filter((item) => item !== id);
    } else if (state.comparisonIds.length >= 2) {
      showToast("비교할 학과는 최대 2개까지 담을 수 있습니다.");
      return false;
    } else {
      state.comparisonIds = [...state.comparisonIds, id];
    }
    state.comparisonOpen = false;
    showToast(state.comparisonIds.includes(id) ? "비교 바구니에 학과를 담았습니다." : "비교 바구니에서 학과를 뺐습니다.");
    return true;
  }

  function departmentSubjectSet(department) {
    return new Set([
      ...department.relatedSubjects,
      ...department.reflectedSubjects.map((subject) => subject.name),
      ...department.scienceRecommendedSubjects.map((subject) => subject.name)
    ]);
  }

  function comparisonSubjectChips(subjects, emptyText = "해당 과목 없음") {
    return subjects.length
      ? majorSubjectGroupsMarkup(subjects, (subject) => `<span>${escapeHtml(subject)}</span>`, { className: "is-comparison", listClass: "comparison-chip-list" })
      : `<p class="comparison-empty">${escapeHtml(emptyText)}</p>`;
  }

  function comparisonDepartmentColumn(department, includeScience) {
    return `<article class="comparison-major-column"><header><small>${escapeHtml(department.field)} FIELD</small><h3>${escapeHtml(department.name)}</h3><span>전체 ${departmentSubjectSet(department).size.toLocaleString("ko-KR")}개 과목</span></header>
      <section class="is-related"><h4>관련 과목 <em>${department.relatedSubjects.length}</em></h4>${comparisonSubjectChips(department.relatedSubjects)}</section>
      <section class="is-reflected"><h4>반영 과목 <em>${department.reflectedSubjects.length}</em></h4>${comparisonSubjectChips(department.reflectedSubjects.map((subject) => subject.name))}</section>
      ${includeScience ? `<section class="is-science"><h4>과학 권장 과목 <em>${department.scienceRecommendedSubjects.length}</em></h4>${comparisonSubjectChips(department.scienceRecommendedSubjects.map((subject) => subject.name))}</section>` : ""}
    </article>`;
  }

  function comparisonMarkup() {
    if (!state.comparisonOpen || state.comparisonIds.length !== 2) return "";
    const [first, second] = state.comparisonIds.map(departmentById);
    if (!first || !second) return "";
    const firstSet = departmentSubjectSet(first);
    const secondSet = departmentSubjectSet(second);
    const common = sortMajorSubjects([...firstSet].filter((subject) => secondSet.has(subject)));
    const firstOnly = sortMajorSubjects([...firstSet].filter((subject) => !secondSet.has(subject)));
    const secondOnly = sortMajorSubjects([...secondSet].filter((subject) => !firstSet.has(subject)));
    const includeScience = first.scienceRecommendedSubjects.length > 0 || second.scienceRecommendedSubjects.length > 0;
    return `<section class="major-comparison" data-comparison-report>
      <header class="major-comparison-head"><div><small>MAJOR COURSE COMPARISON</small><h2>${escapeHtml(first.name)} <i>vs</i> ${escapeHtml(second.name)}</h2><div class="major-comparison-summary"><p>관련·반영·과학 권장 과목을 모두 합쳐 공통점과 차이를 비교했습니다.</p><button type="button" data-close-comparison>비교 결과 닫기</button></div></div></header>
      <div class="comparison-major-grid ${includeScience ? "has-science" : ""}">${comparisonDepartmentColumn(first, includeScience)}${comparisonDepartmentColumn(second, includeScience)}</div>
      <section class="comparison-common"><header><span>${icon("check")}</span><div><small>COMMON COURSES</small><h3>공통으로 겹치는 과목</h3></div><em>${common.length}</em></header>${comparisonSubjectChips(common, "공통 과목이 없습니다.")}</section>
      <section class="comparison-difference"><header><span>${icon("shapes")}</span><div><small>DIFFERENT COURSES</small><h3>차이가 나는 과목</h3></div><em>${firstOnly.length + secondOnly.length}</em></header><div><article><h4>${escapeHtml(first.name)}에만 있는 과목</h4>${comparisonSubjectChips(firstOnly)}</article><article><h4>${escapeHtml(second.name)}에만 있는 과목</h4>${comparisonSubjectChips(secondOnly)}</article></div></section>
    </section>`;
  }

  function comparisonChoicesMarkup() {
    return state.departmentDataset.departments.map((department) => {
      const selected = state.comparisonIds.includes(department.id);
      const visual = fieldVisual(department.field);
      const searchText = `${department.field} ${department.name}`.toLocaleLowerCase("ko");
      return `<button class="comparison-choice ${selected ? "is-selected" : ""}" type="button" data-comparison-choice="${escapeHtml(department.id)}" data-comparison-field="${escapeHtml(department.field)}" data-comparison-search-text="${escapeHtml(searchText)}" style="--field-accent:${visual.accent}; --field-soft:${visual.soft}" aria-pressed="${selected}"><span>${icon(visual.icon)}</span><div><small>${escapeHtml(department.field)} 분야</small><strong>${escapeHtml(department.name)}</strong></div>${icon(selected ? "check" : "cart")}</button>`;
    }).join("");
  }

  function comparisonSelectedSlotMarkup(index) {
    const department = departmentById(state.comparisonIds[index]);
    if (!department) return `<article class="comparison-selected-slot is-empty"><span>${String(index + 1).padStart(2, "0")}</span><div><small>${index ? "SECOND MAJOR" : "FIRST MAJOR"}</small><strong>학과를 선택하세요</strong></div></article>`;
    const visual = fieldVisual(department.field);
    return `<article class="comparison-selected-slot is-selected" style="--field-accent:${visual.accent}; --field-soft:${visual.soft}"><span>${icon(visual.icon)}</span><div><small>${escapeHtml(department.field)} 분야</small><strong>${escapeHtml(department.name)}</strong></div><button type="button" data-comparison-remove-slot="${index}" aria-label="${escapeHtml(department.name)} 선택 해제">×</button></article>`;
  }

  function comparisonFieldFiltersMarkup() {
    return `<button class="is-active" type="button" data-comparison-field-filter="" aria-pressed="true">전체</button>${state.departmentDataset.fields.map((field) => `<button type="button" data-comparison-field-filter="${escapeHtml(field.name)}" aria-pressed="false">${escapeHtml(field.name)}</button>`).join("")}`;
  }

  function comparisonPickerMarkup() {
    const selectedCount = state.comparisonIds.length;
    return `<section class="comparison-picker">
      <header class="comparison-picker-head">
        <span>${icon("cart")}</span>
        <div><p class="dialog-kicker">MAJOR COMPARISON</p><h2 id="record-dialog-title">비교할 학과를 선택하세요</h2><p>서로 다른 학과 두 개를 선택하면 바로 과목 비교가 시작됩니다.</p></div>
        <em>${selectedCount}/2</em>
      </header>
      <div class="comparison-selected-grid">${comparisonSelectedSlotMarkup(0)}${comparisonSelectedSlotMarkup(1)}</div>
      <section class="comparison-search-panel" data-comparison-active-field="">
        <label class="comparison-search-field"><span class="sr-only">비교할 학과 검색</span>${icon("search")}<input type="search" data-comparison-search placeholder="학과명 또는 분야명 검색" autocomplete="off"></label>
        <div class="comparison-field-filters" aria-label="분야별 학과 필터">${comparisonFieldFiltersMarkup()}</div>
        <div class="comparison-choice-list" role="listbox" aria-label="비교 학과 검색 결과">${comparisonChoicesMarkup()}</div>
        <p class="comparison-choice-empty" hidden>검색 결과가 없습니다.</p>
      </section>
      <footer class="comparison-picker-actions"><button type="button" data-clear-comparison${selectedCount ? "" : " disabled"}>선택 초기화</button><button class="primary-action" type="button" data-open-comparison-result${selectedCount === 2 ? "" : " disabled"}>선택한 학과 비교하기 ${icon("arrow")}</button></footer>
    </section>`;
  }

  function setComparisonDialogMode(mode) {
    detailDialog.classList.remove("is-major-dialog", "is-recommend-field-dialog", "is-comparison-picker-dialog", "is-comparison-result-dialog", "is-department-common-dialog");
    detailDialog.classList.add(mode);
    state.dialogReturnToRecommend = false;
    state.dialogDepartmentId = "";
    state.dialogSubjectKind = "";
    state.dialogSubjectName = "";
    state.dialogRecordIndex = -1;
  }

  function openComparisonPicker() {
    state.comparisonOpen = false;
    setComparisonDialogMode("is-comparison-picker-dialog");
    detailContent.innerHTML = comparisonPickerMarkup();
    if (!detailDialog.open) detailDialog.showModal();
    detailDialog.scrollTop = 0;
  }

  function openComparisonResult() {
    if (state.comparisonIds.length !== 2) {
      openComparisonPicker();
      return;
    }
    state.comparisonOpen = true;
    setComparisonDialogMode("is-comparison-result-dialog");
    detailContent.innerHTML = comparisonMarkup();
    if (!detailDialog.open) detailDialog.showModal();
    detailDialog.scrollTop = 0;
  }

  function applyComparisonChoiceFilter() {
    const panel = detailContent.querySelector(".comparison-search-panel");
    if (!panel) return;
    const query = panel.querySelector("[data-comparison-search]")?.value.trim().toLocaleLowerCase("ko") || "";
    const field = panel.dataset.comparisonActiveField || "";
    let visibleCount = 0;
    panel.querySelectorAll("[data-comparison-choice]").forEach((choice) => {
      const matchesQuery = !query || choice.dataset.comparisonSearchText.includes(query);
      const matchesField = !field || choice.dataset.comparisonField === field;
      const visible = matchesQuery && matchesField;
      choice.hidden = !visible;
      if (visible) visibleCount += 1;
    });
    const empty = panel.querySelector(".comparison-choice-empty");
    if (empty) empty.hidden = visibleCount > 0;
  }

  function renderComparisonHost() {
    if (state.tab === "recommend") renderRecommend();
    else if (state.tab === "departments") renderView();
  }

  function recommendSectionPickerMarkup(field, departments) {
    const visual = fieldVisual(field.name);
    const sections = [
      { id: "common", iconName: "book-open", kicker: "STEP 02 · COMMON COURSES", title: `${field.name} 분야 공통 과목`, count: field.commonSubjects.length, description: "교과군별 공통 과목 보기" },
      { id: "departments", iconName: "shapes", kicker: "STEP 03 · DEPARTMENTS", title: "학과별 관련 과목", count: departments.length, description: "학과별 관련·반영 과목 보기" }
    ];
    return `<section class="recommend-section-picker" style="--field-accent:${visual.accent}; --field-soft:${visual.soft}" aria-label="${escapeHtml(field.name)} 분야 정보 선택">${sections.map((section) => {
      const active = state.recommendSection === section.id;
      return `<button class="${active ? "is-active" : ""}" type="button" data-recommend-section="${section.id}" aria-expanded="${active}"><span>${icon(section.iconName)}</span><div><small>${section.kicker}</small><strong>${escapeHtml(section.title)}</strong><p>${section.description}</p></div><em>${section.count.toLocaleString("ko-KR")}</em><i>${icon("arrow")}</i></button>`;
    }).join("")}</section>`;
  }

  function fieldCommonSubjectsMarkup(subjects) {
    return majorSubjectGroupsMarkup(subjects, (subject) => `<span title="${escapeHtml(subject.name)}"><strong>${escapeHtml(subject.name)}</strong><small>${subject.coverageCount}/${subject.totalCount}개 학과</small></span>`, { className: "is-field-common", listClass: "common-major-subjects" });
  }

  function departmentCommonDisclosureMarkup(field) {
    if (!field) return "";
    const visual = fieldVisual(field.name);
    return `<section class="department-common-disclosure" style="--field-accent:${visual.accent}; --field-soft:${visual.soft}">
      <button type="button" data-department-common-open="${escapeHtml(field.name)}" aria-haspopup="dialog">
        <span>${icon("book-open")}</span>
        <span><small>FIELD COMMON COURSES</small><strong>${escapeHtml(field.name)} 분야 공통 과목</strong><em>분야 내 과반수 학과에서 공통으로 확인되는 과목</em></span>
        <b>${field.commonSubjects.length.toLocaleString("ko-KR")}</b>
        <i>${icon("arrow")}</i>
      </button>
    </section>`;
  }

  function openDepartmentCommonDialog(fieldName) {
    const field = fieldByName(fieldName);
    if (!field) return;
    const visual = fieldVisual(field.name);
    detailDialog.classList.remove("is-major-dialog", "is-recommend-field-dialog", "is-comparison-picker-dialog", "is-comparison-result-dialog", "is-department-common-dialog");
    detailDialog.classList.add("is-department-common-dialog");
    detailContent.innerHTML = `
      <div class="major-dialog-head department-common-dialog-head" style="--field-accent:${visual.accent}; --field-soft:${visual.soft}">
        <span>${icon("book-open")}</span>
        <div><p class="dialog-kicker">${escapeHtml(field.name.toLocaleUpperCase("ko"))} · FIELD COMMON COURSES</p><h2 id="record-dialog-title">${escapeHtml(field.name)} 분야 공통 과목</h2><p>${escapeHtml(state.departmentDataset.meta.commonSubjectRule || "분야 내 과반수 학과에서 공통으로 확인되는 관련 과목")}입니다.</p></div>
        <em>${field.commonSubjects.length}</em>
      </div>
      <section class="department-common-dialog-body">${fieldCommonSubjectsMarkup(field.commonSubjects)}</section>`;
    if (!detailDialog.open) detailDialog.showModal();
    detailDialog.scrollTop = 0;
  }

  function selectedRecommendDepartments() {
    const selected = new Set(state.recommendDepartmentIds);
    return state.departmentDataset.departments.filter((department) => selected.has(department.id) && department.field === state.recommendField);
  }

  function recommendationSubjectCategory(subject) {
    const name = typeof subject === "string" ? subject : subject?.name;
    const directCategory = typeof subject === "object" ? compactText(subject?.category) : "";
    if (directCategory) return normalizeCourseGroup(directCategory);
    const key = normalizedCourseName(name);
    const courseNameColumn = findColumn(state.dataset.columns, COLUMN_ALIASES.courseName);
    const row = typeof subject === "object" && subject?.row
      ? subject.row
      : state.dataset.rows.find((item) => normalizedCourseName(item[courseNameColumn]) === key);
    return normalizeCourseGroup(row ? valueAt(row, COLUMN_ALIASES.category) : "");
  }

  function groupedRecommendationSubjects(subjects) {
    const groups = new Map();
    subjects.forEach((subject) => {
      const name = typeof subject === "string" ? subject : subject?.name;
      if (!compactText(name)) return;
      const category = recommendationSubjectCategory(subject);
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category).push(subject);
    });
    return [...groups.entries()]
      .map(([category, entries]) => ({ category, entries }))
      .sort((a, b) => {
        const aIndex = COURSE_GROUP_ORDER.indexOf(a.category);
        const bIndex = COURSE_GROUP_ORDER.indexOf(b.category);
        if (aIndex >= 0 && bIndex >= 0) return aIndex - bIndex;
        if (aIndex >= 0) return -1;
        if (bIndex >= 0) return 1;
        return a.category.localeCompare(b.category, "ko");
      });
  }

  function recommendationSubjectStats(departments, kind = "related") {
    const stats = new Map();
    const courseIndex = recommendationCourseIndex();
    departments.forEach((department) => {
      const source = kind === "reflected"
        ? (department.reflectedSubjects || []).map((subject) => ({ name: subject.name, universities: subject.universities || [] }))
        : (department.relatedSubjects || []).map((name) => ({ name, universities: [] }));
      const seen = new Set();
      source.forEach((subject) => {
        const references = recommendationCourseReferences(subject.name, courseIndex);
        const candidates = references.length ? references : [{
          key: `unresolved:${looseCourseName(subject.name)}`,
          name: subject.name,
          category: recommendationSubjectCategory(subject),
          row: null
        }];
        candidates.forEach((candidate) => {
          const key = candidate.key;
          if (!key) return;
          if (!stats.has(key)) stats.set(key, {
            key,
            name: candidate.name,
            category: candidate.category || recommendationSubjectCategory(candidate),
            row: candidate.row || null,
            count: 0,
            departments: [],
            universities: new Set()
          });
          const item = stats.get(key);
          if (seen.has(key)) {
            subject.universities.forEach((university) => item.universities.add(university));
            return;
          }
          seen.add(key);
          item.count += 1;
          item.departments.push(department.name);
          subject.universities.forEach((university) => item.universities.add(university));
        });
      });
    });
    const sortedNames = sortMajorSubjects([...stats.values()].map((item) => item.name));
    const courseOrder = new Map(sortedNames.map((name, index) => [normalizedCourseName(name), index]));
    return [...stats.values()].sort((a, b) => b.count - a.count
      || (courseOrder.get(normalizedCourseName(a.name)) ?? Number.MAX_SAFE_INTEGER) - (courseOrder.get(normalizedCourseName(b.name)) ?? Number.MAX_SAFE_INTEGER)
      || a.name.localeCompare(b.name, "ko"));
  }

  function recommendKeywordResults() {
    const keywordMap = new Map();
    state.recommendKeywords.map(compactText).filter(Boolean).forEach((keyword) => {
      const key = normalizedCourseName(keyword);
      if (!keywordMap.has(key)) keywordMap.set(key, keyword);
    });
    const keywords = [...keywordMap.values()];
    if (!keywords.length) return [];
    const courseIndex = recommendationCourseIndex();
    const subjects = courseIndex.subjects;
    if (!subjects.length) return [];
    const settings = new Map((state.dataset.chatbot?.searchSettings || []).map((row) => [compactText(row["항목"]), row]));
    const weights = Array.isArray(state.dataset.chatbot?.keywordWeights) ? state.dataset.chatbot.keywordWeights : [];
    const settingNumber = (name, fallback) => {
      const number = Number(String(settings.get(name)?.["값"] ?? "").replace(/[^0-9.-]/g, ""));
      return Number.isFinite(number) ? number : fallback;
    };
    const fieldRules = [
      ["이 과목을 누구에게 추천하나요?", settingNumber("추천대상 필드 직접 일치", 8), "추천 대상"],
      ["이 과목은 어떤 과목인가요?", settingNumber("과목 설명 필드 직접 일치", 5), "과목 설명"],
      ["과목의 주요 내용", settingNumber("주요내용 필드 직접 일치", 6), "주요 내용"],
      ["그 외 질문 1", settingNumber("그 외 질문 필드 직접 일치", 4), "추가 안내"],
      ["그 외 질문 2", settingNumber("그 외 질문 필드 직접 일치", 4), "추가 안내"]
    ];
    const minimumLength = settingNumber("최소 검색어 길이", 2);
    const synonymMultiplier = settingNumber("동의어 DB 점수 배수", 4);
    const exactNameScore = settingNumber("과목명 정확 일치 보너스", 100);
    const partialNameScore = settingNumber("과목명 부분 일치 보너스", 40);
    const groupScore = settingNumber("교과군 직접 일치", 3);
    const extraKeywordScore = settingNumber("추가 키워드 동시 일치 보너스", 5);
    const extraKeywordCap = settingNumber("추가 키워드 보너스 상한", 20);
    const stopWords = new Set(["관심", "분야", "진로", "과목", "수업", "관련", "희망", "좋아함", "좋아요"]);
    const scores = new Map();
    const ensureResult = (subject) => {
      if (!scores.has(subject.key)) scores.set(subject.key, {
        ...subject,
        score: 0,
        keywordScore: 0,
        contextScore: 0,
        strongestKeywordScore: 0,
        strongestSynonym: 0,
        exactName: false,
        partialName: false,
        keywords: new Set(),
        matchReasons: new Set(),
        contextReasons: new Set(),
        evidenceTypes: new Set()
      });
      return scores.get(subject.key);
    };

    keywords.forEach((keyword) => {
      const normalizedKeyword = normalizedCourseName(keyword);
      const tokens = [...new Set((String(keyword).normalize("NFKC").toLocaleLowerCase("ko").match(/[0-9a-z가-힣]+/g) || [])
        .filter((token) => token.length >= minimumLength && !stopWords.has(token)))];
      const keywordMatches = new Map();
      const ensureEvidence = (subject) => {
        if (!keywordMatches.has(subject.key)) keywordMatches.set(subject.key, {
          subject,
          nameScore: 0,
          exactName: false,
          partialName: false,
          groupScore: 0,
          fieldScores: new Map(),
          synonymScores: new Map()
        });
        return keywordMatches.get(subject.key);
      };
      subjects.forEach((subject) => {
        if (subject.key === normalizedKeyword) {
          const evidence = ensureEvidence(subject);
          evidence.nameScore = exactNameScore;
          evidence.exactName = true;
        }
        else if (subject.key.includes(normalizedKeyword) || normalizedKeyword.includes(subject.key)) {
          const evidence = ensureEvidence(subject);
          evidence.nameScore = Math.max(evidence.nameScore, partialNameScore);
          evidence.partialName = true;
        }
        const group = normalizedCourseName(valueAt(subject.row, COLUMN_ALIASES.category));
        if (group && normalizedKeyword.includes(group)) ensureEvidence(subject).groupScore = groupScore;
        tokens.forEach((token) => {
          const normalizedToken = normalizedCourseName(token);
          fieldRules.forEach(([field, points, reason]) => {
            if (!normalizedCourseName(subject.row[field]).includes(normalizedToken)) return;
            const evidence = ensureEvidence(subject);
            const previous = evidence.fieldScores.get(field);
            if (!previous || points > previous.points) evidence.fieldScores.set(field, { points, reason });
          });
        });
      });
      weights.forEach((weight) => {
        const searchTerm = compactText(weight["검색어"]);
        const normalizedTerm = normalizedCourseName(searchTerm);
        if (!normalizedTerm || normalizedTerm.length < minimumLength
          || (!normalizedKeyword.includes(normalizedTerm) && !normalizedTerm.includes(normalizedKeyword))) return;
        parseMultiValue(weight["적용과목"]).forEach((courseName) => {
          recommendationCourseReferences(courseName, courseIndex).forEach((subject) => {
            const evidence = ensureEvidence(subject);
            const points = (Number(weight["가중치"]) || 0) * synonymMultiplier;
            evidence.synonymScores.set(normalizedTerm, Math.max(evidence.synonymScores.get(normalizedTerm) || 0, points));
          });
        });
      });

      keywordMatches.forEach((evidence) => {
        const textScore = Math.min(20, [...evidence.fieldScores.values()].reduce((sum, item) => sum + item.points, 0));
        const synonymValues = [...evidence.synonymScores.values()].sort((a, b) => b - a);
        const synonymScore = Math.min(60, synonymValues.reduce((sum, points) => sum + points, 0));
        const keywordScore = evidence.nameScore + evidence.groupScore + textScore + synonymScore;
        const hasReliableSignal = evidence.exactName || evidence.partialName || synonymScore >= 12 || evidence.fieldScores.size >= 2;
        if (!hasReliableSignal || keywordScore < 12) return;

        const result = ensureResult(evidence.subject);
        result.score += keywordScore;
        result.keywordScore += keywordScore;
        result.strongestKeywordScore = Math.max(result.strongestKeywordScore, keywordScore);
        result.strongestSynonym = Math.max(result.strongestSynonym, synonymValues[0] || 0);
        result.exactName ||= evidence.exactName;
        result.partialName ||= evidence.partialName;
        result.keywords.add(keyword);
        if (evidence.exactName) {
          result.matchReasons.add("과목명 정확 일치");
          result.evidenceTypes.add("name");
        } else if (evidence.partialName) {
          result.matchReasons.add("과목명 부분 일치");
          result.evidenceTypes.add("name");
        }
        if (synonymScore) {
          result.matchReasons.add("검증된 키워드 DB 연결");
          result.evidenceTypes.add("keyword-db");
        }
        if (evidence.fieldScores.size >= 2) {
          result.matchReasons.add("과목 설명·내용 교차 일치");
          result.evidenceTypes.add("course-data");
        } else if (evidence.fieldScores.size === 1) {
          result.matchReasons.add(`${[...evidence.fieldScores.values()][0].reason} 일치`);
          result.evidenceTypes.add("course-data");
        }
        if (evidence.groupScore) {
          result.matchReasons.add("교과군 직접 일치");
          result.evidenceTypes.add("course-group");
        }
      });
    });

    const departments = selectedRecommendDepartments();
    const departmentCount = departments.length;
    const related = new Map(recommendationSubjectStats(departments).map((subject) => [subject.key, subject]));
    const reflected = new Map(recommendationSubjectStats(departments, "reflected").map((subject) => [subject.key, subject]));
    const fieldCommon = new Set();
    (fieldByName(state.recommendField)?.commonSubjects || []).forEach((subject) => {
      const references = recommendationCourseReferences(subject.name, courseIndex);
      (references.length ? references.map((item) => item.key) : [normalizedCourseName(subject.name)]).forEach((key) => fieldCommon.add(key));
    });
    scores.forEach((result) => {
      if (fieldCommon.has(result.key)) {
        result.score += 6;
        result.contextScore += 6;
        result.contextReasons.add(`${state.recommendField} 분야 공통 과목`);
      }
      const relatedItem = related.get(result.key);
      if (relatedItem && departmentCount) {
        const isCommon = departmentCount > 1 && relatedItem.count === departmentCount;
        const points = isCommon ? 24 : Math.round(6 + (12 * relatedItem.count / departmentCount));
        result.score += points;
        result.contextScore += points;
        result.contextReasons.add(isCommon ? "선택 학과 공통 관련 과목" : departmentCount > 1
          ? `${relatedItem.count}/${departmentCount}개 학과 관련 과목` : "선택 학과 관련 과목");
      }
      const reflectedItem = reflected.get(result.key);
      if (reflectedItem && departmentCount) {
        const isCommon = departmentCount > 1 && reflectedItem.count === departmentCount;
        const points = isCommon ? 32 : Math.round(10 + (16 * reflectedItem.count / departmentCount));
        result.score += points;
        result.contextScore += points;
        result.contextReasons.add(isCommon ? "선택 학과 공통 반영 과목" : departmentCount > 1
          ? `${reflectedItem.count}/${departmentCount}개 학과 반영 과목` : "선택 학과 반영 과목");
      }
      const multipleKeywordBonus = Math.min(extraKeywordCap, Math.max(0, result.keywords.size - 1) * extraKeywordScore);
      result.score += multipleKeywordBonus;
      const hasContext = result.contextScore > 0;
      const corroborated = result.evidenceTypes.size >= 2 || result.keywords.size >= 2;
      if (result.exactName || (result.strongestSynonym >= 32 && hasContext)
        || (result.strongestKeywordScore >= 60 && corroborated) || (result.keywords.size >= 2 && hasContext)) {
        result.confidence = "high";
        result.confidenceRank = 3;
        result.confidenceLabel = "높은 연관";
      } else if (result.partialName || result.strongestSynonym >= 24 || corroborated || hasContext) {
        result.confidence = "medium";
        result.confidenceRank = 2;
        result.confidenceLabel = "연관 있음";
      } else {
        result.confidence = "explore";
        result.confidenceRank = 1;
        result.confidenceLabel = "탐색 후보";
      }
      result.reasons = new Set([...result.contextReasons, ...result.matchReasons]);
      result.reasonText = [...result.reasons].slice(0, 3).join(" · ");
    });
    return [...scores.values()].filter((result) => result.keywordScore >= 12)
      .sort((a, b) => b.confidenceRank - a.confidenceRank || b.score - a.score || a.name.localeCompare(b.name, "ko"))
      .slice(0, 12);
  }

  function recommendFinalGroups() {
    const departments = selectedRecommendDepartments();
    const related = recommendationSubjectStats(departments)
      .filter((subject) => departments.length && subject.count === departments.length);
    const reflected = recommendationSubjectStats(departments, "reflected")
      .filter((subject) => departments.length && subject.count === departments.length);
    const special = recommendKeywordResults();
    const reflectedKeys = new Set(reflected.map((subject) => subject.key));
    const relatedKeys = new Set(related.map((subject) => subject.key));
    const specialByKey = new Map(special.map((subject) => [subject.key, subject]));
    const overlapKeys = new Set(special.filter((subject) => relatedKeys.has(subject.key) && !reflectedKeys.has(subject.key)).map((subject) => subject.key));
    return [
      {
        label: "공통 반영 과목",
        description: "선택한 모든 학과에 공통으로 포함된 대학별 핵심·권장 반영 과목입니다.",
        iconName: "solid-star",
        entries: reflected.map((subject) => ({ ...subject, detail: `${subject.departments.join(" · ")}${subject.universities.size ? ` · ${subject.universities.size}개 대학` : ""}` }))
      },
      {
        label: "공통 관련 과목 x 나만의 특별함",
        description: "모든 선택 학과의 공통 관련 과목이면서 입력한 관심 키워드와도 연결됩니다.",
        iconName: "sparkles",
        entries: related.filter((subject) => overlapKeys.has(subject.key)).map((subject) => {
          const match = specialByKey.get(subject.key);
          return { ...subject, score: match.score, detail: `${subject.departments.join(" · ")} · ${[...match.keywords].map((keyword) => `#${keyword}`).join(" ")} · ${match.confidenceLabel}` };
        }).sort((a, b) => b.score - a.score || b.count - a.count)
      },
      {
        label: "공통 관련 과목",
        description: "선택한 모든 학과에 공통으로 포함된 관련 과목입니다.",
        iconName: "book-open",
        entries: related.filter((subject) => !reflectedKeys.has(subject.key) && !overlapKeys.has(subject.key))
          .map((subject) => ({ ...subject, detail: subject.departments.join(" · ") }))
      },
      {
        label: "나만의 특별함",
        description: "입력한 관심사와 세부 진로를 과목 DB의 키워드·설명과 연결했습니다.",
        iconName: "hand-star",
        entries: special.filter((subject) => !relatedKeys.has(subject.key) && !reflectedKeys.has(subject.key))
          .map((subject) => ({ ...subject, detail: `${[...subject.keywords].map((keyword) => `#${keyword}`).join(" ")} · ${subject.confidenceLabel}` }))
      }
    ];
  }

  function recommendProgressMarkup() {
    const labels = ["관심 분야 선택", "관심 학과 선택", "과목 확인", "나만의 특별함 더하기", "최종 결과 확인"];
    return `<ol class="recommend-progress" aria-label="과목 추천 진행 단계">${labels.map((label, index) => {
      const step = index + 1;
      const active = step === state.recommendStep;
      const completed = step < state.recommendStep || step < state.recommendMaxStep;
      return `<li class="${active ? "is-active" : ""} ${completed ? "is-complete" : ""}"><button type="button" data-recommend-go-step="${step}" ${step > state.recommendMaxStep ? "disabled" : ""} aria-current="${active ? "step" : "false"}"><span>${completed && !active ? icon("check") : String(step).padStart(2, "0")}</span><strong>${escapeHtml(label)}</strong></button></li>`;
    }).join("")}</ol>`;
  }

  function recommendStepHeading(step, title, description, meta = "") {
    return `<header class="recommend-step-heading"><div><p class="section-kicker">STEP ${String(step).padStart(2, "0")}</p><h2>${escapeHtml(title)}</h2><p>${escapeHtml(description)}</p></div>${meta ? `<span>${escapeHtml(meta)}</span>` : ""}</header>`;
  }

  function recommendActionsMarkup(options = {}) {
    return `<footer class="recommend-step-actions">
      ${options.back ? `<button class="recommend-secondary-action" type="button" data-recommend-prev>${icon("arrow")} 이전 단계</button>` : "<span></span>"}
      ${options.restart ? `<button class="recommend-secondary-action" type="button" data-recommend-restart>처음부터 다시 추천받기</button>` : ""}
      ${options.next ? `<button class="recommend-primary-action" type="button" data-recommend-next ${options.disabled ? "disabled" : ""}>${escapeHtml(options.label || "확인하고 다음")} ${icon("arrow")}</button>` : ""}
    </footer>`;
  }

  function recommendChoiceSummaryMarkup(keywordEmptyText = "다음 단계에서 입력") {
    const departments = selectedRecommendDepartments();
    const keywords = state.recommendKeywords;
    return `<aside class="recommend-choice-summary" aria-label="나의 선택 정보">
      <div class="recommend-choice-summary-title"><small>MY CHOICES</small><strong>나의 선택 정보</strong></div>
      <section><small>관심 분야</small><div><span>${escapeHtml(state.recommendField)} 분야</span></div></section>
      <section class="is-departments"><small>선택 학과</small><div>${departments.map((department) => `<span>${escapeHtml(department.name)}</span>`).join("")}</div></section>
      <section class="is-keywords"><small>입력 키워드</small><div>${keywords.length ? keywords.map((keyword) => `<span>#${escapeHtml(keyword)}</span>`).join("") : `<span class="is-placeholder">${escapeHtml(keywordEmptyText)}</span>`}</div></section>
    </aside>`;
  }

  function recommendStepOneMarkup(fields) {
    return `${recommendStepHeading(1, "관심 분야 선택", "가장 관심 있는 전공 분야 하나를 먼저 골라 주세요.", state.recommendField ? `${state.recommendField} 분야 선택` : "1개 선택")}
      <div class="recommend-field-choices" role="radiogroup" aria-label="관심 분야">
        ${fields.map((field) => {
          const selected = field.name === state.recommendField;
          const visual = fieldVisual(field.name);
          return `<button class="${selected ? "is-selected" : ""}" type="button" role="radio" aria-checked="${selected}" data-recommend-field="${escapeHtml(field.name)}" style="--field-accent:${visual.accent}; --field-soft:${visual.soft}"><span>${icon(visual.icon)}</span><span><small>${field.departmentCount} DEPARTMENTS</small><strong>${escapeHtml(field.name)}</strong><em>${escapeHtml(visual.description)}</em></span><i>${selected ? icon("check") : icon("arrow")}</i></button>`;
        }).join("")}
      </div>
      ${recommendActionsMarkup({ next: true, disabled: !state.recommendField, label: "분야 선택 확인" })}`;
  }

  function recommendStepTwoMarkup() {
    const departments = departmentsInField(state.recommendField);
    const selectedDepartments = selectedRecommendDepartments();
    const query = state.recommendDepartmentSearch.trim().toLocaleLowerCase("ko");
    const visible = departments.filter((department) => !query || departmentSearchText(department).includes(query));
    const field = fieldByName(state.recommendField);
    const visual = fieldVisual(state.recommendField);
    return `${recommendStepHeading(2, "관심 학과 선택", "관심 학과를 최대 3개까지 선택할 수 있습니다. 다음 단계에서 공통 과목과 학과별 과목을 확인합니다.", `${selectedDepartments.length}/3 선택`)}
      <div class="recommend-department-stage">
        <section class="recommend-department-picker">
          <label class="recommend-search">${icon("search")}<span class="sr-only">학과 검색</span><input type="search" data-recommend-department-search value="${escapeHtml(state.recommendDepartmentSearch)}" placeholder="${escapeHtml(state.recommendField)} 분야 학과 검색" autocomplete="off"></label>
          <div class="recommend-department-options" role="group" aria-label="추천 학과 복수 선택">${visible.map((department) => {
            const selected = state.recommendDepartmentIds.includes(department.id);
            const limitReached = selectedDepartments.length >= 3 && !selected;
            return `<button class="${selected ? "is-selected" : ""}" type="button" data-recommend-department-choice="${escapeHtml(department.id)}" aria-pressed="${selected}" data-recommend-search-text="${escapeHtml(departmentSearchText(department))}" ${limitReached ? "disabled" : ""}><span>${selected ? icon("check") : icon("graduation")}</span><span><strong>${escapeHtml(department.name)}</strong><small>${limitReached ? "최대 3개 선택 완료" : `관련 ${department.relatedSubjects.length} · 반영 ${department.reflectedSubjects.length}`}</small></span></button>`;
          }).join("") || `<p class="recommend-no-match">검색 결과가 없습니다.</p>`}</div>
        </section>
        <aside class="recommend-major-selection ${selectedDepartments.length ? "has-selections" : "is-empty"}" style="--field-accent:${visual.accent}; --field-soft:${visual.soft}">
          <div class="recommend-major-selection-symbol">${icon(visual.icon)}</div>
          <div><small>SELECTED MAJORS</small><h3>${escapeHtml(field?.name || "")} 분야 관심 학과</h3><p>선택한 모든 학과를 기준으로 다음 단계에서 공통 관련 과목과 공통 반영 과목을 계산합니다.</p></div>
          <div class="recommend-major-selection-list">${selectedDepartments.length ? selectedDepartments.map((department, index) => `<span class="recommend-major-selection-item"><b>${String(index + 1).padStart(2, "0")}</b><strong>${escapeHtml(department.name)}</strong></span>`).join("") : `<p>관심 학과를 하나 이상 선택해 주세요.</p>`}</div>
          <em>${selectedDepartments.length}/3</em>
        </aside>
      </div>
      ${recommendActionsMarkup({ back: true, next: true, disabled: !selectedDepartments.length, label: "학과 선택 확인" })}`;
  }

  function recommendReviewCourseListMarkup(subjects, emptyText, options = {}) {
    if (!subjects.length) return `<p class="recommend-review-empty">${escapeHtml(emptyText)}</p>`;
    const reflectedNames = options.reflectedNames || new Set();
    return majorSubjectGroupsMarkup(subjects, (subject) => {
      const name = typeof subject === "string" ? subject : subject.name;
      const universities = typeof subject === "object" ? subject.universities : null;
      const universityCount = universities instanceof Set ? universities.size : (universities?.length || 0);
      if (options.kind === "reflected") {
        return `<span class="major-subject-chip is-reflected"><span>${escapeHtml(name)}</span>${universityCount ? `<small>${universityCount.toLocaleString("ko-KR")}개 대학</small>` : ""}</span>`;
      }
      return reflectedNames.has(normalizedCourseName(name))
        ? `<span class="major-subject-chip is-related-reflected"><span>${escapeHtml(name)}</span>${reflectionStarMarkup()}</span>`
        : `<span class="major-subject-chip is-related"><span>${escapeHtml(name)}</span></span>`;
    }, { className: "recommend-review-subject-groups" });
  }

  function recommendStepThreeMarkup() {
    const selectedDepartments = selectedRecommendDepartments();
    const relatedStats = recommendationSubjectStats(selectedDepartments);
    const reflectedStats = recommendationSubjectStats(selectedDepartments, "reflected");
    const commonRelated = selectedDepartments.length > 1
      ? relatedStats.filter((subject) => subject.count === selectedDepartments.length)
      : relatedStats;
    const commonReflected = selectedDepartments.length > 1
      ? reflectedStats.filter((subject) => subject.count === selectedDepartments.length)
      : reflectedStats;
    return `${recommendStepHeading(3, "과목 확인", "선택 학과의 공통 과목을 먼저 보고, 각 학과의 반영·관련 과목을 함께 확인하세요.", `${selectedDepartments.length}개 학과 기준`)}
      ${recommendChoiceSummaryMarkup()}
      <div class="recommend-course-review">
        <section class="recommend-common-review">
          <header><div><small>COMMON COURSES</small><h3>선택 학과 공통 과목</h3></div><em>${commonRelated.length + commonReflected.length}</em></header>
          <div class="recommend-common-course-stack">
            <section class="is-common-reflected"><h4>${icon("solid-star")}<span>공통 반영 과목</span><em>${commonReflected.length}</em></h4>${recommendReviewCourseListMarkup(commonReflected, "모든 선택 학과에 공통인 반영 과목이 없습니다.", { kind: "reflected" })}</section>
            <section class="is-common-related"><h4>${icon("book-open")}<span>공통 관련 과목</span><em>${commonRelated.length}</em></h4>${recommendReviewCourseListMarkup(commonRelated, "모든 선택 학과에 공통인 관련 과목이 없습니다.", { reflectedNames: new Set(commonReflected.map((subject) => subject.key)) })}</section>
          </div>
        </section>
        <section class="recommend-department-review">
          <header><div><small>COURSES BY DEPARTMENT</small><h3>학과별 반영·관련 과목</h3></div><span>아래로 스크롤해 학과별로 하나씩 크게 확인하세요.</span></header>
          <div class="recommend-department-review-track">${selectedDepartments.map((department) => `<article class="recommend-department-review-card">
            <header><div><small>${escapeHtml(department.field)} FIELD</small><h4>${escapeHtml(department.name)}</h4></div><em>${department.relatedSubjects.length + department.reflectedSubjects.length}</em></header>
            <div class="recommend-department-course-stack">
              <section class="is-reflected"><h5>${icon("solid-star")} <span>반영 과목</span> <em>${department.reflectedSubjects.length}</em></h5>${recommendReviewCourseListMarkup(department.reflectedSubjects, "반영 과목 정보가 없습니다.", { kind: "reflected" })}</section>
              <section class="is-related"><h5>${icon("book-open")} <span>관련 과목</span> <em>${department.relatedSubjects.length}</em></h5>${recommendReviewCourseListMarkup(department.relatedSubjects, "관련 과목 정보가 없습니다.", { reflectedNames: new Set(department.reflectedSubjects.map((subject) => normalizedCourseName(subject.name))) })}</section>
            </div>
          </article>`).join("")}</div>
        </section>
      </div>
      ${recommendActionsMarkup({ back: true, next: true, label: "과목 확인 완료" })}`;
  }

  function recommendStepFourMarkup() {
    const matches = recommendKeywordResults();
    return `${recommendStepHeading(4, "나만의 특별함 더하기", "관심 활동이나 세부 진로를 키워드로 최대 3개까지 입력하세요.", `${state.recommendKeywords.length}/3`)}
      <div class="recommend-keyword-stage">
        <section class="recommend-keyword-entry">
          <form data-recommend-keyword-form>
            <label><span class="sr-only">관심 키워드</span><input type="text" name="keyword" maxlength="30" autocomplete="off" placeholder="예: 인공지능, 상담, 콘텐츠 제작" ${state.recommendKeywords.length >= 3 ? "disabled" : ""}></label>
            <button type="submit" ${state.recommendKeywords.length >= 3 ? "disabled" : ""}>키워드 추가</button>
          </form>
          <div class="recommend-keyword-tags">${state.recommendKeywords.length ? state.recommendKeywords.map((keyword, index) => `<button type="button" data-recommend-keyword-remove="${index}" aria-label="${escapeHtml(keyword)} 삭제"><span>${escapeHtml(keyword)}</span> ×</button>`).join("") : `<p>키워드를 하나씩 입력하고 ‘추가’를 눌러 주세요.</p>`}</div>
          <div class="recommend-keyword-tip"><span>${icon("lightbulb")}</span><p><strong>구체적으로 적을수록 좋아요.</strong><br>‘컴퓨터’보다 ‘인공지능 개발’, ‘미술’보다 ‘게임 캐릭터 디자인’처럼 입력해 보세요.</p></div>
        </section>
        <section class="recommend-special-preview">
          <header><div><small>LIVE COURSE MATCH</small><h3>키워드 연결 과목</h3></div><em>${matches.length}</em></header>
          <p class="recommend-confidence-guide">연관 수준은 키워드 DB·과목 설명·선택 학과가 서로 뒷받침하는 정도입니다.</p>
          <div>${matches.length ? matches.map((result) => {
            const category = valueAt(result.row, COLUMN_ALIASES.category);
            const keywordTags = [...result.keywords].map((keyword) => `#${keyword}`).join(" ");
            return `<article class="is-confidence-${result.confidence}"><span>${icon("sparkles")}</span><div><strong>${escapeHtml(result.name)}</strong><small>${escapeHtml([category, keywordTags].filter(Boolean).join(" · "))}</small><p class="recommend-match-reason">${escapeHtml(result.reasonText || "과목 데이터와 연결됨")}</p></div><em class="recommend-confidence">${escapeHtml(result.confidenceLabel)}</em></article>`;
          }).join("") : `<p class="recommend-special-empty">${state.recommendKeywords.length ? "신뢰할 만한 연결 근거가 있는 과목을 찾지 못했습니다. 조금 더 구체적인 키워드를 입력해 보세요." : "키워드를 입력하면 선택한 분야·학과를 함께 고려한 과목이 여기에 표시됩니다."}</p>`}</div>
        </section>
      </div>
      ${recommendActionsMarkup({ back: true, next: true, label: state.recommendKeywords.length ? "입력 완료 · 결과 보기" : "건너뛰고 결과 보기" })}`;
  }

  function recommendResultEntryMarkup(entry) {
    return `<a href="section.html?tab=subjects&q=${encodeURIComponent(entry.name)}"><strong>${escapeHtml(entry.name)}</strong><small>${escapeHtml(entry.detail || "과목 정보를 확인해 보세요.")}</small>${entry.count > 1 ? `<b>${entry.count}개 학과 공통</b>` : ""}</a>`;
  }

  function recommendResultGroupMarkup(group, index) {
    const subjectGroups = groupedRecommendationSubjects(group.entries);
    return `<article class="recommend-result-group result-priority-${index + 1}">
      <header><b class="recommend-result-order">${String(index + 1).padStart(2, "0")}</b><span>${icon(group.iconName)}</span><div><small>PRIORITY</small><h3>${escapeHtml(group.label)}</h3><p>${escapeHtml(group.description)}</p></div><em>${group.entries.length}</em></header>
      <div class="recommend-result-list">${subjectGroups.length ? subjectGroups.map((subjectGroup) => {
        const [accent, soft] = courseGroupPalette(subjectGroup.category);
        return `<section class="recommend-result-course-group" style="--course-group-accent:${accent}; --course-group-soft:${soft}">
          <header><span>${escapeHtml(subjectGroup.category)}</span><em>${subjectGroup.entries.length}</em></header>
          <div class="recommend-result-course-items">${subjectGroup.entries.map(recommendResultEntryMarkup).join("")}</div>
        </section>`;
      }).join("") : `<div class="recommend-result-empty">${icon("book-open")}<span>해당하는 과목이 없습니다.</span></div>`}</div>
    </article>`;
  }

  function recommendStepFiveMarkup() {
    const groups = recommendFinalGroups();
    const total = new Set(groups.flatMap((group) => group.entries.map((entry) => entry.key))).size;
    return `${recommendStepHeading(5, "최종 결과 확인", "선택한 분야·학과·키워드를 반영해 중요도 순서로 나눴습니다.", `추천 ${total}개`)}
      <div class="recommend-result-print-row">${printActionMarkup("recommendation")}</div>
      ${recommendChoiceSummaryMarkup("입력하지 않음")}
      <div class="recommend-final-groups">${groups.map(recommendResultGroupMarkup).join("")}</div>
      <aside class="recommend-final-warning" role="note"><span>${icon("warning")}</span><p><strong>과목 추천은 정답이 아닙니다.</strong> 꼭 담임 선생님과 검토하세요.</p></aside>
      ${recommendActionsMarkup({ back: true, restart: true })}`;
  }

  function recommendCurrentStepMarkup(fields) {
    if (state.recommendStep === 2) return recommendStepTwoMarkup();
    if (state.recommendStep === 3) return recommendStepThreeMarkup();
    if (state.recommendStep === 4) return recommendStepFourMarkup();
    if (state.recommendStep === 5) return recommendStepFiveMarkup();
    return recommendStepOneMarkup(fields);
  }

  function recommendFieldExpansionMarkup(field, departments) {
    const visual = fieldVisual(field.name);
    return `<div class="recommend-field-expansion" style="--field-accent:${visual.accent}; --field-soft:${visual.soft}">
      ${state.recommendSection ? `<button class="recommend-dialog-back recommend-section-back" type="button" data-return-recommend-menu>${icon("arrow")} ${escapeHtml(field.name)} 분야 메뉴</button>` : recommendSectionPickerMarkup(field, departments)}
      ${state.recommendSection === "common" ? `<section class="field-common-courses" style="--field-accent:${visual.accent}; --field-soft:${visual.soft}">
        <header><span>${icon(visual.icon)}</span><div><small>STEP 02 · FIELD COMMON COURSES</small><h2>${escapeHtml(field.name)} 분야 공통 과목</h2><p>${escapeHtml(state.departmentDataset.meta.commonSubjectRule || "분야 내 과반수 학과에서 공통으로 확인되는 관련 과목")}입니다.</p></div><em>${field.commonSubjects.length}</em></header>
        ${fieldCommonSubjectsMarkup(field.commonSubjects)}
      </section>` : ""}
      ${state.recommendSection === "departments" ? `<div class="results-head major-results-head"><div><small>STEP 03 · DEPARTMENT</small><h2>학과별 관련 과목</h2></div><span>학과를 클릭하여 관련 과목을 확인하세요.</span></div>
      <section class="major-grid recommend-major-grid" aria-live="polite">${recommendDepartmentGridMarkup(departments)}</section>` : ""}
    </div>`;
  }

  function openRecommendFieldDialog(fieldName) {
    const field = fieldByName(fieldName);
    if (!field) return;
    const departments = departmentsInField(field.name);
    const visual = fieldVisual(field.name);
    state.dialogReturnToRecommend = false;
    state.dialogDepartmentId = "";
    state.dialogSubjectKind = "";
    state.dialogSubjectName = "";
    detailDialog.classList.remove("is-comparison-picker-dialog", "is-comparison-result-dialog");
    detailDialog.classList.add("is-major-dialog", "is-recommend-field-dialog");
    detailContent.innerHTML = `
      <div class="major-dialog-head recommend-field-dialog-head" style="--field-accent:${visual.accent}; --field-soft:${visual.soft}">
        <span>${icon(visual.icon)}</span>
        <div><p class="dialog-kicker">STEP 01 · ${escapeHtml(field.name.toLocaleUpperCase("ko"))} FIELD</p><h2 id="record-dialog-title">${escapeHtml(field.name)} 분야 과목 추천</h2><p class="recommend-field-dialog-description">분야 공통 과목 혹은 학과별 관련 과목을 확인하세요.</p></div>
      </div>
      ${recommendFieldExpansionMarkup(field, departments)}`;
    if (!detailDialog.open) detailDialog.showModal();
  }

  function renderRecommend() {
    const fields = state.departmentDataset.fields;
    if (state.recommendField && !fields.some((field) => field.name === state.recommendField)) state.recommendField = "";
    state.recommendDepartmentIds = state.recommendDepartmentIds.filter((id) => {
      const department = departmentById(id);
      return department && department.field === state.recommendField;
    });
    state.recommendStep = Math.max(1, Math.min(5, Number(state.recommendStep) || 1));
    if (!state.recommendField && state.recommendStep > 1) state.recommendStep = 1;
    if (!state.recommendDepartmentIds.length && state.recommendStep > 2) state.recommendStep = 2;
    state.recommendMaxStep = Math.max(state.recommendStep, Math.min(5, Number(state.recommendMaxStep) || 1));
    root.innerHTML = `
      ${renderNotices()}
      <section class="recommend-wizard" data-recommend-step="${state.recommendStep}">
        <header class="recommend-wizard-head">
          <div><p class="page-eyebrow">FIND YOUR BEST PATH</p><h1>나만의 과목 추천</h1><p>다섯 단계를 차례로 확인하며 진로에 맞는 과목을 찾아보세요.</p></div>
          ${recommendProgressMarkup()}
        </header>
        <section class="recommend-step-panel" aria-live="polite">${recommendCurrentStepMarkup(fields)}</section>
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
    const storageKey = state.selectedAdmissionYear ? `${schoolId}:${state.selectedAdmissionYear}` : schoolId;
    if (!state.schoolSelections[storageKey] || typeof state.schoolSelections[storageKey] !== "object") {
      const legacySelection = state.selectedAdmissionYear && state.schoolSelections[schoolId]
        && typeof state.schoolSelections[schoolId] === "object" ? state.schoolSelections[schoolId] : null;
      state.schoolSelections[storageKey] = legacySelection ? { ...legacySelection } : {};
      if (legacySelection) delete state.schoolSelections[schoolId];
    }
    return state.schoolSelections[storageKey];
  }

  function curriculumOptionKey(grade, option, index) {
    return `grade-${grade}:${option.id || option.label || index + 1}`;
  }

  function curriculumStandaloneKey(grade, semester) {
    return `grade-${grade}:semester-${semester}:open-electives`;
  }

  function semesterStandaloneCourses(semesterData) {
    const optionNames = new Set(semesterData.options.flatMap((option) => option.courses || []).map(normalizedCourseName));
    return semesterData.electives.filter((course) => !optionNames.has(normalizedCourseName(course)));
  }

  function selectedSemesterStandalone(selections, grade, semesterData) {
    const key = curriculumStandaloneKey(grade, semesterData.semester);
    const legacyKey = `grade-${grade}:open-electives`;
    const stored = Array.isArray(selections[key]) ? selections[key]
      : semesterData.semester === 1 && Array.isArray(selections[legacyKey]) ? selections[legacyKey] : [];
    const allowed = new Set(semesterStandaloneCourses(semesterData));
    return stored.filter((course) => allowed.has(course));
  }

  function selectedCurriculumSubjects() {
    const map = schoolSelectionMap();
    const selected = [];
    curriculumGrades().forEach((grade) => {
      grade.semesters.forEach((semesterData) => {
        semesterData.options.forEach((option, index) => {
          const key = curriculumOptionKey(grade.grade, option, index);
          const allowed = new Set(option.courses);
          (Array.isArray(map[key]) ? map[key] : []).filter((course) => allowed.has(course)).forEach((course) => selected.push(course));
        });
        selectedSemesterStandalone(map, grade.grade, semesterData).forEach((course) => selected.push(course));
      });
    });
    return [...new Set(selected)];
  }

  function curriculumSelectionProgress(grades = curriculumGrades()) {
    const selections = schoolSelectionMap();
    const gradeProgress = grades.map((grade) => {
      const semesterProgress = grade.semesters.map((semesterData) => {
        const options = semesterData.options.map((option, index) => {
          const key = curriculumOptionKey(grade.grade, option, index);
          const allowed = new Set(option.courses);
          const selected = (Array.isArray(selections[key]) ? selections[key] : []).filter((course) => allowed.has(course));
          const target = Math.min(Math.max(1, Number(option.choose) || 1), option.courses.length);
          return { key, selected, target, complete: selected.length === target };
        });
        const standaloneSelected = selectedSemesterStandalone(selections, grade.grade, semesterData);
        return {
          semester: semesterData.semester,
          options,
          optionCount: options.length,
          completedOptions: options.filter((option) => option.complete).length,
          requiredChoices: options.reduce((sum, option) => sum + option.target, 0),
          selectedChoices: options.reduce((sum, option) => sum + option.selected.length, 0),
          standaloneSelected,
          complete: options.every((option) => option.complete)
        };
      });
      return {
        grade: grade.grade,
        semesterProgress,
        options: semesterProgress.flatMap((semester) => semester.options),
        optionCount: semesterProgress.reduce((sum, semester) => sum + semester.optionCount, 0),
        completedOptions: semesterProgress.reduce((sum, semester) => sum + semester.completedOptions, 0),
        requiredChoices: semesterProgress.reduce((sum, semester) => sum + semester.requiredChoices, 0),
        selectedChoices: semesterProgress.reduce((sum, semester) => sum + semester.selectedChoices, 0),
        standaloneSelected: semesterProgress.flatMap((semester) => semester.standaloneSelected),
        complete: semesterProgress.every((semester) => semester.complete)
      };
    });
    const optionCount = gradeProgress.reduce((sum, grade) => sum + grade.optionCount, 0);
    const completedOptions = gradeProgress.reduce((sum, grade) => sum + grade.completedOptions, 0);
    const requiredChoices = gradeProgress.reduce((sum, grade) => sum + grade.requiredChoices, 0);
    const selectedChoices = gradeProgress.reduce((sum, grade) => sum + grade.selectedChoices, 0);
    const standaloneCount = gradeProgress.reduce((sum, grade) => sum + grade.standaloneSelected.length, 0);
    return {
      gradeProgress,
      optionCount,
      completedOptions,
      requiredChoices,
      selectedChoices,
      standaloneCount,
      selectedCount: selectedChoices + standaloneCount,
      complete: optionCount === 0 || completedOptions === optionCount
    };
  }

  function curriculumCourseEntry(name, source = "elective", semester = 1) {
    const reference = curriculumCourseReference(name);
    const row = reference?.row || null;
    const badge = row ? courseBadge(row) : null;
    const uploadedMetadata = state.curriculum?.courseMetadata?.[curriculumCourseAliasKey(name)] || {};
    const uploadedType = uploadedCourseType(uploadedMetadata.type);
    let type = "elective";
    if (source === "common") type = "common";
    else if (source === "designated") type = "designated";
    else if (uploadedType === "공통") type = "common";
    else if (uploadedType === "일반") type = "general";
    else if (uploadedType === "진로") type = "career";
    else if (uploadedType === "융합") type = "convergence";
    else if (uploadedType === "전문") type = "professional";
    else if (badge?.label === "공통") type = "common";
    else if (badge?.label === "일반") type = "general";
    else if (badge?.label === "진로") type = "career";
    else if (badge?.label === "융합") type = "convergence";
    else if (badge?.label === "전문") type = "professional";
    return {
      name: compactText(name),
      key: normalizedCourseName(name),
      source,
      semester,
      type,
      category: uploadedMetadata.category || (row ? reference.category || majorSubjectGroup(name).name || "교과군 미분류" : "고시 외 과목"),
      row
    };
  }

  function curriculumCoursePlan() {
    const selections = schoolSelectionMap();
    return curriculumGrades().map((grade) => {
      const entries = new Map();
      const add = (name, source, semester) => {
        const entry = curriculumCourseEntry(name, source, semester);
        if (!entry.name) return;
        const planKey = `${semester}:${entry.key}`;
        const existing = entries.get(planKey);
        if (!existing || source === "common") entries.set(planKey, entry);
      };
      grade.semesters.forEach((semesterData) => {
        semesterData.common.forEach((course) => add(course, grade.grade === 1 ? "common" : "designated", semesterData.semester));
        semesterData.options.forEach((option, index) => {
          const key = curriculumOptionKey(grade.grade, option, index);
          const allowed = new Set(option.courses);
          (Array.isArray(selections[key]) ? selections[key] : []).filter((course) => allowed.has(course)).forEach((course) => add(course, "elective", semesterData.semester));
        });
        selectedSemesterStandalone(selections, grade.grade, semesterData).forEach((course) => add(course, "elective", semesterData.semester));
      });
      return { grade: grade.grade, entries: [...entries.values()] };
    });
  }

  const CURRICULUM_RESULT_TYPES = Object.freeze([
    { key: "common", label: "공통", className: "is-common" },
    { key: "designated", label: "학교 지정", className: "is-designated" },
    { key: "general", label: "일반 선택", className: "is-general" },
    { key: "career", label: "진로 선택", className: "is-career" },
    { key: "convergence", label: "융합 선택", className: "is-convergence" },
    { key: "professional", label: "전문 선택", className: "is-professional" },
    { key: "elective", label: "기타 선택", className: "is-elective" }
  ]);

  function simulationCourseGroupMarkup(entries) {
    return groupedRecommendationSubjects(entries).map((group) => `<section class="simulation-final-course-group"><header><span>${escapeHtml(group.category)}</span><em>${group.entries.length}</em></header><ul>${group.entries.map((entry) => `<li><small>${entry.semester}학기</small>${entry.row ? `<a href="section.html?tab=subjects&q=${encodeURIComponent(entry.name)}" title="${escapeHtml(entry.name)} 과목 안내 보기">${escapeHtml(entry.name)}</a>` : `<span>${escapeHtml(entry.name)}</span><em>고시 외 과목</em>`}</li>`).join("")}</ul></section>`).join("");
  }

  function simulationFinalGradeMarkup(gradePlan) {
    const typeSections = CURRICULUM_RESULT_TYPES.map((type) => {
      const entries = gradePlan.entries.filter((entry) => entry.type === type.key);
      if (!entries.length) return "";
      return `<section class="simulation-final-type ${type.className}"><header><strong>${escapeHtml(type.label)}</strong><span>${entries.length}과목</span></header><div>${simulationCourseGroupMarkup(entries)}</div></section>`;
    }).join("");
    return `<article class="simulation-final-grade"><header><span>${gradePlan.grade}</span><div><small>GRADE ${String(gradePlan.grade).padStart(2, "0")}</small><h2>${gradePlan.grade}학년 수강 과목</h2></div><em>${gradePlan.entries.length}과목</em></header><div class="simulation-final-type-list">${typeSections || '<p class="simulation-final-empty">등록된 과목이 없습니다.</p>'}</div></article>`;
  }

  function simulationFinalContentMarkup() {
    const plan = curriculumCoursePlan();
    const progress = curriculumSelectionProgress();
    const fixedCount = plan.reduce((sum, grade) => sum + grade.entries.filter((entry) => ["common", "designated"].includes(entry.type)).length, 0);
    const total = plan.reduce((sum, grade) => sum + grade.entries.length, 0);
    return `<section class="simulation-final-document">
      <header class="simulation-final-summary"><div><p>MY COURSE PLAN</p><h1>${escapeHtml(state.selectedSchool?.name || "선택 학교")} 수강 과목표</h1><span>${escapeHtml(state.selectedAdmissionYear || state.curriculum?.admissionYear || "-")}학년도 입학생 기준</span></div><dl><div><dt>전체 수강</dt><dd>${total}</dd></div><div><dt>공통·학교 지정</dt><dd>${fixedCount}</dd></div><div><dt>선택 완료</dt><dd>${progress.selectedCount}</dd></div></dl></header>
      <div class="simulation-final-grade-grid">${plan.map(simulationFinalGradeMarkup).join("")}</div>
      <footer><span>${icon("check")} 학교 편제표의 공통 과목과 직접 선택한 과목을 합산했습니다.</span><small>선택 과목 안내 플랫폼</small></footer>
    </section>`;
  }

  function syncSchoolSimulationSubjects(save = false) {
    state.settings.schoolSelections = state.schoolSelections;
    state.simulationSubjects = selectedCurriculumSubjects();
    state.settings.simulationSubjects = state.simulationSubjects;
    if (save) store.saveSettings(state.settings);
  }

  function saveSchoolSelections() {
    syncSchoolSimulationSubjects(true);
  }

  function curriculumCourseDisplayMarkup(course) {
    const name = compactText(course);
    const isUnlisted = !curriculumCourseReference(name);
    return `<b>${escapeHtml(name)}</b>${isUnlisted ? '<small class="curriculum-unlisted-badge">고시 외 과목</small>' : ""}`;
  }

  function semesterCurriculumMarkup(gradeData, semesterData, semesterProgress, locked = false) {
    const selections = schoolSelectionMap();
    const standalone = semesterStandaloneCourses(semesterData);
    const fixedCourseLabel = gradeData.grade === 1 ? "공통 과목" : "학교 지정 과목";
    const fixedCourseKicker = gradeData.grade === 1 ? "COMMON COURSES · AUTO" : "SCHOOL DESIGNATED · AUTO";
    const commonMarkup = semesterData.common.length
      ? semesterData.common.map((course) => `<span class="common-course-chip">${icon("check")}${curriculumCourseDisplayMarkup(course)}</span>`).join("")
      : `<span class="curriculum-empty-copy">입력된 ${fixedCourseLabel}이 없습니다.</span>`;
    const standaloneKey = curriculumStandaloneKey(gradeData.grade, semesterData.semester);
    const standaloneSelected = selectedSemesterStandalone(selections, gradeData.grade, semesterData);
    const standaloneMarkup = standalone.length
      ? `<section class="curriculum-option-card is-open"><header><div><small>개설 선택과목</small><h3>자유 선택</h3></div><span><strong>${standaloneSelected.length}</strong>개 선택</span></header><div class="curriculum-course-options">${standalone.map((course) => `<button type="button" class="${standaloneSelected.includes(course) ? "is-selected" : ""}" data-curriculum-choice data-selection-key="${escapeHtml(standaloneKey)}" data-course-name="${escapeHtml(course)}" data-choose="0" aria-pressed="${standaloneSelected.includes(course)}" ${locked ? "disabled" : ""}><span>${standaloneSelected.includes(course) ? "✓" : "+"}</span>${curriculumCourseDisplayMarkup(course)}</button>`).join("")}</div></section>`
      : "";
    const optionsMarkup = semesterData.options.length
      ? semesterData.options.map((option, index) => {
        const key = curriculumOptionKey(gradeData.grade, option, index);
        const selected = Array.isArray(selections[key]) ? selections[key].filter((course) => option.courses.includes(course)) : [];
        const choose = Math.max(1, Number(option.choose) || 1);
        const complete = selected.length === Math.min(choose, option.courses.length);
        return `<section class="curriculum-option-card ${complete ? "is-complete" : ""}">
          <header><div><small>${escapeHtml(option.label || `옵션 ${index + 1}`)}</small><h3>${option.courses.length.toLocaleString("ko-KR")}개 교과 중 택 ${choose}</h3></div><span><strong>${selected.length}</strong> / ${choose} 선택</span></header>
          <div class="curriculum-course-options">${option.courses.map((course) => {
            const isSelected = selected.includes(course);
            const atLimit = !isSelected && selected.length >= choose;
            return `<button type="button" class="${isSelected ? "is-selected" : ""} ${atLimit ? "is-limit" : ""}" data-curriculum-choice data-selection-key="${escapeHtml(key)}" data-course-name="${escapeHtml(course)}" data-choose="${choose}" aria-pressed="${isSelected}" aria-disabled="${atLimit || locked}" ${locked ? "disabled" : ""}><span>${isSelected ? "✓" : "+"}</span>${curriculumCourseDisplayMarkup(course)}</button>`;
          }).join("")}</div>
        </section>`;
      }).join("")
      : "";

    const optionArea = optionsMarkup || standaloneMarkup
      ? `<div class="curriculum-options-grid">${optionsMarkup}${standaloneMarkup}</div>`
      : '<div class="curriculum-empty-option semester-empty-option"><p>이 학기는 선택 옵션이 없습니다. 공통 과목을 확인한 뒤 다음 단계로 이동하세요.</p></div>';

    return `<section class="semester-curriculum-section ${locked ? "is-locked" : ""}" data-semester="${semesterData.semester}">
      <header class="semester-curriculum-head"><div><span>${semesterData.semester}</span><div><small>SEMESTER ${String(semesterData.semester).padStart(2, "0")}</small><h3>${semesterData.semester}학기</h3></div></div><em class="${semesterProgress.complete ? "is-complete" : ""}">${semesterProgress.optionCount ? `택 ${semesterProgress.selectedChoices}/${semesterProgress.requiredChoices} · 옵션 ${semesterProgress.completedOptions}/${semesterProgress.optionCount}` : "선택 옵션 없음"}</em></header>
      ${locked ? `<p class="semester-lock-notice">${icon("lock")} 1학기 선택을 완료하면 2학기 옵션이 열립니다.</p>` : ""}
      <section class="common-course-block"><div><small>${fixedCourseKicker}</small><h3>${fixedCourseLabel} <em>${semesterData.common.length}과목 자동 포함</em></h3></div><div class="common-course-list">${commonMarkup}</div></section>
      ${optionArea}
    </section>`;
  }

  function gradeCurriculumMarkup(gradeData) {
    const progress = curriculumSelectionProgress([gradeData]).gradeProgress[0];
    const firstSemesterComplete = progress.semesterProgress[0]?.complete !== false;
    return `<article class="grade-curriculum-card">
      <header class="grade-curriculum-head"><span>${gradeData.grade}</span><div><p>GRADE ${String(gradeData.grade).padStart(2, "0")}</p><h2>${gradeData.grade}학년 편제</h2></div><em class="grade-selection-progress ${progress.optionCount === progress.completedOptions ? "is-complete" : ""}">${progress.optionCount ? `택 ${progress.selectedChoices}/${progress.requiredChoices} · 옵션 ${progress.completedOptions}/${progress.optionCount}` : "선택 옵션 없음"}</em></header>
      <div class="semester-curriculum-list">${gradeData.semesters.map((semesterData, index) => semesterCurriculumMarkup(gradeData, semesterData, progress.semesterProgress[index], index > 0 && !firstSemesterComplete)).join("")}</div>
    </article>`;
  }

  function simulationSchoolPickerMarkup() {
    const schoolOptions = state.schools.length
      ? state.schools.map((school, index) => {
        const selected = state.selectedSchool?.id === school.id;
        const years = schoolAdmissionYears(school);
        return `<button type="button" class="${selected ? "is-selected" : ""}" data-simulation-school-id="${escapeHtml(school.id)}"><span>${String(index + 1).padStart(2, "0")}</span><div><strong>${escapeHtml(school.name)}</strong><small>${escapeHtml(school.region || "지역 정보 없음")} · ${years.length ? `${years.length}개 입학년도` : "등록 편제표 없음"}</small></div>${icon("arrow")}</button>${selected ? schoolAdmissionYearOptionsMarkup(school) : ""}`;
      }).join("")
      : `<p class="simulation-school-menu-empty">아직 연동된 학교가 없습니다.</p>`;
    return `<div class="simulation-school-picker">
      <button class="primary-action" type="button" data-open-school-picker aria-expanded="false" aria-controls="simulation-school-menu">${state.selectedSchool ? "입학년도 선택 열기" : "학교 선택 열기"}</button>
      <section class="simulation-school-menu" id="simulation-school-menu" data-simulation-school-menu hidden>
        <header><strong>${state.selectedSchool ? `${escapeHtml(state.selectedSchool.name)} 입학년도 선택` : "연동된 학교"}</strong><span>${state.schools.length.toLocaleString("ko-KR")}곳</span></header>
        <div class="simulation-school-options">${schoolOptions}</div>
      </section>
    </div>`;
  }

  function simulationGradeProgressMarkup(progress, maxAccessibleGrade = 1) {
    const gradeItems = progress.gradeProgress.map((gradeProgress) => {
      const accessible = gradeProgress.grade <= maxAccessibleGrade;
      const active = !state.simulationResultOpen && state.simulationGradeStep === gradeProgress.grade;
      const confirmed = gradeProgress.grade < state.simulationMaxGradeStep || (gradeProgress.grade === 3 && state.simulationResultUnlocked);
      const completed = gradeProgress.complete && confirmed;
      return `<li class="${active ? "is-active" : ""} ${completed ? "is-complete" : ""}"><button type="button" data-simulation-grade="${gradeProgress.grade}" ${accessible ? "" : "disabled"} aria-current="${active ? "step" : "false"}"><span>${completed ? icon("check") : String(gradeProgress.grade).padStart(2, "0")}</span><strong>${gradeProgress.grade}학년</strong><small>${gradeProgress.optionCount ? `옵션 ${gradeProgress.completedOptions}/${gradeProgress.optionCount}` : "확인만"}</small></button></li>`;
    }).join("");
    const resultActive = state.simulationResultOpen;
    const resultAvailable = progress.complete && (state.simulationGradeStep === 3 || state.simulationResultUnlocked);
    const resultCompleted = progress.complete && state.simulationResultUnlocked;
    return `<ol class="simulation-grade-progress" aria-label="학년별 과목 선택 진행 단계">${gradeItems}<li class="is-result ${resultActive ? "is-active" : ""} ${resultCompleted ? "is-complete" : ""}"><button type="button" data-show-simulation-result ${resultAvailable ? "" : "disabled"} aria-current="${resultActive ? "step" : "false"}"><span>${resultCompleted ? icon("check") : "04"}</span><strong>최종 결과</strong><small>${resultAvailable ? "확인 가능" : "선택 중"}</small></button></li></ol>`;
  }

  function renderSimulation() {
    if (!state.selectedSchool || !state.curriculum) {
      state.simulationResultOpen = false;
      root.innerHTML = `
        ${renderNotices()}
        ${pageHead("과목 선택 시뮬레이션", "학교와 입학년도를 선택하면 해당 편제표의 학년별 공통 과목과 선택 옵션을 불러옵니다.", 0, "연동 옵션")}
        <div class="empty-state school-required-state"><span class="empty-icon">${icon("school")}</span><h2>${state.selectedSchool ? schoolAdmissionYears(state.selectedSchool).length ? "입학년도를 선택해 주세요." : "이 학교에 공개된 편제표가 없습니다." : "먼저 학교를 선택해 주세요."}</h2><p>${state.selectedSchool ? schoolAdmissionYears(state.selectedSchool).length ? "학교에 등록된 입학년도 중 하나를 선택하면 해당 학생의 편제표가 연동됩니다." : "학교 담당자가 데이터 연동 탭에서 편제표를 업로드하면 시뮬레이션이 활성화됩니다." : "아래의 버튼을 누르면 연동된 학교 목록을 확인할 수 있습니다."}</p>${simulationSchoolPickerMarkup()}</div>`;
      return;
    }

    const grades = curriculumGrades();
    const progress = curriculumSelectionProgress(grades);
    const commonCount = grades.reduce((sum, grade) => sum + grade.semesters.reduce((semesterSum, semester) => semesterSum + semester.common.length, 0), 0);
    let prerequisiteMaxGrade = 1;
    if (progress.gradeProgress[0]?.complete) prerequisiteMaxGrade = 2;
    if (progress.gradeProgress.slice(0, 2).every((grade) => grade.complete)) prerequisiteMaxGrade = 3;
    state.simulationMaxGradeStep = Math.max(1, Math.min(3, Number(state.simulationMaxGradeStep) || 1));
    const maxAccessibleGrade = Math.min(prerequisiteMaxGrade, state.simulationMaxGradeStep);
    state.simulationGradeStep = Math.max(1, Math.min(maxAccessibleGrade, Number(state.simulationGradeStep) || 1));

    if (state.simulationResultOpen) {
      root.innerHTML = `
        ${renderNotices()}
        ${pageHead("최종 수강 과목", `${state.selectedSchool.name} ${state.curriculum.admissionYear || ""}학년도 입학생의 학년별 과목을 확인합니다.`, commonCount + progress.selectedCount, "전체 과목")}
        ${simulationGradeProgressMarkup(progress, maxAccessibleGrade)}
        <div class="simulation-final-actions"><button class="recommend-secondary-action" type="button" data-edit-simulation>${icon("arrow")} 과목 선택 수정</button>${printActionMarkup("simulation")}</div>
        ${simulationFinalContentMarkup()}`;
      return;
    }

    const activeGrade = grades.find((grade) => grade.grade === state.simulationGradeStep) || grades[0];
    const activeProgress = progress.gradeProgress.find((grade) => grade.grade === activeGrade.grade);
    const semesterStatus = activeProgress.semesterProgress.map((semester) => `${semester.semester}학기 ${semester.optionCount ? `${semester.completedOptions}/${semester.optionCount}` : "확인"}`).join(" · ");

    root.innerHTML = `
      ${renderNotices()}
      ${pageHead("과목 선택 시뮬레이션", `${state.selectedSchool.name} ${state.curriculum.admissionYear || ""}학년도 입학생 편제표를 기준으로 선택합니다.`, progress.selectedCount, "선택 과목")}
      ${simulationGradeProgressMarkup(progress, maxAccessibleGrade)}
      <section class="simulation-overview">
        <div><p class="section-kicker">GRADE ${String(activeGrade.grade).padStart(2, "0")} · SCHOOL CURRICULUM</p><h2>${activeGrade.grade}학년 과목 확인</h2><span>${escapeHtml(state.selectedSchool.name)} · ${escapeHtml(state.curriculum.admissionYear || "-")}학년도 입학생 · ${semesterStatus}</span></div>
        <button class="text-action" type="button" data-clear-school-simulation ${progress.selectedCount ? "" : "disabled"}>선택 초기화</button>
      </section>
      <section class="grade-curriculum-list is-single-grade" aria-live="polite">${gradeCurriculumMarkup(activeGrade)}</section>
      <section class="simulation-selection-summary ${activeProgress.complete ? "is-complete" : ""}">
        <span>${icon(activeProgress.complete ? "check" : "route")}</span>
        <div><small>${activeGrade.grade}학년 선택 현황</small><h2>${activeProgress.optionCount ? `${activeProgress.optionCount}개 옵션 중 ${activeProgress.completedOptions}개 완료` : "선택 옵션 없음 · 공통 과목 확인 완료"}</h2><p>${activeProgress.optionCount ? `필수 선택 ${activeProgress.selectedChoices}/${activeProgress.requiredChoices} · ${semesterStatus}` : "공통 과목만 확인하면 다음 학년으로 이동할 수 있습니다."}</p></div>
        <div class="simulation-grade-actions"><button class="simulation-grade-back" type="button" data-simulation-prev-grade ${activeGrade.grade === 1 ? "disabled" : ""}>${icon("arrow")} 이전 학년</button>${activeGrade.grade < 3 ? `<button class="simulation-final-open" type="button" data-simulation-next-grade ${activeProgress.complete ? "" : "disabled"}>다음 · ${activeGrade.grade + 1}학년 ${icon("arrow")}</button>` : `<button class="simulation-final-open" type="button" data-show-simulation-result ${progress.complete ? "" : "disabled"}>최종 수강표 확인 ${icon("arrow")}</button>`}</div>
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

  async function downloadCurriculumTemplate() {
    if (!window.ExcelJS) {
      showToast("서식이 포함된 엑셀 양식 도구를 불러오지 못했습니다. 인터넷 연결 후 다시 시도해 주세요.", 4500);
      return;
    }
    const selectedSchoolName = compactText(state.selectedSchool?.name);
    const selectedRegion = compactText(state.selectedSchool?.region);
    const schoolName = /^.+고등학교$/u.test(selectedSchoolName) ? selectedSchoolName : "";
    const region = SCHOOL_REGIONS.includes(selectedRegion) ? selectedRegion : "";
    const admissionYear = 2026;
    const curriculumRows = [
      ["학교 편제표 표준 양식", "", "", "", "", ""],
      ["지역", region, "학교명", schoolName, "입학년도", admissionYear],
      [],
      ["학년", "학기", "구분", "옵션", "선택 수", "과목명"]
    ];
    [1, 2, 3].forEach((grade) => {
      [1, 2].forEach((semester) => {
        if (grade === 1) {
          curriculumRows.push([grade, semester, "공통(기본)", "", "-", FIRST_GRADE_COMMON_BY_SEMESTER[semester].join(", ")]);
          curriculumRows.push([grade, semester, "예술 추가", "", "-", ""]);
        } else {
          curriculumRows.push([grade, semester, "학교 지정", "", "-", ""]);
        }
        for (let option = 1; option <= 10; option += 1) curriculumRows.push([grade, semester, "선택", `옵션 ${option}`, "", ""]);
      });
    });
    const guideRows = [
      ["학교 편제표 표준 양식 작성 안내", "", "", "", "", ""],
      ["입력은 '편제표' 시트 한 곳에서만 합니다. 1학년 기본 공통 과목은 수정하지 말고 예술 과목만 별도 행에 추가하세요.", "", "", "", "", ""],
      [],
      ["항목", "작성 방법", "입력 예시"],
      ["학교 정보", "지역은 목록에서 선택하고, 학교명은 '고등학교'로 끝나는 정식 명칭을 입력합니다. 입학년도는 2026 또는 2025를 선택합니다.", "강원특별자치도 / 우리고등학교 / 2026"],
      ["학기", "각 학년의 과목을 1학기와 2학기로 나누어 입력합니다.", "2학년 1학기 → 학년 2 / 학기 1"],
      ["1학년 기본 공통", "국어·수학·영어·한국사·통합사회·통합과학·과학탐구실험·체육이 학기별로 미리 입력되어 있습니다. 이 행은 수정하지 않습니다.", "공통국어1, …, 과학탐구실험1, 체육1"],
      ["1학년 예술 추가", "학교에서 지정한 음악·미술 등 예술 과목만 '예술 추가' 행에 쉼표(,)로 입력합니다.", "음악, 미술"],
      ["2·3학년 학교 지정", "학생이 선택하지 않고 학교가 지정한 과목을 학년·학기별 '학교 지정' 행에 입력합니다.", "문학, 대수"],
      ["선택 옵션", "같은 학년·학기·옵션의 과목은 한 칸에 쉼표(,)로 구분해 입력합니다.", "물리학, 화학, 생명과학, 지구과학"],
      ["선택 수", "각 옵션에서 골라야 하는 과목 수를 1~10 사이의 정수로 입력합니다.", "4개 과목 중 2개 선택 → 2"],
      ["과목명 자동 인식", "띄어쓰기와 로마숫자·숫자 표기 차이는 앱의 정식 과목명으로 자동 변환합니다.", "미적분I / 미적분1 → 미적분Ⅰ"],
      ["고시 외 과목", "정식 과목 DB와 확실히 일치하지 않는 이름은 추측해서 연결하지 않고 입력한 이름 그대로 하나의 과목으로 저장합니다.", "학교 자체 개설 과목 → 고시 외 과목"],
      ["빈 옵션", "사용하지 않는 옵션 행은 선택 수와 과목명을 비워 둡니다.", "옵션 4를 사용하지 않으면 빈칸 유지"],
      ["확인 사항", "선택 수는 해당 옵션의 과목 수보다 클 수 없습니다.", "3개 과목이면 선택 수는 최대 3"],
      [],
      ["작성 예시", "", "", "", "", ""],
      ["지역", "강원특별자치도", "학교명", "우리고등학교", "입학년도", 2026],
      [],
      ["학년", "학기", "구분", "옵션", "선택 수", "과목명"],
      [1, 1, "공통(기본)", "", "-", FIRST_GRADE_COMMON_BY_SEMESTER[1].join(", ")],
      [1, 1, "예술 추가", "", "-", "음악, 미술"],
      [1, 2, "공통(기본)", "", "-", FIRST_GRADE_COMMON_BY_SEMESTER[2].join(", ")],
      [1, 2, "예술 추가", "", "-", "음악 연주, 미술 창작"],
      [2, 1, "선택", "옵션 1", 2, "물리학, 화학, 생명과학, 지구과학"],
      [2, 1, "선택", "옵션 2", 1, "한국지리 탐구, 사회와 문화, 윤리와 사상"],
      [2, 2, "선택", "옵션 1", 1, "기하, 미적분Ⅱ, 경제 수학"],
      [3, 1, "학교 지정", "", "-", "스포츠 생활1, 음악 연주"],
      [3, 2, "선택", "옵션 1", 2, "고급 물리학, 고급 화학, 고급 생명과학"]
    ];
    const guideExampleTitleRow = guideRows.findIndex((row) => row[0] === "작성 예시") + 1;
    const guideExampleInfoRow = guideExampleTitleRow + 1;
    const guideExampleHeaderRow = guideRows.findIndex((row, index) => index >= guideExampleTitleRow && row[0] === "학년") + 1;
    const guideExampleDataStartRow = guideExampleHeaderRow + 1;

    const colors = {
      title: "FF083F3B",
      accent: "FF087F6A",
      blue: "FF1769AA",
      text: "FF183D3A",
      muted: "FF5A716D",
      white: "FFFFFFFF",
      grid: "FFB8CBC7",
      label: "FFE7F1EE",
      input: "FFFFF7D6",
      example: "FFEAF4FF",
      fixed: "FFF1F5F4"
    };
    const gridBorder = {
      top: { style: "thin", color: { argb: colors.grid } },
      left: { style: "thin", color: { argb: colors.grid } },
      bottom: { style: "thin", color: { argb: colors.grid } },
      right: { style: "thin", color: { argb: colors.grid } }
    };
    const inputBorder = {
      top: { style: "medium", color: { argb: colors.accent } },
      left: { style: "medium", color: { argb: colors.accent } },
      bottom: { style: "medium", color: { argb: colors.accent } },
      right: { style: "medium", color: { argb: colors.accent } }
    };
    const fill = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
    const eachCell = (sheet, startRow, endRow, startColumn, endColumn, callback) => {
      for (let row = startRow; row <= endRow; row += 1) {
        for (let column = startColumn; column <= endColumn; column += 1) callback(sheet.getCell(row, column), row, column);
      }
    };
    const styleTitle = (sheet, row, background = colors.title) => {
      sheet.getRow(row).height = 34;
      eachCell(sheet, row, row, 1, 6, (cell) => {
        cell.fill = fill(background);
        cell.font = { name: "맑은 고딕", size: 18, bold: true, color: { argb: colors.white } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.border = gridBorder;
      });
    };
    const styleTableHeader = (sheet, row, endColumn = 5) => {
      sheet.getRow(row).height = 27;
      eachCell(sheet, row, row, 1, endColumn, (cell) => {
        cell.fill = fill(colors.accent);
        cell.font = { name: "맑은 고딕", size: 11, bold: true, color: { argb: colors.white } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.border = gridBorder;
      });
    };

    try {
      const workbook = new window.ExcelJS.Workbook();
      workbook.creator = "선택 과목 안내 플랫폼";
      workbook.created = new Date();

      const guideSheet = workbook.addWorksheet("작성안내", {
        views: [{ state: "frozen", ySplit: 4, showGridLines: false }],
        properties: { defaultRowHeight: 22 }
      });
      const curriculumSheet = workbook.addWorksheet("편제표", {
        views: [{ state: "frozen", ySplit: 4, showGridLines: false }],
        properties: { defaultRowHeight: 22 }
      });
      guideRows.forEach((row) => guideSheet.addRow(row));
      curriculumRows.forEach((row) => curriculumSheet.addRow(row));

      guideSheet.columns = [{ width: 16 }, { width: 76 }, { width: 48 }, { width: 12 }, { width: 68 }, { width: 14 }];
      curriculumSheet.columns = [{ width: 9 }, { width: 9 }, { width: 16 }, { width: 13 }, { width: 17 }, { width: 68 }, { width: 2, hidden: true }];
      curriculumSheet.getColumn(7).hidden = true;
      guideSheet.mergeCells("A1:F1");
      guideSheet.mergeCells("A2:F2");
      guideSheet.mergeCells(`A${guideExampleTitleRow}:F${guideExampleTitleRow}`);
      curriculumSheet.mergeCells("A1:F1");
      curriculumSheet.autoFilter = { from: "A4", to: `F${curriculumRows.length}` };
      SCHOOL_REGIONS.forEach((regionName, index) => {
        curriculumSheet.getCell(index + 2, 7).value = regionName;
      });
      curriculumSheet.getCell("B2").dataValidation = {
        type: "list",
        allowBlank: false,
        formulae: [`$G$2:$G$${SCHOOL_REGIONS.length + 1}`],
        showInputMessage: true,
        promptTitle: "지역 선택",
        prompt: "전국 17개 시·도 중 학교가 속한 지역을 목록에서 선택하세요.",
        showErrorMessage: true,
        errorStyle: "stop",
        errorTitle: "지역 확인",
        error: "드롭다운 목록에 있는 지역만 선택할 수 있습니다."
      };
      curriculumSheet.getCell("D2").dataValidation = {
        type: "custom",
        allowBlank: false,
        formulae: ['AND(LEN(TRIM(D2))>4,RIGHT(TRIM(D2),4)="고등학교")'],
        showInputMessage: true,
        promptTitle: "학교명 입력",
        prompt: "'고등학교'로 끝나는 정식 학교명을 입력하세요. 예: 우리고등학교",
        showErrorMessage: true,
        errorStyle: "stop",
        errorTitle: "학교명 확인",
        error: "학교명은 '고등학교'로 끝나야 합니다."
      };
      curriculumSheet.getCell("F2").dataValidation = {
        type: "list",
        allowBlank: false,
        formulae: ['"2026,2025"'],
        showInputMessage: true,
        promptTitle: "입학년도 선택",
        prompt: "2026 또는 2025 중에서 입학년도를 선택하세요.",
        showErrorMessage: true,
        errorStyle: "stop",
        errorTitle: "입학년도 확인",
        error: "입학년도는 2026 또는 2025만 선택할 수 있습니다."
      };

      styleTitle(curriculumSheet, 1);
      curriculumSheet.getRow(2).height = 28;
      [1, 3, 5].forEach((column) => {
        const cell = curriculumSheet.getCell(2, column);
        cell.fill = fill(colors.label);
        cell.font = { name: "맑은 고딕", size: 11, bold: true, color: { argb: colors.text } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.border = gridBorder;
      });
      [2, 4, 6].forEach((column) => {
        const cell = curriculumSheet.getCell(2, column);
        cell.fill = fill(colors.input);
        cell.font = { name: "맑은 고딕", size: 11, bold: true, color: { argb: colors.text } };
        cell.alignment = { horizontal: "left", vertical: "middle" };
        cell.border = inputBorder;
      });
      curriculumSheet.getCell("F2").alignment = { horizontal: "center", vertical: "middle" };
      styleTableHeader(curriculumSheet, 4, 6);
      eachCell(curriculumSheet, 5, curriculumRows.length, 1, 6, (cell, row, column) => {
        const rowType = compactText(curriculumSheet.getCell(row, 3).value);
        const isSelection = rowType.includes("선택");
        cell.font = { name: "맑은 고딕", size: 10, color: { argb: colors.text } };
        cell.alignment = { horizontal: column === 6 ? "left" : "center", vertical: "middle", wrapText: column === 6 };
        cell.border = gridBorder;
        if (column <= 4 || (column === 5 && !isSelection)) cell.fill = fill(colors.fixed);
      });
      for (let row = 5; row <= curriculumRows.length; row += 1) {
        const rowType = compactText(curriculumSheet.getCell(row, 3).value);
        const isSelection = rowType.includes("선택");
        const isBaseCommon = rowType.includes("공통");
        const inputColumns = isBaseCommon ? [] : isSelection ? [5, 6] : [6];
        inputColumns.forEach((column) => {
          const cell = curriculumSheet.getCell(row, column);
          cell.fill = fill(colors.input);
          cell.border = inputBorder;
        });
        if (isBaseCommon) {
          const courseCell = curriculumSheet.getCell(row, 6);
          courseCell.fill = fill(colors.fixed);
          courseCell.note = "1학년 기본 공통 과목입니다. 이 셀은 수정하지 말고 바로 아래 '예술 추가' 행에 예술 과목만 입력하세요.";
        } else if (rowType.includes("예술")) {
          curriculumSheet.getCell(row, 6).dataValidation = {
            type: "custom",
            allowBlank: true,
            formulae: ["TRUE"],
            showInputMessage: true,
            promptTitle: "예술 과목 추가",
            prompt: "음악·미술 등 학교 지정 예술 과목만 쉼표(,)로 구분해 입력하세요."
          };
        } else if (isSelection) {
          curriculumSheet.getCell(row, 5).dataValidation = {
            type: "whole",
            operator: "between",
            allowBlank: true,
            formulae: [1, 10],
            showInputMessage: true,
            promptTitle: "선택 수 입력",
            prompt: "이 옵션에서 선택할 과목 수를 1~10 사이 숫자로 입력하세요."
          };
        }
      }

      styleTitle(guideSheet, 1);
      guideSheet.getRow(2).height = 30;
      const guideIntro = guideSheet.getCell("A2");
      guideIntro.fill = fill(colors.label);
      guideIntro.font = { name: "맑은 고딕", size: 11, bold: true, color: { argb: colors.text } };
      guideIntro.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
      guideIntro.border = gridBorder;
      styleTableHeader(guideSheet, 4, 3);
      eachCell(guideSheet, 5, guideExampleTitleRow - 2, 1, 3, (cell, row, column) => {
        cell.font = { name: "맑은 고딕", size: 10, bold: column === 1, color: { argb: column === 1 ? colors.text : colors.muted } };
        cell.fill = fill(column === 1 ? colors.label : colors.white);
        cell.alignment = { horizontal: column === 1 ? "center" : "left", vertical: "middle", wrapText: true };
        cell.border = gridBorder;
        guideSheet.getRow(row).height = 36;
      });
      styleTitle(guideSheet, guideExampleTitleRow, colors.blue);
      guideSheet.getCell(guideExampleTitleRow, 1).font = { name: "맑은 고딕", size: 16, bold: true, color: { argb: colors.white } };

      guideSheet.getRow(guideExampleInfoRow).height = 28;
      [1, 3, 5].forEach((column) => {
        const cell = guideSheet.getCell(guideExampleInfoRow, column);
        cell.fill = fill(colors.label);
        cell.font = { name: "맑은 고딕", size: 10, bold: true, color: { argb: colors.text } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.border = gridBorder;
      });
      [2, 4, 6].forEach((column) => {
        const cell = guideSheet.getCell(guideExampleInfoRow, column);
        cell.fill = fill(colors.example);
        cell.font = { name: "맑은 고딕", size: 10, italic: true, color: { argb: colors.blue } };
        cell.alignment = { horizontal: column === 6 ? "center" : "left", vertical: "middle" };
        cell.border = gridBorder;
      });
      styleTableHeader(guideSheet, guideExampleHeaderRow, 6);
      eachCell(guideSheet, guideExampleDataStartRow, guideRows.length, 1, 6, (cell, row, column) => {
        cell.fill = fill(colors.example);
        cell.font = { name: "맑은 고딕", size: 10, italic: true, color: { argb: colors.blue } };
        cell.alignment = { horizontal: column === 6 ? "left" : "center", vertical: "middle", wrapText: column === 6 };
        cell.border = gridBorder;
        guideSheet.getRow(row).height = 24;
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blobUrl = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const downloadLink = document.createElement("a");
      downloadLink.href = blobUrl;
      downloadLink.download = "학교_편제표_연동_양식.xlsx";
      document.body.appendChild(downloadLink);
      downloadLink.click();
      downloadLink.remove();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
      showToast("학교 편제표 양식 다운로드를 시작했습니다.");
    } catch (error) {
      console.error("학교 편제표 양식 생성 실패:", error);
      showToast("학교 편제표 양식을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.", 4500);
    }
  }

  function sheetMatrix(workbook, sheetName) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return [];
    return window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true, blankrows: true });
  }

  function sheetMatrixWithMergedValues(workbook, sheetName) {
    const sheet = workbook.Sheets[sheetName];
    const raw = sheetMatrix(workbook, sheetName);
    const filled = raw.map((row) => [...row]);
    const merges = Array.isArray(sheet?.["!merges"]) ? sheet["!merges"] : [];
    merges.forEach((merge) => {
      const value = raw[merge.s.r]?.[merge.s.c];
      for (let row = merge.s.r; row <= merge.e.r; row += 1) {
        if (!filled[row]) filled[row] = [];
        for (let column = merge.s.c; column <= merge.e.c; column += 1) {
          if (isBlank(filled[row][column])) filled[row][column] = value;
        }
      }
    });
    return { sheet, raw, filled, merges };
  }

  function fullYearCurriculumRegion(schoolName) {
    const schoolKey = normalizedKey(schoolName);
    const knownSchool = state.schools.find((school) => normalizedKey(school.name) === schoolKey);
    return compactText(knownSchool?.region);
  }

  function parseChoiceCount(value) {
    const text = compactText(value);
    const match = text.match(/택\s*(\d+)/)
      || text.match(/(\d+)\s*(?:개|과목)?\s*선택/)
      || text.match(/선택\s*(?:수|과목\s*수)?\s*[:：]?\s*(\d+)/);
    return match ? Number(match[1]) : 0;
  }

  function isPlainPlacementNumber(value) {
    const text = compactText(value);
    return /^[1-9]\d*(?:\.\d+)?$/.test(text);
  }

  function uploadedCourseType(value) {
    const text = compactText(value);
    if (text.includes("공통")) return "공통";
    if (text.includes("일반")) return "일반";
    if (text.includes("진로")) return "진로";
    if (text.includes("융합")) return "융합";
    if (text.includes("전문")) return "전문";
    return text;
  }

  function uploadedCourseMetadataEntry(category, type) {
    const normalizedCategory = compactText(category);
    const normalizedType = uploadedCourseType(type);
    return {
      ...(normalizedCategory ? { category: normalizeCourseGroup(normalizedCategory) } : {}),
      ...(normalizedType ? { type: normalizedType } : {})
    };
  }

  function parseSchoolFullYearCurriculumWorkbook(file, workbook) {
    let source = null;
    workbook.SheetNames.some((sheetName) => {
      const matrix = sheetMatrixWithMergedValues(workbook, sheetName);
      const topCells = matrix.raw.slice(0, 30).flat().map(compactText).filter(Boolean);
      const strictTitle = topCells.find((value) => /(\d{4})학년도\s*전학년\s*학교교육과정\s*편제표/.test(value));
      const yearTitle = strictTitle || topCells.find((value) => /(20\d{2})학년도/.test(value));
      const headerCandidate = matrix.filled.findIndex((row) => {
        const keys = row.map(normalizedKey);
        return keys.some((key) => ["과목명", "교과목명", "교과목"].map(normalizedKey).includes(key))
          && keys.some((key) => /^[123]학년$/.test(key));
      });
      const hasSemesterHeader = headerCandidate >= 0 && matrix.filled.slice(headerCandidate, headerCandidate + 3)
        .some((row) => row.some((value) => /^[12]학기$/.test(normalizedKey(value))));
      if (!yearTitle || headerCandidate < 0 || !hasSemesterHeader) return false;
      source = { sheetName, title: yearTitle, strictTitle: Boolean(strictTitle), ...matrix };
      return true;
    });
    if (!source) return null;

    const academicYear = Number(source.title.match(/(\d{4})학년도/)?.[1]);
    const identity = workbookIdentity(workbook);
    const schoolName = source.raw.slice(0, 30).flat().map(compactText).find((value) => /^.+고등학교$/u.test(value)) || identity.schoolName;
    const region = identity.region || fullYearCurriculumRegion(schoolName);
    if (!Number.isInteger(academicYear)) throw new Error("전학년 편제표 제목에서 기준 학년도를 읽지 못했습니다.");

    const headerRowIndex = source.filled.findIndex((row) => {
      const keys = row.map(normalizedKey);
      return keys.some((key) => ["과목명", "교과목명", "교과목"].map(normalizedKey).includes(key)) && keys.some((key) => /^[123]학년$/.test(key));
    });
    if (headerRowIndex < 0) throw new Error("전학년 편제표에서 구분·과목명·학년 머리글을 찾지 못했습니다.");
    const semesterRowIndex = [headerRowIndex + 1, headerRowIndex + 2].find((rowIndex) => source.filled[rowIndex]?.some((value) => /^[12]학기$/.test(normalizedKey(value)))) ?? -1;
    if (semesterRowIndex < 0) throw new Error("전학년 편제표에서 1학기·2학기 머리글을 찾지 못했습니다.");

    const headerKeys = source.filled[headerRowIndex].map(normalizedKey);
    const sectionIndex = headerKeys.findIndex((key) => ["구분", "편성구분", "교육과정구분", "이수구분"].map(normalizedKey).includes(key));
    const courseIndex = headerKeys.findIndex((key) => ["과목명", "교과목명", "교과목"].map(normalizedKey).includes(key));
    const categoryIndex = headerKeys.findIndex((key) => ["교과군", "교과(군)", "교과", "과목군"].map(normalizedKey).includes(key));
    const typeIndex = headerKeys.findIndex((key) => ["과목유형", "과목구분", "선택유형", "유형"].map(normalizedKey).includes(key));
    const semesterColumns = [];
    for (let column = 0; column < Math.max(source.filled[headerRowIndex].length, source.filled[semesterRowIndex].length); column += 1) {
      const grade = Number(normalizedKey(source.filled[headerRowIndex]?.[column]).match(/^([123])학년$/)?.[1]);
      const semester = Number(normalizedKey(source.filled[semesterRowIndex]?.[column]).match(/^([12])학기$/)?.[1]);
      if ([1, 2, 3].includes(grade) && [1, 2].includes(semester)) semesterColumns.push({ column, grade, semester });
    }
    if (semesterColumns.length !== 6) throw new Error("전학년 편제표에서 3개 학년의 1·2학기 열을 모두 찾지 못했습니다.");

    const dataStartRow = semesterRowIndex + 1;
    const dataEndRow = source.filled.findIndex((row, index) => index >= dataStartRow && row.some((value) => normalizedKey(value).includes(normalizedKey("교과 이수 학점 소계"))));
    const lastCourseRow = dataEndRow < 0 ? source.raw.length - 1 : dataEndRow - 1;
    const gradeData = new Map([1, 2, 3].map((grade) => [grade, {
      grade,
      semesters: new Map([1, 2].map((semester) => [semester, { semester, common: [], electives: [], options: [] }]))
    }]));
    const courseMetadata = {};

    semesterColumns.forEach(({ column, grade, semester }) => {
      const target = gradeData.get(grade).semesters.get(semester);
      const groups = source.merges.filter((merge) => merge.s.c === column && parseChoiceCount(source.raw[merge.s.r]?.[merge.s.c]) > 0)
        .map((merge) => ({ startRow: merge.s.r, endRow: merge.e.r, choose: parseChoiceCount(source.raw[merge.s.r]?.[merge.s.c]) }));
      for (let row = dataStartRow; row <= lastCourseRow; row += 1) {
        const choose = parseChoiceCount(source.raw[row]?.[column]);
        if (!choose || groups.some((group) => row >= group.startRow && row <= group.endRow)) continue;
        groups.push({ startRow: row, endRow: row, choose });
      }
      const rowIsInChoiceGroup = (row) => groups.some((group) => row >= group.startRow && row <= group.endRow);
      for (let row = dataStartRow; row <= lastCourseRow; row += 1) {
        const section = sectionIndex < 0 ? "" : normalizedKey(source.filled[row]?.[sectionIndex]);
        const courseName = compactText(source.raw[row]?.[courseIndex]);
        const selectionSection = /학생.*선택|선택.*교육과정|수강.*선택/u.test(section);
        const fixedSection = /학교.*지정|공통|필수/u.test(section);
        const isFixedPlacement = courseName
          && isPlainPlacementNumber(source.raw[row]?.[column])
          && !rowIsInChoiceGroup(row)
          && (fixedSection || !selectionSection);
        if (isFixedPlacement) {
          target.common.push(courseName);
          courseMetadata[curriculumCourseAliasKey(courseName)] = uploadedCourseMetadataEntry(
            categoryIndex < 0 ? "" : source.filled[row]?.[categoryIndex],
            typeIndex < 0 ? "" : source.filled[row]?.[typeIndex]
          );
        }
      }

      groups.sort((a, b) => a.startRow - b.startRow).forEach((group) => {
        const courses = uniqueCourseNames(Array.from({ length: group.endRow - group.startRow + 1 }, (_value, offset) => {
          const row = group.startRow + offset;
          const courseName = compactText(source.raw[row]?.[courseIndex]);
          if (courseName && !/소계|합계/u.test(courseName)) {
            courseMetadata[curriculumCourseAliasKey(courseName)] = uploadedCourseMetadataEntry(
              categoryIndex < 0 ? "" : source.filled[row]?.[categoryIndex],
              typeIndex < 0 ? "" : source.filled[row]?.[typeIndex]
            );
          }
          return courseName;
        }));
        if (!courses.length) return;
        if (group.choose > courses.length) throw new Error(`${grade}학년 ${semester}학기 선택군의 택 ${group.choose}보다 읽힌 과목 수(${courses.length})가 적습니다.`);
        const choose = group.choose;
        const optionNumber = target.options.length + 1;
        target.options.push({ id: `semester-${semester}-option-${optionNumber}`, label: `옵션 ${optionNumber}`, choose, courses, semester });
        target.electives.push(...courses);
      });
    });

    const uploadedAt = new Date().toISOString();
    const curricula = [...gradeData.values()].map((grade) => {
      const semesters = [...grade.semesters.values()].map((semester) => ({
        semester: semester.semester,
        common: uniqueCourseNames(semester.common),
        electives: uniqueCourseNames(semester.electives),
        options: semester.options
      }));
      const currentGrade = {
        grade: grade.grade,
        semesters,
        common: uniqueCourseNames(semesters.flatMap((semester) => semester.common)),
        electives: uniqueCourseNames(semesters.flatMap((semester) => semester.electives)),
        options: semesters.flatMap((semester) => semester.options)
      };
      const allCourseNames = [...currentGrade.common, ...currentGrade.electives];
      return {
        version: 5,
        sourceFormat: "school-full-year",
        sourceAcademicYear: academicYear,
        sourceGrade: grade.grade,
        sourceTitle: source.title,
        sourceSheet: source.sheetName,
        fileName: file.name,
        schoolName,
        region,
        admissionYear: academicYear - grade.grade + 1,
        grades: [currentGrade],
        courseMetadata: Object.fromEntries(allCourseNames.map((course) => [curriculumCourseAliasKey(course), courseMetadata[curriculumCourseAliasKey(course)] || {}])),
        courseCount: new Set(allCourseNames.map(curriculumCourseAliasKey)).size,
        unlistedCourseCount: new Set(allCourseNames.filter((course) => !curriculumCourseReference(course)).map(curriculumCourseAliasKey)).size,
        uploadedAt
      };
    });
    if (curricula.some((curriculum) => !curriculum.courseCount)) throw new Error("전학년 편제표의 일부 학년에서 학교 지정·학생 선택 과목을 찾지 못했습니다.");
    return {
      version: 5,
      sourceFormat: "school-full-year",
      sourceTitle: source.title,
      parseMode: source.strictTitle ? "structured-full-year" : "flexible-matrix",
      parseWarnings: source.strictTitle ? [] : ["전학년 표 구조를 머리글과 셀 패턴으로 유연하게 분석했습니다. 저장 전에 과목 배치를 확인해 주세요."],
      academicYear,
      fileName: file.name,
      schoolName,
      region,
      curricula,
      courseCount: curricula.reduce((sum, curriculum) => sum + curriculum.courseCount, 0),
      unlistedCourseCount: curricula.reduce((sum, curriculum) => sum + curriculum.unlistedCourseCount, 0),
      uploadedAt
    };
  }

  function flexibleHeaderIndex(row, aliases) {
    const aliasKeys = aliases.map((value) => normalizedKey(value).replace(/[()·･・._/\\-]/g, ""));
    return row.findIndex((value) => aliasKeys.includes(normalizedKey(value).replace(/[()·･・._/\\-]/g, "")));
  }

  function workbookIdentity(workbook) {
    const cells = workbook.SheetNames.flatMap((sheetName) => sheetMatrix(workbook, sheetName).slice(0, 40).flat()).map(compactText).filter(Boolean);
    const schoolName = cells.map((value) => value.match(/학교명\s*[:：]?\s*([^:：]{1,40}고등학교)/u)?.[1]?.trim()).find(Boolean)
      || cells.find((value) => /^.+고등학교$/u.test(value))
      || cells.map((value) => value.match(/([가-힣A-Za-z0-9()·･・]+고등학교)/u)?.[1]).find(Boolean)
      || "";
    const academicYear = Number(cells.map((value) => value.match(/(20\d{2})학년도/)?.[1]).find(Boolean));
    const admissionYear = Number(cells.map((value, index) => {
      if (!normalizedKey(value).includes(normalizedKey("입학년도"))) return "";
      return value.match(/(20\d{2})/)?.[1] || cells[index + 1]?.match(/(20\d{2})/)?.[1] || "";
    }).find(Boolean));
    const embeddedRegion = SCHOOL_REGIONS.find((regionName) => cells.some((value) => normalizedKey(value).includes(normalizedKey(regionName)))) || "";
    return { schoolName, academicYear, admissionYear, region: embeddedRegion || fullYearCurriculumRegion(schoolName) };
  }

  function parseFlexibleFlatCurriculumWorkbook(file, workbook) {
    const identity = workbookIdentity(workbook);
    const gradeData = new Map([1, 2, 3].map((grade) => [grade, {
      grade,
      semesters: new Map([1, 2].map((semester) => [semester, { semester, common: [], standalone: [], electives: [], optionMap: new Map() }]))
    }]));
    const courseMetadata = {};
    const parsedSheets = [];
    const warnings = [];

    workbook.SheetNames.forEach((sheetName) => {
      const { raw, filled } = sheetMatrixWithMergedValues(workbook, sheetName);
      let bestHeader = null;
      filled.slice(0, 60).forEach((row, rowIndex) => {
        const courseIndex = flexibleHeaderIndex(row, ["과목명", "교과목명", "교과목"]);
        const gradeIndex = flexibleHeaderIndex(row, ["학년", "개설학년", "대상학년"]);
        const semesterIndex = flexibleHeaderIndex(row, ["학기", "개설학기"]);
        if (courseIndex < 0 || gradeIndex < 0 || semesterIndex < 0) return;
        const indices = {
          rowIndex,
          courseIndex,
          gradeIndex,
          semesterIndex,
          categoryIndex: flexibleHeaderIndex(row, ["교과군", "교과(군)", "교과", "과목군"]),
          typeIndex: flexibleHeaderIndex(row, ["과목유형", "과목 유형", "과목구분", "선택유형", "유형"]),
          sectionIndex: flexibleHeaderIndex(row, ["구분", "편성구분", "교육과정구분", "이수구분"]),
          optionIndex: flexibleHeaderIndex(row, ["옵션", "선택군", "선택그룹", "그룹", "선택목록"]),
          chooseIndex: flexibleHeaderIndex(row, ["선택수", "선택 수", "택수", "택"])
        };
        const score = Object.values(indices).filter((value) => Number.isInteger(value) && value >= 0).length;
        if (!bestHeader || score > bestHeader.score) bestHeader = { ...indices, score };
      });
      if (!bestHeader) return;
      parsedSheets.push(sheetName);
      const optionSequence = new Map();
      for (let rowIndex = bestHeader.rowIndex + 1; rowIndex < filled.length; rowIndex += 1) {
        const row = filled[rowIndex] || [];
        const rawRow = raw[rowIndex] || [];
        const grade = Number(compactText(row[bestHeader.gradeIndex]).match(/[123]/)?.[0]);
        const semester = Number(compactText(row[bestHeader.semesterIndex]).match(/[12]/)?.[0]);
        const courseNames = uniqueCourseNames([rawRow[bestHeader.courseIndex] || row[bestHeader.courseIndex]]);
        if (![1, 2, 3].includes(grade) || ![1, 2].includes(semester) || !courseNames.length) continue;
        const target = gradeData.get(grade).semesters.get(semester);
        const category = bestHeader.categoryIndex < 0 ? "" : row[bestHeader.categoryIndex];
        const type = bestHeader.typeIndex < 0 ? "" : row[bestHeader.typeIndex];
        const section = bestHeader.sectionIndex < 0 ? "" : compactText(row[bestHeader.sectionIndex]);
        const optionText = bestHeader.optionIndex < 0 ? "" : compactText(row[bestHeader.optionIndex]);
        const chooseText = bestHeader.chooseIndex < 0 ? "" : compactText(row[bestHeader.chooseIndex]);
        const choose = parseChoiceCount(chooseText) || (isPlainPlacementNumber(chooseText) ? Number(chooseText) : parseChoiceCount(optionText));
        const fixed = uploadedCourseType(type) === "공통" || /학교\s*지정|공통|필수/u.test(section);
        const hasOption = Boolean(optionText || choose);
        courseNames.forEach((courseName) => {
          courseMetadata[curriculumCourseAliasKey(courseName)] = uploadedCourseMetadataEntry(category, type);
          if (fixed && !hasOption) target.common.push(courseName);
          else if (hasOption) {
            const baseLabel = compactText(optionText.replace(/택\s*\d+|\d+\s*(?:개|과목)?\s*선택/gu, "")) || "선택 옵션";
            const sequenceKey = `${grade}-${semester}-${normalizedKey(baseLabel)}`;
            if (!optionSequence.has(sequenceKey)) optionSequence.set(sequenceKey, optionSequence.size + 1);
            const optionKey = `${sequenceKey}-${choose || 0}`;
            if (!target.optionMap.has(optionKey)) target.optionMap.set(optionKey, {
              id: `semester-${semester}-flex-${optionSequence.get(sequenceKey)}`,
              label: baseLabel === "선택 옵션" ? `옵션 ${target.optionMap.size + 1}` : baseLabel,
              choose: choose || 1,
              courses: [],
              semester
            });
            target.optionMap.get(optionKey).courses.push(courseName);
          } else target.standalone.push(courseName);
        });
      }
    });

    if (!parsedSheets.length) return null;
    const parsedGrades = [...gradeData.values()].map((grade) => {
      const semesters = [...grade.semesters.values()].map((semester) => {
        const options = [...semester.optionMap.values()].map((option) => ({ ...option, courses: uniqueCourseNames(option.courses) }));
        const standalone = uniqueCourseNames(semester.standalone);
        return {
          semester: semester.semester,
          common: uniqueCourseNames(semester.common),
          standalone,
          electives: uniqueCourseNames([...standalone, ...options.flatMap((option) => option.courses)]),
          options
        };
      });
      return {
        grade: grade.grade,
        semesters,
        common: uniqueCourseNames(semesters.flatMap((semester) => semester.common)),
        electives: uniqueCourseNames(semesters.flatMap((semester) => semester.electives)),
        options: semesters.flatMap((semester) => semester.options)
      };
    }).filter((grade) => grade.common.length || grade.electives.length);
    if (!parsedGrades.length) return null;
    const gradeNumbers = new Set(parsedGrades.map((grade) => grade.grade));
    if (![1, 2, 3].every((grade) => gradeNumbers.has(grade))) {
      throw new Error("신입생 자료가 아닌 1·2·3학년 전학년 편제표를 업로드해 주세요. 현재 파일에서는 세 학년의 과목을 모두 찾지 못했습니다.");
    }
    if (!identity.academicYear && !identity.admissionYear) warnings.push("파일에서 기준 학년도를 찾지 못해 현재 연도를 사용했습니다. 입학년도를 확인해 주세요.");
    warnings.push("머리글 의미와 셀 병합 패턴으로 유연하게 분석했습니다. 학교 지정 과목과 옵션별 선택 수를 저장 전에 확인해 주세요.");
    const academicYear = identity.academicYear || new Date().getFullYear();
    const uploadedAt = new Date().toISOString();
    const makeCurriculum = (grades, admissionYear, sourceGrade = 0) => {
      const allCourseNames = grades.flatMap((grade) => [...grade.common, ...grade.electives]);
      return {
        version: 6,
        sourceFormat: "flexible-full-year",
        sourceAcademicYear: academicYear,
        sourceGrade,
        sourceSheets: parsedSheets,
        fileName: file.name,
        schoolName: identity.schoolName,
        region: identity.region,
        admissionYear,
        grades,
        courseMetadata: Object.fromEntries(allCourseNames.map((course) => [curriculumCourseAliasKey(course), courseMetadata[curriculumCourseAliasKey(course)] || {}])),
        courseCount: new Set(allCourseNames.map(curriculumCourseAliasKey)).size,
        unlistedCourseCount: new Set(allCourseNames.filter((course) => !curriculumCourseReference(course)).map(curriculumCourseAliasKey)).size,
        uploadedAt
      };
    };
    const curricula = identity.admissionYear
      ? [makeCurriculum(parsedGrades, identity.admissionYear)]
      : parsedGrades.map((grade) => makeCurriculum([grade], academicYear - grade.grade + 1, grade.grade));
    return {
      version: 6,
      sourceFormat: "flexible-full-year",
      parseMode: "flexible-flat",
      parseWarnings: warnings,
      academicYear,
      fileName: file.name,
      schoolName: identity.schoolName,
      region: identity.region,
      curricula,
      courseCount: curricula.reduce((sum, curriculum) => sum + curriculum.courseCount, 0),
      unlistedCourseCount: curricula.reduce((sum, curriculum) => sum + curriculum.unlistedCourseCount, 0),
      uploadedAt
    };
  }

  function uniqueCourseNames(values) {
    const result = [];
    const seen = new Set();
    values.forEach((value) => {
      parseMultiValue(value).forEach((course) => {
        const canonicalName = curriculumCourseReference(course)?.name || course.trim();
        const key = curriculumCourseAliasKey(canonicalName);
        if (key && !seen.has(key)) {
          seen.add(key);
          result.push(canonicalName);
        }
      });
    });
    return result;
  }

  async function parseCurriculumFile(file) {
    if (!window.XLSX) throw new Error("엑셀 도구를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.");
    if (!/\.(xlsx|xls)$/i.test(file.name)) throw new Error(".xlsx 또는 .xls 파일만 업로드할 수 있습니다.");
    const workbook = window.XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
    const standardMatrix = workbook.SheetNames.includes("편제표") ? sheetMatrix(workbook, "편제표") : [];
    const standardHeaderRowIndex = standardMatrix.findIndex((row) => {
      const cells = row.map(normalizedKey);
      return ["학년", "구분", "옵션", "선택수", "과목명"].every((header) => cells.includes(normalizedKey(header)));
    });
    if (standardHeaderRowIndex < 0) {
      const fullYearCurriculum = parseSchoolFullYearCurriculumWorkbook(file, workbook);
      if (fullYearCurriculum) return fullYearCurriculum;
      const flexibleCurriculum = parseFlexibleFlatCurriculumWorkbook(file, workbook);
      if (flexibleCurriculum) return flexibleCurriculum;
      throw new Error("학년·학기·과목명·과목 유형·옵션·선택 수를 식별하지 못했습니다. 1·2·3학년 정보가 모두 있는 전학년 편제표인지 확인해 주세요.");
    }
    const matrix = standardMatrix;
    if (matrix.length < 5) throw new Error("편제표 시트에 학교 정보와 과목 데이터가 없습니다.");
    const headerRowIndex = standardHeaderRowIndex;
    const info = new Map();
    matrix.slice(0, headerRowIndex).forEach((row) => {
      row.forEach((cell, index) => {
        const key = normalizedKey(cell);
        if (["지역", "학교명", "입학년도"].map(normalizedKey).includes(key)) info.set(key, compactText(row[index + 1]));
      });
    });
    const schoolName = info.get(normalizedKey("학교명")) || "";
    const parsedRegion = info.get(normalizedKey("지역")) || "";
    const region = SCHOOL_REGIONS.includes(parsedRegion) ? parsedRegion : "";
    const admissionYear = Number(String(info.get(normalizedKey("입학년도")) || "").replace(/[^0-9]/g, ""));
    const headers = matrix[headerRowIndex].map((header) => normalizedKey(header));
    const columnIndex = (aliases) => headers.findIndex((header) => aliases.map(normalizedKey).includes(header));
    const gradeIndex = columnIndex(["학년"]);
    const semesterIndex = columnIndex(["학기"]);
    const typeIndex = columnIndex(["구분", "과목 구분"]);
    const optionIndex = columnIndex(["옵션", "선택군"]);
    const chooseIndex = columnIndex(["선택 수", "선택수", "택"]);
    const courseIndex = columnIndex(["과목명", "교과목명", "교과목"]);
    const missing = [[gradeIndex, "학년"], [typeIndex, "구분"], [optionIndex, "옵션"], [chooseIndex, "선택 수"], [courseIndex, "과목명"]].filter(([index]) => index < 0).map(([, name]) => name);
    if (missing.length) throw new Error(`필수 열을 찾을 수 없습니다: ${missing.join(", ")}`);
    if (![2026, 2025].includes(admissionYear)) throw new Error("편제표 시트 위쪽의 입학년도는 2026 또는 2025를 선택해 주세요.");

    const gradeMap = new Map([1, 2, 3].map((grade) => [grade, {
      grade,
      semesters: new Map([1, 2].map((semester) => [semester, {
        semester,
        common: grade === 1 ? [...FIRST_GRADE_COMMON_BY_SEMESTER[semester]] : [],
        electives: [],
        optionMap: new Map()
      }]))
    }]));
    const errors = [];
    const fixedRows = new Set();
    const optionRows = new Set();
    matrix.slice(headerRowIndex + 1).forEach((row, rowIndex) => {
      const courseNames = uniqueCourseNames([row[courseIndex]]);
      if (!courseNames.length) return;
      const excelRow = headerRowIndex + rowIndex + 2;
      const grade = Number(String(row[gradeIndex]).replace(/[^0-9]/g, ""));
      const semester = semesterIndex < 0 ? 1 : Number(String(row[semesterIndex]).replace(/[^0-9]/g, ""));
      const rawType = compactText(row[typeIndex]);
      const fixedType = rawType.includes("예술") ? "예술 추가"
        : rawType.includes("학교") || rawType.includes("지정") ? "학교 지정"
          : rawType.includes("공통") ? "공통" : "";
      const type = fixedType ? "고정" : rawType.includes("선택") ? "선택" : "";
      const rawOption = compactText(row[optionIndex]);
      const optionMatch = rawOption.match(/^(?:옵션|선택군)?\s*(10|[1-9])$/);
      const optionLabel = optionMatch ? `옵션 ${Number(optionMatch[1])}` : "";
      const choose = Number(compactText(row[chooseIndex]));
      if (!gradeMap.has(grade)) errors.push(`${excelRow}행: 학년은 1, 2, 3 중 하나여야 합니다.`);
      if (![1, 2].includes(semester)) errors.push(`${excelRow}행: 학기는 1 또는 2여야 합니다.`);
      if (!type) errors.push(`${excelRow}행: 구분은 공통(기본), 예술 추가, 학교 지정 또는 선택이어야 합니다.`);
      if (rawOption && !optionLabel) errors.push(`${excelRow}행: 옵션은 옵션 1부터 옵션 10까지만 사용할 수 있습니다.`);
      if (type === "선택" && !optionLabel) errors.push(`${excelRow}행: 선택 과목에는 옵션 1부터 옵션 10까지 중 하나를 입력해 주세요.`);
      if (optionLabel && (!Number.isInteger(choose) || choose < 1 || choose > 10)) errors.push(`${excelRow}행: 옵션 과목의 선택 수를 1~10 사이 숫자로 입력해 주세요.`);
      if (fixedType === "예술 추가" && grade !== 1) errors.push(`${excelRow}행: 예술 추가 행은 1학년에서만 사용해 주세요.`);
      if (!gradeMap.has(grade) || ![1, 2].includes(semester) || !type) return;
      const target = gradeMap.get(grade).semesters.get(semester);
      if (type === "고정") {
        const fixedRowKey = `${grade}-${semester}-${fixedType}`;
        if (fixedRows.has(fixedRowKey)) errors.push(`${excelRow}행: ${grade}학년 ${semester}학기 ${fixedType} 과목은 한 행에 쉼표로 구분해 입력해 주세요.`);
        fixedRows.add(fixedRowKey);
        if (rawOption || !["", "-"].includes(compactText(row[chooseIndex]))) errors.push(`${excelRow}행: ${fixedType} 행의 옵션은 비우고 선택 수는 '-'로 표시해 주세요.`);
        if (fixedType === "공통" && grade === 1) {
          const baseKeys = new Set(FIRST_GRADE_COMMON_BY_SEMESTER[semester].map(curriculumCourseAliasKey));
          const extraBaseCourses = courseNames.filter((course) => !baseKeys.has(curriculumCourseAliasKey(course)));
          if (extraBaseCourses.length) errors.push(`${excelRow}행: 1학년 기본 공통 행에는 과목을 추가하지 말고 '${extraBaseCourses.join(", ")}'은 예술 추가 행에 입력해 주세요.`);
        }
        if (fixedType === "예술 추가") {
          const knownNonArtCourses = courseNames.filter((course) => {
            const reference = curriculumCourseReference(course);
            return reference && reference.category !== "예술";
          });
          if (knownNonArtCourses.length) errors.push(`${excelRow}행: 예술 추가 행에는 예술 교과만 입력할 수 있습니다: ${knownNonArtCourses.join(", ")}`);
        }
        target.common.push(...courseNames);
      }
      else {
        target.electives.push(...courseNames);
        if (optionLabel) {
          const optionRowKey = `${grade}-${semester}-${optionLabel}`;
          if (optionRows.has(optionRowKey)) errors.push(`${excelRow}행: ${grade}학년 ${semester}학기 ${optionLabel} 과목은 한 행에 쉼표로 구분해 입력해 주세요.`);
          optionRows.add(optionRowKey);
          if (!target.optionMap.has(optionLabel)) target.optionMap.set(optionLabel, { id: `semester-${semester}-option-${Number(optionMatch[1])}`, label: optionLabel, choose, courses: [], semester });
          const option = target.optionMap.get(optionLabel);
          option.courses.push(...courseNames);
        }
      }
    });

    const grades = [...gradeMap.values()].map((grade) => {
      const semesters = [...grade.semesters.values()].map((semester) => {
        const options = [...semester.optionMap.values()].map((option) => ({ ...option, courses: uniqueCourseNames(option.courses) })).sort((a, b) => Number(a.id.match(/option-(\d+)$/)?.[1] || 0) - Number(b.id.match(/option-(\d+)$/)?.[1] || 0));
        options.forEach((option) => {
          if (option.choose > option.courses.length) errors.push(`${grade.grade}학년 ${semester.semester}학기 ${option.label}: 선택 수(${option.choose})가 과목 수(${option.courses.length})보다 많습니다.`);
        });
        return { semester: semester.semester, common: uniqueCourseNames(semester.common), electives: uniqueCourseNames(semester.electives), options };
      });
      return {
        grade: grade.grade,
        semesters,
        common: uniqueCourseNames(semesters.flatMap((semester) => semester.common)),
        electives: uniqueCourseNames(semesters.flatMap((semester) => semester.electives)),
        options: semesters.flatMap((semester) => semester.options)
      };
    });
    const allCourseNames = grades.flatMap((grade) => [...grade.common, ...grade.electives]);
    const courseCount = new Set(allCourseNames.map(curriculumCourseAliasKey)).size;
    const unlistedCourseCount = new Set(allCourseNames.filter((course) => !curriculumCourseReference(course)).map(curriculumCourseAliasKey)).size;
    if (!courseCount) errors.push("편제표에 입력된 과목이 없습니다.");
    if (errors.length) throw new Error(errors.slice(0, 6).join("\n"));
    return { version: 4, fileName: file.name, schoolName, region, admissionYear, grades, courseCount, unlistedCourseCount, uploadedAt: new Date().toISOString() };
  }

  function pendingCurriculumItems() {
    if (!state.pendingCurriculum) return [];
    return Array.isArray(state.pendingCurriculum.curricula) ? state.pendingCurriculum.curricula : [state.pendingCurriculum];
  }

  function prepareCurriculumForEditing(curriculum) {
    curriculum.grades = (Array.isArray(curriculum.grades) ? curriculum.grades : []).map((grade) => {
      grade.semesters = (Array.isArray(grade.semesters) ? grade.semesters : []).map((semester) => {
        semester.common = uniqueCourseNames(semester.common || []);
        semester.options = (Array.isArray(semester.options) ? semester.options : []).map((option, optionIndex) => ({
          ...option,
          id: option.id || `semester-${semester.semester}-option-${optionIndex + 1}`,
          label: compactText(option.label) || `옵션 ${optionIndex + 1}`,
          choose: Number(option.choose) || 1,
          semester: Number(semester.semester),
          courses: uniqueCourseNames(option.courses || [])
        }));
        const optionKeys = new Set(semester.options.flatMap((option) => option.courses).map(curriculumCourseAliasKey));
        if (!Array.isArray(semester.standalone)) {
          semester.standalone = uniqueCourseNames(semester.electives || []).filter((course) => !optionKeys.has(curriculumCourseAliasKey(course)));
        } else semester.standalone = uniqueCourseNames(semester.standalone);
        semester.electives = uniqueCourseNames([...semester.standalone, ...semester.options.flatMap((option) => option.courses)]);
        return semester;
      }).sort((a, b) => a.semester - b.semester);
      grade.common = uniqueCourseNames(grade.semesters.flatMap((semester) => semester.common));
      grade.electives = uniqueCourseNames(grade.semesters.flatMap((semester) => semester.electives));
      grade.options = grade.semesters.flatMap((semester) => semester.options);
      return grade;
    }).sort((a, b) => a.grade - b.grade);
    const allCourseNames = curriculum.grades.flatMap((grade) => [...grade.common, ...grade.electives]);
    curriculum.courseCount = new Set(allCourseNames.map(curriculumCourseAliasKey).filter(Boolean)).size;
    curriculum.unlistedCourseCount = new Set(allCourseNames.filter((course) => !curriculumCourseReference(course)).map(curriculumCourseAliasKey)).size;
    return curriculum;
  }

  function preparePendingCurriculumForEditing() {
    const pending = state.pendingCurriculum;
    if (!pending) return [];
    const curricula = pendingCurriculumItems().map(prepareCurriculumForEditing);
    if (Array.isArray(pending.curricula)) {
      pending.curricula = curricula;
      pending.courseCount = curricula.reduce((sum, curriculum) => sum + curriculum.courseCount, 0);
      pending.unlistedCourseCount = curricula.reduce((sum, curriculum) => sum + curriculum.unlistedCourseCount, 0);
      pending.schoolName = curricula[0]?.schoolName || pending.schoolName;
      pending.region = curricula[0]?.region || pending.region;
    }
    return curricula;
  }

  function curriculumEditorContext(curriculumIndex, gradeNumber, semesterNumber) {
    const curriculum = pendingCurriculumItems()[Number(curriculumIndex)];
    const grade = curriculum?.grades.find((entry) => entry.grade === Number(gradeNumber));
    const semester = grade?.semesters.find((entry) => entry.semester === Number(semesterNumber));
    return curriculum && grade && semester ? { curriculum, grade, semester } : null;
  }

  function curriculumEditorCourseList(context, lane, optionIndex) {
    if (!context) return null;
    if (lane === "common") return context.semester.common;
    if (lane === "standalone") return context.semester.standalone;
    if (lane === "option") return context.semester.options[Number(optionIndex)]?.courses || null;
    return null;
  }

  function curriculumEditorDataAttributes(curriculumIndex, grade, semester, lane, optionIndex = "") {
    return `data-curriculum-index="${curriculumIndex}" data-curriculum-grade="${grade}" data-curriculum-semester="${semester}" data-curriculum-lane="${lane}"${optionIndex === "" ? "" : ` data-curriculum-option-index="${optionIndex}"`}`;
  }

  function curriculumEditorCourseMarkup(course, courseIndex, attributes, courseMetadata = {}) {
    const reference = curriculumCourseReference(course);
    const isUnlisted = !reference;
    const metadata = courseMetadata[curriculumCourseAliasKey(course)] || {};
    const referenceType = reference?.row ? courseBadge(reference.row)?.label : "";
    const detail = [metadata.category || reference?.category, metadata.type || referenceType].filter(Boolean).join(" · ");
    return `<div class="curriculum-editor-course ${isUnlisted ? "is-unlisted" : ""}" draggable="true" data-curriculum-course-drag data-course-index="${courseIndex}" ${attributes} title="드래그하여 다른 영역으로 이동">
      <span class="curriculum-course-grip" aria-hidden="true">⠿</span>
      <button type="button" data-edit-curriculum-course><strong>${escapeHtml(course)}</strong></button>
      <button class="curriculum-course-meta" type="button" data-edit-curriculum-course-meta>${isUnlisted ? "고시 외 과목" : ""}${isUnlisted && detail ? " · " : ""}${escapeHtml(detail || (isUnlisted ? "" : "분류 정보 확인"))}</button>
      <button class="curriculum-course-remove" type="button" data-remove-curriculum-course aria-label="${escapeHtml(course)} 삭제">×</button>
    </div>`;
  }

  function curriculumEditorLaneMarkup({ curriculumIndex, grade, semester, lane, optionIndex = "", title, courses, addLabel = "과목 추가" }) {
    const attributes = curriculumEditorDataAttributes(curriculumIndex, grade, semester, lane, optionIndex);
    const courseMetadata = pendingCurriculumItems()[curriculumIndex]?.courseMetadata || {};
    return `<section class="curriculum-editor-lane ${lane === "option" ? "is-option" : ""}">
      ${title ? `<header><strong>${escapeHtml(title)}</strong><span>${courses.length}과목</span></header>` : ""}
      <div class="curriculum-course-dropzone ${courses.length ? "" : "is-empty"}" data-curriculum-course-dropzone ${attributes}>
        ${courses.length ? courses.map((course, courseIndex) => curriculumEditorCourseMarkup(course, courseIndex, attributes, courseMetadata)).join("") : "<p>과목을 이곳에 끌어 놓으세요.</p>"}
      </div>
      <button class="curriculum-add-course" type="button" data-add-curriculum-course ${attributes}>＋ ${escapeHtml(addLabel)}</button>
    </section>`;
  }

  function curriculumEditorSemesterMarkup(curriculum, curriculumIndex, grade, semester) {
    const fixedLabel = grade.grade === 1 ? "공통·학교 지정 과목" : "학교 지정 과목";
    const commonLane = curriculumEditorLaneMarkup({
      curriculumIndex,
      grade: grade.grade,
      semester: semester.semester,
      lane: "common",
      title: fixedLabel,
      courses: semester.common
    });
    const standaloneLane = semester.standalone.length ? curriculumEditorLaneMarkup({
      curriculumIndex,
      grade: grade.grade,
      semester: semester.semester,
      lane: "standalone",
      title: "개별 선택 과목",
      courses: semester.standalone
    }) : "";
    const optionMarkup = semester.options.map((option, optionIndex) => {
      const attributes = curriculumEditorDataAttributes(curriculumIndex, grade.grade, semester.semester, "option", optionIndex);
      return `<article class="curriculum-option-editor">
        <header>
          <label><span>옵션명</span><input type="text" value="${escapeHtml(option.label)}" data-curriculum-option-label ${attributes}></label>
          <label class="curriculum-choose-field"><span>선택 수</span><span class="curriculum-choose-input"><b>택</b><input type="number" min="1" max="${Math.max(1, option.courses.length)}" value="${option.choose}" inputmode="numeric" data-curriculum-option-choose ${attributes}></span></label>
          <button type="button" data-remove-curriculum-option ${attributes} aria-label="${escapeHtml(option.label)} 삭제">옵션 삭제</button>
        </header>
        ${curriculumEditorLaneMarkup({ curriculumIndex, grade: grade.grade, semester: semester.semester, lane: "option", optionIndex, courses: option.courses, addLabel: "선택 과목 추가" })}
      </article>`;
    }).join("");
    return `<article class="curriculum-semester-editor">
      <header><div><small>${grade.grade}학년</small><h5>${semester.semester}학기</h5></div><span>학교 지정 ${semester.common.length} · 선택 옵션 ${semester.options.length}</span></header>
      ${commonLane}
      ${standaloneLane}
      <div class="curriculum-options-editor">${optionMarkup || '<p class="curriculum-no-options">학생 선택 옵션이 없습니다.</p>'}</div>
      <button class="curriculum-add-option" type="button" data-add-curriculum-option data-curriculum-index="${curriculumIndex}" data-curriculum-grade="${grade.grade}" data-curriculum-semester="${semester.semester}">＋ 선택 옵션 추가</button>
    </article>`;
  }

  function validatePendingCurriculumEdits() {
    const curricula = preparePendingCurriculumForEditing();
    const errors = [];
    const years = new Set();
    curricula.forEach((curriculum) => {
      if (!/^.+고등학교$/u.test(compactText(curriculum.schoolName))) errors.push("학교명은 '고등학교'로 끝나야 합니다.");
      if (!SCHOOL_REGIONS.includes(curriculum.region)) errors.push("학교 지역을 선택해 주세요.");
      if (!Number.isInteger(Number(curriculum.admissionYear)) || Number(curriculum.admissionYear) < 2000 || Number(curriculum.admissionYear) > 2100) errors.push("입학년도는 네 자리 숫자로 입력해 주세요.");
      if (years.has(Number(curriculum.admissionYear))) errors.push("입학년도가 서로 중복됩니다.");
      years.add(Number(curriculum.admissionYear));
      if (!curriculum.courseCount) errors.push(`${curriculum.admissionYear || "해당"} 입학생 편제표에 과목이 없습니다.`);
      curriculum.grades.forEach((grade) => grade.semesters.forEach((semester) => semester.options.forEach((option) => {
        if (!compactText(option.label)) errors.push(`${grade.grade}학년 ${semester.semester}학기 옵션명이 비어 있습니다.`);
        if (!option.courses.length) errors.push(`${grade.grade}학년 ${semester.semester}학기 ${option.label}에 과목이 없습니다.`);
        if (!Number.isInteger(Number(option.choose)) || Number(option.choose) < 1 || Number(option.choose) > option.courses.length) {
          errors.push(`${grade.grade}학년 ${semester.semester}학기 ${option.label}의 선택 수는 1~${option.courses.length || 1} 사이여야 합니다.`);
        }
      })));
    });
    if (errors.length) throw new Error([...new Set(errors)].slice(0, 5).join(" "));
    return curricula;
  }

  function curriculumPreviewMarkup() {
    const pending = state.pendingCurriculum;
    if (!pending) return "";
    const curricula = preparePendingCurriculumForEditing();
    const isBatch = curricula.length > 1;
    const canPublish = Boolean(state.schoolUser && state.accessRole);
    const publishLabel = state.curriculumBusy ? "Supabase에 저장 중"
      : isBatch ? `${curricula.length}개 입학년도 편제표 등록 · 교체`
        : "편제표 등록 · 교체";
    return `<section class="curriculum-upload-preview">
      <header><div><small>${isBatch ? "FULL-YEAR PARSE REVIEW" : "UPLOAD REVIEW"}</small><h3>파싱 결과 확인 및 수정</h3><p>과목명을 누르면 수정할 수 있고, 손잡이를 끌어 학기·옵션 사이 배치를 바꿀 수 있습니다.</p></div><span>${escapeHtml(pending.fileName)}</span></header>
      <div class="curriculum-editor-school-fields">
        <label><span>학교명</span><input type="text" value="${escapeHtml(curricula[0]?.schoolName || pending.schoolName)}" placeholder="예: ○○고등학교" data-curriculum-school-name></label>
        <label><span>지역</span><select data-curriculum-region-edit><option value="">지역을 선택하세요</option>${SCHOOL_REGIONS.map((regionName) => `<option value="${escapeHtml(regionName)}" ${(curricula[0]?.region || pending.region) === regionName ? "selected" : ""}>${escapeHtml(regionName)}</option>`).join("")}</select></label>
        <div><span>파싱 현황</span><strong>총 ${pending.courseCount.toLocaleString("ko-KR")}과목</strong><small>${pending.unlistedCourseCount ? `고시 외 ${pending.unlistedCourseCount.toLocaleString("ko-KR")}과목` : "모든 과목이 앱 DB와 연결됨"}</small></div>
      </div>
      ${Array.isArray(pending.parseWarnings) && pending.parseWarnings.length ? `<aside class="curriculum-parse-warning" role="status">${icon("warning")}<div><strong>유연 분석 결과를 확인하세요.</strong>${pending.parseWarnings.map((warning) => `<p>${escapeHtml(warning)}</p>`).join("")}</div></aside>` : ""}
      <div class="curriculum-editor-cohorts">${curricula.map((curriculum, curriculumIndex) => `<article class="curriculum-editor-cohort">
        <header><div><small>${curriculum.sourceAcademicYear ? `${curriculum.sourceAcademicYear}학년도 원본${curriculum.sourceGrade ? ` · 당시 ${curriculum.sourceGrade}학년` : ""}` : "표준 연동 양식"}</small><h4><label><input type="number" min="2000" max="2100" value="${curriculum.admissionYear}" data-curriculum-admission-year data-curriculum-index="${curriculumIndex}"><span>년 입학생</span></label></h4></div><span>${curriculum.courseCount}과목${curriculum.unlistedCourseCount ? ` · 고시 외 ${curriculum.unlistedCourseCount}` : ""}</span></header>
        <div class="curriculum-editor-grades">${curriculum.grades.map((grade) => `<section class="curriculum-grade-editor"><header><strong>${grade.grade}학년 편제</strong><span>${grade.common.length + grade.electives.length}과목 · 선택 옵션 ${grade.options.length}</span></header><div>${grade.semesters.map((semester) => curriculumEditorSemesterMarkup(curriculum, curriculumIndex, grade, semester)).join("")}</div></section>`).join("")}</div>
      </article>`).join("")}</div>
      <aside class="curriculum-editor-legend"><span><i></i> 앱 과목 안내와 연결</span><span class="is-unlisted"><i></i> 고시 외 과목 · 입력명 그대로 저장</span><small>드래그 이동과 직접 수정은 이 미리보기에만 적용되며, 아래 등록 버튼을 눌러야 저장됩니다.</small></aside>
      <div class="admin-button-row"><button class="primary-action" type="button" data-publish-curriculum ${state.curriculumBusy || !canPublish ? "disabled" : ""}>${publishLabel}</button><button class="text-action" type="button" data-clear-curriculum-preview>미리보기 닫기</button></div>
      ${!canPublish ? '<small class="preview-help">담당 교사 또는 관리자로 권한을 확인하면 등록할 수 있습니다.</small>' : '<small class="preview-help">같은 학교·입학년도의 편제표가 이미 있으면 이번에 검토한 새 내용으로 교체됩니다.</small>'}
    </section>`;
  }

  function schoolAuthMarkup() {
    if (!schoolStore?.isConfigured?.()) return `<div class="connection-empty">${icon("database")}<div><strong>Supabase 설정이 필요합니다.</strong><p><code>supabase-config.js</code>에 Project URL과 Publishable key를 입력하면 등록 권한 확인이 활성화됩니다.</p></div></div>`;
    if (!state.schoolUser || !state.accessRole) return `<div class="school-access-login">
      <form class="school-login-form teacher-login-form" data-teacher-login-form><div><small>TEACHER ACCESS</small><h3>담당 교사 · 데이터 등록</h3><p>설정된 관리 비밀번호만 입력하세요. 같은 학교·입학년도는 새 업로드로 교체됩니다.</p></div><label><span>관리 비밀번호</span><input type="password" name="password" autocomplete="current-password" required placeholder="관리 비밀번호"></label><button class="primary-action" type="submit">등록 권한 확인</button></form>
      <form class="school-login-form admin-login-form" data-admin-login-form><div><small>ADMIN ACCESS</small><h3>관리자 · 수정 및 삭제</h3><p>관리자 계정으로 로그인하세요.</p></div><label><span>관리자 이메일</span><input type="email" name="email" autocomplete="username" required placeholder="admin@example.com"></label><label><span>비밀번호</span><input type="password" name="password" autocomplete="current-password" required placeholder="비밀번호"></label><button class="secondary-action" type="submit">관리자 로그인</button></form>
    </div>`;
    const isAdmin = state.accessRole === "admin";
    return `<div class="signed-school-user ${isAdmin ? "is-admin" : "is-teacher"}"><span>${icon("user")}</span><div><small>${isAdmin ? "ADMIN" : "TEACHER"}</small><strong>${isAdmin ? "관리자 권한으로 로그인됨" : "담당 교사 등록 권한 확인됨"}</strong><p>${isAdmin ? "편제표를 등록·교체·삭제할 수 있습니다." : "편제표를 등록하고 같은 학교·입학년도 자료를 교체할 수 있습니다."}</p></div><button class="text-action" type="button" data-school-signout>로그아웃</button></div>`;
  }

  function renderAdmin() {
    root.innerHTML = `
      ${renderNotices()}
      ${pageHead("데이터 연동", "학교별 편제표 양식을 내려받아 작성하고 DB에 연결합니다.", state.schools.length, "연동 학교")}
      <div class="school-integration-layout">
        <section class="admin-card school-upload-card" aria-busy="${state.curriculumBusy}">
          <div class="admin-section-head"><div><p class="section-kicker">SCHOOL CURRICULUM</p><h2>학교 편제표 등록</h2></div></div>
          ${schoolAuthMarkup()}
          <div class="template-download-panel"><span>${icon("download")}</span><div><strong>학교 편제표 표준 양식 다운로드</strong><p>1학년 기본 공통 과목은 자동 입력되어 있습니다. 예술 추가 과목과 2·3학년 학교 지정·선택 과목을 작성합니다.</p></div><button class="primary-action" type="button" data-download-curriculum-template>양식 다운로드</button></div>
          <aside class="curriculum-format-notice" role="note">${icon("warning")}<p><strong>업로드 자료를 확인하세요.</strong><span>신입생 편제표가 아닌, <mark>전학년</mark> 편제표를 업로드 하세요.<br>학교별 셀 위치가 달라도 교과군·과목 유형·학년·학기·옵션·선택 수 머리글과 ‘택 N’ 표시를 찾아 분석합니다.</span></p></aside>
          <label class="upload-zone curriculum-upload-zone ${state.curriculumBusy ? "is-busy" : ""}">
            <input type="file" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" data-curriculum-input ${state.curriculumBusy ? "disabled" : ""}>
            <span class="upload-icon">${icon("upload")}</span>
            <strong>${state.curriculumBusy ? "편제표를 처리하고 있습니다" : "표준 양식 또는 전학년 편제표 업로드"}</strong>
            <small>파일을 먼저 분석한 뒤 학교명·지역·입학년도와 모든 과목 배치를 최종 확인하고 수정할 수 있습니다.</small>
          </label>
          ${state.curriculumImportMessage ? `<p class="import-message ${state.pendingCurriculum ? "" : "is-error"}" role="status">${escapeHtml(state.curriculumImportMessage)}</p>` : ""}
          ${curriculumPreviewMarkup()}
        </section>
        <aside class="admin-card connected-schools-card">
          <div class="admin-section-head"><div><p class="section-kicker">CONNECTED SCHOOLS</p><h2>현재 연동 학교</h2></div><span>${state.schools.length.toLocaleString("ko-KR")}곳</span></div>
          <div class="connected-school-list">${state.schools.length ? state.schools.map((school, index) => {
            const selected = state.selectedSchool?.id === school.id;
            const years = schoolAdmissionYears(school);
            return `<button type="button" class="${selected ? "is-selected" : ""}" data-school-id="${escapeHtml(school.id)}"><span>${String(index + 1).padStart(2, "0")}</span><div><strong>${escapeHtml(school.name)}</strong><small>${escapeHtml(school.region || "지역 정보 없음")} · ${years.length ? `입학년도 ${years.join(", ")}` : "등록 편제표 없음"}</small></div>${icon("arrow")}</button>${selected ? schoolAdmissionYearOptionsMarkup(school) : ""}`;
          }).join("") : `<div class="connected-schools-empty">${icon("school")}<strong>연동된 학교가 없습니다.</strong><p>학교 편제표를 업로드하면 연동된 학교 목록에 자동으로 표시됩니다.</p></div>`}</div>
          ${state.selectedSchool ? `<div class="active-school-summary"><small>현재 선택 학교·입학년도</small><strong>${escapeHtml(state.selectedSchool.name)}</strong><span>${state.curriculum ? `${escapeHtml(state.curriculum.admissionYear || "-")}학년도 편제표 연동됨` : schoolAdmissionYears(state.selectedSchool).length ? "입학년도를 선택해 주세요." : "공개된 편제표 없음"}</span>${state.accessRole === "admin" && state.curriculum?.id ? `<button class="danger-action" type="button" data-delete-curriculum data-curriculum-id="${escapeHtml(state.curriculum.id)}">현재 편제표 삭제</button>` : ""}</div>` : ""}
        </aside>
      </div>`;
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

  async function loadDepartmentDatabase(options = {}) {
    try {
      state.departmentDataset = await store.loadDepartmentDatabase(options);
      return state.departmentDataset;
    } catch (error) {
      console.error("학과 DB 불러오기 실패:", error);
      state.departmentDataset = { meta: {}, fields: [], departments: [] };
      state.notices.push("학과 안내 DB를 불러오지 못했습니다. data/departments.json을 확인해 주세요.");
      return state.departmentDataset;
    }
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
    state.dialogRecordIndex = index;
    state.dialogDepartmentId = "";
    detailDialog.classList.remove("is-major-dialog", "is-recommend-field-dialog", "is-comparison-picker-dialog", "is-comparison-result-dialog");
    state.dialogReturnToRecommend = false;
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
        <div class="detail-print-row">${printActionMarkup("subject", index)}</div>
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
      <div class="detail-print-row">${printActionMarkup("subject", index)}</div>
      <p class="dialog-kicker">DATABASE RECORD</p>
      <h2 id="record-dialog-title">${escapeHtml(title)}</h2>
      <dl class="record-detail-list">${state.dataset.columns.map((column) => `<div><dt>${escapeHtml(column)}</dt><dd>${escapeHtml(displayValue(row[column])) || '<span class="empty-cell">정보 없음</span>'}</dd></div>`).join("")}</dl>`;
    if (!detailDialog.open) detailDialog.showModal();
  }

  function printableCourseGroupsMarkup(subjects, options = {}) {
    const normalized = (subjects || []).map((subject) => typeof subject === "string" ? { name: subject } : subject).filter((subject) => compactText(subject?.name));
    const groups = groupedRecommendationSubjects(normalized);
    return groups.length ? `<div class="platform-print-course-groups">${groups.map((group) => `<section><header><strong>${escapeHtml(group.category)}</strong><span>${group.entries.length}과목</span></header><div>${group.entries.map((subject) => {
      const universityCount = Array.isArray(subject.universities) ? subject.universities.length : Number(subject.universityCount) || 0;
      return `<span><b>${escapeHtml(subject.name)}</b>${options.showUniversities && universityCount ? `<small>${universityCount}개 대학</small>` : ""}</span>`;
    }).join("")}</div></section>`).join("")}</div>` : '<p class="platform-print-empty">해당하는 과목이 없습니다.</p>';
  }

  function subjectPrintMarkup(index) {
    const row = state.dataset.rows[index];
    if (!row) return null;
    const courseName = compactText(valueAt(row, COLUMN_ALIASES.courseName)) || compactText(valueAt(row, COLUMN_ALIASES.department)) || "과목 상세 정보";
    const category = normalizeCourseGroup(valueAt(row, COLUMN_ALIASES.category));
    const courseType = compactText(valueAt(row, COLUMN_ALIASES.courseType));
    const courseClass = compactText(valueAt(row, COLUMN_ALIASES.courseClass));
    const selectionType = compactText(valueAt(row, COLUMN_ALIASES.selectionType));
    const description = compactText(valueAt(row, COLUMN_ALIASES.description));
    const recommendation = compactText(valueAt(row, COLUMN_ALIASES.recommendation));
    const topics = courseTopics(valueAt(row, COLUMN_ALIASES.mainContent));
    const faqs = [valueAt(row, COLUMN_ALIASES.faq1), valueAt(row, COLUMN_ALIASES.faq2)].filter((value) => compactText(value)).map(faqParts);
    const facts = [
      ["교과군", category || "정보 없음"],
      ["과목 유형", courseType || "정보 없음"],
      ["과목 구분", courseClass || "정보 없음"],
      ["성취도", compactText(valueAt(row, COLUMN_ALIASES.achievement)) || "정보 없음"],
      ["석차등급", compactText(valueAt(row, COLUMN_ALIASES.rankGrade)) || "정보 없음"],
      ["수능 출제", compactText(valueAt(row, COLUMN_ALIASES.csat)) || "정보 없음"]
    ];
    return {
      title: courseName,
      subtitle: `${category} · 2022 개정 교육과정 과목 안내`,
      body: `<section class="platform-print-detail platform-print-subject"><div class="platform-print-title"><p>COURSE GUIDE</p><h1>${escapeHtml(courseName)}</h1><div>${[courseType, courseClass, selectionType].filter(Boolean).map((value) => `<span>${escapeHtml(value)}</span>`).join("")}</div></div><dl class="platform-print-facts">${facts.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl><div class="platform-print-detail-grid">${description ? `<section><h2>이 과목은 어떤 과목인가요?</h2><p>${escapeHtml(description)}</p></section>` : ""}${recommendation ? `<section><h2>이 과목을 누구에게 추천하나요?</h2><p>${escapeHtml(recommendation)}</p></section>` : ""}${topics.length ? `<section><h2>과목의 주요 내용</h2><ul>${topics.map((topic) => `<li>${escapeHtml(topic)}</li>`).join("")}</ul></section>` : ""}${faqs.length ? `<section><h2>더 알아보기</h2>${faqs.map((faq) => `<article><h3>${escapeHtml(faq.question)}</h3><p>${escapeHtml(faq.answer)}</p></article>`).join("")}</section>` : ""}</div></section>`
    };
  }

  function departmentPrintMarkup(id) {
    const department = departmentById(id);
    if (!department) return null;
    const books = [...(department.recommendedBooks || [])].sort((a, b) => String(a.title || "").localeCompare(String(b.title || ""), "ko") || String(a.author || "").localeCompare(String(b.author || ""), "ko"));
    const printedBooks = books.slice(0, 8);
    const recommendedBooksMarkup = `<section class="platform-print-book-guide"><small>04 · RECOMMENDED BOOKS</small><div class="platform-print-book-heading"><h2>권장 도서</h2><em>${books.length}</em></div>${printedBooks.length ? `<div class="platform-print-book-list">${printedBooks.map((book) => `<div><strong>${escapeHtml(book.title)}</strong><span>${escapeHtml(book.author || "저자 정보 없음")}</span>${recommendedBookUniversityBadgesMarkup(book.universities, "platform-print-book-universities")}</div>`).join("")}</div>${books.length > printedBooks.length ? `<p class="platform-print-book-more">외 ${books.length - printedBooks.length}권은 화면에서 확인할 수 있습니다.</p>` : ""}` : '<p class="platform-print-empty">등록된 권장 도서가 없습니다.</p>'}</section>`;
    return {
      title: department.name,
      subtitle: `${department.field} 분야 · 학과 안내`,
      body: `<section class="platform-print-detail platform-print-department"><div class="platform-print-title"><p>${escapeHtml(department.field.toLocaleUpperCase("ko"))} FIELD · DEPARTMENT GUIDE</p><h1>${escapeHtml(department.name)}</h1></div><div class="platform-print-guide-grid">${department.guide?.overview ? `<section><small>01 · OVERVIEW</small><h2>학과 개요</h2><p>${escapeHtml(department.guide.overview)}</p></section>` : ""}${department.guide?.aptitude ? `<section><small>02 · APTITUDE</small><h2>흥미와 적성</h2><p>${escapeHtml(department.guide.aptitude)}</p></section>` : ""}${department.guide?.careers ? `<section><small>03 · CAREER</small><h2>졸업 후 진출 분야</h2><p>${escapeHtml(department.guide.careers)}</p></section>` : ""}${recommendedBooksMarkup}</div><section class="platform-print-course-section"><header><div><small>RELATED COURSES</small><h2>관련 과목</h2></div><em>${department.relatedSubjects.length}</em></header>${printableCourseGroupsMarkup(department.relatedSubjects)}</section>${department.reflectedSubjects.length ? `<section class="platform-print-course-section is-reflected"><header><div><small>ADMISSION REFLECTION</small><h2>반영 과목</h2></div><em>${department.reflectedSubjects.length}</em></header>${printableCourseGroupsMarkup(department.reflectedSubjects, { showUniversities: true })}</section>` : ""}${department.scienceRecommendedSubjects.length ? `<section class="platform-print-course-section is-science"><header><div><small>SCIENCE RECOMMENDATION</small><h2>과학 권장 과목</h2></div><em>${department.scienceRecommendedSubjects.length}</em></header>${printableCourseGroupsMarkup(department.scienceRecommendedSubjects, { showUniversities: true })}</section>` : ""}<p class="platform-print-note">권장 도서와 대학별 반영·권장 정보는 제공된 엑셀 DB를 기준으로 표시합니다.</p></section>`
    };
  }

  function recommendationPrintMarkup() {
    const groups = recommendFinalGroups();
    const departments = selectedRecommendDepartments();
    const total = new Set(groups.flatMap((group) => group.entries.map((entry) => entry.key))).size;
    return {
      title: "나만의 과목 추천 결과",
      subtitle: `${state.recommendField || "관심 분야"} · 추천 ${total}과목`,
      body: `<section class="platform-print-detail platform-print-recommendation"><div class="platform-print-title"><p>MY COURSE RECOMMENDATION</p><h1>나만의 과목 추천 결과</h1></div><div class="platform-print-choice-summary"><span><small>관심 분야</small><strong>${escapeHtml(state.recommendField || "선택 안 함")}</strong></span><span><small>관심 학과</small><strong>${escapeHtml(departments.map((department) => department.name).join(" · ") || "선택 안 함")}</strong></span><span><small>관심 키워드</small><strong>${state.recommendKeywords.length ? state.recommendKeywords.map((keyword) => `#${escapeHtml(keyword)}`).join(" ") : "입력하지 않음"}</strong></span></div><div class="platform-print-recommendation-groups">${groups.map((group, index) => `<section><header><span>${String(index + 1).padStart(2, "0")}</span><div><small>PRIORITY</small><h2>${escapeHtml(group.label)}</h2><p>${escapeHtml(group.description)}</p></div><em>${group.entries.length}</em></header>${printableCourseGroupsMarkup(group.entries)}</section>`).join("")}</div><aside class="platform-print-warning">${icon("warning")}<strong>과목 추천은 정답이 아닙니다. 꼭 담임 선생님과 검토하세요.</strong></aside></section>`
    };
  }

  function ensurePlatformPrintRoot() {
    let printRoot = document.querySelector("[data-platform-print-root]");
    if (!printRoot) {
      printRoot = document.createElement("div");
      printRoot.className = "platform-print-root";
      printRoot.dataset.platformPrintRoot = "";
      document.body.append(printRoot);
    }
    return printRoot;
  }

  function platformPrintDocumentMarkup(documentData) {
    return `<article class="platform-print-document"><header class="platform-print-brand"><div><span>${icon("school")}</span><strong>선택 과목 안내 플랫폼</strong></div><div><b>${escapeHtml(documentData.title)}</b><small>${escapeHtml(documentData.subtitle || "")}</small></div></header>${documentData.body}<footer class="platform-print-footer"><span>선택 과목 안내 플랫폼</span><small>${new Intl.DateTimeFormat("ko-KR", { dateStyle: "long" }).format(new Date())}</small></footer></article>`;
  }

  function platformExportFileName(title, extension) {
    const safeTitle = compactText(title).replace(/[\\/:*?"<>|]/g, "-").replace(/\.+$/g, "").slice(0, 70) || "선택-과목-안내";
    const now = new Date();
    const date = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
    return `${safeTitle}-${date}.${extension}`;
  }

  function downloadPlatformBlob(blob, fileName) {
    const blobUrl = URL.createObjectURL(blob);
    const downloadLink = document.createElement("a");
    downloadLink.href = blobUrl;
    downloadLink.download = fileName;
    document.body.append(downloadLink);
    downloadLink.click();
    downloadLink.remove();
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
  }

  async function renderPlatformPrintCanvas(documentData) {
    const printRoot = ensurePlatformPrintRoot();
    printRoot.innerHTML = platformPrintDocumentMarkup(documentData);
    document.body.classList.add("is-platform-image-capturing");
    try {
      if (document.fonts?.ready) {
        await Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, 800))]);
      }
      await new Promise((resolve) => setTimeout(resolve, 60));
      const source = printRoot.querySelector(".platform-print-document");
      const capture = await window.html2canvas(source, {
        backgroundColor: "#ffffff",
        scale: 1.25,
        useCORS: true,
        allowTaint: false,
        logging: false,
        imageTimeout: 8000
      });
      const output = document.createElement("canvas");
      output.width = 1800;
      output.height = 1273;
      const context = output.getContext("2d");
      if (!context || !capture.width || !capture.height) throw new Error("출력 화면을 구성하지 못했습니다.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, output.width, output.height);
      const padding = 42;
      const scale = Math.min((output.width - padding * 2) / capture.width, (output.height - padding * 2) / capture.height);
      const drawWidth = Math.max(1, Math.round(capture.width * scale));
      const drawHeight = Math.max(1, Math.round(capture.height * scale));
      const drawX = Math.round((output.width - drawWidth) / 2);
      context.drawImage(capture, drawX, padding, drawWidth, drawHeight);
      return output;
    } finally {
      document.body.classList.remove("is-platform-image-capturing");
      printRoot.replaceChildren();
    }
  }

  function singlePagePdfBlob(jpegBytes, imageWidth, imageHeight) {
    const encoder = new TextEncoder();
    const chunks = [];
    const offsets = Array(6).fill(0);
    let byteLength = 0;
    const push = (value) => {
      const bytes = typeof value === "string" ? encoder.encode(value) : value;
      chunks.push(bytes);
      byteLength += bytes.length;
    };
    const addObject = (number, value) => {
      offsets[number] = byteLength;
      push(`${number} 0 obj\n${value}\nendobj\n`);
    };
    push("%PDF-1.4\n%1234\n");
    addObject(1, "<< /Type /Catalog /Pages 2 0 R >>");
    addObject(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
    addObject(3, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 841.89 595.28] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>");
    offsets[4] = byteLength;
    push(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Interpolate true /Length ${jpegBytes.length} >>\nstream\n`);
    push(jpegBytes);
    push("\nendstream\nendobj\n");
    const pageCommands = "q\n841.89 0 0 595.28 0 0 cm\n/Im0 Do\nQ";
    addObject(5, `<< /Length ${encoder.encode(pageCommands).length} >>\nstream\n${pageCommands}\nendstream`);
    const xrefOffset = byteLength;
    push(`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
    return new Blob(chunks, { type: "application/pdf" });
  }

  async function downloadPlatformPrintImage(documentData) {
    if (!documentData?.body) {
      showToast("저장할 정보를 찾지 못했습니다.");
      return;
    }
    if (platformExportBusy) {
      showToast("파일을 만들고 있습니다. 잠시만 기다려 주세요.");
      return;
    }
    if (typeof window.html2canvas !== "function") {
      showToast("이미지 저장 도구를 불러오지 못했습니다. 인터넷 연결 후 다시 시도해 주세요.", 4500);
      return;
    }
    platformExportBusy = true;
    showToast("현재 화면을 PNG 이미지로 만들고 있습니다.", 5000);
    try {
      const output = await renderPlatformPrintCanvas(documentData);
      const blob = await new Promise((resolve) => output.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("PNG 변환에 실패했습니다.");
      downloadPlatformBlob(blob, platformExportFileName(documentData.title, "png"));
      showToast("PNG 이미지 파일을 저장했습니다.");
    } catch (error) {
      console.error("모바일 이미지 저장 실패:", error);
      showToast("이미지 파일을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.", 4500);
    } finally {
      platformExportBusy = false;
    }
  }

  async function downloadPlatformPrintPdf(documentData) {
    if (!documentData?.body) {
      showToast("저장할 정보를 찾지 못했습니다.");
      return;
    }
    if (platformExportBusy) {
      showToast("파일을 만들고 있습니다. 잠시만 기다려 주세요.");
      return;
    }
    if (typeof window.html2canvas !== "function") {
      showToast("PDF 저장 도구를 불러오지 못했습니다. 인터넷 연결 후 다시 시도해 주세요.", 4500);
      return;
    }
    platformExportBusy = true;
    showToast("한 페이지 PDF 파일을 만들고 있습니다.", 5000);
    try {
      const output = await renderPlatformPrintCanvas(documentData);
      const jpegBlob = await new Promise((resolve) => output.toBlob(resolve, "image/jpeg", 0.94));
      if (!jpegBlob) throw new Error("PDF용 이미지 변환에 실패했습니다.");
      const pdfBlob = singlePagePdfBlob(new Uint8Array(await jpegBlob.arrayBuffer()), output.width, output.height);
      downloadPlatformBlob(pdfBlob, platformExportFileName(documentData.title, "pdf"));
      showToast("PDF 파일을 저장했습니다.");
    } catch (error) {
      console.error("PDF 저장 실패:", error);
      showToast("PDF 파일을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.", 4500);
    } finally {
      platformExportBusy = false;
    }
  }

  function fitPlatformPrintToSinglePage(printRoot) {
    const printDocument = printRoot?.querySelector(".platform-print-document");
    if (!printDocument) return;
    const contentWidth = Math.max(1, Math.ceil(Math.max(printDocument.scrollWidth, printDocument.getBoundingClientRect().width)));
    const contentHeight = Math.max(1, Math.ceil(Math.max(printDocument.scrollHeight, printDocument.getBoundingClientRect().height)));
    const svgNamespace = "http://www.w3.org/2000/svg";
    const xhtmlNamespace = "http://www.w3.org/1999/xhtml";
    const sheet = document.createElementNS(svgNamespace, "svg");
    sheet.classList.add("platform-print-sheet-svg");
    sheet.setAttribute("viewBox", `0 0 ${contentWidth} ${contentHeight}`);
    sheet.setAttribute("preserveAspectRatio", "xMinYMin meet");
    sheet.setAttribute("role", "img");
    sheet.setAttribute("aria-label", "한 페이지 인쇄 문서");
    const foreignObject = document.createElementNS(svgNamespace, "foreignObject");
    foreignObject.setAttribute("width", String(contentWidth));
    foreignObject.setAttribute("height", String(contentHeight));
    const canvas = document.createElement("div");
    canvas.setAttribute("xmlns", xhtmlNamespace);
    canvas.className = "platform-print-svg-canvas";
    canvas.style.width = `${contentWidth}px`;
    canvas.style.height = `${contentHeight}px`;
    const clone = printDocument.cloneNode(true);
    clone.classList.add("is-svg-clone");
    clone.style.width = `${contentWidth}px`;
    canvas.append(clone);
    foreignObject.append(canvas);
    sheet.append(foreignObject);
    printRoot.replaceChildren(sheet);
  }

  function openPlatformPrint(documentData) {
    if (!documentData?.body) {
      showToast("인쇄할 정보를 찾지 못했습니다.");
      return;
    }
    const printRoot = ensurePlatformPrintRoot();
    const previousTitle = document.title;
    printRoot.innerHTML = platformPrintDocumentMarkup(documentData);
    document.title = `${documentData.title} - 선택 과목 안내 플랫폼`;
    document.body.classList.add("is-platform-printing", "is-platform-print-measuring");
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      document.body.classList.remove("is-platform-printing", "is-platform-print-measuring");
      document.title = previousTitle;
    };
    window.addEventListener("afterprint", finish, { once: true });
    requestAnimationFrame(() => setTimeout(() => {
      fitPlatformPrintToSinglePage(printRoot);
      document.body.classList.remove("is-platform-print-measuring");
      requestAnimationFrame(() => {
        window.print();
        setTimeout(finish, 60000);
      });
    }, 80));
  }

  function platformDocumentData(kind, id) {
    let documentData = null;
    if (kind === "subject") documentData = subjectPrintMarkup(Number(id));
    else if (kind === "department") documentData = departmentPrintMarkup(id);
    else if (kind === "recommendation") documentData = recommendationPrintMarkup();
    else if (kind === "simulation") {
      documentData = {
        title: `${state.selectedSchool?.name || "학교"} 수강 과목표`,
        subtitle: `${state.selectedAdmissionYear || state.curriculum?.admissionYear || "-"}학년도 입학생 기준`,
        body: simulationFinalContentMarkup()
      };
    }
    return documentData;
  }

  function printRequestedView(kind, id) {
    return openPlatformPrint(platformDocumentData(kind, id));
  }

  function pdfRequestedView(kind, id) {
    return downloadPlatformPrintPdf(platformDocumentData(kind, id));
  }

  function imageRequestedView(kind, id) {
    return downloadPlatformPrintImage(platformDocumentData(kind, id));
  }

  document.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-print-view], [data-pdf-view], [data-image-view]");
    if (!actionButton) return;
    event.preventDefault();
    event.stopPropagation();
    if (actionButton.dataset.pdfView) pdfRequestedView(actionButton.dataset.pdfView, actionButton.dataset.printId || "");
    else if (actionButton.dataset.imageView) imageRequestedView(actionButton.dataset.imageView, actionButton.dataset.printId || "");
    else printRequestedView(actionButton.dataset.printView, actionButton.dataset.printId || "");
  }, true);

  root.addEventListener("click", async (event) => {
    const departmentField = event.target.closest("[data-department-field]");
    if (departmentField) {
      state.departmentField = departmentField.dataset.departmentField;
      state.departmentSearch = "";
      state.departmentCommonOpen = false;
      renderView();
      return;
    }

    if (event.target.closest("[data-department-back]")) {
      state.departmentField = "";
      state.departmentSearch = "";
      state.departmentCommonOpen = false;
      renderView();
      return;
    }

    const departmentCommonOpen = event.target.closest("[data-department-common-open]");
    if (departmentCommonOpen) {
      openDepartmentCommonDialog(departmentCommonOpen.dataset.departmentCommonOpen);
      return;
    }

    const departmentOpen = event.target.closest("[data-department-open]");
    if (departmentOpen) {
      openDepartment(departmentOpen.dataset.departmentOpen);
      return;
    }

    const recommendField = event.target.closest("[data-recommend-field]");
    if (recommendField) {
      const fieldName = recommendField.dataset.recommendField;
      if (state.recommendField !== fieldName) {
        state.recommendDepartmentIds = [];
        state.recommendDepartmentSearch = "";
        state.recommendKeywords = [];
        state.recommendMaxStep = 1;
      }
      state.recommendField = fieldName;
      state.recommendDepartmentId = "";
      state.recommendSection = "";
      state.comparisonOpen = false;
      renderRecommend();
      return;
    }

    const recommendDepartmentChoice = event.target.closest("[data-recommend-department-choice]");
    if (recommendDepartmentChoice) {
      const id = recommendDepartmentChoice.dataset.recommendDepartmentChoice;
      const preserveDepartmentScroll = window.matchMedia("(max-width: 820px)").matches;
      const departmentScrollTop = preserveDepartmentScroll
        ? recommendDepartmentChoice.closest(".recommend-department-options")?.scrollTop || 0
        : 0;
      if (state.recommendDepartmentIds.includes(id)) {
        state.recommendDepartmentIds = state.recommendDepartmentIds.filter((item) => item !== id);
      } else if (state.recommendDepartmentIds.length >= 3) {
        showToast("관심 학과는 최대 3개까지 선택할 수 있습니다.");
        return;
      } else {
        state.recommendDepartmentIds = [...state.recommendDepartmentIds, id];
      }
      renderRecommend();
      if (preserveDepartmentScroll) {
        requestAnimationFrame(() => {
          const renderedDepartmentOptions = root.querySelector(".recommend-department-options");
          if (renderedDepartmentOptions) renderedDepartmentOptions.scrollTop = departmentScrollTop;
        });
      }
      return;
    }

    const recommendKeywordRemove = event.target.closest("[data-recommend-keyword-remove]");
    if (recommendKeywordRemove) {
      const index = Number(recommendKeywordRemove.dataset.recommendKeywordRemove);
      if (Number.isInteger(index) && index >= 0 && index < state.recommendKeywords.length) {
        state.recommendKeywords = state.recommendKeywords.filter((_, keywordIndex) => keywordIndex !== index);
        renderRecommend();
        requestAnimationFrame(() => root.querySelector("[data-recommend-keyword-form] input")?.focus());
      }
      return;
    }

    const recommendGoStep = event.target.closest("[data-recommend-go-step]");
    if (recommendGoStep && !recommendGoStep.disabled) {
      const step = Number(recommendGoStep.dataset.recommendGoStep);
      if (step >= 1 && step <= state.recommendMaxStep) {
        state.recommendStep = step;
        renderRecommend();
      }
      return;
    }

    if (event.target.closest("[data-recommend-prev]")) {
      state.recommendStep = Math.max(1, state.recommendStep - 1);
      renderRecommend();
      return;
    }

    if (event.target.closest("[data-recommend-next]")) {
      if (state.recommendStep === 1 && !state.recommendField) {
        showToast("관심 분야를 먼저 선택해 주세요.");
        return;
      }
      if (state.recommendStep === 2 && !state.recommendDepartmentIds.length) {
        showToast("관심 학과를 하나 이상 선택해 주세요.");
        return;
      }
      state.recommendStep = Math.min(5, state.recommendStep + 1);
      state.recommendMaxStep = Math.max(state.recommendMaxStep, state.recommendStep);
      renderRecommend();
      return;
    }

    if (event.target.closest("[data-recommend-restart]")) {
      state.recommendStep = 1;
      state.recommendMaxStep = 1;
      state.recommendField = "";
      state.recommendDepartmentId = "";
      state.recommendDepartmentIds = [];
      state.recommendDepartmentSearch = "";
      state.recommendKeywords = [];
      renderRecommend();
      return;
    }

    const compareToggle = event.target.closest("[data-compare-toggle]");
    if (compareToggle) {
      const id = compareToggle.dataset.compareToggle;
      const wasSelected = state.comparisonIds.includes(id);
      if (!toggleComparisonSelection(id)) return;
      renderComparisonHost();
      if (!wasSelected && state.comparisonIds.length === 2) openComparisonResult();
      return;
    }

    if (event.target.closest("[data-start-comparison]")) {
      openComparisonPicker();
      return;
    }

    if (event.target.closest("[data-close-comparison]")) {
      state.comparisonOpen = false;
      openComparisonPicker();
      return;
    }

    const schoolAdmissionYear = event.target.closest("[data-school-admission-year]");
    if (schoolAdmissionYear && schoolStore) {
      schoolAdmissionYear.disabled = true;
      try {
        const result = await schoolStore.selectAdmissionYear(Number(schoolAdmissionYear.dataset.schoolAdmissionYear));
        syncSchoolState(result);
        syncSchoolSimulationSubjects(true);
        state.subjectCategory = "전체";
        state.subjectPage = 1;
        render();
        showToast(`${state.selectedSchool?.name || "학교"} ${state.selectedAdmissionYear}학년도 입학생 편제표를 연결했습니다.`);
      } catch (error) {
        schoolAdmissionYear.disabled = false;
        showToast(error.message || "입학년도 편제표를 불러오지 못했습니다.", 4500);
      }
      return;
    }

    const schoolCard = event.target.closest(".connected-school-list [data-school-id]");
    if (schoolCard && schoolStore) {
      const result = await schoolStore.selectSchool(schoolCard.dataset.schoolId);
      syncSchoolState(result);
      syncSchoolSimulationSubjects(true);
      state.subjectCategory = "전체";
      state.subjectPage = 1;
      render();
      showToast(schoolAdmissionYears(state.selectedSchool).length
        ? `${state.selectedSchool?.name || "학교"}의 입학년도를 선택해 주세요.`
        : `${state.selectedSchool?.name || "학교"}에 등록된 편제표가 없습니다.`);
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

    const simulationGradeButton = event.target.closest("[data-simulation-grade]");
    if (simulationGradeButton && !simulationGradeButton.disabled) {
      state.simulationResultOpen = false;
      state.simulationGradeStep = Math.max(1, Math.min(3, Number(simulationGradeButton.dataset.simulationGrade) || 1));
      renderSimulation();
      root.focus({ preventScroll: true });
      return;
    }

    if (event.target.closest("[data-simulation-prev-grade]")) {
      state.simulationResultOpen = false;
      state.simulationGradeStep = Math.max(1, state.simulationGradeStep - 1);
      renderSimulation();
      root.focus({ preventScroll: true });
      return;
    }

    if (event.target.closest("[data-simulation-next-grade]")) {
      const currentProgress = curriculumSelectionProgress().gradeProgress.find((grade) => grade.grade === state.simulationGradeStep);
      if (!currentProgress?.complete) {
        showToast(`${state.simulationGradeStep}학년의 선택 옵션을 먼저 완료해 주세요.`);
        return;
      }
      state.simulationGradeStep = Math.min(3, state.simulationGradeStep + 1);
      state.simulationMaxGradeStep = Math.max(state.simulationMaxGradeStep, state.simulationGradeStep);
      renderSimulation();
      root.focus({ preventScroll: true });
      return;
    }

    if (event.target.closest("[data-show-simulation-result]")) {
      const progress = curriculumSelectionProgress();
      if (!progress.complete) {
        showToast(`아직 ${progress.optionCount - progress.completedOptions}개 옵션의 선택이 남았습니다.`);
        return;
      }
      if (!state.simulationResultUnlocked && state.simulationGradeStep !== 3) {
        showToast("1학년부터 3학년까지 차례로 확인해 주세요.");
        return;
      }
      state.simulationResultUnlocked = true;
      state.simulationResultOpen = true;
      renderSimulation();
      root.focus({ preventScroll: true });
      return;
    }

    if (event.target.closest("[data-edit-simulation]")) {
      state.simulationResultOpen = false;
      renderSimulation();
      root.focus({ preventScroll: true });
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
      state.simulationResultOpen = false;
      saveSchoolSelections();
      renderSimulation();
      return;
    }

    if (event.target.closest("[data-clear-school-simulation]")) {
      if (state.selectedSchool) {
        const key = state.selectedAdmissionYear ? `${state.selectedSchool.id}:${state.selectedAdmissionYear}` : state.selectedSchool.id;
        state.schoolSelections[key] = {};
      }
      state.simulationResultOpen = false;
      saveSchoolSelections();
      renderSimulation();
      showToast("이 학교의 과목 선택을 초기화했습니다.");
      return;
    }

    const simulationSchoolOption = event.target.closest("[data-simulation-school-id]");
    if (simulationSchoolOption && schoolStore) {
      simulationSchoolOption.disabled = true;
      const result = await schoolStore.selectSchool(simulationSchoolOption.dataset.simulationSchoolId);
      syncSchoolState(result);
      syncSchoolSimulationSubjects(true);
      state.subjectCategory = "전체";
      state.subjectPage = 1;
      render();
      const refreshedMenu = root.querySelector("[data-simulation-school-menu]");
      if (refreshedMenu) refreshedMenu.hidden = false;
      root.querySelector("[data-open-school-picker]")?.setAttribute("aria-expanded", "true");
      showToast(schoolAdmissionYears(state.selectedSchool).length
        ? `${state.selectedSchool?.name || "학교"}의 입학년도를 선택해 주세요.`
        : `${state.selectedSchool?.name || "학교"}에 등록된 편제표가 없습니다.`);
      return;
    }

    const simulationSchoolTrigger = event.target.closest("[data-open-school-picker]");
    if (simulationSchoolTrigger) {
      const menu = root.querySelector("[data-simulation-school-menu]");
      if (menu) {
        const willOpen = menu.hidden;
        menu.hidden = !willOpen;
        simulationSchoolTrigger.setAttribute("aria-expanded", String(willOpen));
        if (willOpen) requestAnimationFrame(() => menu.querySelector("[data-simulation-school-id]")?.focus());
      }
      return;
    }

    if (event.target.closest("[data-download-curriculum-template]")) {
      await downloadCurriculumTemplate();
      return;
    }

    const editCurriculumCourseMeta = event.target.closest("[data-edit-curriculum-course-meta]");
    if (editCurriculumCourseMeta) {
      const courseChip = editCurriculumCourseMeta.closest("[data-curriculum-course-drag]");
      const context = curriculumEditorContext(courseChip?.dataset.curriculumIndex, courseChip?.dataset.curriculumGrade, courseChip?.dataset.curriculumSemester);
      const courses = curriculumEditorCourseList(context, courseChip?.dataset.curriculumLane, courseChip?.dataset.curriculumOptionIndex);
      const course = courses?.[Number(courseChip?.dataset.courseIndex)];
      if (!course || !context) return;
      const metadataKey = curriculumCourseAliasKey(course);
      const currentMetadata = context.curriculum.courseMetadata?.[metadataKey] || {};
      const category = prompt("교과군을 입력하세요. (예: 국어, 수학, 사회, 과학)", currentMetadata.category || curriculumCourseReference(course)?.category || "");
      if (category === null) return;
      const type = prompt("과목 유형을 입력하세요. (공통, 일반, 진로, 융합, 전문)", currentMetadata.type || "");
      if (type === null) return;
      const normalizedType = uploadedCourseType(type);
      if (normalizedType && !["공통", "일반", "진로", "융합", "전문"].includes(normalizedType)) {
        showToast("과목 유형은 공통·일반·진로·융합·전문 중에서 입력해 주세요.");
        return;
      }
      if (!context.curriculum.courseMetadata) context.curriculum.courseMetadata = {};
      context.curriculum.courseMetadata[metadataKey] = uploadedCourseMetadataEntry(category, normalizedType);
      renderAdmin();
      return;
    }

    const editCurriculumCourse = event.target.closest("[data-edit-curriculum-course]");
    if (editCurriculumCourse) {
      const courseChip = editCurriculumCourse.closest("[data-curriculum-course-drag]");
      const context = curriculumEditorContext(courseChip?.dataset.curriculumIndex, courseChip?.dataset.curriculumGrade, courseChip?.dataset.curriculumSemester);
      const courses = curriculumEditorCourseList(context, courseChip?.dataset.curriculumLane, courseChip?.dataset.curriculumOptionIndex);
      const courseIndex = Number(courseChip?.dataset.courseIndex);
      const currentName = courses?.[courseIndex];
      if (!currentName) return;
      const enteredName = prompt("과목명을 수정하세요.", currentName);
      if (enteredName === null) return;
      const nextName = compactText(enteredName);
      if (!nextName) {
        showToast("과목명을 입력해 주세요.");
        return;
      }
      const canonicalName = curriculumCourseReference(nextName)?.name || nextName;
      const duplicate = courses.some((course, index) => index !== courseIndex && curriculumCourseAliasKey(course) === curriculumCourseAliasKey(canonicalName));
      if (duplicate) {
        showToast("같은 영역에 이미 있는 과목입니다.");
        return;
      }
      const previousMetadataKey = curriculumCourseAliasKey(currentName);
      const nextMetadataKey = curriculumCourseAliasKey(canonicalName);
      if (context.curriculum.courseMetadata?.[previousMetadataKey] && previousMetadataKey !== nextMetadataKey) {
        context.curriculum.courseMetadata[nextMetadataKey] = context.curriculum.courseMetadata[previousMetadataKey];
      }
      courses[courseIndex] = canonicalName;
      preparePendingCurriculumForEditing();
      renderAdmin();
      return;
    }

    const removeCurriculumCourse = event.target.closest("[data-remove-curriculum-course]");
    if (removeCurriculumCourse) {
      const courseChip = removeCurriculumCourse.closest("[data-curriculum-course-drag]");
      const context = curriculumEditorContext(courseChip?.dataset.curriculumIndex, courseChip?.dataset.curriculumGrade, courseChip?.dataset.curriculumSemester);
      const courses = curriculumEditorCourseList(context, courseChip?.dataset.curriculumLane, courseChip?.dataset.curriculumOptionIndex);
      const courseIndex = Number(courseChip?.dataset.courseIndex);
      if (!courses?.[courseIndex]) return;
      courses.splice(courseIndex, 1);
      preparePendingCurriculumForEditing();
      renderAdmin();
      return;
    }

    const addCurriculumCourse = event.target.closest("[data-add-curriculum-course]");
    if (addCurriculumCourse) {
      const context = curriculumEditorContext(addCurriculumCourse.dataset.curriculumIndex, addCurriculumCourse.dataset.curriculumGrade, addCurriculumCourse.dataset.curriculumSemester);
      const courses = curriculumEditorCourseList(context, addCurriculumCourse.dataset.curriculumLane, addCurriculumCourse.dataset.curriculumOptionIndex);
      if (!courses) return;
      const enteredName = prompt("추가할 과목명을 입력하세요.", "");
      if (enteredName === null) return;
      const nextName = compactText(enteredName);
      if (!nextName) {
        showToast("과목명을 입력해 주세요.");
        return;
      }
      const canonicalName = curriculumCourseReference(nextName)?.name || nextName;
      if (courses.some((course) => curriculumCourseAliasKey(course) === curriculumCourseAliasKey(canonicalName))) {
        showToast("같은 영역에 이미 있는 과목입니다.");
        return;
      }
      courses.push(canonicalName);
      preparePendingCurriculumForEditing();
      renderAdmin();
      return;
    }

    const addCurriculumOption = event.target.closest("[data-add-curriculum-option]");
    if (addCurriculumOption) {
      const context = curriculumEditorContext(addCurriculumOption.dataset.curriculumIndex, addCurriculumOption.dataset.curriculumGrade, addCurriculumOption.dataset.curriculumSemester);
      if (!context) return;
      const optionNumber = context.semester.options.length + 1;
      context.semester.options.push({
        id: `editor-${context.grade.grade}-${context.semester.semester}-${Date.now()}`,
        label: `옵션 ${optionNumber}`,
        choose: 1,
        courses: [],
        semester: context.semester.semester
      });
      preparePendingCurriculumForEditing();
      renderAdmin();
      return;
    }

    const removeCurriculumOption = event.target.closest("[data-remove-curriculum-option]");
    if (removeCurriculumOption) {
      const context = curriculumEditorContext(removeCurriculumOption.dataset.curriculumIndex, removeCurriculumOption.dataset.curriculumGrade, removeCurriculumOption.dataset.curriculumSemester);
      const optionIndex = Number(removeCurriculumOption.dataset.curriculumOptionIndex);
      const option = context?.semester.options[optionIndex];
      if (!option) return;
      if (option.courses.length && !confirm(`${option.label}과 그 안의 ${option.courses.length}개 과목을 미리보기에서 삭제할까요?`)) return;
      context.semester.options.splice(optionIndex, 1);
      preparePendingCurriculumForEditing();
      renderAdmin();
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
      let pendingCurricula;
      try {
        pendingCurricula = [...validatePendingCurriculumEdits()].sort((a, b) => a.admissionYear - b.admissionYear);
      } catch (error) {
        state.curriculumImportMessage = `수정 내용을 확인해 주세요. ${error.message}`;
        renderAdmin();
        showToast("편제표 수정 내용에 확인이 필요합니다.", 4500);
        return;
      }
      state.curriculumBusy = true;
      state.curriculumImportMessage = pendingCurricula.length > 1
        ? `Supabase에 ${pendingCurricula.length}개 입학년도 편제표를 저장하고 있습니다.`
        : "Supabase에 학교 편제표를 저장하고 있습니다.";
      renderAdmin();
      try {
        let result = null;
        const actions = [];
        for (const curriculum of pendingCurricula) {
          result = await schoolStore.publishCurriculum(curriculum);
          actions.push(result.action);
        }
        syncSchoolState(result);
        syncSchoolSimulationSubjects(true);
        state.pendingCurriculum = null;
        const updatedCount = actions.filter((action) => action === "updated").length;
        const actionLabel = pendingCurricula.length > 1
          ? `${pendingCurricula.length}개 입학년도 등록${updatedCount ? ` · ${updatedCount}개 수정` : ""}`
          : result.action === "updated" ? "수정" : "등록";
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
        syncSchoolSimulationSubjects(true);
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
    if (event.target.closest("[data-print-view], [data-pdf-view], [data-image-view]")) return;
    const card = event.target.closest(".course-record-card[data-record-index]");
    if (!card || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    openRecord(Number(card.dataset.recordIndex));
  });

  root.addEventListener("input", (event) => {
    if (event.target.matches("[data-recommend-department-search]")) {
      const value = event.target.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.recommendDepartmentSearch = value;
        renderRecommend();
        const input = root.querySelector("[data-recommend-department-search]");
        input?.focus();
        input?.setSelectionRange(value.length, value.length);
      }, 120);
    }
    if (event.target.matches("[data-department-search]")) {
      const value = event.target.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.departmentSearch = value;
        renderView();
        const input = root.querySelector("[data-department-search]");
        input?.focus();
        input?.setSelectionRange(value.length, value.length);
      }, 120);
    }
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
    const keywordForm = event.target.closest("[data-recommend-keyword-form]");
    if (keywordForm) {
      event.preventDefault();
      const value = compactText(new FormData(keywordForm).get("keyword"));
      if (!value) {
        showToast("관심 분야나 세부 진로 키워드를 입력해 주세요.");
        return;
      }
      if (state.recommendKeywords.length >= 3) {
        showToast("키워드는 최대 3개까지 입력할 수 있습니다.");
        return;
      }
      if (state.recommendKeywords.some((keyword) => normalizedCourseName(keyword) === normalizedCourseName(value))) {
        showToast("이미 입력한 키워드입니다.");
        return;
      }
      state.recommendKeywords = [...state.recommendKeywords, value];
      renderRecommend();
      requestAnimationFrame(() => root.querySelector("[data-recommend-keyword-form] input:not(:disabled)")?.focus());
      return;
    }
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
    if (event.target.matches("[data-curriculum-school-name]")) {
      const schoolName = compactText(event.target.value);
      pendingCurriculumItems().forEach((curriculum) => { curriculum.schoolName = schoolName; });
      if (state.pendingCurriculum) state.pendingCurriculum.schoolName = schoolName;
      preparePendingCurriculumForEditing();
      renderAdmin();
      return;
    }
    if (event.target.matches("[data-curriculum-region-edit]")) {
      const region = SCHOOL_REGIONS.includes(event.target.value) ? event.target.value : "";
      pendingCurriculumItems().forEach((curriculum) => { curriculum.region = region; });
      if (state.pendingCurriculum) state.pendingCurriculum.region = region;
      preparePendingCurriculumForEditing();
      renderAdmin();
      return;
    }
    if (event.target.matches("[data-curriculum-admission-year]")) {
      const curriculum = pendingCurriculumItems()[Number(event.target.dataset.curriculumIndex)];
      if (curriculum) curriculum.admissionYear = Number(event.target.value);
      preparePendingCurriculumForEditing();
      renderAdmin();
      return;
    }
    if (event.target.matches("[data-curriculum-option-label], [data-curriculum-option-choose]")) {
      const context = curriculumEditorContext(event.target.dataset.curriculumIndex, event.target.dataset.curriculumGrade, event.target.dataset.curriculumSemester);
      const option = context?.semester.options[Number(event.target.dataset.curriculumOptionIndex)];
      if (!option) return;
      if (event.target.matches("[data-curriculum-option-label]")) option.label = compactText(event.target.value);
      else option.choose = Number(event.target.value);
      preparePendingCurriculumForEditing();
      renderAdmin();
      return;
    }
    if (event.target.matches("[data-curriculum-input]") && event.target.files?.[0]) {
      const file = event.target.files[0];
      state.curriculumBusy = true;
      state.pendingCurriculum = null;
      state.curriculumImportMessage = "학교 편제표를 읽고 검증하고 있습니다.";
      renderAdmin();
      try {
        state.pendingCurriculum = await parseCurriculumFile(file);
        preparePendingCurriculumForEditing();
        const admissionCount = Array.isArray(state.pendingCurriculum.curricula) ? state.pendingCurriculum.curricula.length : 1;
        state.curriculumImportMessage = admissionCount > 1
          ? `자동 변환 완료: ${state.pendingCurriculum.academicYear}학년도 전학년 자료를 ${admissionCount}개 입학년도 편제표로 분리하고 ${state.pendingCurriculum.courseCount.toLocaleString("ko-KR")}개 교과를 확인했습니다.`
          : `검증 완료: ${state.pendingCurriculum.courseCount.toLocaleString("ko-KR")}개 교과와 학년별 옵션을 확인했습니다.`;
        showToast("학교 편제표 검증이 완료되었습니다.");
      } catch (error) {
        console.error("학교 편제표 분석 실패:", error);
        state.pendingCurriculum = null;
        state.curriculumImportMessage = "";
        const libraryUnavailable = !window.XLSX || /엑셀 도구를 불러오지 못했습니다/.test(error.message || "");
        showCurriculumAlert(
          libraryUnavailable ? "엑셀 분석 도구 연결 오류" : "편제표를 확인해 주세요",
          libraryUnavailable
            ? "업로드한 편제표의 문제가 아닙니다. 엑셀 분석 도구가 아직 로드되지 않았거나 외부 CDN 연결이 차단되었습니다. 인터넷 연결을 확인하고 페이지를 새로고침한 뒤 다시 업로드해 주세요."
            : error.message || "지원하는 편제표 형식인지 확인한 뒤 다시 업로드해 주세요."
        );
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

  root.addEventListener("dragstart", (event) => {
    const courseChip = event.target.closest("[data-curriculum-course-drag]");
    if (!courseChip) return;
    curriculumDragPayload = {
      curriculumIndex: Number(courseChip.dataset.curriculumIndex),
      grade: Number(courseChip.dataset.curriculumGrade),
      semester: Number(courseChip.dataset.curriculumSemester),
      lane: courseChip.dataset.curriculumLane,
      optionIndex: courseChip.dataset.curriculumOptionIndex === undefined ? "" : Number(courseChip.dataset.curriculumOptionIndex),
      courseIndex: Number(courseChip.dataset.courseIndex)
    };
    courseChip.classList.add("is-dragging");
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", JSON.stringify(curriculumDragPayload));
    }
  });

  root.addEventListener("dragover", (event) => {
    const dropzone = event.target.closest("[data-curriculum-course-dropzone]");
    if (!dropzone || !curriculumDragPayload) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    root.querySelectorAll(".curriculum-course-dropzone.is-drag-over").forEach((zone) => {
      if (zone !== dropzone) zone.classList.remove("is-drag-over");
    });
    dropzone.classList.add("is-drag-over");
  });

  root.addEventListener("dragleave", (event) => {
    const dropzone = event.target.closest("[data-curriculum-course-dropzone]");
    if (dropzone && !dropzone.contains(event.relatedTarget)) dropzone.classList.remove("is-drag-over");
  });

  root.addEventListener("drop", (event) => {
    const dropzone = event.target.closest("[data-curriculum-course-dropzone]");
    if (!dropzone || !curriculumDragPayload) return;
    event.preventDefault();
    const sourceContext = curriculumEditorContext(curriculumDragPayload.curriculumIndex, curriculumDragPayload.grade, curriculumDragPayload.semester);
    const sourceCourses = curriculumEditorCourseList(sourceContext, curriculumDragPayload.lane, curriculumDragPayload.optionIndex);
    const targetContext = curriculumEditorContext(dropzone.dataset.curriculumIndex, dropzone.dataset.curriculumGrade, dropzone.dataset.curriculumSemester);
    const targetCourses = curriculumEditorCourseList(targetContext, dropzone.dataset.curriculumLane, dropzone.dataset.curriculumOptionIndex);
    const sourceIndex = curriculumDragPayload.courseIndex;
    const course = sourceCourses?.[sourceIndex];
    if (!course || !targetCourses) return;
    const sameList = sourceCourses === targetCourses;
    if (!sameList && targetCourses.some((targetCourse) => curriculumCourseAliasKey(targetCourse) === curriculumCourseAliasKey(course))) {
      showToast("이동할 영역에 같은 과목이 이미 있습니다.");
      return;
    }
    const targetChip = event.target.closest("[data-curriculum-course-drag]");
    let targetIndex = targetChip && targetChip.closest("[data-curriculum-course-dropzone]") === dropzone
      ? Number(targetChip.dataset.courseIndex)
      : targetCourses.length;
    sourceCourses.splice(sourceIndex, 1);
    if (sameList && sourceIndex < targetIndex) targetIndex -= 1;
    targetCourses.splice(Math.max(0, targetIndex), 0, course);
    if (sourceContext.curriculum !== targetContext.curriculum) {
      const metadataKey = curriculumCourseAliasKey(course);
      const metadata = sourceContext.curriculum.courseMetadata?.[metadataKey];
      if (metadata) {
        if (!targetContext.curriculum.courseMetadata) targetContext.curriculum.courseMetadata = {};
        targetContext.curriculum.courseMetadata[metadataKey] = metadata;
      }
    }
    curriculumDragPayload = null;
    preparePendingCurriculumForEditing();
    renderAdmin();
  });

  root.addEventListener("dragend", () => {
    curriculumDragPayload = null;
    root.querySelectorAll(".curriculum-editor-course.is-dragging, .curriculum-course-dropzone.is-drag-over").forEach((element) => element.classList.remove("is-dragging", "is-drag-over"));
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
    const returnToRecommendMenu = event.target.closest("#record-dialog [data-return-recommend-menu]");
    if (returnToRecommendMenu) {
      state.recommendSection = "";
      state.recommendDepartmentId = "";
      openRecommendFieldDialog(state.recommendField);
      return;
    }

    const returnToRecommend = event.target.closest("#record-dialog [data-return-recommend-field]");
    if (returnToRecommend) {
      state.recommendSection = "departments";
      state.recommendDepartmentId = "";
      openRecommendFieldDialog(state.recommendField);
      return;
    }

    const recommendSection = event.target.closest("#record-dialog [data-recommend-section]");
    if (recommendSection) {
      state.recommendSection = recommendSection.dataset.recommendSection;
      state.recommendDepartmentId = "";
      openRecommendFieldDialog(state.recommendField);
      return;
    }

    const recommendDepartment = event.target.closest("#record-dialog [data-recommend-department]");
    if (recommendDepartment) {
      state.recommendDepartmentId = recommendDepartment.dataset.recommendDepartment;
      openDepartment(state.recommendDepartmentId, { fromRecommend: true });
      return;
    }

    const modalCompareToggle = event.target.closest("#record-dialog [data-compare-toggle]");
    if (modalCompareToggle) {
      const id = modalCompareToggle.dataset.compareToggle;
      const wasSelected = state.comparisonIds.includes(id);
      if (!toggleComparisonSelection(id)) return;
      renderComparisonHost();
      if (!wasSelected && state.comparisonIds.length === 2) openComparisonResult();
      else if (state.tab === "recommend" && state.recommendField) openRecommendFieldDialog(state.recommendField);
      return;
    }

    const comparisonChoice = event.target.closest("#record-dialog [data-comparison-choice]");
    if (comparisonChoice) {
      const id = comparisonChoice.dataset.comparisonChoice;
      const wasSelected = state.comparisonIds.includes(id);
      if (!toggleComparisonSelection(id)) return;
      renderComparisonHost();
      if (!wasSelected && state.comparisonIds.length === 2) openComparisonResult();
      else openComparisonPicker();
      return;
    }

    const comparisonFieldFilter = event.target.closest("#record-dialog [data-comparison-field-filter]");
    if (comparisonFieldFilter) {
      const panel = comparisonFieldFilter.closest(".comparison-search-panel");
      if (!panel) return;
      const field = comparisonFieldFilter.dataset.comparisonFieldFilter || "";
      panel.dataset.comparisonActiveField = field;
      panel.querySelectorAll("[data-comparison-field-filter]").forEach((button) => {
        const active = button === comparisonFieldFilter;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
      });
      applyComparisonChoiceFilter();
      return;
    }

    const comparisonRemoveSlot = event.target.closest("#record-dialog [data-comparison-remove-slot]");
    if (comparisonRemoveSlot) {
      const slot = Number(comparisonRemoveSlot.dataset.comparisonRemoveSlot);
      if (slot !== 0 && slot !== 1) return;
      state.comparisonIds = state.comparisonIds.filter((_, index) => index !== slot);
      state.comparisonOpen = false;
      renderComparisonHost();
      openComparisonPicker();
      return;
    }

    if (event.target.closest("#record-dialog [data-clear-comparison]")) {
      state.comparisonIds = [];
      state.comparisonOpen = false;
      renderComparisonHost();
      openComparisonPicker();
      return;
    }

    if (event.target.closest("#record-dialog [data-open-comparison-result]")) {
      openComparisonResult();
      return;
    }

    if (event.target.closest("#record-dialog [data-close-comparison]")) {
      state.comparisonOpen = false;
      openComparisonPicker();
      return;
    }

    const majorSubject = event.target.closest("[data-major-subject-universities]");
    if (majorSubject) {
      state.dialogDepartmentId = majorSubject.dataset.departmentId;
      state.dialogSubjectKind = majorSubject.dataset.subjectKind;
      state.dialogSubjectName = majorSubject.dataset.subjectName;
      openDepartment(state.dialogDepartmentId, { keepSubject: true });
      requestAnimationFrame(() => detailContent.querySelector(".university-reveal")?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
      return;
    }
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
    const schoolYearOption = event.target.closest(".header-school-picker [data-school-admission-year]");
    if (schoolYearOption && schoolStore) {
      schoolYearOption.disabled = true;
      try {
        const result = await schoolStore.selectAdmissionYear(Number(schoolYearOption.dataset.schoolAdmissionYear));
        syncSchoolState(result);
        syncSchoolSimulationSubjects(true);
        state.subjectCategory = "전체";
        state.subjectPage = 1;
        render();
        if (menu) menu.hidden = true;
        picker?.querySelector("[data-school-trigger]")?.setAttribute("aria-expanded", "false");
        showToast(`${state.selectedSchool?.name || "학교"} ${state.selectedAdmissionYear}학년도 입학생 편제표를 연결했습니다.`);
      } catch (error) {
        schoolYearOption.disabled = false;
        showToast(error.message || "입학년도 편제표를 불러오지 못했습니다.", 4500);
      }
      return;
    }
    const schoolOption = event.target.closest(".header-school-picker [data-school-id]");
    if (schoolOption && schoolStore) {
      schoolOption.disabled = true;
      const result = await schoolStore.selectSchool(schoolOption.dataset.schoolId);
      syncSchoolState(result);
      syncSchoolSimulationSubjects(true);
      state.subjectCategory = "전체";
      state.subjectPage = 1;
      render();
      if (menu) menu.hidden = false;
      picker?.querySelector("[data-school-trigger]")?.setAttribute("aria-expanded", "true");
      showToast(schoolAdmissionYears(state.selectedSchool).length
        ? `${state.selectedSchool?.name || "학교"}의 입학년도를 선택해 주세요.`
        : `${state.selectedSchool?.name || "학교"}에 등록된 편제표가 없습니다.`);
      return;
    }
    if (picker && !picker.contains(event.target) && menu) {
      menu.hidden = true;
      picker.querySelector("[data-school-trigger]")?.setAttribute("aria-expanded", "false");
    }
  });

  detailDialog.addEventListener("input", (event) => {
    const comparisonSearch = event.target.closest("[data-comparison-search]");
    if (!comparisonSearch) return;
    applyComparisonChoiceFilter();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const picker = document.querySelector(".header-school-picker");
    const menu = picker?.querySelector("[data-school-menu]");
    if (menu) menu.hidden = true;
    picker?.querySelector("[data-school-trigger]")?.setAttribute("aria-expanded", "false");
  });

  detailDialog.addEventListener("click", (event) => {
    if (event.target === detailDialog) detailDialog.close();
  });

  detailDialog.addEventListener("close", () => {
    const closedRecommendFlow = detailDialog.classList.contains("is-recommend-field-dialog") || state.dialogReturnToRecommend;
    const closedComparison = detailDialog.classList.contains("is-comparison-picker-dialog") || detailDialog.classList.contains("is-comparison-result-dialog");
    detailDialog.classList.remove("is-major-dialog", "is-recommend-field-dialog", "is-comparison-picker-dialog", "is-comparison-result-dialog", "is-department-common-dialog");
    if (closedComparison) {
      state.comparisonOpen = false;
      state.comparisonIds = [];
      renderComparisonHost();
    }
    state.dialogDepartmentId = "";
    state.dialogSubjectKind = "";
    state.dialogSubjectName = "";
    state.dialogRecordIndex = -1;
    state.dialogReturnToRecommend = false;
    if (closedRecommendFlow && state.tab === "recommend") {
      state.recommendField = "";
      state.recommendDepartmentId = "";
      state.recommendSection = "";
      renderRecommend();
    }
  });

  recommendNoticeDialog?.addEventListener("cancel", (event) => {
    event.preventDefault();
  });

  recommendNoticeDialog?.addEventListener("click", (event) => {
    if (!event.target.closest("[data-recommend-notice-confirm]")) return;
    state.recommendStep = 1;
    state.recommendMaxStep = 1;
    state.recommendField = "";
    state.recommendDepartmentId = "";
    state.recommendDepartmentIds = [];
    state.recommendDepartmentSearch = "";
    state.recommendKeywords = [];
    recommendNoticeDialog.close();
    renderRecommend();
    requestAnimationFrame(() => root.querySelector("[data-recommend-field]")?.focus({ preventScroll: true }));
  });

  curriculumAlertDialog?.addEventListener("click", (event) => {
    if (event.target === curriculumAlertDialog || event.target.closest("[data-curriculum-alert-close]")) {
      curriculumAlertDialog.close();
    }
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
    loadDepartmentDatabase,
    exportJson,
    resetDatabase,
    downloadCurriculumTemplate,
    parseCurriculumFile,
    normalizeCurriculumCourseNames: uniqueCourseNames,
    getCurriculumGrades: curriculumGrades,
    renderRecommend,
    recommendKeywordResults,
    recommendFinalGroups,
    getState: () => state
  };

  try {
    if (schoolStore) syncSchoolState(await schoolStore.init());
    await loadDatabase();
    await loadDepartmentDatabase();
    syncSchoolSimulationSubjects(false);
  } catch (error) {
    console.error("앱 초기화 실패:", error);
    state.notices = ["데이터베이스를 시작하지 못했습니다. 페이지를 새로고침해 주세요."];
  }
  render();
  const initialDepartmentDetail = pageParams.get("detail");
  if (initialDepartmentDetail && departmentById(initialDepartmentDetail)) {
    state.dialogSubjectKind = pageParams.get("subjectKind") || "";
    state.dialogSubjectName = pageParams.get("subject") || "";
    openDepartment(initialDepartmentDetail, { keepSubject: Boolean(state.dialogSubjectName) });
    if (state.dialogSubjectName) requestAnimationFrame(() => detailContent.querySelector(".university-reveal")?.scrollIntoView({ block: "nearest" }));
  }
  if (!initialDepartmentDetail && state.comparisonOpen && state.comparisonIds.length === 2) openComparisonResult();
  if (state.tab === "recommend" && recommendNoticeDialog && !recommendNoticeDialog.open) {
    requestAnimationFrame(() => recommendNoticeDialog.showModal());
  }
  state.notices.forEach((message) => showToast(message, 4500));
})();
