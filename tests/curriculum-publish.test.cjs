const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

async function main() {
  const source = fs.readFileSync(path.join(__dirname, "..", "school-data.js"), "utf8");
  const school = {
    id: "wonju-girls",
    slug: "wonju-girls",
    name: "원주여자고등학교",
    region: "강원특별자치도",
    is_active: true,
    updated_at: "2026-09-05T00:00:00.000Z"
  };
  const draftOnlySchool = {
    id: "draft-only",
    slug: "draft-only",
    name: "임시저장고등학교",
    region: "강원특별자치도",
    is_active: true,
    updated_at: "2026-09-05T00:00:00.000Z"
  };
  let allowUpdate = false;
  let storedRow = {
    id: "curriculum-2025",
    school_id: school.id,
    admission_year: 2025,
    data: { admissionYear: 2025, grades: [], courseCount: 0, unlistedCourseCount: 0 },
    is_published: true,
    updated_at: "2026-09-05T00:00:00.000Z"
  };

  class Query {
    constructor(table) {
      this.table = table;
      this.action = "select";
      this.columns = "";
      this.payload = null;
      this.filters = new Map();
    }

    select(columns) {
      this.columns = columns || "";
      return this;
    }

    insert(payload) {
      this.action = "insert";
      this.payload = payload;
      return this;
    }

    update(payload) {
      this.action = "update";
      this.payload = payload;
      return this;
    }

    eq(key, value) {
      this.filters.set(key, value);
      return this;
    }

    in() { return this; }
    order() { return this; }
    limit() { return this; }
    single() { return this; }
    maybeSingle() { return this; }

    then(resolve, reject) {
      return Promise.resolve(this.response()).then(resolve, reject);
    }

    response() {
      if (this.table === "schools") return { data: [{ ...school }, { ...draftOnlySchool }], error: null };
      if (this.table === "platform_users") return { data: { role: "teacher" }, error: null };
      if (this.table !== "curricula") return { data: null, error: null };

      if (this.action === "update") {
        if (!allowUpdate) return { data: null, error: null };
        storedRow = { ...storedRow, ...this.payload };
        return { data: { ...storedRow, data: JSON.parse(JSON.stringify(storedRow.data)) }, error: null };
      }

      if (this.action === "insert") {
        storedRow = { id: "inserted", ...this.payload };
        return { data: { ...storedRow, data: JSON.parse(JSON.stringify(storedRow.data)) }, error: null };
      }

      if (this.columns === "school_id, admission_year, updated_at") {
        return { data: [{ school_id: storedRow.school_id, admission_year: storedRow.admission_year, updated_at: storedRow.updated_at }], error: null };
      }
      if (this.columns === "id") return { data: { id: storedRow.id }, error: null };
      return { data: { ...storedRow, data: JSON.parse(JSON.stringify(storedRow.data)) }, error: null };
    }
  }

  const client = {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: "teacher-user" } } }, error: null }),
      onAuthStateChange() {},
      signOut: async () => ({ error: null })
    },
    from(table) { return new Query(table); }
  };
  const context = {
    console,
    URLSearchParams,
    location: { search: "", pathname: "/section.html", hash: "" },
    history: { state: null, replaceState() {} },
    localStorage: memoryStorage(),
    CustomEvent: class CustomEvent {
      constructor(type, init) { this.type = type; this.detail = init?.detail; }
    }
  };
  context.window = {
    SUPABASE_CONFIG: { url: "https://example.supabase.co", publishableKey: "publishable-test-key" },
    supabase: { createClient: () => client },
    sessionStorage: memoryStorage(),
    dispatchEvent() {}
  };

  vm.runInNewContext(source, context, { filename: "school-data.js" });
  const store = context.window.SchoolStore;
  const initialized = await store.init();
  assert.equal(initialized.schools.length, 1, "등록 편제표가 없는 학교는 연동 목록에서 숨겨야 합니다.");
  assert.equal(initialized.schools[0].name, "원주여자고등학교");
  const latest = {
    version: 8,
    sourceFormat: "manual",
    schoolName: school.name,
    region: school.region,
    admissionYear: 2025,
    grades: [{
      grade: 1,
      semesters: [{
        semester: 1,
        common: ["공통국어1"],
        designated: [],
        standalone: [],
        electives: ["물리학", "화학"],
        options: [{ id: "science-choice", label: "과학 선택", choose: 1, semester: 1, courses: ["물리학", "화학"] }]
      }],
      common: ["공통국어1"],
      designated: [],
      electives: ["물리학", "화학"],
      options: [{ id: "science-choice", label: "과학 선택", choose: 1, semester: 1, courses: ["물리학", "화학"] }]
    }],
    courseMetadata: {},
    courseCount: 3,
    unlistedCourseCount: 0
  };

  await assert.rejects(
    () => store.publishCurriculum(latest),
    /편제표 교체 권한이 DB에 적용되지 않아 저장되지 않았습니다/
  );
  assert.equal(storedRow.data.courseCount, 0, "0건 수정은 성공으로 처리하면 안 됩니다.");

  allowUpdate = true;
  const result = await store.publishCurriculum(latest);
  assert.equal(result.action, "updated");
  assert.equal(result.schools.length, 1);
  assert.equal(result.curriculum.admissionYear, 2025);
  assert.equal(result.curriculum.courseCount, 3);
  assert.equal(result.curriculum.grades[0].common.join(","), "공통국어1");
  assert.equal(result.curriculum.grades[0].semesters[0].options[0].courses.join(","), "물리학,화학");
  assert.equal(storedRow.data.grades[0].semesters[0].options[0].courses.join(","), "물리학,화학");
  assert.equal(storedRow.data.courseCount, 3);
  console.log("Curriculum publish verification passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
