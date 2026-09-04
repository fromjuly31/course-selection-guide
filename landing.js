(() => {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  requestAnimationFrame(() => document.body.classList.add("is-ready"));

  const parallax = document.querySelector("[data-parallax]");
  if (parallax && !reduceMotion && window.matchMedia("(pointer: fine)").matches) {
    window.addEventListener("pointermove", (event) => {
      const x = ((event.clientX / window.innerWidth) - 0.5) * 14;
      const y = ((event.clientY / window.innerHeight) - 0.5) * 14;
      parallax.style.setProperty("--mx", `${x}px`);
      parallax.style.setProperty("--my", `${y}px`);
    }, { passive: true });
  }

  const schoolStore = window.SchoolStore;
  const picker = document.querySelector("[data-school-picker]");
  const trigger = picker?.querySelector("[data-school-trigger]");
  const menu = picker?.querySelector("[data-school-menu]");
  const options = picker?.querySelector("[data-school-options]");
  const label = picker?.querySelector("[data-school-picker-label]");
  const meta = picker?.querySelector("[data-school-picker-meta]");
  const search = picker?.querySelector("[data-school-search]");
  const count = picker?.querySelector("[data-school-list-count]");
  const listView = picker?.querySelector("[data-school-list-view]");
  const yearView = picker?.querySelector("[data-school-year-view]");
  const yearMeta = picker?.querySelector("[data-school-year-meta]");
  const yearName = picker?.querySelector("[data-school-year-name]");
  const yearOptions = picker?.querySelector("[data-school-year-options]");
  const currentMeta = picker?.querySelector("[data-school-current-meta]");
  const currentName = picker?.querySelector("[data-school-current-name]");
  let schoolSearch = "";
  let pendingSchoolId = "";

  function orderedSchools(schools) {
    return [...schools].sort((a, b) => String(a.region || "").localeCompare(String(b.region || ""), "ko")
      || String(a.name || "").localeCompare(String(b.name || ""), "ko"));
  }

  function admissionYears(school) {
    return [...new Set((school?.admissionYears || []).map(Number).filter(Number.isInteger))].sort((a, b) => b - a);
  }

  function showSchoolList() {
    pendingSchoolId = "";
    if (listView) listView.hidden = false;
    if (yearView) yearView.hidden = true;
    requestAnimationFrame(() => search?.focus());
  }

  function showAdmissionYears(school) {
    const years = admissionYears(school);
    if (!yearView || !yearOptions) return;
    pendingSchoolId = school.id;
    if (listView) listView.hidden = true;
    yearView.hidden = false;
    if (yearMeta) yearMeta.textContent = `${school.region || "지역 정보 없음"} · ${years.length}개 입학년도`;
    if (yearName) yearName.textContent = school.name;
    yearView.querySelector("p")?.replaceChildren(document.createTextNode("연동할 입학년도를 선택하세요."));
    const yearButtons = years.map((year) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.schoolConnectYear = String(year);
      button.textContent = `${year}년 입학생`;
      return button;
    });
    if (!yearButtons.length) {
      const empty = document.createElement("em");
      empty.textContent = "등록된 편제표가 없습니다.";
      yearButtons.push(empty);
    }
    yearOptions.replaceChildren(...yearButtons);
    requestAnimationFrame(() => yearOptions.querySelector("button")?.focus());
  }

  function closeSchoolMenu() {
    if (!menu || !trigger) return;
    if (menu.open) menu.close();
    trigger.setAttribute("aria-expanded", "false");
    showSchoolList();
  }

  function openSchoolMenu() {
    if (!menu || !trigger) return;
    showSchoolList();
    if (!menu.open) menu.showModal();
    trigger.setAttribute("aria-expanded", "true");
  }

  function renderSchoolPicker(snapshot) {
    if (!picker || !options || !label || !meta) return;
    const selected = snapshot.selectedSchool && snapshot.selectedAdmissionYear ? snapshot.selectedSchool : null;
    label.textContent = selected?.name || "미선택";
    meta.textContent = selected ? `${selected.region || "지역 정보 없음"} · ${snapshot.selectedAdmissionYear}년 입학생` : "학교 선택";
    picker.classList.toggle("has-selection", Boolean(selected));
    if (currentMeta) currentMeta.textContent = selected ? `${selected.region || "지역 정보 없음"} · ${snapshot.selectedAdmissionYear}년 입학생` : "현재 연동 학교";
    if (currentName) currentName.textContent = selected?.name || "미선택";
    const schools = orderedSchools(snapshot.schools || []);
    const keyword = schoolSearch.replace(/\s+/g, "").toLocaleLowerCase("ko-KR");
    const filtered = schools.filter((school) => !keyword || `${school.region || ""}${school.name || ""}`.replace(/\s+/g, "").toLocaleLowerCase("ko-KR").includes(keyword));
    if (count) count.textContent = `${snapshot.schools.length.toLocaleString("ko-KR")}개 학교`;
    options.replaceChildren();
    if (!filtered.length) {
      const empty = document.createElement("span");
      empty.className = "school-menu-empty";
      empty.textContent = snapshot.schools.length
        ? "검색 결과가 없습니다."
        : snapshot.configured
        ? "아직 연동된 학교가 없습니다."
        : "Supabase 설정 후 학교 목록이 표시됩니다.";
      options.append(empty);
      return;
    }
    filtered.forEach((school) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.schoolId = school.id;
      button.className = selected?.id === school.id ? "is-selected" : "";
      const region = document.createElement("small");
      const years = admissionYears(school);
      region.textContent = `${school.region || "지역 정보 없음"} · ${years.length}개 입학년도`;
      const name = document.createElement("strong");
      name.textContent = school.name;
      button.append(region, name);
      options.append(button);
    });
  }

  trigger?.addEventListener("click", openSchoolMenu);

  options?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-school-id]");
    if (!button || !schoolStore) return;
    const school = schoolStore.getSnapshot().schools.find((item) => item.id === button.dataset.schoolId);
    if (school) showAdmissionYears(school);
  });

  menu?.addEventListener("click", async (event) => {
    if (event.target === menu || event.target.closest("[data-school-menu-close]")) {
      closeSchoolMenu();
      return;
    }
    if (event.target.closest("[data-school-year-back]")) {
      showSchoolList();
      return;
    }
    const yearButton = event.target.closest("[data-school-connect-year]");
    if (!yearButton || !pendingSchoolId || !schoolStore) return;
    yearButton.disabled = true;
    try {
      const snapshot = await schoolStore.selectSchoolAdmissionYear(pendingSchoolId, Number(yearButton.dataset.schoolConnectYear));
      renderSchoolPicker(snapshot);
      closeSchoolMenu();
    } catch (error) {
      yearButton.disabled = false;
      yearView?.querySelector("p")?.replaceChildren(document.createTextNode(error.message || "편제표를 불러오지 못했습니다."));
    }
  });

  search?.addEventListener("input", () => {
    schoolSearch = search.value;
    renderSchoolPicker(schoolStore?.getSnapshot?.() || { schools: [] });
  });

  document.querySelectorAll("[data-nav-href]").forEach((button) => {
    button.addEventListener("click", () => location.assign(button.dataset.navHref));
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeSchoolMenu();
  });
  window.addEventListener("schooldatachange", (event) => renderSchoolPicker(event.detail));

  if (schoolStore) {
    schoolStore.init().then(renderSchoolPicker).catch((error) => {
      console.error("학교 선택 초기화 실패:", error);
    });
  }
})();
