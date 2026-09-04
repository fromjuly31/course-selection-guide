const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function elementStub() {
  const classes = new Set();
  const listeners = new Map();
  return {
    innerHTML: "",
    textContent: "",
    open: false,
    hidden: false,
    classList: {
      add(...names) { names.forEach((name) => classes.add(name)); },
      remove(...names) { names.forEach((name) => classes.delete(name)); },
      toggle(name, force) {
        if (force === true) classes.add(name);
        else if (force === false) classes.delete(name);
        else if (classes.has(name)) classes.delete(name);
        else classes.add(name);
        return classes.has(name);
      },
      contains(name) { return classes.has(name); }
    },
    addEventListener(type, callback) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(callback);
    },
    async dispatchTestEvent(type, event) {
      for (const callback of listeners.get(type) || []) await callback(event);
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    setAttribute() {},
    removeAttribute() {},
    focus() {},
    close() { this.open = false; },
    showModal() { this.open = true; }
  };
}

const root = elementStub();
const detailDialog = elementStub();
const detailContent = elementStub();
const recommendNoticeDialog = elementStub();
const curriculumAlertDialog = elementStub();
const curriculumAlertTitle = elementStub();
const curriculumAlertMessage = elementStub();
const toast = elementStub();
const body = elementStub();

global.location = { search: "?tab=admin", href: "http://localhost/section.html?tab=admin" };
global.history = { replaceState() {} };
global.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {}, clear() {} };
global.requestAnimationFrame = (callback) => callback();
global.confirm = () => true;
global.prompt = () => null;
global.CustomEvent = class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } };

global.document = {
  body,
  title: "",
  querySelector(selector) {
    return ({
      "#app-root": root,
      "#record-dialog": detailDialog,
      "[data-record-dialog-content]": detailContent,
      "#recommend-notice-dialog": recommendNoticeDialog,
      "#curriculum-alert-dialog": curriculumAlertDialog,
      "#curriculum-alert-title": curriculumAlertTitle,
      "#curriculum-alert-message": curriculumAlertMessage,
      "[data-app-toast]": toast
    })[selector] || null;
  },
  querySelectorAll() { return []; },
  addEventListener() {},
  createElement() { return elementStub(); }
};

const dataset = {
  meta: {},
  columns: ["과목명", "교과군"],
  rows: [{ "과목명": "기술·가정", "교과군": "기술·가정" }]
};

global.window = {
  DatabaseStore: {
    getSettings() { return {}; },
    loadDatabase: async () => ({ database: dataset, notices: [] }),
    loadDepartmentDatabase: async () => ({ meta: {}, fields: [], departments: [] }),
    saveSettings() {}
  },
  SchoolStore: {
    regions: ["강원특별자치도"],
    isConfigured() { return true; },
    getSnapshot() { return {}; },
    init: async () => ({ schools: [], connection: "local" })
  },
  matchMedia: () => ({ matches: false }),
  addEventListener() {},
  dispatchEvent() {}
};

const rows = [
  ["2026학년도 입학생 3개년 교육과정 편제표", "테스트고등학교"],
  ["구분", "교과군", "과목유형", "과목명", "1학년", "", "2학년", "", "3학년", ""],
  ["", "", "", "", "1학기", "2학기", "1학기", "2학기", "1학기", "2학기"],
  ["공통", "국어", "공통", "공통 과목", 3, "", "", "", "", ""],
  ["학교 지정", "국어", "일반", "학교 지정 1", 3, "", "", "", "", ""],
  ["학생 선택", "예술", "진로", "음악 연주와 창작", "", "택１\n2", "", "", "", ""],
  ["학생 선택", "예술", "진로", "미술 창작", "", "", "", "", "", ""],
  ["학교 지정", "수학", "일반", "학교 지정 2", "", "", 3, "", "", ""],
  ["학생 선택", "과학", "진로", "물리학", "", "", "", "택 １", "", ""],
  ["학생 선택", "과학", "진로", "화학", "", "", "", "", "", ""],
  ["학교 지정", "영어", "일반", "3학년 미래 과목", "", "", "", "", 3, ""]
];

const workbook = {
  SheetNames: ["전학년 편제표"],
  Sheets: {
    "전학년 편제표": {
      _matrix: rows,
      "!merges": [
        { s: { r: 1, c: 4 }, e: { r: 1, c: 5 } },
        { s: { r: 1, c: 6 }, e: { r: 1, c: 7 } },
        { s: { r: 1, c: 8 }, e: { r: 1, c: 9 } },
        { s: { r: 5, c: 5 }, e: { r: 6, c: 5 } },
        { s: { r: 8, c: 7 }, e: { r: 9, c: 7 } }
      ]
    }
  }
};

const freshmanRows = [
  ["2025학년도 입학생 3개년 교육과정 편제(안)"],
  ["[자율형공립고] 원주고등학교"],
  ["구분", "교과영역", "교과(군)", "과목", "", "기준 학점", "운영 학점", "1학년", "", "2학년", "", "3학년", ""],
  ["", "", "", "구분", "과목", "", "", "1학기", "2학기", "1학기", "2학기", "1학기", "2학기"],
  ["학교지정", "기초", "국어", "공통", "공통국어1", 4, 4, 4, "", "", "", "", ""],
  ["학교지정", "기초", "국어", "공통", "공통국어2", 4, 4, "", "(4)", "", "", "", ""],
  ["학교지정", "기초", "국어", "일반", "문학", 4, 4, "", "", 4, "", "", ""],
  ["학생 선택 교육과정", "탐구", "과학", "일반", "★물리학", 4, 4, "", "", "", "택1(4)", "", ""],
  ["학생 선택 교육과정", "탐구", "과학", "일반", "★화학", 4, 4, "", "", "", "", "", ""],
  ["학교지정", "기초", "국어", "일반", "독서와 작문", 4, 4, "", "", "", "", 4, ""],
  ["학생 선택 교육과정", "탐구", "과학", "진로", "전자기와 양자", 4, 4, "", "", "", "", "", "택1(4)"],
  ["학생 선택 교육과정", "탐구", "과학", "진로", "화학 반응의 세계", 4, 4, "", "", "", "", "", ""]
];

const freshmanWorkbook = {
  SheetNames: ["2025 신입생"],
  Sheets: {
    "2025 신입생": {
      _matrix: freshmanRows,
      "!merges": [
        { s: { r: 2, c: 0 }, e: { r: 3, c: 0 } },
        { s: { r: 2, c: 3 }, e: { r: 2, c: 4 } },
        { s: { r: 2, c: 7 }, e: { r: 2, c: 8 } },
        { s: { r: 2, c: 9 }, e: { r: 2, c: 10 } },
        { s: { r: 2, c: 11 }, e: { r: 2, c: 12 } },
        { s: { r: 7, c: 10 }, e: { r: 8, c: 10 } },
        { s: { r: 10, c: 12 }, e: { r: 11, c: 12 } }
      ]
    }
  }
};

let activeWorkbook = workbook;

window.XLSX = {
  read() { return activeWorkbook; },
  utils: { sheet_to_json(sheet) { return sheet._matrix.map((row) => [...row]); } }
};

require(path.join(__dirname, "..", "app.js"));

async function main() {
  const schemaSql = fs.readFileSync(path.join(__dirname, "..", "supabase", "schema.sql"), "utf8");
  const draftInstallSql = fs.readFileSync(path.join(__dirname, "..", "supabase", "install-curriculum-drafts.sql"), "utf8");
  const schoolStoreSource = fs.readFileSync(path.join(__dirname, "..", "school-data.js"), "utf8");
  const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  const appDataSource = fs.readFileSync(path.join(__dirname, "..", "app-data.js"), "utf8");
  const appCss = fs.readFileSync(path.join(__dirname, "..", "app.css"), "utf8");
  const sectionHtml = fs.readFileSync(path.join(__dirname, "..", "section.html"), "utf8");
  assert.match(schemaSql, /create table if not exists public\.curriculum_drafts/);
  assert.match(schemaSql, /unique \(updated_by, region, school_name\)/);
  assert.match(schemaSql, /platform users read own curriculum drafts/);
  assert.match(draftInstallSql, /create table if not exists public\.curriculum_drafts/);
  assert.match(draftInstallSql, /notify pgrst, 'reload schema'/);
  assert.match(schoolStoreSource, /async function loadCurriculumDraft/);
  assert.match(schoolStoreSource, /async function saveCurriculumDraft/);
  assert.match(schoolStoreSource, /async function loadCurriculumForCopy/);
  assert.match(schoolStoreSource, /saveLocalCurriculumDraft/);
  assert.match(schoolStoreSource, /isMissingCurriculumDraftTableError\(error\).*saveLocalCurriculumDraft/s);
  assert.match(schoolStoreSource, /function selectionStorage\(\) \{\s*return window\.sessionStorage/);
  assert.match(schoolStoreSource, /async function selectSchoolAdmissionYear/);
  assert.match(appSource, /function refreshSubjectSearchInPlace/);
  assert.match(appSource, /function refreshDepartmentSearchInPlace/);
  assert.match(appSource, /function refreshRecommendDepartmentSearchInPlace/);
  assert.match(appSource, /function refreshPreviewSearchInPlace/);
  const recommendResultEntrySource = appSource.match(/function recommendResultEntryMarkup\(entry\) \{[\s\S]*?\n  \}/)?.[0] || "";
  assert.match(recommendResultEntrySource, /data-recommend-course=/);
  assert.match(recommendResultEntrySource, /aria-haspopup="dialog"/);
  assert.doesNotMatch(recommendResultEntrySource, /section\.html\?tab=subjects/);
  assert.match(appSource, /const recommendCourse = event\.target\.closest\("\[data-recommend-course\]"\)/);
  assert.match(appSource, /await Promise\.all\(\[loadDatabase\(\), loadDepartmentDatabase\(\)\]\)/);
  assert.match(appSource, /const allSelectionsComplete = historyComplete && progress\.complete/);
  assert.match(appSource, /const accessible = allSelectionsComplete \|\| gradeProgress\.grade <= state\.simulationMaxGradeStep \|\| state\.simulationResultUnlocked/);
  assert.match(appSource, /state\.simulationMaxGradeStep = Math\.max\(firstGrade, state\.simulationMaxGradeStep\)/);
  assert.match(appSource, /state\.simulationResultUnlocked = true;\s*state\.simulationHistoryOpen = false;\s*state\.simulationResultOpen = true/);
  assert.match(appSource, /const descendantBottom = isSimulation/);
  assert.match(appSource, /measuredHeight \* 1\.02 \+ 6/);
  assert.match(appSource, /printablePageHeight = Math\.ceil\(contentWidth \* \(206 \/ 293\)\)/);
  assert.match(appDataSource, /INDEXED_DB_OPEN_TIMEOUT = 2500/);
  assert.match(appDataSource, /fetchWithTimeout/);
  assert.match(appDataSource, /STATIC_DATA_VERSION = "20260905-2"/);
  assert.match(appSource, /"success",\s*closeCurriculumPreview\s*\)/);
  assert.match(appSource, /if \(confirmAction\) await confirmAction\(\)/);
  assert.doesNotMatch(appSource, /기이수 과목/);
  assert.match(appSource, /data-semester-lock-info/);
  assert.doesNotMatch(appSource, /semester-lock-notice/);
  assert.match(appCss, /\.course-group-grid\.is-live-search-results/);
  assert.match(appCss, /\.major-field-grid\.is-live-search-results/);
  assert.match(appCss, /\.semester-lock-hit-area/);
  assert.match(appCss, /\.semester-curriculum-section \.curriculum-option-card header > span[\s\S]*?font-size: 12px/);
  assert.match(appCss, /\.simulation-selection-summary > \.simulation-grade-actions[\s\S]*?justify-content: flex-end/);
  assert.match(appCss, /\.simulation-grade-actions \.simulation-final-open[\s\S]*?min-width: 180px/);
  assert.match(appCss, /@page[\s\S]*?margin: 2mm/);
  assert.match(appCss, /body\.is-platform-print-measuring \.platform-print-root[\s\S]*?width: 293mm/);
  assert.match(appCss, /\.platform-print-sheet-svg[\s\S]*?height: 206mm/);
  assert.match(appCss, /\.platform-print-root \.simulation-final-summary h1[\s\S]*?font-size: 16pt/);
  assert.match(appCss, /\.platform-print-root \.simulation-final-summary > div[\s\S]*?justify-content: space-between/);
  assert.match(appCss, /\.platform-print-root \.simulation-final-course-group li[\s\S]*?font-size: 8pt/);
  assert.match(appCss, /@media \(max-width: 820px\)[\s\S]*?\.simulation-grade-progress[\s\S]*?display: flex/);
  assert.match(appCss, /\.common-course-block\.semester-subject-block,[\s\S]*?\.semester-elective-block\.semester-subject-block[\s\S]*?flex-direction: column/);
  assert.match(appCss, /\.recommend-result-course-items > button/);
  assert.match(appCss, /\.school-upload-card \.curriculum-format-notice span[\s\S]*?font-size: 13px/);
  assert.match(appCss, /\.connected-schools-card \.school-admission-year-options button[\s\S]*?min-height: 42px/);
  assert.match(appSource, /const padding = 10/);
  assert.match(appSource, /sheet\.setAttribute\("preserveAspectRatio", "xMidYMin meet"\)/);
  assert.match(appSource, /const simulationCourse = event\.target\.closest\("\[data-simulation-course\]"\)/);
  assert.match(appSource, /data-simulation-course=/);
  assert.doesNotMatch(appSource, /section\.html\?tab=subjects&q=\$\{encodeURIComponent\(entry\.name\)\}/);
  assert.match(sectionHtml, /data-header-school-search/);
  assert.match(sectionHtml, /<dialog class="header-school-menu school-picker-dialog"/);
  assert.match(sectionHtml, /data-school-picker-label>미선택/);
  assert.match(sectionHtml, /app\.js\?v=20260905-3/);
  assert.match(sectionHtml, /data-nav-href="section\.html\?tab=recommend&amp;v=20260905-3"/);
  assert.doesNotMatch(sectionHtml, /DATA IMPORT NOTICE/);

  for (let index = 0; index < 20 && !window.DatabaseApp; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.ok(window.DatabaseApp, "앱 테스트 API가 초기화되어야 합니다.");
  const state = window.DatabaseApp.getState();

  root.innerHTML = '<div class="initial-loading">데이터베이스를 불러오고 있습니다.</div>';
  state.tab = "recommend";
  recommendNoticeDialog.open = true;
  await recommendNoticeDialog.dispatchTestEvent("click", {
    target: {
      closest(selector) { return selector === "[data-recommend-notice-confirm]" ? this : null; }
    }
  });
  assert.equal(recommendNoticeDialog.open, false);
  assert.match(root.innerHTML, /class="recommend-wizard"/);
  assert.doesNotMatch(root.innerHTML, /데이터베이스를 불러오고 있습니다/);

  const normalized = window.DatabaseApp.normalizeCurriculumCourseNames(["기술· 가정", "기술･가정"]);
  assert.deepEqual(normalized, ["기술·가정"]);
  assert.equal(window.DatabaseApp.normalizeData("기술･가정", "과목명"), "기술·가정");
  assert.deepEqual(
    window.DatabaseApp.sortCurriculumCoursesByGroup(
      ["음악", "정보", "공통수학1", "생명과학", "문학", "영어", "통합사회", "기술·가정"],
      {
        음악: { category: "예술" },
        정보: { category: "정보" },
        공통수학1: { category: "수학" },
        생명과학: { category: "과학" },
        문학: { category: "국어" },
        영어: { category: "영어" },
        통합사회: { category: "사회(역사/도덕 포함)" },
        기술가정: { category: "기술·가정" }
      }
    ),
    ["문학", "공통수학1", "영어", "통합사회", "생명과학", "음악", "기술·가정", "정보"]
  );
  assert.deepEqual(
    ["정보", "과학", "교양", "영어", "수학", "국어", "미분류"]
      .sort((a, b) => window.DatabaseApp.courseGroupOrderIndex(a) - window.DatabaseApp.courseGroupOrderIndex(b)),
    ["국어", "수학", "영어", "과학", "정보", "교양", "미분류"]
  );

  const result = await window.DatabaseApp.parseCurriculumFile({
    name: "2026학년도_신입생_3개년.xlsx",
    arrayBuffer: async () => new ArrayBuffer(0)
  });
  assert.deepEqual(result.curricula.map((item) => item.admissionYear), [2026]);
  assert.deepEqual(result.curricula[0].grades.map((grade) => grade.grade), [1, 2, 3]);

  const grade1 = result.curricula[0].grades[0];
  assert.deepEqual(grade1.semesters[0].common, ["공통 과목", "학교 지정 1"]);
  assert.equal(grade1.semesters[1].options[0].choose, 1);
  assert.deepEqual(grade1.semesters[1].options[0].courses, ["음악 연주와 창작", "미술 창작"]);
  const grade2 = result.curricula[0].grades[1];
  assert.deepEqual(grade2.semesters[0].common, ["학교 지정 2"]);
  assert.deepEqual(grade2.semesters[0].designated, []);
  assert.equal(grade2.semesters[1].options[0].choose, 1);
  assert.deepEqual(grade2.semesters[1].options[0].courses, ["물리학", "화학"]);
  assert.deepEqual(result.curricula[0].grades[2].semesters[0].common, ["3학년 미래 과목"]);

  activeWorkbook = freshmanWorkbook;
  const freshmanResult = await window.DatabaseApp.parseCurriculumFile({
    name: "2025학년도 신입생 3개년 교육과정 편제표.xlsx",
    arrayBuffer: async () => new ArrayBuffer(0)
  });
  activeWorkbook = workbook;
  assert.equal(freshmanResult.curricula[0].schoolName, "원주고등학교");
  assert.equal(freshmanResult.curricula[0].admissionYear, 2025);
  assert.deepEqual(freshmanResult.curricula[0].grades.map((grade) => grade.grade), [1, 2, 3]);
  assert.deepEqual(freshmanResult.curricula[0].grades[0].semesters[0].common, ["공통국어1"]);
  assert.deepEqual(freshmanResult.curricula[0].grades[1].semesters[0].common, ["문학"]);
  assert.deepEqual(freshmanResult.curricula[0].grades[1].semesters[1].options[0].courses, ["물리학", "화학"]);
  assert.equal(freshmanResult.curricula[0].grades[1].semesters[1].options[0].choose, 1);
  assert.deepEqual(freshmanResult.curricula[0].grades[2].semesters[0].common, ["독서와 작문"]);
  assert.deepEqual(freshmanResult.curricula[0].grades[2].semesters[1].options[0].courses, ["전자기와 양자", "화학 반응의 세계"]);
  const batchFiles = [2026, 2025, 2024].map((year) => ({ name: `${year}학년도 신입생.xlsx` }));
  const batchImports = [2026, 2025, 2024].map((year) => {
    const parsed = JSON.parse(JSON.stringify(freshmanResult));
    parsed.curricula[0].admissionYear = year;
    parsed.curricula[0].sourceAdmissionYear = year;
    return parsed;
  });
  const batchResult = window.DatabaseApp.combineFreshmanCurriculumImports(batchFiles, batchImports);
  assert.deepEqual(batchResult.curricula.map((curriculum) => curriculum.admissionYear), [2026, 2025, 2024]);
  assert.equal(batchResult.sourceFileNames.length, 3);
  const singleYearResult = window.DatabaseApp.combineFreshmanCurriculumImports([batchFiles[0]], [batchImports[0]]);
  assert.deepEqual(singleYearResult.curricula.map((curriculum) => curriculum.admissionYear), [2026]);
  assert.equal(singleYearResult.sourceFileNames.length, 1);
  assert.equal(
    window.DatabaseApp.localizedAccessError(new Error("Invalid login credentials"), "admin"),
    "관리자 이메일 또는 비밀번호가 올바르지 않습니다. 입력한 정보를 다시 확인해 주세요."
  );
  assert.equal(
    window.DatabaseApp.localizedAccessError(new Error("Invalid login credentials"), "teacher"),
    "등록 비밀번호가 올바르지 않습니다. 비밀번호를 다시 확인해 주세요."
  );
  assert.doesNotMatch(
    window.DatabaseApp.localizedAccessError(new Error("Unexpected authentication backend failure"), "admin"),
    /[A-Za-z]{3,}/
  );

  const simulationPrintMarkup = window.DatabaseApp.platformPrintDocumentMarkup({
    kind: "simulation",
    title: "원주여자고등학교 수강 과목표",
    subtitle: "2026년 입학생 기준",
    body: "<section><h1>원주여자고등학교 수강 과목표</h1></section>"
  });
  assert.match(simulationPrintMarkup, /is-simulation-print/);
  assert.match(simulationPrintMarkup, /<h1>원주여자고등학교 수강 과목표<\/h1>/);
  assert.doesNotMatch(simulationPrintMarkup, /platform-print-brand/);
  assert.doesNotMatch(simulationPrintMarkup, /platform-print-footer/);
  const standardPrintMarkup = window.DatabaseApp.platformPrintDocumentMarkup({ title: "과목 안내", subtitle: "테스트", body: "<section>본문</section>" });
  assert.match(standardPrintMarkup, /platform-print-brand/);
  assert.match(standardPrintMarkup, /platform-print-footer/);
  state.schools = [
    { id: "seoul-na", name: "나래고등학교", region: "서울특별시", admissionYears: [2026] },
    { id: "gyeonggi", name: "하늘고등학교", region: "경기도", admissionYears: [2026] },
    { id: "seoul-ga", name: "가람고등학교", region: "서울특별시", admissionYears: [2026] }
  ];
  state.tab = "admin";
  state.pendingCurriculum = null;
  window.DatabaseApp.renderAdmin();
  assert.match(root.innerHTML, /data-open-connected-school-list/);
  assert.match(root.innerHTML, /3개 학교/);
  assert.doesNotMatch(root.innerHTML, /하늘고등학교/);

  state.tab = "simulation";
  state.simulationSchoolSearch = "서울";
  window.DatabaseApp.renderSimulation();
  assert.match(root.innerHTML, /data-simulation-school-search/);
  assert.match(root.innerHTML, /가람고등학교/);
  assert.match(root.innerHTML, /나래고등학교/);
  assert.doesNotMatch(root.innerHTML, /하늘고등학교/);
  assert.ok(root.innerHTML.indexOf("가람고등학교") < root.innerHTML.indexOf("나래고등학교"));

  state.tab = "admin";
  state.simulationSchoolSearch = "";
  state.pendingCurriculum = result;
  window.DatabaseApp.renderAdmin();
  assert.match(root.innerHTML, /curriculum-preview-overlay/);
  assert.match(root.innerHTML, /data-curriculum-region-toggle/);
  assert.match(root.innerHTML, /2026년 입학생/);
  assert.match(root.innerHTML, /공통·학교 지정과목/);
  assert.match(root.innerHTML, /COMMON · SCHOOL DESIGNATED/);
  assert.match(root.innerHTML, /공통·학교 지정 과목/);
  assert.match(root.innerHTML, /선택 과목을 추가하세요\./);
  assert.doesNotMatch(root.innerHTML, /과목을 이곳에 끌어 놓으세요\./);
  assert.match(root.innerHTML, /data-curriculum-preview-grade/);
  assert.doesNotMatch(root.innerHTML, /표준 양식 다운로드/);
  assert.match(root.innerHTML, /curriculum-entry-methods/);
  assert.match(root.innerHTML, /직접 등록/);
  assert.match(root.innerHTML, /신입생 편제표 업로드/);
  assert.match(root.innerHTML, /전학년 편제표가 아닌 신입생 편제표를 업로드하세요/);
  assert.match(root.innerHTML, /data-create-blank-curriculum><span>[\s\S]*icons\.svg#pencil[\s\S]*<\/span><strong>직접 등록<\/strong><small>/);
  assert.match(root.innerHTML, /data-request-curriculum-upload/);
  assert.match(root.innerHTML, /data-open-admin-login/);
  assert.doesNotMatch(root.innerHTML, /school-access-login/);
  assert.ok(root.innerHTML.indexOf("curriculum-entry-methods") < root.innerHTML.indexOf("curriculum-format-notice"));
  const previewNavigation = root.innerHTML.match(/<nav class="curriculum-preview-pages"[\s\S]*?<\/nav>/)?.[0] || "";
  assert.doesNotMatch(root.innerHTML, /data-curriculum-region-edit/);

  state.pendingCurriculum = window.DatabaseApp.createBlankCurriculumImport();
  window.DatabaseApp.renderAdmin();
  assert.match(root.innerHTML, /CURRICULUM EDITOR/);
  assert.doesNotMatch(root.innerHTML, /유연 분석 결과를 확인하세요/);
  assert.doesNotMatch(root.innerHTML, /<header><div>[\s\S]*?<\/div><span>직접 작성<\/span><\/header>/);
  assert.match(root.innerHTML, /data-curriculum-semester-editor/);
  assert.match(root.innerHTML, /data-save-curriculum-draft/);
  assert.ok(root.innerHTML.indexOf("curriculum-region-field") < root.innerHTML.indexOf("data-curriculum-school-name"));
  assert.match(root.innerHTML, /school-name-affix[\s\S]*?<b>고등학교<\/b>/);
  assert.match(root.innerHTML, /다른 입학년도 편제 불러오기/);

  state.pendingCurriculum = null;
  state.schoolUser = null;
  state.accessRole = "";
  await root.dispatchTestEvent("click", {
    target: {
      closest(selector) { return selector === "[data-create-blank-curriculum]" ? this : null; },
      matches() { return false; }
    }
  });
  assert.equal(state.pendingCurriculum, null);
  assert.equal(state.schoolAuthDialogMode, "teacher");
  assert.equal(state.pendingCurriculumAction, "manual");

  state.schoolAuthDialogMode = "teacher";
  state.pendingCurriculumAction = "upload";
  state.schoolAuthStep = 1;
  window.DatabaseApp.renderAdmin();
  assert.match(root.innerHTML, /school-auth-overlay/);
  assert.match(root.innerHTML, /data-teacher-password-form/);
  assert.match(root.innerHTML, /등록 비밀번호 확인/);
  assert.match(root.innerHTML, /등록 비밀번호/);
  assert.doesNotMatch(root.innerHTML, /학교명/);
  assert.doesNotMatch(root.innerHTML, /data-auth-curriculum-file/);
  assert.match(root.innerHTML, /비밀번호 확인 후 다음/);
  state.schoolAuthStep = 2;
  state.schoolAuthSchoolName = "테스트고등학교";
  window.DatabaseApp.renderAdmin();
  assert.match(root.innerHTML, /data-teacher-school-form/);
  assert.match(root.innerHTML, /지역과 학교명 입력/);
  assert.ok(root.innerHTML.indexOf("data-school-auth-region-toggle") < root.innerHTML.indexOf('name="schoolName"'));
  assert.match(root.innerHTML, /data-school-auth-region-option/);
  assert.match(root.innerHTML, /name="schoolName"/);
  assert.match(root.innerHTML, /name="schoolName" value="테스트"/);
  assert.match(root.innerHTML, /name="region"/);
  assert.match(root.innerHTML, /school-name-affix[\s\S]*?<b>고등학교<\/b>/);
  assert.doesNotMatch(root.innerHTML, /name="password"/);
  assert.match(root.innerHTML, /마지막 임시저장본을 먼저 불러옵니다/);
  state.schoolAuthStep = 3;
  window.DatabaseApp.renderAdmin();
  assert.match(root.innerHTML, /data-teacher-upload-form/);
  assert.match(root.innerHTML, /신입생 편제표 선택/);
  assert.match(root.innerHTML, /data-auth-curriculum-file/);
  assert.match(root.innerHTML, /multiple/);
  assert.match(root.innerHTML, /선택한 편제표 분석 시작/);
  assert.match(root.innerHTML, /신입생 편제표 1~3개/);
  state.schoolAuthDialogMode = "";
  state.schoolAuthStep = 1;
  state.pendingCurriculumAction = "";

  const blank = window.DatabaseApp.createBlankCurriculumImport();
  assert.deepEqual(blank.curricula[0].grades.map((grade) => grade.grade), [1, 2, 3]);
  assert.deepEqual(blank.curricula[1].grades.map((grade) => grade.grade), [1, 2, 3]);
  assert.equal(window.DatabaseApp.schoolNamePrefix("우리고등학교"), "우리");
  assert.equal(window.DatabaseApp.completeSchoolName("우리"), "우리고등학교");
  assert.equal(window.DatabaseApp.completeSchoolName("우리고등학교"), "우리고등학교");

  const copiedCurriculum = JSON.parse(JSON.stringify(blank.curricula[1]));
  const copiedAdmissionYear = copiedCurriculum.admissionYear;
  assert.equal(window.DatabaseApp.copyCurriculumStructure(copiedCurriculum, result.curricula[0]), true);
  assert.equal(copiedCurriculum.admissionYear, copiedAdmissionYear);
  assert.deepEqual(copiedCurriculum.grades, result.curricula[0].grades);

  state.pendingCurriculum = blank;
  curriculumAlertDialog.close();
  await root.dispatchTestEvent("click", {
    target: {
      closest(selector) { return selector === "[data-publish-curriculum]" ? this : null; },
      matches() { return false; }
    }
  });
  assert.equal(curriculumAlertDialog.open, true);
  assert.equal(curriculumAlertTitle.textContent, "등록 전 확인할 항목이 있습니다");
  assert.match(curriculumAlertMessage.textContent, /2026년 입학생 편제표에 과목이 없습니다/);
  assert.doesNotMatch(curriculumAlertMessage.textContent, /2025년 입학생 편제표에 과목이 없습니다/);
  curriculumAlertDialog.close();

  window.DatabaseApp.copyCurriculumStructure(blank.curricula[0], result.curricula[0]);
  state.curriculumPreviewIndex = 1;
  state.schoolUser = { id: "teacher-test" };
  state.accessRole = "teacher";
  window.DatabaseApp.renderAdmin();
  assert.match(root.innerHTML, /value="pending:0">2026년 입학생 · 현재 작성 중/);
  assert.match(root.innerHTML, /현재 열린 2025년 입학생 편제표 한 건만 등록됩니다/);
  const curriculumCopySelect = { value: "pending:0", selectedOptions: [{ textContent: "2026년 입학생 · 현재 작성 중" }] };
  const curriculumCopyTools = { querySelector() { return curriculumCopySelect; } };
  const curriculumCopyButton = {
    dataset: { curriculumIndex: "1" },
    disabled: false,
    textContent: "편제 불러오기",
    closest(selector) {
      if (selector === "[data-copy-curriculum-year]") return this;
      if (selector === ".curriculum-copy-tools") return curriculumCopyTools;
      return null;
    },
    matches() { return false; }
  };
  await root.dispatchTestEvent("click", { target: curriculumCopyButton, preventDefault() {} });
  assert.deepEqual(blank.curricula[1].grades, blank.curricula[0].grades);
  assert.equal(blank.curricula[1].admissionYear, 2025);

  state.pendingCurriculum = result;
  state.curriculumCoursePicker = {
    curriculumIndex: 0,
    grade: 2,
    semester: 1,
    lane: "common",
    optionIndex: "",
    title: "공통·학교 지정과목",
    selectedKeys: []
  };
  window.DatabaseApp.renderAdmin();
  assert.match(root.innerHTML, /curriculum-course-picker-overlay/);
  assert.match(root.innerHTML, /과목을 한꺼번에 선택하세요/);
  assert.match(root.innerHTML, /기술·가정/);
  assert.doesNotMatch(root.innerHTML, /data-curriculum-custom-course-form/);

  state.curriculumCoursePicker.lane = "standalone";
  state.curriculumCoursePicker.title = "개별 선택 과목";
  window.DatabaseApp.renderAdmin();
  assert.match(root.innerHTML, /data-toggle-curriculum-custom-course/);
  assert.match(root.innerHTML, /＋ 직접 추가/);
  assert.doesNotMatch(root.innerHTML, /data-curriculum-custom-course-form/);
  assert.ok(root.innerHTML.indexOf("data-toggle-curriculum-custom-course") < root.innerHTML.indexOf("data-confirm-curriculum-course-picker"));

  state.curriculumCoursePicker.customEntryOpen = true;
  window.DatabaseApp.renderAdmin();
  assert.match(root.innerHTML, /data-curriculum-custom-course-form/);
  assert.match(root.innerHTML, /고시 외 과목.*분류됩니다/);
  assert.match(root.innerHTML, /<button type="submit">저장<\/button>/);

  const customCourseInput = { value: "학교자율탐구", focus() {}, select() {} };
  const customCourseForm = {
    querySelector(selector) { return selector === "input[name='customCourse']" ? customCourseInput : null; },
    closest(selector) { return selector === "[data-curriculum-custom-course-form]" ? this : null; }
  };
  await root.dispatchTestEvent("submit", { target: customCourseForm, preventDefault() {} });
  assert.deepEqual(state.curriculumCoursePicker.customCourses, ["학교자율탐구"]);
  assert.equal(state.curriculumCoursePickerCategory, "고시 외 과목");
  assert.equal(state.curriculumCoursePicker.customEntryOpen, false);

  const confirmCustomCourse = {
    closest(selector) { return selector === "[data-confirm-curriculum-course-picker]" ? this : null; },
    matches() { return false; }
  };
  await root.dispatchTestEvent("click", { target: confirmCustomCourse, preventDefault() {} });
  assert.ok(result.curricula[0].grades[1].semesters[0].standalone.includes("학교자율탐구"));
  assert.ok(Object.values(result.curricula[0].courseMetadata).some((metadata) => metadata.category === "고시 외 과목"));

  state.curriculumCoursePicker = null;
  state.selectedSchool = { id: "test-school", name: "테스트고등학교", region: "강원특별자치도" };
  state.selectedAdmissionYear = 2026;
  state.curriculum = result.curricula[0];
  state.curriculum.id = "curriculum-test-id";
  state.schoolUser = { id: "admin-test", email: "admin@example.com" };
  state.accessRole = "admin";
  window.DatabaseApp.renderAdmin();
  assert.match(root.innerHTML, /편제표 열어 수정/);
  assert.match(root.innerHTML, /data-delete-curriculum/);
  assert.match(root.innerHTML, /data-delete-school/);
  assert.match(root.innerHTML, /강원특별자치도 · 2026년 입학생/);
  assert.match(root.innerHTML, /편제표 연동됨/);
  assert.match(root.innerHTML, /2026년 입학생/);

  state.simulationHistoryOpen = true;
  window.DatabaseApp.renderSimulation();
  assert.match(root.innerHTML, /<h2>수강 완료 과목<\/h2>/);
  assert.match(root.innerHTML, /실제로 수강한 과목이 맞는지 확인하세요\./);
  assert.doesNotMatch(root.innerHTML, /STEP 01 · COMPLETED CURRICULUM/);
  assert.doesNotMatch(root.innerHTML, /지금까지의 공통·지정과목과 선택 내역/);
  assert.match(root.innerHTML, /공통·학교 지정과목/);
  assert.match(root.innerHTML, /STUDENT ELECTIVES/);
  assert.match(root.innerHTML, /<h3>선택 과목<\/h3>/);
  assert.match(root.innerHTML, /수강 완료 과목/);
  assert.doesNotMatch(root.innerHTML, /기이수/);
  assert.match(root.innerHTML, /공통 과목/);
  assert.match(root.innerHTML, /다음 · 2학년 선택/);
  assert.doesNotMatch(root.innerHTML, /1학년 과목 확인/);

  state.simulationHistoryOpen = false;
  state.simulationResultOpen = true;
  window.DatabaseApp.renderSimulation();
  assert.match(root.innerHTML, /COMPLETED COURSES/);
  assert.match(root.innerHTML, /<h2>수강 완료 과목<\/h2>/);
  assert.doesNotMatch(root.innerHTML, /현재까지 들은 과목/);

  state.selectedAdmissionYear = 2025;
  state.curriculum = freshmanResult.curricula[0];
  state.simulationHistoryOpen = true;
  window.DatabaseApp.renderSimulation();
  assert.match(root.innerHTML, /실제로 수강한 과목이 맞는지 확인하세요\./);
  assert.match(root.innerHTML, /다음 · 3학년 선택/);
  assert.doesNotMatch(root.innerHTML, /다음 · 2학년 선택/);

  curriculumAlertDialog.close();
  const lockedSemesterTarget = {
    closest(selector) { return selector === "[data-semester-lock-info]" ? this : null; },
    matches() { return false; }
  };
  await root.dispatchTestEvent("click", { target: lockedSemesterTarget });
  assert.equal(curriculumAlertDialog.open, true);
  assert.equal(curriculumAlertTitle.textContent, "2학기는 아직 선택할 수 없습니다");
  assert.match(curriculumAlertMessage.textContent, /1학기 선택을 완료하면 2학기 선택 옵션이 열립니다/);
  await curriculumAlertDialog.dispatchTestEvent("click", {
    target: { closest(selector) { return selector === "[data-curriculum-alert-close]" ? this : null; } }
  });
  assert.equal(curriculumAlertDialog.open, false);

  const commonDisclosure = window.DatabaseApp.departmentCommonDisclosureMarkup({
    name: "인문",
    commonSubjects: [{ name: "공통국어1" }, { name: "공통영어1" }]
  });
  assert.match(commonDisclosure, /department-common-click/);
  assert.match(commonDisclosure, /C L I C K/);

  detailDialog.close();
  const recommendedCourseName = dataset.rows[0][dataset.columns[0]];
  await root.dispatchTestEvent("click", {
    target: {
      dataset: { recommendCourse: recommendedCourseName },
      closest(selector) { return selector === "[data-recommend-course]" ? this : null; },
      matches() { return false; }
    }
  });
  assert.equal(detailDialog.open, true);
  assert.equal(detailDialog.classList.contains("is-course-dialog"), true);
  assert.match(detailContent.innerHTML, /course-dialog-sections/);

  detailDialog.close();
  state.tab = "simulation";
  state.simulationResultOpen = true;
  await root.dispatchTestEvent("click", {
    target: {
      dataset: { simulationCourse: recommendedCourseName },
      closest(selector) { return selector === "[data-simulation-course]" ? this : null; },
      matches() { return false; }
    }
  });
  assert.equal(detailDialog.open, true);
  assert.equal(state.tab, "simulation");
  assert.equal(state.simulationResultOpen, true);
  assert.equal(detailDialog.classList.contains("is-course-dialog"), true);
  assert.match(detailContent.innerHTML, /course-dialog-sections/);
  detailDialog.close();
  await detailDialog.dispatchTestEvent("close", {});
  assert.equal(state.tab, "simulation");
  assert.equal(state.simulationResultOpen, true);

  window.DatabaseApp.openRecord(0);
  assert.match(detailContent.innerHTML, /course-dialog-head/);
  assert.match(detailContent.innerHTML, /course-dialog-sections/);
  assert.equal(detailDialog.classList.contains("is-course-dialog"), true);

  console.log("curriculum parser tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
