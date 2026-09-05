const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createEngine, normalize, splitValues } = require("../chatbot-engine.js");

const database = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "database.json"), "utf8"));
const chatbot = database.chatbot;

assert.equal(database.meta.schemaVersion, 2);
assert.equal(database.rows.length, 290);
assert.equal(chatbot.faqIntents.length, 63);
assert.equal(chatbot.questionVariants.length, 337);
assert.equal(chatbot.answers.length, 130);
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
  if (String(testCase.expected_intent).startsWith("COURSE:") && result.intentId === "COURSE_SCOPE_CLARIFY") {
    assert.equal(result.results.length, 0, `${testCase.test_id}: 범위 확인 전에는 카드를 표시하지 않아야 합니다.`);
    assert.ok(result.candidateCount >= 6, `${testCase.test_id}: 후보가 6개 이상이어야 합니다.`);
  } else {
    assert.equal(result.intentId, testCase.expected_intent, `${testCase.test_id}: ${testCase.sample_user_query}`);
  }
  assert.match(result.sourceText, /^\[출처:.+\]$/u, `${testCase.test_id}: 출처 형식 오류`);
});

const broadTeacher = engine.respond("교사가 진로야");
assert.equal(broadTeacher.results.length, 3);
assert.ok(broadTeacher.choices.length >= 10);

const koreanTeacher = engine.respond("국어 교사가 되고 싶어");
assert.equal(koreanTeacher.intentId, "COURSE_SCOPE_CLARIFY");
assert.equal(koreanTeacher.results.length, 0);
assert.ok(koreanTeacher.candidateCount >= 6);
assert.ok(koreanTeacher.choices.some((choice) => choice.label.startsWith("진로선택")));

const careerIntent = chatbot.faqIntents.find((intent) => intent.intent_id === "F063");
assert.equal(careerIntent.category, "진로탐색");
assert.equal(careerIntent.answer_mode, "MULTI");
assert.equal(chatbot.questionVariants.filter((variant) => variant.intent_id === "F063").length, 26);
assert.equal(chatbot.answers.filter((answer) => answer.intent_id === "F063").length, 4);
assert.equal(chatbot.sources.find((source) => source.source_id === "S01").url, "https://www.hscredit.kr/curriculum/subjects");

const undecidedCareer = engine.respond("저 진로가 없어요.");
assert.equal(undecidedCareer.intentId, "F063");
assert.equal(undecidedCareer.results.length, 0);
assert.match(undecidedCareer.text, /지금 당장 하나의 직업이나 학과로 확정할 필요는 없습니다/u);
assert.match(undecidedCareer.text, /진로검사, 진로상담, 독서, 동아리, 체험 활동/u);
assert.doesNotMatch(undecidedCareer.text, /선택과목을 정해야 하는데/u);
assert.match(undecidedCareer.text, /1\. 내가 좋아하거나 관심 있는 것은/u);

[
  "꿈이 없어",
  "하고 싶은 게 없어",
  "뭘 하고 싶은지 모르겠어"
].forEach((query) => {
  const result = engine.respond(query);
  assert.equal(result.intentId, "F063", `${query}: 반말·붙여쓰기 질문도 F063으로 연결해야 합니다.`);
  assert.equal(result.kind, "faq");
  assert.equal(result.results.length, 0, `${query}: 과목 추천 카드를 표시하지 않아야 합니다.`);
});

const overlappingCareerQueries = ["진로가없어", "희망 학과를 못 정했어", "관심 분야를 모르겠어"];
overlappingCareerQueries.forEach((query) => {
  const result = engine.respond(query);
  assert.equal(result.intentId, "FAQ_CLARIFY", `${query}: FAQ와 과목 추천이 겹치면 의도를 먼저 물어야 합니다.`);
  assert.equal(result.kind, "clarification");
  assert.equal(result.results.length, 0);
  assert.equal(result.choices.length, 2);
  assert.match(result.choices[1].label, /과목을 추천받고 싶어요/u);
});

const ambiguousCareerPurpose = engine.respond(overlappingCareerQueries[0]);
assert.match(ambiguousCareerPurpose.choices[0].label, /진로가 아직 없는데/u);

[
  "진로가 불확실해",
  "진로가 애매해",
  "진로가 고민이야",
  "진로 때문에 고민 중이야",
  "진로가 모호해",
  "진로가 아직 확실하지 않아",
  "진로가 정해지지 않았어",
  "진로가 헷갈려"
].forEach((query) => {
  const result = engine.respond(query);
  assert.equal(result.intentId, "FAQ_CLARIFY", `${query}: 진로 미정 표현은 의도 확인을 먼저 해야 합니다.`);
  assert.equal(result.kind, "clarification");
  assert.equal(result.results.length, 0, `${query}: 의도 확인 전에는 과목 카드를 표시하지 않아야 합니다.`);
  assert.equal(result.choices.length, 2);
});

const confirmedNoCareer = engine.respond(ambiguousCareerPurpose.choices[0].prompt);
assert.equal(confirmedNoCareer.intentId, "F063");
assert.equal(confirmedNoCareer.kind, "faq");
assert.equal(confirmedNoCareer.results.length, 0);

const requestedCareerCourses = engine.respond(ambiguousCareerPurpose.choices[1].prompt);
assert.equal(requestedCareerCourses.intentId, "COURSE_DETAIL_CLARIFY");
assert.equal(requestedCareerCourses.kind, "clarification");
assert.equal(requestedCareerCourses.results.length, 0);
assert.match(requestedCareerCourses.followupText, /희망 직업·학과·관심 분야/u);

const undecidedCourseChoice = engine.respond("선택과목 골라야 하는데 진로가 없어요.");
assert.equal(undecidedCourseChoice.intentId, "F063");
assert.equal(undecidedCourseChoice.results.length, 0);
assert.match(undecidedCourseChoice.text, /선택과목을 정해야 하는데 진로가 아직 확실하지 않다면/u);
assert.match(undecidedCourseChoice.sourceText, /한국교육과정평가원 고교학점제 공식 홈페이지/u);
assert.equal(undecidedCourseChoice.sourceDetails[0].url, "https://www.hscredit.kr/curriculum/subjects");

console.log(`chatbot database tests passed (${evaluatedCases.length} DB cases)`);
