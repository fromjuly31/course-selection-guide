const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const projectRoot = path.resolve(__dirname, "..");
const vendorPath = path.join(projectRoot, "vendor", "xlsx.full.min.js");
const expectedSha256 = "cc015130aa8521e7f088f88898eba949ccdcbfb38df0bd129b44b7273c3a6f41";
const expectedSri = "sha256-zAFRMKqFIefwiPiImOupSczcv7ON8L0Sm0S3Jzw6b0E=";

test("the locally served SheetJS build has the pinned upstream checksum", () => {
  const source = fs.readFileSync(vendorPath);
  const sha256 = crypto.createHash("sha256").update(source).digest("hex");
  assert.equal(sha256, expectedSha256);
  assert.match(source.toString("utf8"), /version="0\.20\.3"/);
});

test("section.html uses only the integrity-protected local SheetJS build", () => {
  const html = fs.readFileSync(path.join(projectRoot, "section.html"), "utf8");
  assert.ok(html.includes(`src="vendor/xlsx.full.min.js?v=0.20.3" integrity="${expectedSri}"`));
  assert.ok(!html.includes("cdn.sheetjs.com"));
});
