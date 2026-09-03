(() => {
  "use strict";

  const SELECTED_SCHOOL_KEY = "course-guide:selected-school:v1";
  const FALLBACK_URL = "./data/schools.json";
  const config = window.SUPABASE_CONFIG || {};
  const configured = Boolean(config.url && config.publishableKey);
  let client = null;
  let initialized = false;
  let initPromise = null;
  let schools = [];
  let selectedSchool = null;
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

  function cleanSchool(row) {
    if (!row || typeof row !== "object") return null;
    return {
      id: String(row.id || row.slug || "").trim(),
      slug: String(row.slug || row.id || "").trim(),
      name: String(row.name || row.schoolName || "이름 없는 학교").trim(),
      region: String(row.region || "").trim(),
      updatedAt: row.updated_at || row.updatedAt || "",
      curriculum: row.curriculum && typeof row.curriculum === "object" ? row.curriculum : undefined
    };
  }

  function emitChange(reason = "update") {
    window.dispatchEvent(new CustomEvent("schooldatachange", { detail: { reason, ...snapshot() } }));
  }

  function snapshot() {
    return {
      configured,
      connection,
      message,
      schools: schools.map((school) => ({ ...school })),
      selectedSchool: selectedSchool ? { ...selectedSchool } : null,
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
      schools = (Array.isArray(payload) ? payload : payload.schools || []).map(cleanSchool).filter(Boolean);
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
    schools = (data || []).map(cleanSchool).filter(Boolean);
    return schools;
  }

  async function loadCurriculum(schoolId) {
    curriculum = null;
    if (!schoolId) return null;
    if (!client) {
      const localSchool = schools.find((school) => school.id === schoolId);
      curriculum = localSchool?.curriculum || null;
      return curriculum;
    }
    const { data, error } = await client
      .from("curricula")
      .select("id, school_id, admission_year, data, updated_at")
      .eq("school_id", schoolId)
      .eq("is_published", true)
      .order("admission_year", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    curriculum = data?.data && typeof data.data === "object"
      ? { ...data.data, id: data.id, schoolId: data.school_id, admissionYear: data.admission_year, updatedAt: data.updated_at }
      : null;
    return curriculum;
  }

  async function restoreSelection() {
    const selectedId = new URLSearchParams(location.search).get("school") || localStorage.getItem(SELECTED_SCHOOL_KEY) || "";
    selectedSchool = schools.find((school) => school.id === selectedId || school.slug === selectedId) || null;
    if (!selectedSchool && selectedId) localStorage.removeItem(SELECTED_SCHOOL_KEY);
    if (selectedSchool) {
      localStorage.setItem(SELECTED_SCHOOL_KEY, selectedSchool.id);
      await loadCurriculum(selectedSchool.id);
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
    curriculum = null;
    if (selectedSchool) {
      localStorage.setItem(SELECTED_SCHOOL_KEY, selectedSchool.id);
      try {
        await loadCurriculum(selectedSchool.id);
      } catch (error) {
        console.error("학교 편제표 불러오기 실패:", error);
        message = `${selectedSchool.name} 편제표를 불러오지 못했습니다.`;
      }
    } else {
      localStorage.removeItem(SELECTED_SCHOOL_KEY);
    }
    emitChange("selection");
    return snapshot();
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

  function newSchoolSlug() {
    const randomPart = globalThis.crypto?.randomUUID?.().slice(0, 8) || Math.random().toString(36).slice(2, 10);
    return `school-${Date.now().toString(36)}-${randomPart}`;
  }

  async function findOrCreateSchool(input) {
    const name = String(input?.schoolName || "").trim();
    const region = String(input?.region || "").trim();
    if (!name || !region) throw new Error("편제표의 지역과 학교명을 확인해 주세요.");
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
    if (school) schools = [...schools, school].sort((a, b) => a.name.localeCompare(b.name, "ko"));
    return school;
  }

  async function publishCurriculum(input) {
    await init();
    if (!client) throw new Error("Supabase가 연결되지 않았습니다.");
    if (!user || !accessRole) throw new Error("담당 교사 또는 관리자 로그인이 필요합니다.");
    const admissionYear = Number(input?.admissionYear);
    if (!Number.isInteger(admissionYear) || admissionYear < 2022 || admissionYear > 2100) throw new Error("적용 입학년도를 확인해 주세요.");
    const school = await findOrCreateSchool(input);
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
      if (accessRole !== "admin") throw new Error(`${school.name} ${admissionYear}학년도 편제표는 이미 등록되어 있습니다. 수정은 관리자만 할 수 있습니다.`);
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
    localStorage.setItem(SELECTED_SCHOOL_KEY, school.id);
    await loadCurriculum(school.id);
    emitChange("publish");
    return { ...snapshot(), action };
  }

  async function deleteCurriculum(curriculumId) {
    await init();
    if (!client || !user || accessRole !== "admin") throw new Error("관리자만 편제표를 삭제할 수 있습니다.");
    const id = String(curriculumId || curriculum?.id || "").trim();
    if (!id) throw new Error("삭제할 편제표를 찾을 수 없습니다.");
    const schoolId = selectedSchool?.id || curriculum?.schoolId || "";
    const { error } = await client.from("curricula").delete().eq("id", id);
    if (error) throw error;
    await loadCurriculum(schoolId);
    emitChange("delete");
    return snapshot();
  }

  window.SchoolStore = {
    init,
    getSnapshot: snapshot,
    selectSchool,
    signInTeacher,
    signInAdmin,
    signOut,
    publishCurriculum,
    deleteCurriculum,
    isConfigured: () => configured
  };
})();
