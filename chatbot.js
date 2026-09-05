(() => {
  "use strict";

  const store = window.DatabaseStore;
  const engineApi = window.CourseChatbotEngine;
  if (!store || !engineApi) return;

  const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="icons.svg#${name}"></use></svg>`;
  const shorten = (value, maximum = 180) => {
    const text = String(value ?? "").replace(/\s*\/\s*/g, " · ").replace(/\s+/g, " ").trim();
    return text.length > maximum ? `${text.slice(0, maximum).trim()}…` : text;
  };
  const escapeHtml = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const state = {
    database: null,
    engine: null,
    pendingChoices: [],
    readyPromise: null,
    open: false,
    faqOpen: false,
    collapsed: false
  };

  const shell = document.createElement("div");
  shell.className = "course-chatbot";
  shell.innerHTML = `
    <div class="course-support-launchers">
      <button class="course-chatbot-launcher" type="button" aria-label="챗봇 문의 열기" aria-expanded="false">
        ${icon("message")}<span>챗봇 문의</span>
      </button>
      <button class="course-faq-launcher" type="button" aria-label="FAQ 열기" aria-expanded="false">
        ${icon("help")}<span>FAQ</span>
      </button>
    </div>
    <button class="course-support-collapse" type="button" data-support-collapse aria-label="학과 비교와 도움 버튼 접기" aria-expanded="true" title="버튼 접기">
      <span class="course-support-collapse-glyph" aria-hidden="true"></span>
    </button>
    <section class="course-chatbot-panel" role="dialog" aria-modal="false" aria-labelledby="course-chatbot-title" hidden>
      <header class="course-chatbot-header">
        <div><span class="course-chatbot-mark">${icon("sparkles")}</span><div><strong id="course-chatbot-title">과목 추천 도우미</strong></div></div>
        <button type="button" data-chat-close aria-label="챗봇 닫기">${icon("close")}</button>
      </header>
      <div class="course-chatbot-messages" data-chat-messages aria-live="polite">
        <div class="course-chatbot-message is-bot">
          <p>안녕하세요. 관심 분야나 희망 진로를 말씀해 주세요. 확인된 DB 안에서 관련 과목을 함께 찾아보고, 질문이 넓으면 먼저 몇 가지를 여쭤볼게요.</p>
        </div>
      </div>
      <form class="course-chatbot-form" data-chat-form>
        <label><span class="sr-only">과목 또는 학과 추천 질문</span><input type="text" data-chat-input maxlength="200" autocomplete="off" placeholder="관심 분야 혹은 희망 진로를 입력하세요"></label>
        <button type="submit" aria-label="질문 보내기">${icon("send")}</button>
      </form>
      <p class="course-chatbot-disclaimer">DB에서 확인되는 내용만 답하며, 모든 답변 끝에 출처를 표시합니다.</p>
    </section>
    <section class="course-faq-panel" role="dialog" aria-modal="false" aria-labelledby="course-faq-title" hidden>
      <header class="course-chatbot-header course-faq-header">
        <div><span class="course-chatbot-mark">${icon("help")}</span><div><strong id="course-faq-title">자주 묻는 질문</strong><small>FAQ · 이용 안내</small></div></div>
        <button type="button" data-faq-close aria-label="FAQ 닫기">${icon("close")}</button>
      </header>
      <div class="course-faq-body">
        <div class="course-chatbot-faq-list">
          <details class="course-chatbot-faq-item">
            <summary><span>01</span><strong>${icon("solid-star")}반영 과목은 무슨 의미인가요?</strong></summary>
            <p>대학별로 발표한 '권장 과목', '핵심 과목'을 합쳐서 '반영 과목'으로 분류했습니다.</p>
          </details>
          <details class="course-chatbot-faq-item">
            <summary><span>02</span><strong>이 프로그램의 모든 정보를 100% 신뢰해도 되나요?</strong></summary>
            <p>아니요. 선택 교과 및 추천 과목 정보가 업데이트되지 않을 수 있으므로 꼭 검토해 보세요.</p>
          </details>
          <details class="course-chatbot-faq-item">
            <summary><span>03</span><strong>이 프로그램에 쓰인 데이터들의 출처는 무엇인가요?</strong></summary>
            <p>강원특별자치도교육청 「고교학점제를 위한 진로·학업 설계 안내서」, 커리어넷 「학과 정보」, 대학 어디가 「2028학년도 권역별 대학별 권장과목」 및 「2028학년도 계열별 대표 모집단위별 반영과목」의 자료를 기반으로 만들었습니다.</p>
          </details>
          <details class="course-chatbot-faq-item">
            <summary><span>04</span><strong>제가 희망하는 학과가 없어요.</strong></summary>
            <p>해당 학과가 커리어넷 또는 출처상 자료에 없는 학과일 수 있습니다. 자세한 내용은 해당 학과의 홈페이지를 참고해 주세요.</p>
          </details>
          <details class="course-chatbot-faq-item">
            <summary><span>05</span><strong>학교 데이터는 어떻게 연동하나요?</strong></summary>
            <p>데이터 연동 탭에서 학교 편제표 표준 양식을 업로드할 수 있습니다.</p>
          </details>
        </div>
      </div>
    </section>
    <dialog class="course-chatbot-detail-dialog" data-chat-detail-dialog aria-labelledby="course-chatbot-detail-title">
      <button class="course-chatbot-detail-close" type="button" data-chat-detail-close aria-label="상세 정보 닫기">${icon("close")}</button>
      <div data-chat-detail-content></div>
    </dialog>`;
  document.body.append(shell);

  const launcher = shell.querySelector(".course-chatbot-launcher");
  const panel = shell.querySelector(".course-chatbot-panel");
  const faqLauncher = shell.querySelector(".course-faq-launcher");
  const faqPanel = shell.querySelector(".course-faq-panel");
  const collapseControl = shell.querySelector("[data-support-collapse]");
  const messages = shell.querySelector("[data-chat-messages]");
  const input = shell.querySelector("[data-chat-input]");
  const detailDialog = shell.querySelector("[data-chat-detail-dialog]");
  const detailContent = shell.querySelector("[data-chat-detail-content]");
  let detailReturnFocus = null;

  async function prepareDatabase() {
    if (state.database) return state.database;
    if (state.readyPromise) return state.readyPromise;

    state.readyPromise = (async () => {
      let database = (await store.loadDatabase()).database;
      if (!database.chatbot?.keywordWeights?.length) database = await store.fetchDefaultDatabase();
      if (!database.rows?.length || !database.chatbot?.keywordWeights?.length) {
        throw new Error("과목 또는 챗봇 가중치 데이터가 없습니다.");
      }

      state.database = database;
      state.engine = engineApi.createEngine(database);
      return database;
    })().catch((error) => {
      state.readyPromise = null;
      throw error;
    });
    return state.readyPromise;
  }

  function scoreCourses(query) {
    return state.engine ? state.engine.scoreCourses(query) : { results: [], exact: false, confident: false };
  }

  function scrollMessageToTop(message) {
    if (!message) return;
    requestAnimationFrame(() => {
      messages.querySelector(".course-chatbot-scroll-spacer")?.remove();
      const styles = getComputedStyle(messages);
      const paddingTop = Number.parseFloat(styles.paddingTop) || 0;
      const paddingBottom = Number.parseFloat(styles.paddingBottom) || 0;
      const spacer = document.createElement("div");
      spacer.className = "course-chatbot-scroll-spacer";
      spacer.setAttribute("aria-hidden", "true");
      spacer.style.height = `${Math.max(0, messages.clientHeight - message.getBoundingClientRect().height - paddingTop - paddingBottom)}px`;
      messages.append(spacer);
      requestAnimationFrame(() => {
        const messageTop = message.getBoundingClientRect().top;
        const messagesTop = messages.getBoundingClientRect().top;
        messages.scrollTo({
          top: Math.max(0, messages.scrollTop + messageTop - messagesTop - paddingTop),
          behavior: "auto"
        });
      });
    });
  }

  function clearMessageScrollSpacer() {
    messages.querySelector(".course-chatbot-scroll-spacer")?.remove();
  }

  function splitCourseTopics(value) {
    return String(value || "")
      .split(/\r?\n|[•●▪]/u)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function resultSourceLabel(result) {
    const ids = [...(result.sourceIds || [])];
    const labels = ids.map((id) => {
      const source = state.engine?.sourceById?.get(String(id));
      if (!source) return String(id);
      const institution = String(source.institution || source["기관"] || "").trim();
      const title = String(source.title || source["자료명"] || source["주소/자료"] || "").trim();
      return [institution, title && `「${title}」`].filter(Boolean).join(", ");
    }).filter(Boolean);
    return labels.length ? `[출처: ${labels.join(" / ")}]` : "[출처: 과목선택 데이터베이스]";
  }

  function courseDetailMarkup(result) {
    const subject = result.subject;
    const name = subject["과목명"] || "과목 상세 정보";
    const badges = [subject["과목유형"], subject["교과군"], subject["선택과목의 종류"] || subject["과목 구분"]].filter(Boolean);
    const facts = [
      ["과목 구분", subject["과목 구분"]],
      ["성취도", subject["성취도"]],
      ["석차등급", subject["석차등급"]],
      ["수능 출제", subject["수능 출제 여부"]]
    ].filter(([, value]) => String(value || "").trim());
    const topics = splitCourseTopics(subject["과목의 주요 내용"]);
    return `<article class="course-chatbot-detail">
      <header class="course-chatbot-detail-head">
        <span>${icon("book-open")}</span>
        <div><small>COURSE GUIDE</small><h2 id="course-chatbot-detail-title">${escapeHtml(name)}</h2><div>${badges.map((badge) => `<em>${escapeHtml(badge)}</em>`).join("")}</div></div>
      </header>
      ${facts.length ? `<dl class="course-chatbot-detail-facts">${facts.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl>` : ""}
      <div class="course-chatbot-detail-sections">
        ${subject["이 과목은 어떤 과목인가요?"] ? `<section><h3>어떤 과목인가요?</h3><p>${escapeHtml(subject["이 과목은 어떤 과목인가요?"])}</p></section>` : ""}
        ${subject["이 과목을 누구에게 추천하나요?"] ? `<section class="is-recommendation"><h3>누구에게 추천하나요?</h3><p>${escapeHtml(subject["이 과목을 누구에게 추천하나요?"])}</p></section>` : ""}
        ${topics.length ? `<section><h3>주요 내용</h3><ul>${topics.map((topic) => `<li>${escapeHtml(topic)}</li>`).join("")}</ul></section>` : ""}
      </div>
      <p class="course-chatbot-detail-source">${escapeHtml(resultSourceLabel(result))}</p>
    </article>`;
  }

  function departmentDetailMarkup(result) {
    const department = result.department;
    const guide = department.guide || {};
    const subjects = Array.isArray(department.relatedSubjects) ? department.relatedSubjects : [];
    return `<article class="course-chatbot-detail">
      <header class="course-chatbot-detail-head">
        <span>${icon("graduation")}</span>
        <div><small>DEPARTMENT GUIDE</small><h2 id="course-chatbot-detail-title">${escapeHtml(department.name || "학과 상세 정보")}</h2>${department.field ? `<div><em>${escapeHtml(department.field)} 분야</em></div>` : ""}</div>
      </header>
      <div class="course-chatbot-detail-sections">
        ${guide.overview ? `<section><h3>학과 소개</h3><p>${escapeHtml(guide.overview)}</p></section>` : ""}
        ${guide.aptitude ? `<section class="is-recommendation"><h3>어떤 학생에게 맞나요?</h3><p>${escapeHtml(guide.aptitude)}</p></section>` : ""}
        ${guide.careers ? `<section><h3>관련 진로</h3><p>${escapeHtml(guide.careers)}</p></section>` : ""}
        ${subjects.length ? `<section><h3>관련 과목</h3><ul>${subjects.map((subject) => `<li>${escapeHtml(subject)}</li>`).join("")}</ul></section>` : ""}
      </div>
    </article>`;
  }

  function openRecommendationDetail(result, trigger) {
    if (!result?.subject && !result?.department) return;
    detailReturnFocus = trigger || document.activeElement;
    detailContent.innerHTML = result.subject ? courseDetailMarkup(result) : departmentDetailMarkup(result);
    if (!detailDialog.open) detailDialog.showModal();
    detailDialog.scrollTop = 0;
    requestAnimationFrame(() => detailDialog.querySelector("[data-chat-detail-close]")?.focus({ preventScroll: true }));
  }

  function closeRecommendationDetail() {
    if (detailDialog.open) detailDialog.close();
  }

  function appendTextMessage(text, role = "bot", options = {}) {
    clearMessageScrollSpacer();
    const wrapper = document.createElement("div");
    wrapper.className = `course-chatbot-message is-${role}`;
    const paragraph = document.createElement("p");
    paragraph.textContent = text;
    wrapper.append(paragraph);
    messages.append(wrapper);
    if (options.scrollToEnd !== false) messages.scrollTop = messages.scrollHeight;
    return wrapper;
  }

  function appendBotResponse(answerData, options = {}) {
    clearMessageScrollSpacer();
    const wrapper = document.createElement("div");
    wrapper.className = `course-chatbot-message is-bot${answerData.results?.length ? " has-results" : ""}`;
    if (answerData.intentId === "FAQ_CLARIFY") wrapper.classList.add("is-faq-clarification");
    const introduction = document.createElement("p");
    introduction.textContent = answerData.text;
    wrapper.append(introduction);

    (answerData.results || []).forEach((result, index) => {
      const subject = result.subject;
      const department = result.department;
      if (!subject && !department) return;
      const entityType = department ? "학과" : "과목";
      const entityName = department?.name || subject["과목명"];
      const card = document.createElement("article");
      card.className = "course-chatbot-result";

      const heading = document.createElement("div");
      const rank = document.createElement("span");
      rank.textContent = answerData.exact ? `${entityType} 정보` : `추천 ${String(index + 1).padStart(2, "0")}`;
      const name = document.createElement("strong");
      name.textContent = entityName;
      const meta = document.createElement("small");
      meta.textContent = department
        ? [department.field, "학과"].filter(Boolean).join(" · ")
        : [subject["과목유형"], subject["교과군"], subject["선택과목의 종류"] || subject["과목 구분"]].filter(Boolean).join(" · ");
      heading.append(rank, name, meta);

      const description = document.createElement("p");
      description.textContent = department
        ? shorten(department.guide?.overview, answerData.exact ? 260 : 170) || "DB에 등록된 학과 설명을 확인해 보세요."
        : shorten(subject["이 과목은 어떤 과목인가요?"], answerData.exact ? 260 : 170) || "DB에 등록된 과목 설명을 확인해 보세요.";
      const recommendation = document.createElement("p");
      recommendation.className = "course-chatbot-reason";
      const relation = [...(result.reasons || [])].filter((reason) => reason !== "과목명 정확 일치").slice(0, 2).join(" · ");
      const recommendationText = department?.guide?.aptitude || subject?.["이 과목을 누구에게 추천하나요?"];
      recommendation.textContent = recommendationText
        ? `이런 학생에게 잘 맞아요: ${shorten(recommendationText, 170)}`
        : `DB 연결 근거: ${relation || `${entityType} 정보`}`;

      const footer = document.createElement("div");
      const keywords = document.createElement("span");
      const linkedTerms = [...(result.terms || [])].slice(0, 4);
      keywords.textContent = linkedTerms.length ? `연결 키워드 · ${linkedTerms.join(" · ")}` : `DB ${entityType} 프로필 연계`;
      const detailButton = document.createElement("button");
      detailButton.type = "button";
      detailButton.className = "course-chatbot-result-detail";
      detailButton.setAttribute("aria-haspopup", "dialog");
      detailButton.textContent = "상세 보기";
      detailButton.addEventListener("click", () => openRecommendationDetail(result, detailButton));
      footer.append(keywords, detailButton);
      card.append(heading, description, recommendation, footer);
      wrapper.append(card);
    });

    if (answerData.followupText) {
      const followup = document.createElement("p");
      followup.className = "course-chatbot-followup-question";
      followup.textContent = answerData.followupText;
      wrapper.append(followup);
    }

    if (answerData.choices?.length) {
      const choices = document.createElement("div");
      choices.className = "course-chatbot-followups";
      answerData.choices.forEach((choice) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = choice.label;
        button.addEventListener("click", () => answer(choice.prompt));
        choices.append(button);
      });
      wrapper.append(choices);
    }

    const source = document.createElement("p");
    source.className = "course-chatbot-source";
    source.textContent = answerData.sourceText || "[출처: 데이터베이스에 확인 가능한 자료 없음]";
    wrapper.append(source);
    messages.append(wrapper);
    if (options.scrollToEnd !== false) messages.scrollTop = messages.scrollHeight;
    return wrapper;
  }

  async function answer(query) {
    const cleanQuery = String(query || "").trim();
    if (!cleanQuery) return;
    appendTextMessage(cleanQuery, "user");
    input.value = "";
    input.disabled = true;

    const loading = appendTextMessage("DB에서 관련 내용과 출처를 함께 확인하고 있어요.");
    loading.classList.add("is-loading");
    try {
      await prepareDatabase();
      loading.remove();
      let effectiveQuery = cleanQuery;
      if (state.pendingChoices.length) {
        const normalizedQuery = engineApi.normalize(cleanQuery);
        const matchedChoice = state.pendingChoices.find((choice) => {
          const normalizedLabel = engineApi.normalize(choice.label);
          return normalizedLabel === normalizedQuery || normalizedLabel.includes(normalizedQuery) || normalizedQuery.includes(normalizedLabel);
        });
        if (matchedChoice) effectiveQuery = matchedChoice.prompt;
      }
      state.pendingChoices = [];
      const answerData = state.engine.respond(effectiveQuery);
      if (answerData.kind === "clarification") state.pendingChoices = answerData.choices || [];
      const response = appendBotResponse(answerData, { scrollToEnd: false });
      scrollMessageToTop(response);
    } catch (error) {
      console.error("챗봇 데이터 로딩 실패:", error);
      loading.remove();
      const response = appendBotResponse({
        kind: "fallback",
        text: "지금은 과목 DB를 불러오지 못했어요. 잠시 뒤 다시 시도해 주시고, 계속 같은 문제가 생기면 선생님에게 문의해 주세요.",
        results: [],
        choices: [],
        sourceText: "[출처: 데이터베이스 연결 실패]"
      }, { scrollToEnd: false });
      scrollMessageToTop(response);
    } finally {
      input.disabled = false;
      input.focus();
    }
  }

  function setOpen(open) {
    if (open && state.faqOpen) {
      state.faqOpen = false;
      faqPanel.hidden = true;
      shell.classList.remove("is-faq-open");
      faqLauncher.setAttribute("aria-expanded", "false");
      faqLauncher.setAttribute("aria-label", "FAQ 열기");
    }
    state.open = open;
    panel.hidden = !open;
    shell.classList.toggle("is-open", open);
    launcher.setAttribute("aria-expanded", String(open));
    launcher.setAttribute("aria-label", open ? "챗봇 문의 닫기" : "챗봇 문의 열기");
    if (open) {
      prepareDatabase().catch(() => {});
      setTimeout(() => input.focus(), 0);
    } else {
      launcher.focus();
    }
  }

  function setFaqOpen(open) {
    if (open && state.open) {
      state.open = false;
      panel.hidden = true;
      shell.classList.remove("is-open");
      launcher.setAttribute("aria-expanded", "false");
      launcher.setAttribute("aria-label", "챗봇 문의 열기");
    }
    state.faqOpen = open;
    faqPanel.hidden = !open;
    shell.classList.toggle("is-faq-open", open);
    faqLauncher.setAttribute("aria-expanded", String(open));
    faqLauncher.setAttribute("aria-label", open ? "FAQ 닫기" : "FAQ 열기");
    if (!open) faqLauncher.focus();
  }

  function setSupportCollapsed(collapsed) {
    if (collapsed) {
      if (state.open) setOpen(false);
      if (state.faqOpen) setFaqOpen(false);
    }
    state.collapsed = collapsed;
    shell.classList.toggle("is-collapsed", collapsed);
    document.documentElement.classList.toggle("support-launchers-collapsed", collapsed);
    collapseControl.setAttribute("aria-expanded", String(!collapsed));
    collapseControl.setAttribute("aria-label", collapsed ? "학과 비교와 도움 버튼 펼치기" : "학과 비교와 도움 버튼 접기");
    collapseControl.setAttribute("title", collapsed ? "버튼 펼치기" : "버튼 접기");
    collapseControl.focus();
  }

  launcher.addEventListener("click", () => setOpen(!state.open));
  faqLauncher.addEventListener("click", () => setFaqOpen(!state.faqOpen));
  collapseControl.addEventListener("click", () => setSupportCollapsed(!state.collapsed));
  shell.querySelector("[data-chat-close]").addEventListener("click", () => setOpen(false));
  shell.querySelector("[data-faq-close]").addEventListener("click", () => setFaqOpen(false));
  shell.querySelector("[data-chat-detail-close]").addEventListener("click", closeRecommendationDetail);
  detailDialog.addEventListener("click", (event) => {
    if (event.target !== detailDialog) return;
    const bounds = detailDialog.getBoundingClientRect();
    const inside = event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
    if (!inside) closeRecommendationDetail();
  });
  detailDialog.addEventListener("close", () => {
    detailReturnFocus?.focus?.({ preventScroll: true });
    detailReturnFocus = null;
  });
  shell.querySelector("[data-chat-form]").addEventListener("submit", (event) => {
    event.preventDefault();
    answer(input.value);
  });
  shell.querySelectorAll(".course-chatbot-faq-item").forEach((item) => {
    item.addEventListener("toggle", () => {
      if (!item.open) return;
      shell.querySelectorAll(".course-chatbot-faq-item[open]").forEach((other) => {
        if (other !== item) other.open = false;
      });
    });
  });
  document.addEventListener("keydown", (event) => {
    if (detailDialog.open) return;
    if (event.key === "Escape" && state.open) setOpen(false);
    else if (event.key === "Escape" && state.faqOpen) setFaqOpen(false);
  });

  window.CourseChatbot = { prepareDatabase, scoreCourses, answer, getState: () => state };
})();
