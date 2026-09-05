const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

async function main() {
  const source = fs.readFileSync(path.join(__dirname, "..", "school-data.js"), "utf8");
  const selectionKey = "course-guide:selected-school:v1";
  const yearKey = "course-guide:selected-admission-year:v1";
  const sessionStorage = memoryStorage({ [selectionKey]: "old-school", [yearKey]: "2025" });
  const events = [];
  const historyUrls = [];
  const schoolPayload = {
    schools: [{
      id: "wonju-girls",
      slug: "wonju-girls",
      name: "원주여자고등학교",
      region: "강원특별자치도",
      admissionYears: [2026],
      curricula: [{ admissionYear: 2026, grades: [] }]
    }, {
      id: "draft-only",
      slug: "draft-only",
      name: "임시저장고등학교",
      region: "강원특별자치도",
      admissionYears: [],
      curricula: []
    }]
  };
  const context = {
    console,
    URLSearchParams,
    location: {
      search: "?school=wonju-girls&admissionYear=2026&tab=subjects",
      pathname: "/section.html",
      hash: "#courses"
    },
    history: {
      state: { keep: true },
      replaceState(_state, _title, url) { historyUrls.push(url); }
    },
    localStorage: memoryStorage(),
    fetch: async () => ({ ok: true, json: async () => schoolPayload }),
    CustomEvent: class CustomEvent {
      constructor(type, init) { this.type = type; this.detail = init?.detail; }
    }
  };
  context.window = {
    sessionStorage,
    dispatchEvent(event) { events.push(event); }
  };

  vm.runInNewContext(source, context, { filename: "school-data.js" });
  const store = context.window.SchoolStore;
  const connected = await store.init();
  assert.equal(connected.selectedSchool.name, "원주여자고등학교");
  assert.equal(connected.selectedAdmissionYear, 2026);
  assert.equal(connected.schools.length, 1, "공개 등록 편제표가 없는 학교는 연동 목록에서 숨겨야 합니다.");
  assert.equal(connected.schools[0].name, "원주여자고등학교");

  const disconnected = await store.disconnectSchool();
  assert.equal(disconnected.selectedSchool, null);
  assert.equal(disconnected.selectedAdmissionYear, null);
  assert.equal(disconnected.curriculum, null);
  assert.equal(sessionStorage.getItem(selectionKey), null);
  assert.equal(sessionStorage.getItem(yearKey), null);
  assert.equal(historyUrls.at(-1), "/section.html?tab=subjects#courses");
  assert.equal(events.at(-1).detail.reason, "disconnect");
  assert.equal(disconnected.schools.length, 1, "연동 해제 후에도 학교 데이터는 남아 있어야 합니다.");

  console.log("School disconnect behavior passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
