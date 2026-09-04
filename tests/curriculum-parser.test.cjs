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
const curriculumAlertDialog = elementStub();
const curriculumAlertTitle = elementStub();
const curriculumAlertMessage = elementStub();
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
      "#curriculum-alert-dialog": curriculumAlertDialog,
      "#curriculum-alert-title": curriculumAlertTitle,
      "#curriculum-alert-message": curriculumAlertMessage
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
  const appCss = fs.readFileSync(path.join(__dirname, "..", "app.css"), "utf8");
  const sectionHtml = fs.readFileSync(path.join(__dirname, "..", "section.html"), "utf8");
  assert.match(schemaSql, /create table if not exists public\.curriculum_drafts/);
  assert.match(schemaSql, /unique \(updated_by, region, school_name\)/);
  assert.match(schemaSql, /platform users read own curriculum drafts/);
  assert.match(draftInstallSql, /create table if not exists public\.curriculum_drafts/);
  assert.match(draftInstallSql, /notify pgrst, 'reload schema'/);
  assert.match(schoolStoreSource, /async function loadCurriculumDraft/);
  assert.match(schoolStoreSource, /async function saveCurriculumDraft/);
  assert.match(schoolStoreSource, /saveLocalCurriculumDraft/);
  assert.match(schoolStoreSource, /isMissingCurriculumDraftTableError\(error\).*saveLocalCurriculumDraft/s);
  assert.match(appSource, /function refreshSubjectSearchInPlace/);
  assert.match(appSource, /function refreshDepartmentSearchInPlace/);
  assert.match(appSource, /function refreshRecommendDepartmentSearchInPlace/);
  assert.match(appSource, /function refreshPreviewSearchInPlace/);
  assert.match(appCss, /\.course-group-grid\.is-live-search-results/);
  assert.match(appCss, /\.major-field-grid\.is-live-search-results/);
  assert.match(sectionHtml, /data-header-school-search/);
  assert.doesNotMatch(sectionHtml, /DATA IMPORT NOTICE/);

  for (let index = 0; index < 20 && !window.DatabaseApp; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.ok(window.DatabaseApp, "앱 테스트 API가 초기화되어야 합니다.");

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

  const state = window.DatabaseApp.getState();
  state.schools = [
    { id: "seoul-na", name: "나래고등학교", region: "서울특별시", admissionYears: [2026] },
    { id: "gyeonggi", name: "하늘고등학교", region: "경기도", admissionYears: [2026] },
    { id: "seoul-ga", name: "가람고등학교", region: "서울특별시", admissionYears: [2026] }
  ];
  state.tab = "admin";
  state.pendingCurriculum = null;
  window.DatabaseApp.renderAdmin();
  assert.ok(root.innerHTML.indexOf("하늘고등학교") < root.innerHTML.indexOf("가람고등학교"));
  assert.ok(root.innerHTML.indexOf("가람고등학교") < root.innerHTML.indexOf("나래고등학교"));

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
  window.DatabaseApp.renderAdmin();
  assert.match(root.innerHTML, /data-teacher-school-form/);
  assert.match(root.innerHTML, /지역과 학교명 입력/);
  assert.ok(root.innerHTML.indexOf("data-school-auth-region-toggle") < root.innerHTML.indexOf('name="schoolName"'));
  assert.match(root.innerHTML, /data-school-auth-region-option/);
  assert.match(root.innerHTML, /name="schoolName"/);
  assert.match(root.innerHTML, /name="region"/);
  assert.doesNotMatch(root.innerHTML, /name="password"/);
  assert.match(root.innerHTML, /마지막 임시저장본을 먼저 불러옵니다/);
  state.schoolAuthStep = 3;
  window.DatabaseApp.renderAdmin();
  assert.match(root.innerHTML, /data-teacher-upload-form/);
  assert.match(root.innerHTML, /신입생 편제표 선택/);
  assert.match(root.innerHTML, /data-auth-curriculum-file/);
  assert.match(root.innerHTML, /multiple/);
  assert.match(root.innerHTML, /편제표 3개 분석 시작/);
  state.schoolAuthDialogMode = "";
  state.schoolAuthStep = 1;
  state.pendingCurriculumAction = "";

  const blank = window.DatabaseApp.createBlankCurriculumImport();
  assert.deepEqual(blank.curricula[0].grades.map((grade) => grade.grade), [1, 2, 3]);
  assert.deepEqual(blank.curricula[1].grades.map((grade) => grade.grade), [1, 2, 3]);

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

  state.simulationHistoryOpen = true;
  window.DatabaseApp.renderSimulation();
  assert.match(root.innerHTML, /지금까지의 공통·지정과목과 선택 내역/);
  assert.match(root.innerHTML, /공통·학교 지정과목/);
  assert.match(root.innerHTML, /공통 과목/);
  assert.match(root.innerHTML, /다음 · 2학년 선택/);
  assert.doesNotMatch(root.innerHTML, /1학년 과목 확인/);

  state.selectedAdmissionYear = 2025;
  state.curriculum = freshmanResult.curricula[0];
  state.simulationHistoryOpen = true;
  window.DatabaseApp.renderSimulation();
  assert.match(root.innerHTML, /2학년까지의 공통·학교 지정과목은 자동 반영/);
  assert.match(root.innerHTML, /다음 · 3학년 선택/);
  assert.doesNotMatch(root.innerHTML, /다음 · 2학년 선택/);

  const commonDisclosure = window.DatabaseApp.departmentCommonDisclosureMarkup({
    name: "인문",
    commonSubjects: [{ name: "공통국어1" }, { name: "공통영어1" }]
  });
  assert.match(commonDisclosure, /department-common-click/);
  assert.match(commonDisclosure, /C L I C K/);

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
