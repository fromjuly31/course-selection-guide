const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createEngine, normalize, splitValues } = require("../chatbot-engine.js");

const database = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "database.json"), "utf8"));
const chatbot = database.chatbot;

assert.equal(database.meta.schemaVersion, 2);
assert.equal(database.rows.length, 290);
assert.equal(chatbot.faqIntents.length, 62);
assert.equal(chatbot.questionVariants.length, 311);
assert.equal(chatbot.answers.length, 126);
assert.equal(chatbot.keywordWeights.length, 5464);
assert.equal(chatbot.sources.length, 16);
assert.equal(chatbot.clarificationRules.length, 1);

const unique = (values, label) => {
  const filtered = values.map(String).map((value) => value.trim()).filter(Boolean);
  assert.equal(new Set(filtered).size, filtered.length, `${label} 값이 중복되었습니다.`);
};

unique(database.rows.map((row) => row["과목ID"]), "과목ID");
unique(database.rows.map((row) => normalize(row["과목명"])), "과목명");
unique(chatbot.faqIntents.map((row) => row.intent_id), "intent_id");
unique(chatbot.questionVariants.map((row) => row.variant_id), "variant_id");
unique(chatbot.answers.map((row) => row.answer_id), "answer_id");
unique(chatbot.sources.map((row) => row.source_id), "source_id");

const courseNames = new Set(database.rows.map((row) => normalize(row["과목명"])));
const intentIds = new Set(chatbot.faqIntents.map((row) => String(row.intent_id)));
const sourceIds = new Set(chatbot.sources.map((row) => String(row.source_id)));
chatbot.keywordWeights.forEach((row) => {
  assert.ok(courseNames.has(normalize(row["적용과목"])), `키워드가 없는 과목을 참조합니다: ${row["적용과목"]}`);
  splitValues(row["출처ID"]).forEach((id) => assert.ok(sourceIds.has(id), `키워드 출처가 없습니다: ${id}`));
});
chatbot.answers.forEach((row) => {
  assert.ok(intentIds.has(String(row.intent_id)), `답변 intent가 없습니다: ${row.intent_id}`);
  const ids = splitValues(row.source_id);
  assert.ok(ids.length, `답변 출처가 없습니다: ${row.answer_id}`);
  ids.forEach((id) => assert.ok(sourceIds.has(id), `답변 출처가 없습니다: ${id}`));
});

const engine = createEngine(database);
const evaluatedCases = chatbot.testCases.filter((testCase) => {
  const expected = String(testCase.expected_intent || "");
  return /^F\d+$/u.test(expected) || expected === "CL001" || expected === "FALLBACK" || expected.startsWith("COURSE:");
});
evaluatedCases.forEach((testCase) => {
  const result = engine.respond(testCase.sample_user_query);
  assert.equal(result.intentId, testCase.expected_intent, `${testCase.test_id}: ${testCase.sample_user_query}`);
  assert.match(result.sourceText, /^\[출처:.+\]$/u, `${testCase.test_id}: 출처 형식 오류`);
});

const broadTeacher = engine.respond("교사가 진로야");
assert.equal(broadTeacher.results.length, 3);
assert.ok(broadTeacher.choices.length >= 10);

const koreanTeacher = engine.respond("국어 교사가 되고 싶어");
assert.ok(koreanTeacher.results.length > 1);
assert.ok(koreanTeacher.results.some((result) => result.subject["과목명"] === "교육의 이해"));
assert.ok(koreanTeacher.results.filter((result) => result.subject["교과군"] === "국어").length > 1);

console.log(`chatbot database tests passed (${evaluatedCases.length} DB cases)`);
