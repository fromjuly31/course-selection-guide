(() => {
  "use strict";

  const store = window.DatabaseStore;
  if (!store) return;

  const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="icons.svg#${name}"></use></svg>`;
  const normalize = (value) => String(value ?? "").normalize("NFKC").toLocaleLowerCase("ko").replace(/\s+/g, "");
  const splitValues = (value) => String(value ?? "").split(/[;,，|·\n]+/).map((item) => item.trim()).filter(Boolean);
  const shorten = (value, maximum = 180) => {
    const text = String(value ?? "").replace(/\s*\/\s*/g, " · ").replace(/\s+/g, " ").trim();
    return text.length > maximum ? `${text.slice(0, maximum).trim()}…` : text;
  };

  const STOP_WORDS = new Set([
    "나는", "제가", "저는", "우리", "학생", "과목", "수업", "추천", "추천해줘", "추천해주세요", "알려줘", "알려주세요",
    "어떤", "무슨", "관련", "관심", "있어", "있어요", "하고", "싶어", "싶어요", "좋아", "좋아요", "대한", "위한", "되는",
    "배우는", "배우고", "공부", "진로", "선택", "고등학교", "궁금해", "궁금해요", "인가요", "뭔가요", "어떻게", "할까요"
  ]);

  const state = {
    database: null,
    subjects: [],
    subjectByName: new Map(),
    weights: [],
    settings: new Map(),
    readyPromise: null,
    open: false,
    faqOpen: false,
    collapsed: true
  };

  const shell = document.createElement("div");
  shell.className = "course-chatbot is-collapsed";
  shell.innerHTML = `
    <div class="course-support-launchers">
      <button class="course-chatbot-launcher" type="button" aria-label="챗봇 문의 열기" aria-expanded="false">
        ${icon("message")}<span>챗봇 문의</span>
      </button>
      <button class="course-faq-launcher" type="button" aria-label="FAQ 열기" aria-expanded="false">
        ${icon("help")}<span>FAQ</span>
      </button>
    </div>
    <button class="course-support-collapse" type="button" data-support-collapse aria-label="학과 비교와 도움 버튼 펼치기" aria-expanded="false" title="버튼 펼치기">
      <span class="course-support-collapse-glyph" aria-hidden="true"></span>
    </button>
    <section class="course-chatbot-panel" role="dialog" aria-modal="false" aria-labelledby="course-chatbot-title" hidden>
      <header class="course-chatbot-header">
        <div><span class="course-chatbot-mark">${icon("sparkles")}</span><div><strong id="course-chatbot-title">과목 추천 도우미</strong></div></div>
        <button type="button" data-chat-close aria-label="챗봇 닫기">${icon("close")}</button>
      </header>
      <div class="course-chatbot-messages" data-chat-messages aria-live="polite">
        <div class="course-chatbot-message is-bot">
          <p>관심 분야 혹은 희망 진로를 입력하세요. 2022 개정 교육과정에 근거하여 과목 추천 혹은 학과를 소개해 드릴게요.</p>
        </div>
      </div>
      <div class="course-chatbot-suggestions" aria-label="대학교 관심 분야 빠른 선택">
        <span class="course-chatbot-suggestion-label">대학교 관심 분야</span>
        <button type="button" data-chat-prompt="인문 분야 학과와 과목을 추천해 주세요">인문</button>
        <button type="button" data-chat-prompt="사회 분야 학과와 과목을 추천해 주세요">사회</button>
        <button type="button" data-chat-prompt="자연 분야 학과와 과목을 추천해 주세요">자연</button>
        <button type="button" data-chat-prompt="공학 분야 학과와 과목을 추천해 주세요">공학</button>
        <button type="button" data-chat-prompt="의학 분야 학과와 과목을 추천해 주세요">의학</button>
        <button type="button" data-chat-prompt="교육 분야 학과와 과목을 추천해 주세요">교육</button>
        <button type="button" data-chat-prompt="예체능 분야 학과와 과목을 추천해 주세요">예체능</button>
        <button type="button" data-chat-prompt="기타 분야 학과와 과목을 추천해 주세요">기타</button>
      </div>
      <form class="course-chatbot-form" data-chat-form>
        <label><span class="sr-only">과목 또는 학과 추천 질문</span><input type="text" data-chat-input maxlength="200" autocomplete="off" placeholder="관심 분야 혹은 희망 진로를 입력하세요"></label>
        <button type="submit" aria-label="질문 보내기">${icon("send")}</button>
      </form>
      <p class="course-chatbot-disclaimer">과목 DB의 키워드·가중치로 계산한 참고용 안내입니다.</p>
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
    </section>`;
  document.documentElement.classList.add("support-launchers-collapsed");
  document.body.append(shell);

  const launcher = shell.querySelector(".course-chatbot-launcher");
  const panel = shell.querySelector(".course-chatbot-panel");
  const faqLauncher = shell.querySelector(".course-faq-launcher");
  const faqPanel = shell.querySelector(".course-faq-panel");
  const collapseControl = shell.querySelector("[data-support-collapse]");
  const messages = shell.querySelector("[data-chat-messages]");
  const input = shell.querySelector("[data-chat-input]");

  function settingNumber(name, fallback) {
    const value = state.settings.get(name)?.["값"];
    const number = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(number) ? number : fallback;
  }

  function tokenize(query) {
    const minimumLength = settingNumber("최소 검색어 길이", 2);
    return [...new Set((String(query).normalize("NFKC").toLocaleLowerCase("ko").match(/[0-9a-z가-힣]+/g) || [])
      .filter((token) => token.length >= minimumLength && !STOP_WORDS.has(token)))];
  }

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
      state.subjects = database.rows.filter((row) => String(row["과목명"] || "").trim());
      state.subjectByName = new Map(state.subjects.map((row) => [normalize(row["과목명"]), row]));
      state.weights = database.chatbot.keywordWeights;
      state.settings = new Map(database.chatbot.searchSettings.map((row) => [String(row["항목"] || "").trim(), row]));
      return database;
    })().catch((error) => {
      state.readyPromise = null;
      throw error;
    });
    return state.readyPromise;
  }

  function scoreCourses(query) {
    const queryCompact = normalize(query);
    const queryTokens = tokenize(query);
    const scores = new Map();
    const exactSubjects = new Set();
    const exactBonus = settingNumber("과목명 정확 일치 보너스", 100);
    const partialBonus = settingNumber("과목명 부분 일치 보너스", 40);
    const synonymMultiplier = settingNumber("동의어 DB 점수 배수", 4);
    const recommendationScore = settingNumber("추천대상 필드 직접 일치", 8);
    const descriptionScore = settingNumber("과목 설명 필드 직접 일치", 5);
    const contentScore = settingNumber("주요내용 필드 직접 일치", 6);
    const faqScore = settingNumber("그 외 질문 필드 직접 일치", 4);
    const groupScore = settingNumber("교과군 직접 일치", 3);
    const additionalBonus = settingNumber("추가 키워드 동시 일치 보너스", 5);
    const additionalCap = settingNumber("추가 키워드 보너스 상한", 20);

    const addScore = (subject, points, term, reason) => {
      if (!subject || !Number.isFinite(points) || points <= 0) return;
      const name = String(subject["과목명"] || "").trim();
      if (!name) return;
      if (!scores.has(name)) scores.set(name, { subject, score: 0, terms: new Set(), reasons: new Set() });
      const result = scores.get(name);
      result.score += points;
      if (term) result.terms.add(term);
      if (reason) result.reasons.add(reason);
    };

    state.subjects.forEach((subject) => {
      const name = String(subject["과목명"] || "").trim();
      const normalizedName = normalize(name);
      if (normalizedName && queryCompact.includes(normalizedName)) {
        exactSubjects.add(name);
        addScore(subject, exactBonus, name, "과목명 정확 일치");
      } else {
        const nameToken = queryTokens.find((token) => normalize(token).length >= 2 && normalizedName.includes(normalize(token)));
        if (nameToken) addScore(subject, partialBonus, nameToken, "과목명 부분 일치");
      }

      const group = String(subject["교과군"] || "").trim();
      if (group && queryCompact.includes(normalize(group))) addScore(subject, groupScore, group, "교과군 일치");
    });

    const bestSynonymMatches = new Map();
    state.weights.forEach((weightRow) => {
      const searchTerm = String(weightRow["검색어"] || "").trim();
      const normalizedTerm = normalize(searchTerm);
      if (!normalizedTerm || normalizedTerm.length < settingNumber("최소 검색어 길이", 2) || !queryCompact.includes(normalizedTerm)) return;
      splitValues(weightRow["적용과목"]).forEach((courseName) => {
        const subject = state.subjectByName.get(normalize(courseName));
        if (!subject) return;
        const key = `${normalize(courseName)}\u0000${normalizedTerm}`;
        const points = Number(weightRow["가중치"]) || 0;
        const previous = bestSynonymMatches.get(key);
        if (!previous || points > previous.points) {
          bestSynonymMatches.set(key, { subject, points, searchTerm, relation: String(weightRow["관계유형"] || "연관 키워드") });
        }
      });
    });
    bestSynonymMatches.forEach((match) => addScore(match.subject, match.points * synonymMultiplier, match.searchTerm, match.relation));

    const fieldRules = [
      ["이 과목을 누구에게 추천하나요?", recommendationScore, "추천 대상 일치"],
      ["이 과목은 어떤 과목인가요?", descriptionScore, "과목 설명 일치"],
      ["과목의 주요 내용", contentScore, "주요 내용 일치"],
      ["그 외 질문 1", faqScore, "추가 안내 일치"],
      ["그 외 질문 2", faqScore, "추가 안내 일치"]
    ];
    state.subjects.forEach((subject) => {
      queryTokens.forEach((token) => {
        const normalizedToken = normalize(token);
        fieldRules.forEach(([field, points, reason]) => {
          if (normalize(subject[field]).includes(normalizedToken)) addScore(subject, points, token, reason);
        });
      });
    });

    scores.forEach((result) => {
      const extraMatches = Math.max(0, result.terms.size - 1);
      result.score += Math.min(additionalCap, extraMatches * additionalBonus);
    });

    const sorted = [...scores.values()].filter((result) => result.score > 0)
      .sort((a, b) => b.score - a.score || String(a.subject["과목명"]).localeCompare(String(b.subject["과목명"]), "ko"));
    const exactResults = sorted.filter((result) => exactSubjects.has(String(result.subject["과목명"])));
    const limit = exactResults.length ? Math.min(3, exactResults.length) : settingNumber("상위 추천 개수", 5);
    return { results: (exactResults.length ? exactResults : sorted).slice(0, limit), exact: exactResults.length > 0, tokens: queryTokens };
  }

  function scrollMessageToTop(message) {
    if (!message) return;
    requestAnimationFrame(() => {
      const messageTop = message.getBoundingClientRect().top;
      const messagesTop = messages.getBoundingClientRect().top;
      const paddingTop = Number.parseFloat(getComputedStyle(messages).paddingTop) || 0;
      messages.scrollTo({
        top: Math.max(0, messages.scrollTop + messageTop - messagesTop - paddingTop),
        behavior: "smooth"
      });
    });
  }

  function appendTextMessage(text, role = "bot", options = {}) {
    const wrapper = document.createElement("div");
    wrapper.className = `course-chatbot-message is-${role}`;
    const paragraph = document.createElement("p");
    paragraph.textContent = text;
    wrapper.append(paragraph);
    messages.append(wrapper);
    if (options.scrollToEnd !== false) messages.scrollTop = messages.scrollHeight;
    return wrapper;
  }

  function appendResults(scored, options = {}) {
    const wrapper = document.createElement("div");
    wrapper.className = "course-chatbot-message is-bot has-results";
    const introduction = document.createElement("p");
    introduction.textContent = scored.exact
      ? "질문에 적힌 과목명을 우선해 해당 과목 정보를 찾았습니다."
      : "엑셀의 키워드 가중치와 과목 설명 일치 점수를 합산한 추천 결과입니다.";
    wrapper.append(introduction);

    scored.results.forEach((result, index) => {
      const subject = result.subject;
      const card = document.createElement("article");
      card.className = "course-chatbot-result";

      const heading = document.createElement("div");
      const rank = document.createElement("span");
      rank.textContent = scored.exact ? "과목 정보" : `${index + 1}순위`;
      const name = document.createElement("strong");
      name.textContent = subject["과목명"];
      const meta = document.createElement("small");
      meta.textContent = [subject["과목유형"], subject["교과군"], subject["선택과목의 종류"]].filter(Boolean).join(" · ");
      heading.append(rank, name, meta);

      const description = document.createElement("p");
      description.textContent = shorten(subject["이 과목은 어떤 과목인가요?"], scored.exact ? 260 : 150) || "과목 설명을 확인해 보세요.";
      const recommendation = document.createElement("p");
      recommendation.className = "course-chatbot-reason";
      recommendation.textContent = subject["이 과목을 누구에게 추천하나요?"]
        ? `추천 대상: ${shorten(subject["이 과목을 누구에게 추천하나요?"], 150)}`
        : `연결 키워드: ${[...result.terms].slice(0, 4).join(", ") || "과목명"}`;

      const footer = document.createElement("div");
      const score = document.createElement("span");
      score.textContent = `추천 점수 ${Math.round(result.score)}`;
      const link = document.createElement("a");
      link.href = `section.html?tab=subjects&q=${encodeURIComponent(subject["과목명"])}`;
      link.textContent = "상세 보기";
      footer.append(score, link);
      card.append(heading, description, recommendation, footer);
      wrapper.append(card);
    });

    messages.append(wrapper);
    if (options.scrollToEnd !== false) messages.scrollTop = messages.scrollHeight;
    return wrapper;
  }

  async function answer(query, options = {}) {
    const cleanQuery = String(query || "").trim();
    if (!cleanQuery) return;
    const alignAnswerTop = options.alignAnswerTop === true;
    appendTextMessage(cleanQuery, "user");
    input.value = "";
    input.disabled = true;

    const loading = appendTextMessage("과목 DB와 가중치를 계산하고 있습니다.");
    loading.classList.add("is-loading");
    try {
      await prepareDatabase();
      loading.remove();
      const scored = scoreCourses(cleanQuery);
      let response;
      if (!scored.results.length) {
        response = appendTextMessage("질문에서 과목과 연결되는 키워드를 찾지 못했습니다. 관심 직업, 좋아하는 활동, 배우고 싶은 내용을 조금 더 구체적으로 적어 주세요.", "bot", { scrollToEnd: !alignAnswerTop });
      } else {
        response = appendResults(scored, { scrollToEnd: !alignAnswerTop });
      }
      if (alignAnswerTop) scrollMessageToTop(response);
    } catch (error) {
      console.error("챗봇 데이터 로딩 실패:", error);
      loading.remove();
      const response = appendTextMessage("과목 DB를 불러오지 못했습니다. Live Server 또는 배포 주소로 접속했는지 확인한 뒤 다시 시도해 주세요.", "bot", { scrollToEnd: !alignAnswerTop });
      if (alignAnswerTop) scrollMessageToTop(response);
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
  shell.querySelector("[data-chat-form]").addEventListener("submit", (event) => {
    event.preventDefault();
    answer(input.value);
  });
  shell.querySelectorAll("[data-chat-prompt]").forEach((button) => {
    button.addEventListener("click", () => answer(button.dataset.chatPrompt, { alignAnswerTop: true }));
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
    if (event.key === "Escape" && state.open) setOpen(false);
    else if (event.key === "Escape" && state.faqOpen) setFaqOpen(false);
  });

  window.CourseChatbot = { prepareDatabase, scoreCourses, answer, getState: () => state };
})();
