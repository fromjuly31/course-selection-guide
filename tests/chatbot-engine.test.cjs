const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createEngine } = require("../chatbot-engine.js");

const database = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "database.json"), "utf8"));
database.chatbot = { ...database.chatbot };
database.chatbot.sources = [{
  source_id: "CS01",
  institution: "인천광역시교육청",
  title: "2022 개정 교육과정에 따른 고등학교 과목 안내서",
  status: "CURRENT"
}];
database.sources = database.chatbot.sources;

database.rows.forEach((row, index) => {
  row["과목ID"] ||= `C${String(index + 1).padStart(4, "0")}`;
  row["출처ID"] = "CS01";
  row["상태"] = "ACTIVE";
});

const extraKeywords = [];
const addKeyword = (subject, term, weight = 10, relation = "희망 교과 직접 연계") => {
  const row = database.rows.find((candidate) => candidate["과목명"] === subject);
  if (!row) return;
  extraKeywords.push({
    "교과군": row["교과군"], "기준어": term.replaceAll(" ", ""), "검색어": term, "가중치": weight,
    "관계유형": relation, "적용과목": subject, "출처ID": "CS01", "상태": "ACTIVE"
  });
};

addKeyword("교육의 이해", "교사", 10, "진로 직접 연관");
addKeyword("화법과 언어", "교사", 9, "추천 직업 직접 명시");
addKeyword("인간과 심리", "교사", 7, "학생 이해 역량 연관");
database.rows.filter((row) => row["교과군"] === "국어").forEach((row) => addKeyword(row["과목명"], "국어 교사"));
database.chatbot.keywordWeights = [...database.chatbot.keywordWeights, ...extraKeywords];
database.chatbot.searchSettings = [
  ...database.chatbot.searchSettings,
  { "항목": "최대 추천 개수", "값": 30 },
  { "항목": "최소 과목 추천 점수", "값": 12 },
  { "항목": "강한 연관 점수 비율", "값": 0.65 }
];
database.chatbot.clarificationRules = [{
  rule_id: "CL001",
  trigger_terms: "교사;선생님;교직",
  specific_terms: "국어교사;국어교육과",
  acknowledgement: "교사를 희망하시는군요.",
  prompt: "어떤 교과의 교사를 희망하시나요?",
  options: "국어 교사|국어 교사;수학 교사|수학 교사",
  recommended_courses: "교육의 이해;화법과 언어;인간과 심리",
  source_id: "CS01",
  status: "ACTIVE"
}];
database.chatbot.faqIntents = [{
  intent_id: "F001", category: "고교학점제", canonical_question: "고교학점제가 무엇인가요?",
  core_keywords: "고교학점제;학점제", min_score: 4, min_margin: 1.2, status: "ACTIVE"
}];
database.chatbot.questionVariants = [{
  variant_id: "V-F001-01", intent_id: "F001", utterance: "고교학점제가 뭐야?",
  normalized_utterance: "고교학점제가 뭐야", status: "ACTIVE"
}];
database.chatbot.answers = [{
  answer_id: "A-F001-01", intent_id: "F001", answer_order: 1,
  answer_text: "고교학점제는 학생이 과목을 선택하고 이수 기준을 충족해 학점을 취득·누적하는 제도입니다.",
  source_id: "CS01", source_locator: "제도 설명", status: "CURRENT"
}];
database.chatbot.synonyms = [];

const engine = createEngine(database);

const broadTeacher = engine.respond("교사가 진로야");
assert.equal(broadTeacher.kind, "clarification");
assert.equal(broadTeacher.intentId, "CL001");
assert.equal(broadTeacher.results.length, 3);
assert.ok(broadTeacher.choices.length >= 2);
assert.match(broadTeacher.sourceText, /^\[출처:/);

const koreanTeacher = engine.respond("국어 교사가 되고 싶어");
assert.equal(koreanTeacher.kind, "clarification");
assert.equal(koreanTeacher.intentId, "COURSE_SCOPE_CLARIFY");
assert.equal(koreanTeacher.results.length, 0);
assert.ok(koreanTeacher.candidateCount >= 6);
assert.ok(koreanTeacher.choices.some((choice) => choice.label.startsWith("일반선택")));
assert.match(koreanTeacher.sourceText, /고등학교 과목 안내서/);

const broadNatural = engine.respond("자연 분야 학과와 과목을 추천해 주세요");
assert.equal(broadNatural.kind, "clarification");
assert.equal(broadNatural.results.length, 0);
assert.ok(broadNatural.candidateCount >= 6);
const naturalGeneralChoice = broadNatural.choices.find((choice) => choice.label.startsWith("일반선택"));
assert.ok(naturalGeneralChoice);
const narrowedNatural = engine.respond(naturalGeneralChoice.prompt);
assert.equal(narrowedNatural.kind, "courses");
assert.ok(narrowedNatural.results.length > 0 && narrowedNatural.results.length <= 5);
assert.ok(narrowedNatural.results.every((result) => result.subject["선택과목의 종류"] === "일반선택"));

const naturalCareerChoice = broadNatural.choices.find((choice) => choice.label.startsWith("진로선택"));
const naturalCareer = engine.respond(naturalCareerChoice.prompt);
assert.equal(naturalCareer.kind, "clarification");
const mathChoice = naturalCareer.choices.find((choice) => choice.label.startsWith("수학"));
assert.ok(mathChoice);
const fiveCandidates = engine.respond(mathChoice.prompt);
assert.equal(fiveCandidates.kind, "courses");
assert.equal(fiveCandidates.results.length, 5);

const exactCourse = engine.respond("교육의 이해는 어떤 과목이야?");
assert.equal(exactCourse.kind, "courses");
assert.equal(exactCourse.results[0].subject["과목명"], "교육의 이해");

const faq = engine.respond("고교학점제가 뭐야?");
assert.equal(faq.kind, "faq");
assert.equal(faq.intentId, "F001");
assert.match(faq.text, /학점을 취득·누적/);
assert.match(faq.sourceText, /제도 설명/);

const fallback = engine.respond("오늘 급식 뭐야?");
assert.equal(fallback.kind, "fallback");
assert.match(fallback.text, /선생님에게 문의해 주세요/);
assert.equal(fallback.sourceText, "[출처: 데이터베이스에 확인 가능한 자료 없음]");

console.log("chatbot engine tests passed");
