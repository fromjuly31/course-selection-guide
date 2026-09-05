const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const mimeTypes = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml" };
const schoolPayload = JSON.stringify({
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
});

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
    const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
    if (pathname === "/supabase-config.js") {
      response.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" }).end("window.SUPABASE_CONFIG = {};");
      return;
    }
    if (pathname === "/data/schools.json") {
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" }).end(schoolPayload);
      return;
    }
    const requested = pathname.replace(/^\/+/, "") || "index.html";
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
  const debugPort = 9341;
  const profilePath = fs.mkdtempSync(path.join(os.tmpdir(), "course-school-picker-"));
  const pageUrl = `http://127.0.0.1:${webPort}/section.html?tab=subjects&school=wonju-girls&admissionYear=2026`;
  const edge = spawn(edgePath, [
    "--headless=new", "--disable-gpu", "--no-sandbox", `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profilePath}`, "--window-size=1280,820", "about:blank"
  ], { windowsHide: true, stdio: "ignore" });

  let client;
  try {
    const page = await waitFor(async () => {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(pageUrl)}`, { method: "PUT" });
      return response.ok ? response.json() : null;
    });
    client = createCdpClient(page.webSocketDebuggerUrl);
    await client.send("Runtime.enable");
    await client.send("Page.enable");
    await client.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false });

    const evaluate = async (expression, awaitPromise = false) => {
      const result = await client.send("Runtime.evaluate", { expression, awaitPromise, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "브라우저 평가 오류");
      return result.result.value;
    };

    await waitFor(async () => evaluate(`(() => {
      const picker = document.querySelector('.header-school-picker');
      return document.readyState === 'complete' && picker?.classList.contains('has-selection') && Boolean(picker.querySelector('.school-cohort-badge'));
    })()`));
    const connectedUi = await evaluate(`(() => {
      const picker = document.querySelector('.header-school-picker');
      const trigger = picker.querySelector('[data-school-trigger]');
      const disconnect = picker.querySelector('[data-school-disconnect]');
      const badge = picker.querySelector('.school-cohort-badge');
      const triggerRect = trigger.getBoundingClientRect();
      const disconnectRect = disconnect.getBoundingClientRect();
      const nameRect = picker.querySelector('[data-school-picker-label]').getBoundingClientRect();
      const badgeRect = badge.getBoundingClientRect();
      const badgeStyle = getComputedStyle(badge);
      return {
        name: picker.querySelector('[data-school-picker-label]').textContent,
        metaText: picker.querySelector('[data-school-picker-meta]').textContent,
        badge: badge.textContent,
        badgeDisplay: badgeStyle.display,
        badgeBackground: badgeStyle.backgroundImage,
        disconnectText: disconnect.textContent.trim(),
        disconnectHidden: disconnect.hidden,
        disconnectAtRight: disconnectRect.left >= triggerRect.right - 0.5,
        badgeBelowName: badgeRect.top >= nameRect.bottom,
        sameCard: trigger.parentElement === disconnect.parentElement && getComputedStyle(picker).borderTopWidth !== '0px',
        ariaLabel: disconnect.getAttribute('aria-label'),
        brandFontSize: Number.parseFloat(getComputedStyle(document.querySelector('.app-brand strong')).fontSize)
      };
    })()`);
    assert.equal(connectedUi.name, "원주여자고등학교");
    assert.equal(connectedUi.metaText, "2026년 입학생");
    assert.equal(connectedUi.badge, "2026년 입학생");
    assert.ok(["flex", "inline-flex"].includes(connectedUi.badgeDisplay));
    assert.notEqual(connectedUi.badgeBackground, "none");
    assert.equal(connectedUi.disconnectText, "연동 해제");
    assert.equal(connectedUi.disconnectHidden, false);
    assert.equal(connectedUi.disconnectAtRight, true);
    assert.equal(connectedUi.badgeBelowName, true);
    assert.equal(connectedUi.sameCard, true);
    assert.equal(connectedUi.ariaLabel, "원주여자고등학교 연동 해제");
    assert.ok(connectedUi.brandFontSize >= 16);

    await waitFor(async () => evaluate("Boolean(document.querySelector('.school-course-school-badge'))"));
    const schoolCourseBadge = await evaluate(`(() => {
      const badge = document.querySelector('.school-course-school-badge');
      const title = document.querySelector('.school-course-toggle-title');
      const bounds = badge.getBoundingClientRect();
      const titleBounds = title.getBoundingClientRect();
      return {
        text: badge.textContent.trim(),
        hasSchoolIcon: Boolean(badge.querySelector('.icon')),
        fontSize: Number.parseFloat(getComputedStyle(badge).fontSize),
        height: bounds.height,
        titleFontSize: Number.parseFloat(getComputedStyle(title.querySelector('strong')).fontSize),
        badgeBelowTitle: bounds.top >= titleBounds.bottom
      };
    })()`);
    assert.equal(schoolCourseBadge.text, "원주여자고등학교");
    assert.equal(schoolCourseBadge.hasSchoolIcon, true);
    assert.ok(schoolCourseBadge.fontSize >= 10);
    assert.ok(schoolCourseBadge.height >= 23);
    assert.ok(schoolCourseBadge.titleFontSize >= 13);
    assert.equal(schoolCourseBadge.badgeBelowTitle, true);

    const screenshot = await client.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    fs.writeFileSync(path.join(projectRoot, "previews", "school-linkage-header.png"), Buffer.from(screenshot.data, "base64"));

    await evaluate("document.querySelector('.header-school-picker [data-school-trigger]').click()");
    await waitFor(async () => evaluate("document.querySelector('.header-school-picker [data-school-menu]').open"));
    const dialogCurrent = await evaluate(`(() => {
      const current = document.querySelector('.header-school-picker [data-school-current]');
      return {
        name: current.querySelector('[data-school-current-name]').textContent,
        meta: current.querySelector('[data-school-current-meta]').textContent,
        disconnect: current.querySelector('[data-school-disconnect]').textContent.trim(),
        hasRegion: current.textContent.includes('강원특별자치도')
      };
    })()`);
    assert.equal(dialogCurrent.name, "원주여자고등학교");
    assert.equal(dialogCurrent.meta, "2026년 입학생");
    assert.equal(dialogCurrent.disconnect, "연동 해제");
    assert.equal(dialogCurrent.hasRegion, false);
    const dialogScreenshot = await client.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    fs.writeFileSync(path.join(projectRoot, "previews", "school-picker-dialog-current.png"), Buffer.from(dialogScreenshot.data, "base64"));
    await evaluate("document.querySelector('.header-school-picker [data-school-menu-close]').click()");
    await waitFor(async () => evaluate("!document.querySelector('.header-school-picker [data-school-menu]').open"));

    await client.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 760, deviceScaleFactor: 1, mobile: true });
    await wait(250);
    const mobileUi = await evaluate(`(() => {
      const picker = document.querySelector('.header-school-picker');
      const badge = picker.querySelector('.school-cohort-badge');
      const pickerRect = picker.getBoundingClientRect();
      const trigger = picker.querySelector('[data-school-trigger]');
      return {
        left: pickerRect.left,
        right: pickerRect.right,
        viewportWidth: innerWidth,
        badgeVisible: badge.getBoundingClientRect().width > 0,
        disconnectVisible: document.querySelector('[data-school-disconnect]').getBoundingClientRect().width > 0,
        brandFontSize: Number.parseFloat(getComputedStyle(document.querySelector('.app-brand strong')).fontSize),
        schoolNameFontSize: Number.parseFloat(getComputedStyle(picker.querySelector('[data-school-picker-label]')).fontSize),
        triggerWidth: trigger.getBoundingClientRect().width
      };
    })()`);
    assert.ok(mobileUi.left >= 0);
    assert.ok(mobileUi.right <= mobileUi.viewportWidth + 1, JSON.stringify(mobileUi));
    assert.equal(mobileUi.badgeVisible, true);
    assert.equal(mobileUi.disconnectVisible, true);
    assert.ok(mobileUi.brandFontSize > mobileUi.schoolNameFontSize, JSON.stringify(mobileUi));
    assert.ok(mobileUi.triggerWidth <= 130, JSON.stringify(mobileUi));

    const mobileScreenshot = await client.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    fs.writeFileSync(path.join(projectRoot, "previews", "school-linkage-header-mobile.png"), Buffer.from(mobileScreenshot.data, "base64"));

    await evaluate("document.querySelector('[data-school-disconnect]').click()");
    await waitFor(async () => evaluate("window.SchoolStore.getSnapshot().selectedSchool === null"));
    const disconnectedUi = await evaluate(`(() => ({
      buttonHidden: document.querySelector('[data-school-disconnect]').hidden,
      label: document.querySelector('[data-school-picker-label]').textContent,
      meta: document.querySelector('[data-school-picker-meta]').textContent,
      schoolCount: window.SchoolStore.getSnapshot().schools.length,
      hasSchoolParam: new URL(location.href).searchParams.has('school'),
      hasYearParam: new URL(location.href).searchParams.has('admissionYear')
    }))()`);
    assert.equal(disconnectedUi.buttonHidden, true);
    assert.equal(disconnectedUi.label, "미선택");
    assert.equal(disconnectedUi.meta, "현재 연동 학교");
    assert.equal(disconnectedUi.schoolCount, 1);
    assert.equal(disconnectedUi.hasSchoolParam, false);
    assert.equal(disconnectedUi.hasYearParam, false);

    await client.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false });
    await client.send("Page.navigate", { url: `http://127.0.0.1:${webPort}/index.html?school=wonju-girls&admissionYear=2026` });
    await waitFor(async () => evaluate(`(() => {
      const picker = document.querySelector('.landing-school-picker');
      return document.readyState === 'complete' && picker?.classList.contains('has-selection') && Boolean(picker.querySelector('.school-cohort-badge'));
    })()`));
    const landingUi = await evaluate(`(() => ({
      badge: document.querySelector('.landing-school-picker .school-cohort-badge')?.textContent,
      disconnectHidden: document.querySelector('.landing-school-picker [data-school-disconnect]')?.hidden,
      disconnectText: document.querySelector('.landing-school-picker [data-school-disconnect]')?.textContent.trim(),
      sameCard: document.querySelector('.landing-school-picker [data-school-trigger]').parentElement === document.querySelector('.landing-school-picker [data-school-disconnect]').parentElement,
      leadBreakDisplay: getComputedStyle(document.querySelector('.landing-lead .desktop-break')).display,
      brandFontSize: Number.parseFloat(getComputedStyle(document.querySelector('.landing-brand strong')).fontSize)
    }))()`);
    assert.equal(landingUi.badge, "2026년 입학생");
    assert.equal(landingUi.disconnectHidden, false);
    assert.equal(landingUi.disconnectText, "연동 해제");
    assert.equal(landingUi.sameCard, true);
    assert.notEqual(landingUi.leadBreakDisplay, "none");
    assert.ok(landingUi.brandFontSize >= 16);
    await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 0, y: 0 });
    const landingCardBeforeHover = await evaluate("getComputedStyle(document.querySelector('.landing-school-picker')).backgroundColor");
    const disconnectCenter = await evaluate(`(() => {
      const bounds = document.querySelector('.landing-school-picker > [data-school-disconnect]').getBoundingClientRect();
      return { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
    })()`);
    await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: disconnectCenter.x, y: disconnectCenter.y });
    await wait(100);
    const landingCardHover = await evaluate(`(() => {
      const picker = document.querySelector('.landing-school-picker');
      const pickerBounds = picker.getBoundingClientRect();
      const disconnectBounds = picker.querySelector(':scope > [data-school-disconnect]').getBoundingClientRect();
      return {
        hovered: picker.matches(':hover'),
        background: getComputedStyle(picker).backgroundColor,
        triggerBackground: getComputedStyle(picker.querySelector(':scope > [data-school-trigger]')).backgroundColor,
        disconnectFontSize: Number.parseFloat(getComputedStyle(picker.querySelector(':scope > [data-school-disconnect]')).fontSize),
        disconnectInside: disconnectBounds.left >= pickerBounds.left && disconnectBounds.right <= pickerBounds.right
      };
    })()`);
    assert.equal(landingCardHover.hovered, true);
    assert.notEqual(landingCardHover.background, landingCardBeforeHover);
    assert.equal(landingCardHover.triggerBackground, "rgba(0, 0, 0, 0)");
    assert.ok(landingCardHover.disconnectFontSize >= 10);
    assert.equal(landingCardHover.disconnectInside, true);
    await wait(500);
    const landingScreenshot = await client.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    fs.writeFileSync(path.join(projectRoot, "previews", "landing-school-card.png"), Buffer.from(landingScreenshot.data, "base64"));
    await client.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 760, deviceScaleFactor: 1, mobile: true });
    await wait(150);
    const landingMobileUi = await evaluate(`(() => ({
      brandFontSize: Number.parseFloat(getComputedStyle(document.querySelector('.landing-brand strong')).fontSize),
      leadBreakDisplay: getComputedStyle(document.querySelector('.landing-lead .desktop-break')).display
    }))()`);
    assert.ok(landingMobileUi.brandFontSize >= 12);
    assert.notEqual(landingMobileUi.leadBreakDisplay, "none");
    await client.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false });
    await evaluate("document.querySelector('.landing-school-picker [data-school-disconnect]').click()");
    await waitFor(async () => evaluate("window.SchoolStore.getSnapshot().selectedSchool === null"));
    assert.equal(await evaluate("document.querySelector('.landing-school-picker [data-school-disconnect]').hidden"), true);

    await client.send("Page.navigate", { url: `http://127.0.0.1:${webPort}/section.html?tab=admin` });
    await waitFor(async () => evaluate("document.readyState === 'complete' && document.querySelectorAll('.curriculum-format-notice li').length === 3"));
    const uploadNotice = await evaluate(`(() => {
      const notice = document.querySelector('.curriculum-format-notice');
      const title = notice.querySelector('header');
      const firstItem = notice.querySelector('li');
      const uploadCard = document.querySelector('.curriculum-upload-zone');
      const uploadCenter = uploadCard.getBoundingClientRect().left + (uploadCard.getBoundingClientRect().width / 2);
      const elementCenter = (element) => element.getBoundingClientRect().left + (element.getBoundingClientRect().width / 2);
      return {
        title: title.querySelector('strong')?.textContent,
        hasIcon: Boolean(title.querySelector('.icon')),
        itemCount: notice.querySelectorAll('li').length,
        listBelowTitle: firstItem.getBoundingClientRect().top > title.getBoundingClientRect().bottom,
        hasLegacyMark: Boolean(notice.querySelector('mark')),
        uploadSubtitle: uploadCard.querySelector('small').textContent.trim(),
        uploadIconOffset: Math.abs(elementCenter(uploadCard.querySelector('.upload-icon')) - uploadCenter),
        uploadTitleOffset: Math.abs(elementCenter(uploadCard.querySelector('strong')) - uploadCenter),
        uploadSubtitleAlignment: getComputedStyle(uploadCard.querySelector('small')).textAlign
      };
    })()`);
    assert.equal(uploadNotice.title, "업로드 전 확인하세요.");
    assert.equal(uploadNotice.hasIcon, true);
    assert.equal(uploadNotice.itemCount, 3);
    assert.equal(uploadNotice.listBelowTitle, true);
    assert.equal(uploadNotice.hasLegacyMark, false);
    assert.equal(uploadNotice.uploadSubtitle, "엑셀, 한글 편제표를 입학년도별로 선택합니다.");
    assert.ok(uploadNotice.uploadIconOffset <= 1);
    assert.ok(uploadNotice.uploadTitleOffset <= 1);
    assert.equal(uploadNotice.uploadSubtitleAlignment, "center");
    const uploadNoticeScreenshot = await client.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    fs.writeFileSync(path.join(projectRoot, "previews", "upload-format-notice.png"), Buffer.from(uploadNoticeScreenshot.data, "base64"));
    assert.equal(await evaluate("window.SchoolStore.getSnapshot().schools.some((school) => school.id === 'draft-only')"), false);

    const schoolNameFormatWarning = await evaluate(`(async () => {
      window.SchoolStore.isConfigured = () => true;
      const state = window.DatabaseApp.getState();
      state.schoolAuthDialogMode = 'teacher';
      state.pendingCurriculumAction = 'upload';
      state.schoolAuthStep = 2;
      state.schoolAuthRegion = '강원특별자치도';
      state.schoolAuthSchoolName = '';
      window.DatabaseApp.renderAdmin();
      const form = document.querySelector('[data-teacher-school-form]');
      form.querySelector('input[name="schoolName"]').value = '원주여자';
      form.requestSubmit();
      await new Promise((resolve) => setTimeout(resolve, 0));
      return {
        open: document.querySelector('#curriculum-alert-dialog').open,
        message: document.querySelector('#curriculum-alert-message').textContent.trim()
      };
    })()`, true);
    assert.equal(schoolNameFormatWarning.open, true);
    assert.equal(schoolNameFormatWarning.message, "OO 고등학교 형식으로 작성해 주세요");
    await evaluate("document.querySelector('#curriculum-alert-dialog [data-curriculum-alert-close]').click()");

    const uploadWorkspace = await evaluate(`(() => {
      const state = window.DatabaseApp.getState();
      state.schoolAuthDialogMode = 'teacher';
      state.pendingCurriculumAction = 'upload';
      state.schoolAuthStep = 3;
      state.schoolAuthRegion = '강원특별자치도';
      state.schoolAuthSchoolName = '원주여자고등학교';
      state.pendingCurriculumIdentity = { schoolName: '원주여자고등학교', region: '강원특별자치도' };
      state.uploadCurriculumDraft = {
        id: 'upload-draft-test',
        updatedAt: '2026-09-05T03:30:00.000Z',
        storage: 'remote',
        data: window.DatabaseApp.createBlankCurriculumImport()
      };
      window.DatabaseApp.renderAdmin();
      const dialog = document.querySelector('[data-school-auth-dialog]');
      const inputs = [...dialog.querySelectorAll('[data-auth-curriculum-file]')];
      const draftButton = dialog.querySelector('[data-load-upload-curriculum-draft]');
      return {
        title: dialog.querySelector('h3').textContent.trim(),
        inputCount: inputs.length,
        years: inputs.map((input) => Number(input.dataset.uploadAdmissionYear)),
        acceptsHwp: inputs.every((input) => input.accept.includes('.hwp') && input.accept.includes('.hwpx')),
        draftButton: draftButton?.textContent.replace(/\s+/g, ' ').trim() || '',
        draftNotice: dialog.querySelector('.curriculum-upload-draft-resume')?.textContent.replace(/\s+/g, ' ').trim() || '',
        confirmation: dialog.querySelector('button[type="submit"]').textContent.trim(),
        helper: dialog.querySelector('.curriculum-upload-review-help').textContent.trim(),
        width: dialog.getBoundingClientRect().width
      };
    })()`);
    assert.equal(uploadWorkspace.title, "입학년도별 신입생 편제표 업로드");
    assert.equal(uploadWorkspace.inputCount, 2);
    assert.deepEqual(uploadWorkspace.years, [2026, 2025]);
    assert.equal(uploadWorkspace.acceptsHwp, true);
    assert.equal(uploadWorkspace.draftButton, "임시저장 불러오기");
    assert.match(uploadWorkspace.draftNotice, /임시저장본이 있습니다/);
    assert.equal(uploadWorkspace.confirmation, "업로드 확인");
    assert.match(uploadWorkspace.helper, /마지막에 ‘편제표 등록’을 눌러야 연동됩니다/);
    assert.ok(uploadWorkspace.width >= 800);

    await evaluate("document.querySelector('[data-load-upload-curriculum-draft]').click()");
    await waitFor(async () => evaluate("Boolean(document.querySelector('[data-curriculum-preview-overlay]'))"));
    const resumedUploadDraft = await evaluate(`(() => {
      const state = window.DatabaseApp.getState();
      return {
        authClosed: !document.querySelector('[data-school-auth-overlay]'),
        draftId: state.curriculumDraftId,
        schoolName: state.pendingCurriculum.curricula[0].schoolName,
        message: state.curriculumImportMessage
      };
    })()`);
    assert.equal(resumedUploadDraft.authClosed, true);
    assert.equal(resumedUploadDraft.draftId, "upload-draft-test");
    assert.equal(resumedUploadDraft.schoolName, "원주여자고등학교");
    assert.equal(resumedUploadDraft.message, "마지막 임시저장본을 불러왔습니다.");

    const resetButtonUi = await evaluate(`(() => {
      const state = window.DatabaseApp.getState();
      state.schoolAuthDialogMode = '';
      state.schoolAuthStep = 1;
      state.pendingCurriculumAction = '';
      state.pendingCurriculum = window.DatabaseApp.createBlankCurriculumImport();
      state.curriculumSavedFingerprints = {};
      const firstSemester = state.pendingCurriculum.curricula[0].grades[0].semesters[0];
      firstSemester.common.push('공통국어1', '공통수학1');
      firstSemester.options.push({ label: '옵션 1', choose: 1, courses: ['문학', '대수'] });
      window.DatabaseApp.renderAdmin();
      const copyButton = document.querySelector('[data-copy-curriculum-year]');
      const resetButton = document.querySelector('[data-reset-curriculum]');
      const yearToggle = document.querySelector('[data-curriculum-year-toggle]');
      const currentYearPanel = document.querySelector('.curriculum-current-year-panel');
      const cohortYear = document.querySelector('.curriculum-current-cohort-title strong');
      const schoolFields = document.querySelector('.curriculum-editor-school-fields');
      const yearPicker = document.querySelector('.curriculum-year-workspace-selector');
      const commonCourses = [...document.querySelectorAll('.curriculum-common-section .curriculum-editor-course')];
      const optionNameField = document.querySelector('.curriculum-option-editor > header > label');
      const choosePrefix = document.querySelector('.curriculum-choose-input b');
      const chooseValue = document.querySelector('.curriculum-choose-input input');
      const copyRect = copyButton.getBoundingClientRect();
      const resetRect = resetButton.getBoundingClientRect();
      return {
        label: resetButton.textContent.trim(),
        background: getComputedStyle(resetButton).backgroundColor,
        isRightOfCopy: resetRect.left >= copyRect.right,
        hasYearTabs: Boolean(document.querySelector('[data-curriculum-preview-page]')),
        hasNativeYearSelect: Boolean(document.querySelector('[data-curriculum-year-select]')),
        yearSelectLabel: document.querySelector('.curriculum-year-workspace-selector > span').textContent.trim(),
        yearOptionCount: document.querySelectorAll('[data-curriculum-year-option]').length,
        selectedYearText: yearToggle.textContent.replace(/\s+/g, ' ').trim(),
        yearToggleWidth: yearToggle.getBoundingClientRect().width,
        currentYearText: currentYearPanel.textContent.replace(/\s+/g, ' ').trim(),
        currentYearBackground: getComputedStyle(currentYearPanel).backgroundImage,
        cohortYearText: cohortYear.textContent.trim(),
        cohortYearFontSize: Number.parseFloat(getComputedStyle(cohortYear).fontSize),
        labelsMatch: Number.parseFloat(getComputedStyle(schoolFields.querySelector(':scope > div > span')).fontSize) === Number.parseFloat(getComputedStyle(document.querySelector('.curriculum-year-workspace-selector > span')).fontSize),
        schoolFieldsBeforeYearPicker: schoolFields.getBoundingClientRect().top < yearPicker.getBoundingClientRect().top,
        yearPickerBeforeCurrentPanel: yearPicker.getBoundingClientRect().top < currentYearPanel.getBoundingClientRect().top,
        commonCoursesShareRow: commonCourses.length === 2 && Math.abs(commonCourses[0].getBoundingClientRect().top - commonCourses[1].getBoundingClientRect().top) <= 1,
        commonCoursesUseTwoColumns: commonCourses.length === 2 && commonCourses[1].getBoundingClientRect().left > commonCourses[0].getBoundingClientRect().right,
        optionNameWidth: optionNameField.getBoundingClientRect().width,
        choosePrefixFontSize: Number.parseFloat(getComputedStyle(choosePrefix).fontSize),
        chooseValueFontSize: Number.parseFloat(getComputedStyle(chooseValue).fontSize),
        chooseValueFontWeight: Number.parseInt(getComputedStyle(chooseValue).fontWeight, 10)
      };
    })()`);
    assert.equal(resetButtonUi.label, "초기화");
    assert.equal(resetButtonUi.background, "rgb(184, 76, 85)");
    assert.equal(resetButtonUi.isRightOfCopy, true);
    assert.equal(resetButtonUi.hasYearTabs, false);
    assert.equal(resetButtonUi.hasNativeYearSelect, false);
    assert.equal(resetButtonUi.yearSelectLabel, "작업할 신입생 입학년도");
    assert.equal(resetButtonUi.yearOptionCount, 2);
    assert.match(resetButtonUi.selectedYearText, /2026학년도 신입생/);
    assert.ok(resetButtonUi.yearToggleWidth <= 560);
    assert.match(resetButtonUi.currentYearText, /현재 2026학년도 편제표 한 건만 저장합니다/);
    assert.notEqual(resetButtonUi.currentYearBackground, "none");
    assert.equal(resetButtonUi.cohortYearText, "2026학년도");
    assert.ok(resetButtonUi.cohortYearFontSize >= 24);
    assert.equal(resetButtonUi.labelsMatch, true);
    assert.equal(resetButtonUi.schoolFieldsBeforeYearPicker, true);
    assert.equal(resetButtonUi.yearPickerBeforeCurrentPanel, true);
    assert.equal(resetButtonUi.commonCoursesShareRow, true);
    assert.equal(resetButtonUi.commonCoursesUseTwoColumns, true);
    assert.ok(resetButtonUi.optionNameWidth <= 420);
    assert.ok(resetButtonUi.choosePrefixFontSize >= 15);
    assert.ok(resetButtonUi.chooseValueFontSize >= 18);
    assert.ok(resetButtonUi.chooseValueFontWeight >= 900);

    await evaluate("document.querySelector('[data-clear-curriculum-preview]').click()");
    await waitFor(async () => evaluate("document.querySelector('#curriculum-leave-dialog').open"));
    const unsavedDialog = await evaluate(`(() => {
      const dialog = document.querySelector('#curriculum-leave-dialog');
      return {
        message: dialog.querySelector('#curriculum-leave-message').textContent.trim(),
        confirmText: dialog.querySelector('[data-confirm-curriculum-leave]').textContent.trim(),
        zIndex: Number.parseInt(getComputedStyle(dialog).zIndex, 10),
        pendingStillOpen: Boolean(document.querySelector('[data-curriculum-preview-overlay]'))
      };
    })()`);
    assert.equal(unsavedDialog.message, "작업 중인 편제표가 저장되지 않았습니다. 그래도 나가시겠습니까?");
    assert.equal(unsavedDialog.confirmText, "저장하지 않고 나가기");
    assert.ok(unsavedDialog.zIndex >= 11000);
    assert.equal(unsavedDialog.pendingStillOpen, true);
    await evaluate("document.querySelector('#curriculum-leave-dialog [data-confirm-curriculum-leave]').click()");
    await waitFor(async () => evaluate("!document.querySelector('[data-curriculum-preview-overlay]')"));
    console.log("school picker and upload notice browser tests passed");
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
