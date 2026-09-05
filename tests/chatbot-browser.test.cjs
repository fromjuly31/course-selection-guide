const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const mimeTypes = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml" };

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitFor(check, timeout = 12000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = await check().catch(() => null);
    if (value) return value;
    await wait(100);
  }
  throw new Error("브라우저 응답 대기 시간이 초과되었습니다.");
}

function createCdpClient(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  const pending = new Map();
  let nextId = 1;
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  });
  const opened = new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  return {
    async send(method, params = {}) {
      await opened;
      const id = nextId++;
      const response = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
      socket.send(JSON.stringify({ id, method, params }));
      return response;
    },
    close() { socket.close(); }
  };
}

async function main() {
  const server = http.createServer((request, response) => {
    const requested = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname).replace(/^\/+/, "") || "index.html";
    const filePath = path.resolve(projectRoot, requested);
    if (!filePath.startsWith(`${projectRoot}${path.sep}`) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      response.writeHead(404).end("Not found");
      return;
    }
    response.writeHead(200, { "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream" });
    fs.createReadStream(filePath).pipe(response);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const webPort = server.address().port;
  const debugPort = 9337;
  const profilePath = fs.mkdtempSync(path.join(os.tmpdir(), "course-chatbot-browser-"));
  const edge = spawn(edgePath, [
    "--headless=new", "--disable-gpu", "--no-sandbox", `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profilePath}`, "--window-size=1280,900", "about:blank"
  ], { windowsHide: true, stdio: "ignore" });

  let client;
  try {
    const page = await waitFor(async () => {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(`http://127.0.0.1:${webPort}/index.html`)}`, { method: "PUT" });
      return response.ok ? response.json() : null;
    });
    client = createCdpClient(page.webSocketDebuggerUrl);
    await client.send("Runtime.enable");
    await client.send("Page.enable");
    await client.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

    const evaluate = async (expression, awaitPromise = false) => {
      const result = await client.send("Runtime.evaluate", { expression, awaitPromise, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "브라우저 평가 오류");
      return result.result.value;
    };

    await waitFor(async () => evaluate("document.readyState === 'complete' && Boolean(window.CourseChatbot)") );
    const initialSupportDock = await evaluate(`(() => ({
      collapsed: document.querySelector('.course-chatbot').classList.contains('is-collapsed'),
      launchersVisible: getComputedStyle(document.querySelector('.course-support-launchers')).visibility,
      expanded: document.querySelector('[data-support-collapse]').getAttribute('aria-expanded')
    }))()`);
    assert.equal(initialSupportDock.collapsed, false);
    assert.equal(initialSupportDock.launchersVisible, "visible");
    assert.equal(initialSupportDock.expanded, "true");
    await client.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    const mobileSupportDock = await evaluate(`(() => ({
      chatbotWidth: document.querySelector('.course-chatbot-launcher').getBoundingClientRect().width,
      faqWidth: document.querySelector('.course-faq-launcher').getBoundingClientRect().width,
      chatbotLabel: getComputedStyle(document.querySelector('.course-chatbot-launcher > span')).display,
      faqLabel: getComputedStyle(document.querySelector('.course-faq-launcher > span')).display
    }))()`);
    assert.equal(mobileSupportDock.chatbotWidth, 46);
    assert.equal(mobileSupportDock.faqWidth, 46);
    assert.equal(mobileSupportDock.chatbotLabel, "none");
    assert.equal(mobileSupportDock.faqLabel, "none");
    await client.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    const faqSources = await evaluate(`(() => {
      document.querySelector('.course-faq-launcher').click();
      const sourceItem = [...document.querySelectorAll('.course-chatbot-faq-item')]
        .find((item) => item.querySelector('summary')?.textContent.includes('출처는 무엇인가요'));
      sourceItem.open = true;
      const rows = [...sourceItem.querySelectorAll('.course-faq-source-list > li')];
      return {
        texts: rows.map((row) => row.textContent.trim()),
        displays: rows.map((row) => getComputedStyle(row).display),
        tops: rows.map((row) => row.getBoundingClientRect().top)
      };
    })()`);
    assert.deepEqual(faqSources.texts, [
      "①강원특별자치도교육청 · 고교학점제를 위한 진로·학업 설계 안내서",
      "②커리어넷 · 학과 정보",
      "③대학 어디가 · 2028학년도 권역별 대학별 권장과목",
      "④대학 어디가 · 2028학년도 계열별 대표 모집단위별 반영과목",
      "⑤한국교육과정평가원 · 고교학점제 공식 홈페이지",
      "⑥인천광역시교육청 · 2025 고교학점제 이해를 위한 Q&A",
      "⑦경기도교육청 · 2022 개정 고등학교 교육과정 Q&A 도움 자료집",
      "⑧교육부 · 2022 개정 초·중등학교 및 특수교육 교육과정 확정·발표 및 질의응답 자료"
    ]);
    assert.ok(faqSources.displays.every((display) => display === "grid"));
    assert.ok(faqSources.tops.every((top, index) => index === 0 || top > faqSources.tops[index - 1]));
    const faqItems = await evaluate(`[...document.querySelectorAll('.course-chatbot-faq-item')].map((item) => ({
      number: item.querySelector('summary > span').textContent.trim(),
      question: item.querySelector('summary strong').textContent.trim(),
      answer: item.querySelector(':scope > p')?.textContent.trim() || ''
    }))`);
    assert.equal(faqItems.length, 7);
    assert.equal(faqItems[1].answer, "아니요. 최신 정보가 반영되지 않았을 수 있으므로 반드시 검토해야 합니다.");
    assert.deepEqual(faqItems[3], {
      number: "04",
      question: "우리 학교에 개설된 과목 안내가 없어요.",
      answer: "고시 외 과목일 가능성이 높습니다. 고시 외 과목은 학교 선생님께 문의하세요."
    });
    assert.equal(faqItems[4].number, "05");
    assert.equal(faqItems[4].question, "제가 희망하는 학과의 정보가 없어요.");
    assert.equal(faqItems[5].number, "06");
    assert.equal(faqItems[5].question, "학교 데이터는 어떻게 연동하나요?");
    assert.deepEqual(faqItems[6], {
      number: "07",
      question: "앱 관련 문의 사항이 있어요. 어디에 문의해야 할까요?",
      answer: "원주여자고등학교 김범준으로 메신저 혹은 fromjuly31@gmail.com으로 메일 주세요."
    });
    await evaluate("document.querySelector('[data-faq-close]').click()");
    assert.equal(await evaluate("document.querySelector('.course-chatbot-suggestions') === null"), true);
    await evaluate(`(() => {
      const messages = document.querySelector('[data-chat-messages]');
      const nativeScrollTo = messages.scrollTo.bind(messages);
      window.__chatScrollBehaviors = [];
      messages.scrollTo = (options) => {
        window.__chatScrollBehaviors.push(options?.behavior || 'auto');
        nativeScrollTo(options);
      };
    })()`);
    await evaluate(`(async () => {
      document.querySelector('.course-chatbot-launcher').click();
      await window.CourseChatbot.answer('교사가 진로야');
      return true;
    })()`, true);
    await waitFor(async () => evaluate("window.__chatScrollBehaviors.includes('smooth')"));
    const desktopPanelWidth = await evaluate("document.querySelector('.course-chatbot-panel').getBoundingClientRect().width");
    assert.ok(desktopPanelWidth >= 465, `PC 챗봇 너비: ${desktopPanelWidth}px`);
    const broad = await evaluate(`(() => {
      const item = [...document.querySelectorAll('.course-chatbot-message.is-bot')].at(-1);
      return {
        resultCount: item.querySelectorAll('.course-chatbot-result').length,
        choices: [...item.querySelectorAll('.course-chatbot-followups button')].map((button) => button.textContent),
        source: item.querySelector('.course-chatbot-source')?.textContent || '',
        sourceIsLast: item.lastElementChild?.classList.contains('course-chatbot-source') || false,
        scrollBehaviors: window.__chatScrollBehaviors
      };
    })()`);
    assert.equal(broad.resultCount, 3);
    assert.ok(broad.choices.includes("국어 교사"));
    assert.equal(new Set(broad.choices).size, broad.choices.length);
    assert.match(broad.source, /^\[출처:/);
    assert.equal(broad.sourceIsLast, true);
    assert.equal(broad.scrollBehaviors.at(-1), "smooth");

    await evaluate("window.CourseChatbot.answer('국어 교사')", true);
    const narrowedQuestion = await evaluate(`(() => {
      const item = [...document.querySelectorAll('.course-chatbot-message.is-bot')].at(-1);
      return {
        resultCount: item.querySelectorAll('.course-chatbot-result').length,
        choices: [...item.querySelectorAll('.course-chatbot-followups button')].map((button) => button.textContent),
        source: item.querySelector('.course-chatbot-source')?.textContent || '',
        sourceIsLast: item.lastElementChild?.classList.contains('course-chatbot-source') || false
      };
    })()`);
    assert.equal(narrowedQuestion.resultCount, 0);
    assert.ok(narrowedQuestion.choices.some((choice) => choice.startsWith("일반선택")));
    assert.match(narrowedQuestion.source, /^\[출처:/);
    assert.equal(narrowedQuestion.sourceIsLast, true);

    await evaluate("window.CourseChatbot.answer('교육의 이해는 어떤 과목이야?')", true);
    await waitFor(async () => evaluate(`(() => {
      const item = [...document.querySelectorAll('.course-chatbot-message.is-bot')].at(-1);
      const messageArea = document.querySelector('[data-chat-messages]');
      const expectedTop = messageArea.getBoundingClientRect().top + (Number.parseFloat(getComputedStyle(messageArea).paddingTop) || 0);
      return Math.abs(item.getBoundingClientRect().top - expectedTop) <= 4;
    })()`), 3000);
    const exactCourse = await evaluate(`(() => {
      const item = [...document.querySelectorAll('.course-chatbot-message.is-bot')].at(-1);
      const messageArea = document.querySelector('[data-chat-messages]');
      const expectedTop = messageArea.getBoundingClientRect().top + (Number.parseFloat(getComputedStyle(messageArea).paddingTop) || 0);
      return {
        resultCount: item.querySelectorAll('.course-chatbot-result').length,
        name: item.querySelector('.course-chatbot-result strong')?.textContent,
        sourceFontSize: Number.parseFloat(getComputedStyle(item.querySelector('.course-chatbot-source')).fontSize),
        answerStartDelta: Math.abs(item.getBoundingClientRect().top - expectedTop),
        location: location.href
      };
    })()`);
    assert.equal(exactCourse.resultCount, 1);
    assert.equal(exactCourse.name, "교육의 이해");
    assert.ok(exactCourse.sourceFontSize >= 10);
    assert.ok(exactCourse.answerStartDelta <= 4, JSON.stringify(exactCourse));

    await evaluate("[...document.querySelectorAll('.course-chatbot-message.is-bot')].at(-1).querySelector('.course-chatbot-result-detail').click()");
    const detail = await evaluate(`(() => ({
      open: document.querySelector('[data-chat-detail-dialog]').open,
      title: document.querySelector('#course-chatbot-detail-title')?.textContent,
      hasDescription: document.querySelector('[data-chat-detail-content]').textContent.includes('어떤 과목인가요?'),
      chatOpen: window.CourseChatbot.getState().open,
      location: location.href
    }))()`);
    assert.equal(detail.open, true);
    assert.equal(detail.title, "교육의 이해");
    assert.equal(detail.hasDescription, true);
    assert.equal(detail.chatOpen, true);
    assert.equal(detail.location, exactCourse.location);
    await evaluate("document.querySelector('[data-chat-detail-close]').click()");
    assert.equal(await evaluate("window.CourseChatbot.getState().open"), true);

    await evaluate("window.CourseChatbot.answer('성적 평가')", true);
    await wait(100);
    const faqChoices = await evaluate(`(() => {
      const item = [...document.querySelectorAll('.course-chatbot-message.is-bot')].at(-1);
      const list = item.querySelector('.course-chatbot-followups');
      const buttons = [...list.querySelectorAll('button')];
      return {
        markedAsFaqClarification: item.classList.contains('is-faq-clarification'),
        layout: getComputedStyle(list).display,
        count: buttons.length,
        topPositions: buttons.map((button) => Math.round(button.getBoundingClientRect().top)),
        fillsRow: buttons.every((button) => Math.abs(button.getBoundingClientRect().width - list.getBoundingClientRect().width) <= 1),
        fontSize: Number.parseFloat(getComputedStyle(buttons[0]).fontSize)
      };
    })()`);
    assert.equal(faqChoices.markedAsFaqClarification, true);
    assert.equal(faqChoices.layout, "grid");
    assert.equal(faqChoices.count, 3);
    assert.equal(new Set(faqChoices.topPositions).size, faqChoices.count);
    assert.equal(faqChoices.fillsRow, true);
    assert.ok(faqChoices.fontSize >= 12);

    await evaluate("window.CourseChatbot.answer('진로가없어')", true);
    const careerCounseling = await evaluate(`(() => {
      const item = [...document.querySelectorAll('.course-chatbot-message.is-bot')].at(-1);
      const list = item.querySelector('.course-chatbot-followups');
      return {
        resultCount: item.querySelectorAll('.course-chatbot-result').length,
        markedAsFaqClarification: item.classList.contains('is-faq-clarification'),
        choices: list ? [...list.querySelectorAll('button')].map((button) => button.textContent.trim()) : [],
        text: item.textContent
      };
    })()`);
    assert.equal(careerCounseling.resultCount, 0);
    assert.equal(careerCounseling.markedAsFaqClarification, false);
    assert.equal(careerCounseling.choices.length, 0);
    assert.match(careerCounseling.text, /진로를 지금 당장 하나의 직업이나 학과로 확정할 필요는 없습니다/);

    await evaluate("window.CourseChatbot.answer('화학자 되고 싶은데 과목 추천해줘')", true);
    const chemistRecommendation = await evaluate(`(() => {
      const item = [...document.querySelectorAll('.course-chatbot-message.is-bot')].at(-1);
      return {
        names: [...item.querySelectorAll('.course-chatbot-result strong')].map((element) => element.textContent.trim()),
        shortcuts: [...item.querySelectorAll('[data-chat-navigation]')].map((link) => ({ label: link.textContent.trim(), href: link.getAttribute('href') })),
        sourceIsLast: item.lastElementChild?.classList.contains('course-chatbot-source') || false
      };
    })()`);
    assert.equal(chemistRecommendation.names.length, 10);
    assert.ok(chemistRecommendation.names.includes("화학"));
    assert.ok(chemistRecommendation.names.includes("화학 실험"));
    assert.ok(chemistRecommendation.shortcuts.some((shortcut) => shortcut.label.includes("화학과") && shortcut.href.includes("tab=departments")));
    assert.ok(chemistRecommendation.shortcuts.some((shortcut) => shortcut.label.includes("화학공학과") && shortcut.href.includes("tab=departments")));
    assert.equal(chemistRecommendation.sourceIsLast, true);

    await evaluate("window.CourseChatbot.answer('진로·관심사에 맞는 과목을 추천받고 싶어요.')", true);
    const careerDetailQuestion = await evaluate(`(() => {
      const item = [...document.querySelectorAll('.course-chatbot-message.is-bot')].at(-1);
      return {
        resultCount: item.querySelectorAll('.course-chatbot-result').length,
        text: item.textContent
      };
    })()`);
    assert.equal(careerDetailQuestion.resultCount, 0);
    assert.match(careerDetailQuestion.text, /희망 직업·학과·관심 분야/);

    const screenshot = await client.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    fs.writeFileSync(path.join(projectRoot, "previews", "chatbot-teacher.png"), Buffer.from(screenshot.data, "base64"));
    console.log("chatbot browser tests passed");
  } finally {
    if (client) {
      await client.send("Browser.close").catch(() => {});
      client.close();
    }
    if (edge.exitCode === null) {
      await Promise.race([new Promise((resolve) => edge.once("exit", resolve)), wait(2500)]);
    }
    if (edge.exitCode === null) edge.kill();
    await new Promise((resolve) => server.close(resolve));
    const tempRoot = path.resolve(os.tmpdir());
    const resolvedProfile = path.resolve(profilePath);
    if (resolvedProfile.startsWith(`${tempRoot}${path.sep}`)) {
      fs.rmSync(resolvedProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
