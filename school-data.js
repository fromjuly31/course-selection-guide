(() => {
  "use strict";

  const SELECTED_SCHOOL_KEY = "course-guide:selected-school:v1";
  const SELECTED_ADMISSION_YEAR_KEY = "course-guide:selected-admission-year:v1";
  const LOCAL_CURRICULUM_DRAFTS_KEY = "course-guide:curriculum-drafts:v1";
  const FALLBACK_URL = "./data/schools.json";
  const SUPPORTED_ADMISSION_YEARS = Object.freeze([2026, 2025, 2024]);
  const EDUCATION_OFFICE_REGIONS = Object.freeze([
    "서울특별시", "부산광역시", "대구광역시", "인천광역시", "광주광역시", "대전광역시", "울산광역시",
    "세종특별자치시", "경기도", "강원특별자치도", "충청북도", "충청남도", "전북특별자치도", "전라남도",
    "경상북도", "경상남도", "제주특별자치도"
  ]);
  const config = window.SUPABASE_CONFIG || {};
  const configured = Boolean(config.url && config.publishableKey);
  let client = null;
  let initialized = false;
  let initPromise = null;
  let schools = [];
  let selectedSchool = null;
  let selectedAdmissionYear = null;
  let curriculum = null;
  let user = null;
  let accessRole = "";
  let connection = configured ? "connecting" : "local";
  let message = configured ? "Supabase 연결을 확인하고 있습니다." : "Supabase 설정값을 입력하면 온라인 연동이 시작됩니다.";

  function loadSupabaseLibrary() {
    if (window.supabase?.createClient) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const existing = document.querySelector("script[data-supabase-library]");
      if (existing) {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", () => reject(new Error("Supabase 라이브러리를 불러오지 못했습니다.")), { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
      script.dataset.supabaseLibrary = "true";
      script.onload = resolve;
      script.onerror = () => reject(new Error("Supabase 라이브러리를 불러오지 못했습니다."));
      document.head.append(script);
    });
  }

  function cleanAdmissionYears(values) {
    return [...new Set((Array.isArray(values) ? values : []).map(Number)
      .filter((year) => SUPPORTED_ADMISSION_YEARS.includes(year)))].sort((a, b) => b - a);
  }

  function cleanCurricula(row) {
    const source = Array.isArray(row?.curricula) ? row.curricula : row?.curriculum ? [row.curriculum] : [];
    return source.filter((item) => item && typeof item === "object").map((item) => ({
      ...item,
      admissionYear: Number(item.admissionYear ?? item.admission_year) || null
    })).filter((item) => SUPPORTED_ADMISSION_YEARS.includes(item.admissionYear));
  }

  function cleanSchool(row) {
    if (!row || typeof row !== "object") return null;
    const curricula = cleanCurricula(row);
    const admissionYears = cleanAdmissionYears([
      ...(Array.isArray(row.admissionYears) ? row.admissionYears : []),
      ...(Array.isArray(row.admission_years) ? row.admission_years : []),
      ...curricula.map((item) => item.admissionYear)
    ]);
    return {
      id: String(row.id || row.slug || "").trim(),
      slug: String(row.slug || row.id || "").trim(),
      name: String(row.name || row.schoolName || "이름 없는 학교").trim(),
      region: String(row.region || "").trim(),
      admissionYears,
      updatedAt: row.updated_at || row.updatedAt || "",
      curriculum: row.curriculum && typeof row.curriculum === "object" ? row.curriculum : undefined,
      curricula
    };
  }

  function sortSchools(values) {
    return [...values].sort((a, b) => String(a.region || "").localeCompare(String(b.region || ""), "ko", { sensitivity: "base" })
      || String(a.name || "").localeCompare(String(b.name || ""), "ko", { sensitivity: "base" }));
  }

  function isMissingCurriculumDraftTableError(error) {
    const code = String(error?.code || "").trim().toUpperCase();
    const detail = [error?.message, error?.details, error?.hint].filter(Boolean).join(" ").toLowerCase();
    return (code === "PGRST205" || code === "42P01" || /schema cache|does not exist/.test(detail))
      && /curriculum_drafts/.test(detail);
  }

  function schoolSnapshot(school) {
    return school ? {
      ...school,
      admissionYears: [...(school.admissionYears || [])],
      curricula: (school.curricula || []).map((item) => ({ ...item }))
    } : null;
  }

  function emitChange(reason = "update") {
    window.dispatchEvent(new CustomEvent("schooldatachange", { detail: { reason, ...snapshot() } }));
  }

  function snapshot() {
    return {
      configured,
      connection,
      message,
      schools: schools.map(schoolSnapshot),
      selectedSchool: schoolSnapshot(selectedSchool),
      selectedAdmissionYear,
      curriculum: curriculum ? JSON.parse(JSON.stringify(curriculum)) : null,
      user: user ? { id: user.id, email: user.email || "" } : null,
      accessRole
    };
  }

  async function loadFallbackSchools() {
    try {
      const response = await fetch(FALLBACK_URL, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      schools = sortSchools((Array.isArray(payload) ? payload : payload.schools || []).map(cleanSchool).filter(Boolean));
    } catch (error) {
      console.warn("학교 목록 로컬 파일을 읽지 못했습니다.", error);
      schools = [];
    }
  }

  async function loadSchools() {
    if (!client) {
      await loadFallbackSchools();
      return schools;
    }
    const { data, error } = await client
      .from("schools")
      .select("id, slug, name, region, updated_at")
      .eq("is_active", true)
      .order("name", { ascending: true });
    if (error) throw error;
    const { data: curriculumRows, error: curriculumError } = await client
      .from("curricula")
      .select("school_id, admission_year, updated_at")
      .eq("is_published", true)
      .in("admission_year", SUPPORTED_ADMISSION_YEARS)
      .order("admission_year", { ascending: false });
    if (curriculumError) throw curriculumError;
    const yearsBySchool = new Map();
    (curriculumRows || []).forEach((row) => {
      if (!yearsBySchool.has(row.school_id)) yearsBySchool.set(row.school_id, []);
      yearsBySchool.get(row.school_id).push(row.admission_year);
    });
    schools = sortSchools((data || []).map((row) => cleanSchool({ ...row, admissionYears: yearsBySchool.get(row.id) || [] })).filter(Boolean));
    return schools;
  }

  async function loadCurriculum(schoolId, admissionYear) {
    curriculum = null;
    const year = Number(admissionYear);
    if (!schoolId || !SUPPORTED_ADMISSION_YEARS.includes(year)) return null;
    if (!client) {
      const localSchool = schools.find((school) => school.id === schoolId);
      curriculum = (localSchool?.curricula || []).find((item) => Number(item.admissionYear) === year)
        || (Number(localSchool?.curriculum?.admissionYear ?? localSchool?.curriculum?.admission_year) === year ? localSchool.curriculum : null);
      return curriculum;
    }
    const { data, error } = await client
      .from("curricula")
      .select("id, school_id, admission_year, data, updated_at")
      .eq("school_id", schoolId)
      .eq("admission_year", year)
      .eq("is_published", true)
      .maybeSingle();
    if (error) throw error;
    curriculum = data?.data && typeof data.data === "object"
      ? { ...data.data, id: data.id, schoolId: data.school_id, admissionYear: data.admission_year, updatedAt: data.updated_at }
      : null;
    return curriculum;
  }

  async function loadCurriculumForCopy(input = {}) {
    await init();
    const year = Number(input.admissionYear);
    if (!SUPPORTED_ADMISSION_YEARS.includes(year)) throw new Error("불러올 입학년도를 확인해 주세요.");
    let school = schools.find((item) => item.id === String(input.schoolId || "").trim()) || null;
    if (!school && input.schoolName && input.region) {
      const { name, region } = validateSchoolIdentity(input);
      school = schools.find((item) => comparable(item.name) === comparable(name) && comparable(item.region) === comparable(region)) || null;
    }
    if (!school) throw new Error("해당 학교의 저장된 편제표를 찾을 수 없습니다.");
    if (!client) {
      const stored = (school.curricula || []).find((item) => Number(item.admissionYear) === year)
        || (Number(school.curriculum?.admissionYear ?? school.curriculum?.admission_year) === year ? school.curriculum : null);
      return stored ? JSON.parse(JSON.stringify(stored)) : null;
    }
    const { data, error } = await client
      .from("curricula")
      .select("id, school_id, admission_year, data, updated_at")
      .eq("school_id", school.id)
      .eq("admission_year", year)
      .eq("is_published", true)
      .maybeSingle();
    if (error) throw error;
    return data?.data && typeof data.data === "object"
      ? { ...JSON.parse(JSON.stringify(data.data)), id: data.id, schoolId: data.school_id, admissionYear: data.admission_year, updatedAt: data.updated_at }
      : null;
  }

  async function restoreSelection() {
    const params = new URLSearchParams(location.search);
    const selectedId = params.get("school") || localStorage.getItem(SELECTED_SCHOOL_KEY) || "";
    const savedYear = Number(params.get("admissionYear") || params.get("year") || localStorage.getItem(SELECTED_ADMISSION_YEAR_KEY));
    selectedSchool = schools.find((school) => school.id === selectedId || school.slug === selectedId) || null;
    if (!selectedSchool && selectedId) localStorage.removeItem(SELECTED_SCHOOL_KEY);
    if (selectedSchool) {
      localStorage.setItem(SELECTED_SCHOOL_KEY, selectedSchool.id);
      if (selectedSchool.admissionYears.includes(savedYear)) {
        curriculum = await loadCurriculum(selectedSchool.id, savedYear);
        selectedAdmissionYear = curriculum ? savedYear : null;
      }
      if (!selectedAdmissionYear) localStorage.removeItem(SELECTED_ADMISSION_YEAR_KEY);
    }
  }

  async function loadAccessRole() {
    accessRole = "";
    if (!client || !user) return null;
    const { data: access, error } = await client
      .from("platform_users")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;
    accessRole = access?.role === "admin" || access?.role === "teacher" ? access.role : "";
    return accessRole;
  }

  async function init() {
    if (initialized) return snapshot();
    if (initPromise) return initPromise;
    initPromise = (async () => {
      try {
        if (configured) {
          await loadSupabaseLibrary();
          if (!window.supabase?.createClient) throw new Error("Supabase 라이브러리를 불러오지 못했습니다.");
          client = window.supabase.createClient(config.url, config.publishableKey);
          const { data, error } = await client.auth.getSession();
          if (error) throw error;
          user = data.session?.user || null;
          await loadSchools();
          await restoreSelection();
          await loadAccessRole();
          connection = "online";
          message = "Supabase와 연결되었습니다.";
          client.auth.onAuthStateChange((_event, session) => {
            user = session?.user || null;
            setTimeout(async () => {
              try {
                await loadAccessRole();
                emitChange("auth");
              } catch (error) {
                console.error("플랫폼 권한 확인 실패:", error);
              }
            }, 0);
          });
        } else {
          await loadFallbackSchools();
          await restoreSelection();
        }
      } catch (error) {
        console.error("학교 데이터 연결 실패:", error);
        client = null;
        connection = "error";
        message = `Supabase 연결 실패: ${error.message || "설정과 네트워크를 확인해 주세요."}`;
        await loadFallbackSchools();
        await restoreSelection();
      }
      initialized = true;
      return snapshot();
    })();
    return initPromise;
  }

  async function selectSchool(schoolId) {
    await init();
    selectedSchool = schools.find((school) => school.id === schoolId || school.slug === schoolId) || null;
    selectedAdmissionYear = null;
    curriculum = null;
    if (selectedSchool) {
      localStorage.setItem(SELECTED_SCHOOL_KEY, selectedSchool.id);
    } else {
      localStorage.removeItem(SELECTED_SCHOOL_KEY);
    }
    localStorage.removeItem(SELECTED_ADMISSION_YEAR_KEY);
    emitChange("selection");
    return snapshot();
  }

  async function selectAdmissionYear(admissionYear) {
    await init();
    if (!selectedSchool) throw new Error("학교를 먼저 선택해 주세요.");
    const year = Number(admissionYear);
    if (!Number.isInteger(year) || !selectedSchool.admissionYears.includes(year)) {
      throw new Error("선택한 학교에 등록된 입학년도가 아닙니다.");
    }
    try {
      curriculum = await loadCurriculum(selectedSchool.id, year);
      if (!curriculum) throw new Error(`${year}학년도 편제표를 찾을 수 없습니다.`);
      selectedAdmissionYear = year;
      localStorage.setItem(SELECTED_ADMISSION_YEAR_KEY, String(year));
      emitChange("admission-year");
      return snapshot();
    } catch (error) {
      curriculum = null;
      selectedAdmissionYear = null;
      localStorage.removeItem(SELECTED_ADMISSION_YEAR_KEY);
      throw error;
    }
  }

  async function authenticate(email, password, requiredRole) {
    await init();
    if (!client) throw new Error("먼저 supabase-config.js에 연결 정보를 입력해 주세요.");
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    user = data.user;
    await loadAccessRole();
    if (!accessRole || accessRole !== requiredRole) {
      await client.auth.signOut();
      user = null;
      accessRole = "";
      throw new Error(requiredRole === "admin" ? "관리자 권한이 없는 계정입니다." : "담당 교사 등록 권한이 없습니다.");
    }
    emitChange("auth");
    return snapshot();
  }

  async function signInTeacher(password) {
    const email = String(config.teacherEmail || "").trim();
    if (!email) throw new Error("supabase-config.js에 담당 교사 계정 이메일을 먼저 설정해 주세요.");
    return authenticate(email, password, "teacher");
  }

  async function signInAdmin(email, password) {
    return authenticate(String(email || "").trim(), password, "admin");
  }

  async function signOut() {
    if (!client) return snapshot();
    const { error } = await client.auth.signOut();
    if (error) throw error;
    user = null;
    accessRole = "";
    emitChange("auth");
    return snapshot();
  }

  function comparable(value) {
    return String(value || "").replace(/\s+/g, "").toLocaleLowerCase("ko");
  }

  function validateSchoolIdentity(input) {
    const name = String(input?.schoolName || "").trim();
    const region = String(input?.region || "").trim();
    if (!EDUCATION_OFFICE_REGIONS.includes(region)) throw new Error("지역은 전국 17개 시·도 목록에서 선택해 주세요.");
    if (!/^.+고등학교$/u.test(name)) throw new Error("학교명은 '고등학교'로 끝나는 정식 명칭을 입력해 주세요. 예: 우리고등학교");
    return { name, region };
  }

  function readLocalCurriculumDrafts() {
    try {
      const parsed = JSON.parse(localStorage.getItem(LOCAL_CURRICULUM_DRAFTS_KEY) || "{}");
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
      console.warn("브라우저 임시저장본을 읽지 못했습니다.", error);
      return {};
    }
  }

  function localCurriculumDraftKey(name, region) {
    return [user?.id || "signed-out", comparable(region), comparable(name)].join(":");
  }

  function loadLocalCurriculumDraft(name, region) {
    const draft = readLocalCurriculumDrafts()[localCurriculumDraftKey(name, region)];
    if (!draft?.data || typeof draft.data !== "object") return null;
    return { ...draft, data: JSON.parse(JSON.stringify(draft.data)), storage: "local" };
  }

  function saveLocalCurriculumDraft(input, name, region) {
    const drafts = readLocalCurriculumDrafts();
    const key = localCurriculumDraftKey(name, region);
    const saved = {
      id: `local:${key}`,
      schoolName: name,
      region,
      entryMode: input.entryMode === "upload" ? "upload" : "manual",
      data: JSON.parse(JSON.stringify(input.data)),
      updatedAt: new Date().toISOString(),
      storage: "local"
    };
    drafts[key] = saved;
    try {
      localStorage.setItem(LOCAL_CURRICULUM_DRAFTS_KEY, JSON.stringify(drafts));
    } catch (error) {
      console.error("브라우저 임시저장 실패:", error);
      throw new Error("브라우저 임시저장 공간이 부족하거나 사용할 수 없습니다.");
    }
    return saved;
  }

  function deleteLocalCurriculumDraft(name, region) {
    if (!name || !region) return false;
    const drafts = readLocalCurriculumDrafts();
    const key = localCurriculumDraftKey(name, region);
    if (!drafts[key]) return false;
    delete drafts[key];
    localStorage.setItem(LOCAL_CURRICULUM_DRAFTS_KEY, JSON.stringify(drafts));
    return true;
  }

  function newSchoolSlug() {
    const randomPart = globalThis.crypto?.randomUUID?.().slice(0, 8) || Math.random().toString(36).slice(2, 10);
    return `school-${Date.now().toString(36)}-${randomPart}`;
  }

  async function findOrCreateSchool(input) {
    const { name, region } = validateSchoolIdentity(input);
    await loadSchools();
    const findExisting = () => schools.find((school) => comparable(school.name) === comparable(name) && comparable(school.region) === comparable(region));
    const existing = findExisting();
    if (existing) return existing;
    const { data, error } = await client
      .from("schools")
      .insert({ slug: newSchoolSlug(), name, region, is_active: true })
      .select("id, slug, name, region, updated_at")
      .single();
    if (error) {
      if (error.code === "23505") {
        await loadSchools();
        const concurrent = findExisting();
        if (concurrent) return concurrent;
      }
      throw error;
    }
    const school = cleanSchool(data);
    if (school) schools = sortSchools([...schools, school]);
    return school;
  }

  async function loadCurriculumDraft(input) {
    await init();
    if (!client) throw new Error("Supabase가 연결되지 않았습니다.");
    if (!user || !accessRole) throw new Error("등록 비밀번호 확인이 필요합니다.");
    const { name, region } = validateSchoolIdentity(input);
    const { data, error } = await client
      .from("curriculum_drafts")
      .select("id, school_name, region, entry_mode, data, updated_at")
      .eq("updated_by", user.id)
      .eq("school_name", name)
      .eq("region", region)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      if (isMissingCurriculumDraftTableError(error)) {
        console.warn("임시저장 테이블이 아직 생성되지 않아 저장본 조회를 건너뜁니다.");
        return loadLocalCurriculumDraft(name, region);
      }
      throw error;
    }
    if (!data?.data || typeof data.data !== "object") return loadLocalCurriculumDraft(name, region);
    return {
      id: data.id,
      schoolName: data.school_name,
      region: data.region,
      entryMode: data.entry_mode,
      data: JSON.parse(JSON.stringify(data.data)),
      updatedAt: data.updated_at
    };
  }

  async function saveCurriculumDraft(input) {
    await init();
    if (!client) throw new Error("Supabase가 연결되지 않았습니다.");
    if (!user || !accessRole) throw new Error("등록 비밀번호 확인이 필요합니다.");
    const { name, region } = validateSchoolIdentity(input);
    if (!input?.data || typeof input.data !== "object" || Array.isArray(input.data)) throw new Error("임시저장할 편제표 데이터가 없습니다.");
    const payload = {
      school_name: name,
      region,
      entry_mode: input.entryMode === "upload" ? "upload" : "manual",
      data: input.data,
      updated_by: user.id,
      updated_at: new Date().toISOString()
    };
    let query;
    const draftId = String(input.id || "").trim();
    if (draftId && !draftId.startsWith("local:")) {
      query = client.from("curriculum_drafts").update(payload).eq("id", draftId).eq("updated_by", user.id);
    } else {
      query = client.from("curriculum_drafts").upsert(payload, { onConflict: "updated_by,region,school_name" });
    }
    const { data, error } = await query.select("id, school_name, region, entry_mode, updated_at").single();
    if (error) {
      if (isMissingCurriculumDraftTableError(error)) return saveLocalCurriculumDraft(input, name, region);
      throw error;
    }
    deleteLocalCurriculumDraft(name, region);
    return {
      id: data.id,
      schoolName: data.school_name,
      region: data.region,
      entryMode: data.entry_mode,
      updatedAt: data.updated_at
    };
  }

  async function deleteCurriculumDraft(input = {}) {
    await init();
    if (!client || !user || !accessRole) return false;
    const identity = input?.schoolName && input?.region ? validateSchoolIdentity(input) : null;
    const draftId = String(input.id || "").trim();
    if (draftId.startsWith("local:")) return identity ? deleteLocalCurriculumDraft(identity.name, identity.region) : false;
    let query = client.from("curriculum_drafts").delete().eq("updated_by", user.id);
    if (draftId) query = query.eq("id", draftId);
    else {
      const { name, region } = identity || validateSchoolIdentity(input);
      query = query.eq("school_name", name).eq("region", region);
    }
    const { error } = await query;
    if (error) {
      if (isMissingCurriculumDraftTableError(error)) return identity ? deleteLocalCurriculumDraft(identity.name, identity.region) : false;
      throw error;
    }
    if (identity) deleteLocalCurriculumDraft(identity.name, identity.region);
    return true;
  }

  async function publishCurriculum(input) {
    await init();
    if (!client) throw new Error("Supabase가 연결되지 않았습니다.");
    if (!user || !accessRole) throw new Error("담당 교사 또는 관리자 로그인이 필요합니다.");
    const admissionYear = Number(input?.admissionYear);
    if (!SUPPORTED_ADMISSION_YEARS.includes(admissionYear)) throw new Error("입학년도는 2024년, 2025년 또는 2026년만 등록할 수 있습니다.");
    let school = null;
    const existingSchoolId = input?.sourceFormat === "admin-edit" && accessRole === "admin" ? String(input.schoolId || "").trim() : "";
    if (existingSchoolId) {
      await loadSchools();
      school = schools.find((item) => item.id === existingSchoolId) || null;
      if (!school) throw new Error("수정할 연동 학교를 찾을 수 없습니다.");
    } else school = await findOrCreateSchool(input);
    const payload = {
      school_id: school.id,
      admission_year: admissionYear,
      data: { ...input, schoolId: school.id, schoolName: school.name, region: school.region },
      is_published: true,
      updated_by: user.id,
      updated_at: new Date().toISOString()
    };
    const { data: existing, error: lookupError } = await client
      .from("curricula")
      .select("id")
      .eq("school_id", school.id)
      .eq("admission_year", admissionYear)
      .maybeSingle();
    if (lookupError) throw lookupError;
    let action = "inserted";
    if (existing?.id) {
      const { error } = await client.from("curricula").update(payload).eq("id", existing.id);
      if (error) throw error;
      action = "updated";
    } else {
      const { error } = await client.from("curricula").insert(payload);
      if (error?.code === "23505") throw new Error(`${school.name} ${admissionYear}학년도 편제표는 이미 등록되어 있습니다.`);
      if (error) throw error;
    }
    await loadSchools();
    selectedSchool = schools.find((item) => item.id === school.id) || school;
    selectedAdmissionYear = admissionYear;
    localStorage.setItem(SELECTED_SCHOOL_KEY, school.id);
    localStorage.setItem(SELECTED_ADMISSION_YEAR_KEY, String(admissionYear));
    await loadCurriculum(school.id, admissionYear);
    emitChange("publish");
    return { ...snapshot(), action };
  }

  async function deleteCurriculum(curriculumId) {
    await init();
    if (!client || !user || accessRole !== "admin") throw new Error("관리자만 편제표를 삭제할 수 있습니다.");
    const id = String(curriculumId || curriculum?.id || "").trim();
    if (!id) throw new Error("삭제할 편제표를 찾을 수 없습니다.");
    const schoolId = selectedSchool?.id || curriculum?.schoolId || "";
    const { data, error } = await client.from("curricula").delete().eq("id", id).select("id").maybeSingle();
    if (error) throw error;
    if (!data?.id) throw new Error("편제표를 삭제하지 못했습니다. 관리자 권한과 편제표 상태를 확인해 주세요.");
    await loadSchools();
    selectedSchool = schools.find((school) => school.id === schoolId) || null;
    selectedAdmissionYear = null;
    curriculum = null;
    localStorage.removeItem(SELECTED_ADMISSION_YEAR_KEY);
    emitChange("delete");
    return snapshot();
  }

  async function deleteSchool(schoolId) {
    await init();
    if (!client || !user || accessRole !== "admin") throw new Error("관리자만 학교 연동 데이터를 삭제할 수 있습니다.");
    const id = String(schoolId || selectedSchool?.id || "").trim();
    if (!id) throw new Error("삭제할 학교를 찾을 수 없습니다.");
    const deletingSelectedSchool = selectedSchool?.id === id;
    const { data, error } = await client.from("schools").delete().eq("id", id).select("id").maybeSingle();
    if (error) throw error;
    if (!data?.id) throw new Error("학교를 삭제하지 못했습니다. 관리자 권한과 학교 상태를 확인해 주세요.");
    await loadSchools();
    if (deletingSelectedSchool) {
      selectedSchool = null;
      selectedAdmissionYear = null;
      curriculum = null;
      localStorage.removeItem(SELECTED_SCHOOL_KEY);
      localStorage.removeItem(SELECTED_ADMISSION_YEAR_KEY);
    } else if (selectedSchool) {
      selectedSchool = schools.find((school) => school.id === selectedSchool.id) || null;
    }
    emitChange("delete-school");
    return snapshot();
  }

  window.SchoolStore = {
    init,
    getSnapshot: snapshot,
    selectSchool,
    selectAdmissionYear,
    loadCurriculumForCopy,
    signInTeacher,
    signInAdmin,
    signOut,
    loadCurriculumDraft,
    saveCurriculumDraft,
    deleteCurriculumDraft,
    publishCurriculum,
    deleteCurriculum,
    deleteSchool,
    isConfigured: () => configured,
    regions: [...EDUCATION_OFFICE_REGIONS]
  };
})();
