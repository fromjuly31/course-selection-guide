const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const mimeTypes = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml" };

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitFor(check, timeout = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = await check().catch(() => null);
    if (value) return value;
    await wait(100);
  }
  throw new Error("인쇄 화면 브라우저 응답 대기 시간이 초과되었습니다.");
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
    const requested = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname).replace(/^\/+/, "") || "section.html";
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
  const debugPort = 9343;
  const profilePath = fs.mkdtempSync(path.join(os.tmpdir(), "course-print-icons-"));
  const edge = spawn(edgePath, [
    "--headless=new", "--disable-gpu", "--no-sandbox", `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profilePath}`, "--window-size=1400,900", "about:blank"
  ], { windowsHide: true, stdio: "ignore" });

  let client;
  try {
    const page = await waitFor(async () => {
      const targetUrl = `http://127.0.0.1:${webPort}/section.html?tab=recommend`;
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(targetUrl)}`, { method: "PUT" });
      return response.ok ? response.json() : null;
    });
    client = createCdpClient(page.webSocketDebuggerUrl);
    await client.send("Runtime.enable");
    await client.send("Page.enable");
    const evaluate = async (expression) => {
      const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || "브라우저 평가 오류");
      return result.result.value;
    };

    await waitFor(async () => evaluate("Boolean(window.DatabaseApp?.getState().departmentDataset.departments.length)"));
    const metrics = await evaluate(`(() => {
      const api = window.DatabaseApp;
      const state = api.getState();
      const departments = [...state.departmentDataset.departments].sort((a, b) => {
        const weight = (item) => (item.relatedSubjects?.length || 0) + (item.reflectedSubjects?.length || 0) + (item.scienceRecommendedSubjects?.length || 0) + (item.recommendedBooks?.length || 0);
        return weight(b) - weight(a);
      });
      const department = departments.find((item) => item.reflectedSubjects?.length && item.scienceRecommendedSubjects?.length) || departments[0];
      state.recommendField = department.field;
      state.recommendDepartmentIds = departments.slice(0, 3).map((item) => item.id);
      state.recommendKeywords = ["인공지능", "환경", "데이터"];

      const printRoot = document.createElement("div");
      printRoot.className = "platform-print-root";
      printRoot.dataset.platformPrintRoot = "";
      document.body.append(printRoot);
      document.body.classList.add("is-platform-print-measuring");
      const millimeter = 96 / 25.4;

      const inspect = (kind, id = "") => {
        const documentData = api.platformDocumentData(kind, id);
        printRoot.innerHTML = api.platformPrintDocumentMarkup(documentData);
        const source = printRoot.querySelector(".platform-print-document");
        const careerFit = api.fitDepartmentCareerToPrintArea(source);
        const sourceIcons = [...source.querySelectorAll("svg[data-print-icon]")];
        const sourceBounds = source.getBoundingClientRect();
        const careers = source.querySelector(".platform-print-careers");
        const careerStyle = careers ? getComputedStyle(careers) : null;
        const result = {
          iconCount: sourceIcons.length,
          iconNames: [...new Set(sourceIcons.map((icon) => icon.dataset.printIcon))],
          iconWidths: sourceIcons.map((icon) => Number(icon.getBoundingClientRect().width.toFixed(2))),
          externalUseCount: source.querySelectorAll('use[href^="icons.svg#"]').length,
          rawWidth: Number(sourceBounds.width.toFixed(2)),
          rawHeight: Number(Math.max(source.scrollHeight, sourceBounds.height).toFixed(2)),
          horizontalOverflow: Math.max(0, source.scrollWidth - Math.ceil(sourceBounds.width)),
          careers: careers ? {
            text: careers.textContent,
            lines: [...careers.querySelectorAll(".career-guide-line")].map((line) => line.textContent),
            clientHeight: careers.clientHeight,
            scrollHeight: careers.scrollHeight,
            whiteSpace: careerStyle.whiteSpace,
            overflow: careerStyle.overflow,
            lineClamp: careerStyle.webkitLineClamp,
            truncated: careerFit.truncated,
            lineLimit: careerFit.lineLimit,
            detailPadding: getComputedStyle(careers.querySelector(".is-detail")).paddingLeft,
            detailTextIndent: getComputedStyle(careers.querySelector(".is-detail")).textIndent
          } : null
        };
        api.fitPlatformPrintToSinglePage(printRoot);
        const sheet = printRoot.querySelector(".platform-print-sheet-svg");
        const sheetStyle = getComputedStyle(sheet);
        result.sheetCount = printRoot.children.length;
        result.sheetHeightMm = Number((sheet.getBoundingClientRect().height / millimeter).toFixed(2));
        result.sheetTopMarginMm = Number((parseFloat(sheetStyle.marginTop) / millimeter).toFixed(2));
        result.sheetExternalUseCount = sheet.querySelectorAll('use[href^="icons.svg#"]').length;
        result.sheetInlineIconCount = sheet.querySelectorAll("svg[data-print-icon]").length;
        result.viewBox = sheet.getAttribute("viewBox");
        return result;
      };

      const originalCareers = department.guide.careers;
      department.guide.careers = Array.from({ length: 20 }, (_, index) => "∘ " + (index + 1) + "번째 진출 분야\\n- 해당 분야의 길어서 다음 줄로 넘어가는 상세 진출 안내").join(" ");
      const result = {
        recommendation: inspect("recommendation"),
        department: inspect("department", department.id)
      };
      const validationDepartment = departments.find((item) => item.reflectedSubjects?.length && item.relatedSubjects?.length >= 15)
        || departments.find((item) => item.reflectedSubjects?.length)
        || departments[0];
      const previousSchool = state.selectedSchool;
      const previousAdmissionYear = state.selectedAdmissionYear;
      const previousCurriculum = state.curriculum;
      const previousValidationDepartmentId = state.simulationValidationDepartmentId;
      const blank = api.createBlankCurriculumImport();
      state.selectedSchool = { id: "print-validation-school", name: "검증고등학교", region: "강원특별자치도", admissionYears: [2025] };
      state.selectedAdmissionYear = 2025;
      state.curriculum = blank.curricula.find((curriculum) => curriculum.admissionYear === 2025);
      state.simulationValidationDepartmentId = validationDepartment.id;
      const multiPageData = api.platformDocumentData("simulation");
      printRoot.innerHTML = api.platformPrintDocumentMarkup(multiPageData);
      const validationSource = printRoot.querySelector(".is-simulation-validation-print");
      const validationBounds = validationSource.getBoundingClientRect();
      const validationBottom = [...validationSource.querySelectorAll("*")].reduce((bottom, element) => Math.max(bottom, element.getBoundingClientRect().bottom - validationBounds.top), 0);
      const relatedGrid = validationSource.querySelector(".simulation-validation-lists > .is-related .simulation-validation-course-group > ul");
      const reflectedGrid = validationSource.querySelector(".simulation-validation-lists > .is-reflected .simulation-validation-course-group > ul");
      const sampleCourseButton = relatedGrid?.querySelector(".simulation-validation-course-open");
      const sampleCourseCopy = sampleCourseButton?.querySelector(".simulation-validation-course-copy");
      const courseButtonBounds = sampleCourseButton?.getBoundingClientRect();
      const courseCopyBounds = sampleCourseCopy?.getBoundingClientRect();
      result.multiPage = {
        sourceCount: printRoot.querySelectorAll(".platform-print-document").length,
        relatedColumnCount: relatedGrid ? getComputedStyle(relatedGrid).gridTemplateColumns.split(" ").length : 0,
        reflectedColumnCount: reflectedGrid ? getComputedStyle(reflectedGrid).gridTemplateColumns.split(" ").length : 0,
        courseCopyPaddingLeft: sampleCourseCopy ? Number.parseFloat(getComputedStyle(sampleCourseCopy).paddingLeft) : 0,
        courseCopyVerticallyCentered: courseButtonBounds && courseCopyBounds ? Math.abs((courseButtonBounds.top + courseButtonBounds.bottom) / 2 - (courseCopyBounds.top + courseCopyBounds.bottom) / 2) <= 1 : false,
        validationBottom
      };
      api.fitPlatformPrintToSinglePage(printRoot);
      const printSheets = [...printRoot.querySelectorAll(".platform-print-sheet-svg")];
      result.multiPage.sheetCount = printSheets.length;
      result.multiPage.pageNumbers = printSheets.map((sheet) => sheet.dataset.platformPrintPage);
      result.multiPage.hasMultiplePagesClass = printRoot.classList.contains("has-multiple-pages");
      result.multiPage.validationViewBoxHeight = Number(printSheets[1]?.getAttribute("viewBox")?.split(" ")[3] || 0);
      state.selectedSchool = previousSchool;
      state.selectedAdmissionYear = previousAdmissionYear;
      state.curriculum = previousCurriculum;
      state.simulationValidationDepartmentId = previousValidationDepartmentId;
      department.guide.careers = originalCareers;
      document.body.classList.remove("is-platform-print-measuring");
      printRoot.remove();
      return result;
    })()`);

    for (const [kind, result] of [["recommendation", metrics.recommendation], ["department", metrics.department]]) {
      assert.ok(result.iconCount >= 6, `${kind}: 인쇄 아이콘이 충분히 포함되어야 합니다.`);
      assert.equal(result.externalUseCount, 0, `${kind}: 외부 SVG 참조가 남아서는 안 됩니다.`);
      assert.equal(result.sheetExternalUseCount, 0, `${kind}: 한 장 변환 후 외부 SVG 참조가 남아서는 안 됩니다.`);
      assert.equal(result.sheetInlineIconCount, result.iconCount);
      assert.equal(result.sheetCount, 1, `${kind}: 인쇄 루트는 한 장짜리 SVG 하나여야 합니다.`);
      assert.ok(result.sheetHeightMm + result.sheetTopMarginMm <= 200.2, `${kind}: 인쇄물이 200mm 높이를 넘었습니다.`);
      assert.ok(result.iconWidths.every((width) => width >= 10 && width <= 20), `${kind}: 아이콘 크기가 인쇄 문맥에 맞지 않습니다.`);
      assert.equal(result.horizontalOverflow, 0, `${kind}: 인쇄 원본에 가로 넘침이 있습니다.`);
      assert.match(result.viewBox, /^0 0 \d+ \d+$/);
    }
    ["solid-star", "sparkles", "book-open", "hand-star", "warning"].forEach((name) => assert.ok(metrics.recommendation.iconNames.includes(name)));
    ["book", "book-open", "solid-star", "flask"].forEach((name) => assert.ok(metrics.department.iconNames.includes(name)));
    assert.deepEqual(metrics.department.careers.lines.slice(0, 3), [
      "∘ 1번째 진출 분야",
      "- 해당 분야의 길어서 다음 줄로 넘어가는 상세 진출 안내",
      "∘ 2번째 진출 분야"
    ]);
    assert.ok(parseFloat(metrics.department.careers.detailPadding) > 0);
    assert.ok(parseFloat(metrics.department.careers.detailTextIndent) < 0);
    assert.equal(metrics.department.careers.whiteSpace, "pre-line");
    assert.equal(metrics.department.careers.overflow, "hidden");
    assert.equal(metrics.department.careers.truncated, true);
    assert.ok(metrics.department.careers.lineLimit > 4, "인쇄 카드의 실제 여유 높이를 네 줄보다 넉넉하게 사용해야 합니다.");
    assert.equal(metrics.department.careers.lineClamp, String(metrics.department.careers.lineLimit));
    assert.ok(metrics.department.careers.scrollHeight > metrics.department.careers.clientHeight, "실제 카드 높이를 넘는 진출 분야만 말줄임표로 제한되어야 합니다.");
    assert.equal(metrics.multiPage.sourceCount, 2);
    assert.equal(metrics.multiPage.sheetCount, 2);
    assert.deepEqual(metrics.multiPage.pageNumbers, ["1", "2"]);
    assert.equal(metrics.multiPage.hasMultiplePagesClass, true);
    assert.equal(metrics.multiPage.relatedColumnCount, 4);
    assert.equal(metrics.multiPage.reflectedColumnCount, 3);
    assert.ok(metrics.multiPage.courseCopyPaddingLeft > 0, JSON.stringify(metrics.multiPage));
    assert.equal(metrics.multiPage.courseCopyVerticallyCentered, true, JSON.stringify(metrics.multiPage));
    assert.ok(metrics.multiPage.validationViewBoxHeight > metrics.multiPage.validationBottom, JSON.stringify(metrics.multiPage));
    if (process.argv.includes("--capture-preview")) {
      const showPrintPreview = async (kind) => evaluate(`(() => {
        document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close());
        window.__printPreviewRoot?.remove();
        const api = window.DatabaseApp;
        const state = api.getState();
        const department = state.departmentDataset.departments.find((item) => item.reflectedSubjects?.length && item.scienceRecommendedSubjects?.length) || state.departmentDataset.departments[0];
        const root = document.createElement('div');
        root.className = 'platform-print-root';
        root.style.cssText = 'display:block;position:fixed;z-index:99999;left:157px;top:50px;width:1085px;height:756px;overflow:hidden;background:#fff';
        root.innerHTML = api.platformPrintDocumentMarkup(api.platformDocumentData('${kind}', '${kind}' === 'department' ? department.id : ''));
        document.body.append(root);
        api.fitPlatformPrintToSinglePage(root);
        window.__printPreviewRoot = root;
        return true;
      })()`);
      await showPrintPreview("recommendation");
      const recommendationShot = await client.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      const recommendationPath = path.join(os.tmpdir(), "print-recommendation-preview.png");
      fs.writeFileSync(recommendationPath, Buffer.from(recommendationShot.data, "base64"));
      await showPrintPreview("department");
      const departmentShot = await client.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      const departmentPath = path.join(os.tmpdir(), "print-department-preview.png");
      fs.writeFileSync(departmentPath, Buffer.from(departmentShot.data, "base64"));
      console.log(`print previews: ${recommendationPath}, ${departmentPath}`);
    }
    console.log(`print icon browser tests passed (recommendation ${metrics.recommendation.iconCount} icons, department ${metrics.department.iconCount} icons, ${metrics.department.sheetHeightMm}mm + ${metrics.department.sheetTopMarginMm}mm)`);
  } finally {
    if (client) {
      await client.send("Browser.close").catch(() => {});
      client.close();
    }
    if (edge.exitCode === null) await Promise.race([new Promise((resolve) => edge.once("exit", resolve)), wait(2500)]);
    if (edge.exitCode === null) edge.kill();
    await new Promise((resolve) => server.close(resolve));
    const resolvedProfile = path.resolve(profilePath);
    const tempRoot = `${path.resolve(os.tmpdir())}${path.sep}`;
    if (resolvedProfile.startsWith(tempRoot)) fs.rmSync(resolvedProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
