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
    await evaluate(`(async () => {
      document.querySelector('[data-support-collapse]').click();
      document.querySelector('.course-chatbot-launcher').click();
      await window.CourseChatbot.answer('교사가 진로야');
      return true;
    })()`, true);
    const broad = await evaluate(`(() => {
      const item = [...document.querySelectorAll('.course-chatbot-message.is-bot')].at(-1);
      return {
        resultCount: item.querySelectorAll('.course-chatbot-result').length,
        choices: [...item.querySelectorAll('.course-chatbot-followups button')].map((button) => button.textContent),
        source: item.querySelector('.course-chatbot-source')?.textContent || '',
        sourceIsLast: item.lastElementChild?.classList.contains('course-chatbot-source') || false
      };
    })()`);
    assert.equal(broad.resultCount, 3);
    assert.ok(broad.choices.includes("국어 교사"));
    assert.match(broad.source, /^\[출처:/);
    assert.equal(broad.sourceIsLast, true);

    await evaluate("window.CourseChatbot.answer('국어 교사')", true);
    const specific = await evaluate(`(() => {
      const item = [...document.querySelectorAll('.course-chatbot-message.is-bot')].at(-1);
      return {
        resultCount: item.querySelectorAll('.course-chatbot-result').length,
        names: [...item.querySelectorAll('.course-chatbot-result strong')].map((node) => node.textContent),
        scoreLabels: [...item.querySelectorAll('.course-chatbot-result div:last-child span')].map((node) => node.textContent),
        source: item.querySelector('.course-chatbot-source')?.textContent || '',
        sourceIsLast: item.lastElementChild?.classList.contains('course-chatbot-source') || false
      };
    })()`);
    assert.ok(specific.resultCount > 1);
    assert.ok(specific.names.includes("교육의 이해"));
    assert.ok(specific.scoreLabels.every((label) => !label.includes("추천 점수")));
    assert.match(specific.source, /^\[출처:/);
    assert.equal(specific.sourceIsLast, true);

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
