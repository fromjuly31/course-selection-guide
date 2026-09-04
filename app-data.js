(() => {
  "use strict";

  // 대용량 행 데이터는 localStorage의 용량 한계를 피하기 위해 IndexedDB에 저장한다.
  // 중요: IndexedDB 데이터는 업로드한 관리자의 현재 브라우저/기기에만 보관된다.
  const DB_NAME = "course-guide-database";
  const DB_VERSION = 1;
  const STORE_NAME = "databases";
  const ACTIVE_KEY = "active";
  const SETTINGS_KEY = "course-guide:settings:v2";
  const DEFAULT_DATABASE_URL = "./data/database.json";
  const DEPARTMENT_DATABASE_URL = "./data/departments.json";
  const STATIC_DATA_VERSION = "20260905-2";
  const INDEXED_DB_OPEN_TIMEOUT = 2500;
  const DATA_FETCH_TIMEOUT = 8000;

  const embeddedFallback = {
    meta: {
      title: "선택과목 안내 데이터",
      sourceType: "fallback",
      sourceName: "내장 비상 데이터",
      updatedAt: "2026-09-02T00:00:00+09:00"
    },
    columns: ["학과", "계열", "반영과목", "과학 권장과목", "대학명", "안내"],
    chatbot: { keywordWeights: [], searchSettings: [] },
    sources: [],
    rows: [
      {
        "학과": "컴퓨터공학과",
        "계열": "공학",
        "반영과목": "미적분;기하;확률과 통계",
        "과학 권장과목": "물리학;화학",
        "대학명": "가온대학교",
        "안내": "수학과 정보 과목을 균형 있게 이수하는 것을 권장합니다."
      }
    ]
  };

  const clone = (value) => {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  };

  function normalizeCourseTypography(value) {
    return typeof value === "string"
      ? value.replace(/기술\s*[·ㆍ･・]\s*가정/gu, "기술·가정")
      : value;
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(new Error("이 브라우저는 IndexedDB를 지원하지 않습니다."));
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error("브라우저 저장소 응답 시간이 초과되었습니다."));
      }, INDEXED_DB_OPEN_TIMEOUT);
      const finish = (callback) => {
        if (settled) return false;
        settled = true;
        clearTimeout(timeout);
        callback();
        return true;
      };
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, { keyPath: "key" });
        }
      };
      request.onsuccess = () => {
        if (!finish(() => resolve(request.result))) request.result.close();
      };
      request.onerror = () => finish(() => reject(request.error || new Error("IndexedDB를 열 수 없습니다.")));
      request.onblocked = () => finish(() => reject(new Error("다른 탭에서 데이터베이스를 사용 중입니다. 다른 탭을 닫고 다시 시도해 주세요.")));
    });
  }

  async function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DATA_FETCH_TIMEOUT);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }

  async function runTransaction(mode, action) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      let request;

      try {
        request = action(store);
      } catch (error) {
        database.close();
        reject(error);
        return;
      }

      transaction.oncomplete = () => {
        database.close();
        resolve(request?.result);
      };
      transaction.onerror = () => {
        database.close();
        reject(transaction.error || request?.error || new Error("브라우저 데이터베이스 작업에 실패했습니다."));
      };
      transaction.onabort = () => {
        database.close();
        reject(transaction.error || new Error("브라우저 데이터베이스 작업이 취소되었습니다."));
      };
    });
  }

  async function readUploadedDatabase() {
    const record = await runTransaction("readonly", (store) => store.get(ACTIVE_KEY));
    return record?.payload || null;
  }

  async function saveDatabase(database) {
    const payload = normalizeDatabase(database);
    payload.meta = {
      ...payload.meta,
      sourceType: "admin",
      updatedAt: payload.meta.updatedAt || new Date().toISOString()
    };
    await runTransaction("readwrite", (store) => store.put({ key: ACTIVE_KEY, payload }));
    return clone(payload);
  }

  async function deleteUploadedDatabase() {
    await runTransaction("readwrite", (store) => store.delete(ACTIVE_KEY));
  }

  function normalizeDatabase(input) {
    const source = Array.isArray(input) ? { rows: input } : (input || {});
    const rows = Array.isArray(source.rows)
      ? source.rows.filter((row) => row && typeof row === "object" && !Array.isArray(row))
      : [];
    const discoveredColumns = [];
    const seen = new Set();

    const addColumn = (candidate) => {
      const column = String(candidate ?? "").trim();
      if (column && !seen.has(column)) {
        seen.add(column);
        discoveredColumns.push(column);
      }
    };
    (Array.isArray(source.columns) ? source.columns : []).forEach(addColumn);
    // flatMap으로 모든 키의 거대한 임시 배열을 만들지 않아 수만 행에서도 메모리를 절약한다.
    rows.forEach((row) => Object.keys(row).forEach(addColumn));

    const copyRecords = (records) => Array.isArray(records)
      ? records.filter((record) => record && typeof record === "object" && !Array.isArray(record)).map((record) => ({ ...record }))
      : [];
    const chatbot = source.chatbot && typeof source.chatbot === "object" ? source.chatbot : {};

    return {
      meta: source.meta && typeof source.meta === "object" ? { ...source.meta } : {},
      columns: discoveredColumns,
      rows: rows.map((row) => {
        const normalized = {};
        discoveredColumns.forEach((column) => { normalized[column] = normalizeCourseTypography(row[column] ?? ""); });
        return normalized;
      }),
      chatbot: {
        keywordWeights: copyRecords(chatbot.keywordWeights),
        searchSettings: copyRecords(chatbot.searchSettings)
      },
      sources: copyRecords(source.sources)
    };
  }

  function normalizeDepartmentDatabase(input) {
    const source = input && typeof input === "object" ? input : {};
    const departments = Array.isArray(source.departments)
      ? source.departments.filter((department) => department && typeof department === "object" && department.name && department.field).map((department) => ({
        id: String(department.id || ""),
        field: String(department.field || "").trim(),
        name: String(department.name || "").trim(),
        guide: {
          overview: String(department.guide?.overview || "").trim(),
          aptitude: String(department.guide?.aptitude || "").trim(),
          careers: String(department.guide?.careers || "").trim()
        },
        relatedSubjects: Array.isArray(department.relatedSubjects) ? department.relatedSubjects.map(String).map((value) => value.trim()).filter(Boolean) : [],
        recommendedBooks: normalizeRecommendedBooks(department.recommendedBooks),
        reflectedSubjects: normalizeSubjectUniversities(department.reflectedSubjects),
        scienceRecommendedSubjects: normalizeSubjectUniversities(department.scienceRecommendedSubjects)
      }))
      : [];
    const fields = Array.isArray(source.fields)
      ? source.fields.filter((field) => field && typeof field === "object" && field.name).map((field) => ({
        name: String(field.name).trim(),
        departmentCount: Number(field.departmentCount) || departments.filter((department) => department.field === field.name).length,
        commonSubjectThreshold: Number(field.commonSubjectThreshold) || 0,
        commonSubjects: Array.isArray(field.commonSubjects) ? field.commonSubjects.filter((subject) => subject?.name).map((subject) => ({
          name: String(subject.name).trim(),
          coverageCount: Number(subject.coverageCount) || 0,
          totalCount: Number(subject.totalCount) || 0,
          coverageRate: Number(subject.coverageRate) || 0
        })) : []
      }))
      : [];
    return {
      meta: source.meta && typeof source.meta === "object" ? { ...source.meta } : {},
      fields,
      departments
    };
  }

  function normalizeSubjectUniversities(subjects) {
    if (!Array.isArray(subjects)) return [];
    return subjects.filter((subject) => subject && typeof subject === "object" && subject.name).map((subject) => ({
      name: String(subject.name).trim(),
      universities: Array.isArray(subject.universities) ? subject.universities.map(String).map((value) => value.trim()).filter(Boolean) : []
    }));
  }

  function normalizeRecommendedBooks(books) {
    if (!Array.isArray(books)) return [];
    return books.filter((book) => book && typeof book === "object" && book.title).map((book) => ({
      title: String(book.title).trim(),
      author: String(book.author || "").trim(),
      universities: [...new Set(Array.isArray(book.universities) ? book.universities.map(String).map((value) => value.trim()).filter(Boolean) : [])]
        .sort((a, b) => a.localeCompare(b, "ko"))
    })).sort((a, b) => a.title.localeCompare(b.title, "ko") || a.author.localeCompare(b.author, "ko"));
  }

  async function fetchDefaultDatabase({ cacheBust = false } = {}) {
    const suffix = `?v=${cacheBust ? Date.now() : STATIC_DATA_VERSION}`;
    const response = await fetchWithTimeout(`${DEFAULT_DATABASE_URL}${suffix}`, { cache: cacheBust ? "no-store" : "default" });
    if (!response.ok) throw new Error(`기본 DB 요청 실패 (HTTP ${response.status})`);
    const parsed = await response.json();
    const database = normalizeDatabase(parsed);
    if (!database.columns.length || !database.rows.length) throw new Error("기본 database.json에 사용할 데이터가 없습니다.");
    database.meta = {
      ...database.meta,
      sourceType: "default",
      sourceName: database.meta.sourceName || "data/database.json"
    };
    return database;
  }

  async function loadDepartmentDatabase({ cacheBust = false } = {}) {
    const suffix = `?v=${cacheBust ? Date.now() : STATIC_DATA_VERSION}`;
    const response = await fetchWithTimeout(`${DEPARTMENT_DATABASE_URL}${suffix}`, { cache: cacheBust ? "no-store" : "default" });
    if (!response.ok) throw new Error(`학과 DB 요청 실패 (HTTP ${response.status})`);
    const database = normalizeDepartmentDatabase(await response.json());
    if (!database.fields.length || !database.departments.length) throw new Error("departments.json에 사용할 학과 데이터가 없습니다.");
    return database;
  }

  // 로딩 우선순위: 1) 관리자 업로드 IndexedDB, 2) data/database.json, 3) 내장 비상 데이터.
  async function loadDatabase({ forceDefault = false, cacheBust = false } = {}) {
    const notices = [];
    if (!forceDefault) {
      try {
        const uploaded = await readUploadedDatabase();
        if (uploaded) return { database: normalizeDatabase(uploaded), notices };
      } catch (error) {
        console.error("IndexedDB 불러오기 실패:", error);
        notices.push("브라우저에 저장된 DB를 읽지 못해 기본 DB를 불러왔습니다.");
      }
    }

    try {
      return { database: await fetchDefaultDatabase({ cacheBust }), notices };
    } catch (error) {
      console.error("database.json 불러오기 실패:", error);
      notices.push("기본 database.json을 불러오지 못해 내장 비상 데이터를 표시합니다.");
      return { database: clone(embeddedFallback), notices };
    }
  }

  function getSettings() {
    try {
      const value = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
      return value && typeof value === "object" ? value : {};
    } catch {
      return {};
    }
  }

  function saveSettings(settings) {
    // 페이지 크기·마지막 시트 같은 작은 UI 설정만 localStorage에 둔다.
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings || {}));
  }

  function clearSettings() {
    localStorage.removeItem(SETTINGS_KEY);
  }

  window.DatabaseStore = {
    DEFAULT_DATABASE_URL,
    DEPARTMENT_DATABASE_URL,
    SETTINGS_KEY,
    clone,
    normalizeDatabase,
    normalizeDepartmentDatabase,
    loadDatabase,
    fetchDefaultDatabase,
    loadDepartmentDatabase,
    saveDatabase,
    deleteUploadedDatabase,
    getSettings,
    saveSettings,
    clearSettings
  };
})();
