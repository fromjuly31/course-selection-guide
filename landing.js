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

  function closeSchoolMenu() {
    if (!menu || !trigger) return;
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  }

  function renderSchoolPicker(snapshot) {
    if (!picker || !options || !label) return;
    const selected = snapshot.selectedSchool;
    label.textContent = selected?.name || "학교를 선택하세요";
    picker.classList.toggle("has-selection", Boolean(selected));
    options.replaceChildren();
    if (!snapshot.schools.length) {
      const empty = document.createElement("span");
      empty.className = "school-menu-empty";
      empty.textContent = snapshot.configured
        ? "아직 연동된 학교가 없습니다."
        : "Supabase 설정 후 학교 목록이 표시됩니다.";
      options.append(empty);
      return;
    }
    snapshot.schools.forEach((school) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.schoolId = school.id;
      button.className = selected?.id === school.id ? "is-selected" : "";
      const name = document.createElement("strong");
      name.textContent = school.name;
      const region = document.createElement("small");
      region.textContent = school.region || "학교 편제표 연동";
      button.append(name, region);
      options.append(button);
    });
  }

  trigger?.addEventListener("click", () => {
    const willOpen = menu.hidden;
    menu.hidden = !willOpen;
    trigger.setAttribute("aria-expanded", String(willOpen));
  });

  options?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-school-id]");
    if (!button || !schoolStore) return;
    button.disabled = true;
    await schoolStore.selectSchool(button.dataset.schoolId);
    renderSchoolPicker(schoolStore.getSnapshot());
    closeSchoolMenu();
  });

  document.addEventListener("click", (event) => {
    if (picker && !picker.contains(event.target)) closeSchoolMenu();
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
