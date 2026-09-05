((root, factory) => {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CourseChatbotEngine = api;
})(typeof window !== "undefined" ? window : globalThis, () => {
  "use strict";

  const GENERIC_WORDS = new Set([
    "나는", "제가", "저는", "우리", "학생", "과목", "수업", "추천", "추천해줘", "추천해주세요", "알려줘", "알려주세요",
    "어떤", "무슨", "관련", "관심", "있어", "있어요", "하고", "싶어", "싶어요", "좋아", "좋아요", "대한", "위한", "되는",
    "배우는", "배우고", "공부", "선택", "진로", "진로와", "고등학교", "궁금해", "궁금해요", "인가요", "뭔가요", "어떻게", "할까요", "분야"
  ]);
  const PARTICLES = ["이에요", "예요", "입니다", "이라서", "라서", "으로", "에서", "에게", "한테", "처럼", "까지", "부터", "이랑", "랑", "으로는", "에는", "은", "는", "이", "가", "을", "를", "의", "도", "만", "야"];
  const COURSE_SIGNAL = /진로|직업|되고\s*싶|희망|관심|적성|추천|교사|선생님|교육과|사범대|교대/u;
  const COURSE_RESULT_CLARIFICATION_THRESHOLD = 6;
  const SELECTION_TYPES = ["공통과목", "일반선택", "진로선택", "융합선택"];
  const COURSE_GROUP_ALIASES = [
    ["제2외국어", ["제2외국어", "제이외국어"]],
    ["기술·가정", ["기술가정", "기술·가정"]],
    ["사회(역사/도덕 포함)", ["사회", "역사", "도덕"]],
    ["과학", ["과학"]],
    ["수학", ["수학"]],
    ["국어", ["국어"]],
    ["영어", ["영어"]],
    ["체육", ["체육", "스포츠"]],
    ["예술", ["예술", "미술", "음악", "무용", "연극"]],
    ["정보", ["정보", "컴퓨터", "인공지능"]],
    ["한문", ["한문"]],
    ["교양", ["교양"]]
  ];

  const normalize = (value) => String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("ko")
    .replace(/[ㆍ･・]/gu, "·")
    .replace(/[^0-9a-z가-힣ⅠⅡⅢ·]+/gu, "");

  const splitValues = (value) => String(value ?? "")
    .split(/[;,，|\n]+/u)
    .map((item) => item.trim())
    .filter(Boolean);

  const isActive = (row) => {
    const status = String(row?.status ?? row?.["상태"] ?? "ACTIVE").trim().toUpperCase();
    return !status || ["ACTIVE", "CURRENT", "CURRENT_WITH_CAUTION", "FOUNDATIONAL", "SUPPORTING"].includes(status);
  };

  function tokens(value) {
    const words = String(value ?? "").normalize("NFKC").toLocaleLowerCase("ko").match(/[0-9a-z가-힣ⅠⅡⅢ]+/gu) || [];
    const variants = new Set();
    words.forEach((word) => {
      if (word.length >= 2 && !GENERIC_WORDS.has(word)) variants.add(word);
      PARTICLES.forEach((particle) => {
        if (word.endsWith(particle) && word.length - particle.length >= 2) {
          const stem = word.slice(0, -particle.length);
          if (!GENERIC_WORDS.has(stem)) variants.add(stem);
        }
      });
    });
    return [...variants];
  }

  function ngrams(value, size = 2) {
    const text = normalize(value);
    if (text.length <= size) return text ? new Set([text]) : new Set();
    const result = new Set();
    for (let index = 0; index <= text.length - size; index += 1) result.add(text.slice(index, index + size));
    return result;
  }

  function diceSimilarity(left, right) {
    const a = ngrams(left);
    const b = ngrams(right);
    if (!a.size || !b.size) return 0;
    let overlap = 0;
    a.forEach((value) => { if (b.has(value)) overlap += 1; });
    return (2 * overlap) / (a.size + b.size);
  }

  function numberValue(value, fallback) {
    const number = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(number) ? number : fallback;
  }

  function selectionTypeFromQuery(query) {
    const compact = normalize(query);
    return SELECTION_TYPES.find((type) => compact.includes(normalize(type))) || "";
  }

  function subjectSelectionType(subject) {
    const selectionType = String(subject?.["선택과목의 종류"] || "").trim();
    if (selectionType) return selectionType;
    return subject?.["과목 구분"] === "공통과목" ? "공통과목" : "";
  }

  function courseGroupFromQuery(query) {
    const compact = normalize(query);
    return COURSE_GROUP_ALIASES.find(([, aliases]) => aliases.some((alias) => compact.includes(normalize(alias))))?.[0] || "";
  }

  function withoutSelectionType(query) {
    return String(query ?? "").replace(/공통\s*과목|(?:일반|진로|융합)\s*선택/gu, " ").replace(/\s+/g, " ").trim();
  }

  function createEngine(database) {
    const data = database && typeof database === "object" ? database : {};
    const chatbot = data.chatbot && typeof data.chatbot === "object" ? data.chatbot : {};
    const subjects = (Array.isArray(data.rows) ? data.rows : []).filter((row) => row && row["과목명"] && isActive(row));
    const subjectByName = new Map(subjects.map((row) => [normalize(row["과목명"]), row]));
    const keywordWeights = (Array.isArray(chatbot.keywordWeights) ? chatbot.keywordWeights : []).filter(isActive);
    const settings = new Map((Array.isArray(chatbot.searchSettings) ? chatbot.searchSettings : []).map((row) => [String(row["항목"] || "").trim(), row]));
    const faqIntents = (Array.isArray(chatbot.faqIntents) ? chatbot.faqIntents : []).filter(isActive);
    const questionVariants = (Array.isArray(chatbot.questionVariants) ? chatbot.questionVariants : []).filter(isActive);
    const answers = (Array.isArray(chatbot.answers) ? chatbot.answers : []).filter(isActive);
    const faqSynonyms = (Array.isArray(chatbot.synonyms) ? chatbot.synonyms : []).filter(isActive);
    const clarificationRules = (Array.isArray(chatbot.clarificationRules) ? chatbot.clarificationRules : []).filter(isActive);
    const testCases = (Array.isArray(chatbot.testCases) ? chatbot.testCases : []).filter(isActive);
    const sources = (Array.isArray(chatbot.sources) && chatbot.sources.length ? chatbot.sources : (Array.isArray(data.sources) ? data.sources : [])).filter(isActive);
    const sourceById = new Map(sources.map((source) => [String(source.source_id || source["출처ID"] || "").trim(), source]));
    const variantsByIntent = new Map();
    const answersByIntent = new Map();
    const testsByIntent = new Map();

    questionVariants.forEach((variant) => {
      const id = String(variant.intent_id || "").trim();
      if (!id) return;
      if (!variantsByIntent.has(id)) variantsByIntent.set(id, []);
      variantsByIntent.get(id).push(variant);
    });
    answers.forEach((answer) => {
      const id = String(answer.intent_id || "").trim();
      if (!id) return;
      if (!answersByIntent.has(id)) answersByIntent.set(id, []);
      answersByIntent.get(id).push(answer);
    });
    testCases.forEach((testCase) => {
      const id = String(testCase.expected_intent || "").trim();
      if (!/^F\d+$/u.test(id) || !testCase.sample_user_query) return;
      if (!testsByIntent.has(id)) testsByIntent.set(id, []);
      testsByIntent.get(id).push(testCase);
    });

    function setting(name, fallback) {
      return numberValue(settings.get(name)?.["값"], fallback);
    }

    function findClarification(query) {
      const compact = normalize(query);
      return clarificationRules.find((rule) => {
        const triggers = splitValues(rule.trigger_terms).map(normalize).filter(Boolean);
        const specifics = splitValues(rule.specific_terms).map(normalize).filter(Boolean);
        const optionPrompts = splitValues(rule.options).map((option) => normalize(option.split("|")[1] || option.split("|")[0]));
        return triggers.some((term) => compact.includes(term))
          && !specifics.some((term) => compact.includes(term))
          && !optionPrompts.some((term) => term && compact.includes(term));
      }) || null;
    }

    function sourcesForIds(sourceIds, locators = new Map()) {
      const ids = [...new Set(sourceIds.flatMap(splitValues).filter(Boolean))];
      return ids.map((id) => {
        const source = sourceById.get(id);
        if (!source) return { id, label: id, url: "" };
        const institution = String(source.institution || source["기관"] || "").trim();
        const title = String(source.title || source["자료명"] || source["주소/자료"] || "").trim();
        const locatorText = [...new Set(locators.get(id) || [])].filter(Boolean).join(" · ");
        return {
          id,
          label: [institution, title && `「${title}」`, locatorText].filter(Boolean).join(", "),
          url: String(source.url || "").trim()
        };
      });
    }

    function citation(sourceDetails, fallback = "데이터베이스에 확인 가능한 자료 없음") {
      const labels = sourceDetails.map((source) => source.label).filter(Boolean);
      return `[출처: ${labels.length ? labels.join(" / ") : fallback}]`;
    }

    function scoreFaq(query) {
      const compact = normalize(query);
      if (!compact || !faqIntents.length) return { accepted: false, ambiguous: false, candidates: [], score: 0, margin: 0 };
      const queryTokens = tokens(query).map(normalize);
      const synonymMatches = [];
      faqSynonyms.forEach((row) => {
        const synonym = normalize(row.synonym);
        if (synonym && compact.includes(synonym)) {
          synonymMatches.push({ canonical: normalize(row.canonical_term), weight: numberValue(row.weight, 1) });
        }
      });

      const scored = faqIntents.map((intent) => {
        const intentId = String(intent.intent_id || "").trim();
        const variants = variantsByIntent.get(intentId) || [];
        let variantScore = 0;
        let exact = false;
        const intentTests = testsByIntent.get(intentId) || [];
        [intent.canonical_question, ...variants.map((variant) => variant.normalized_utterance || variant.utterance), ...intentTests.map((testCase) => testCase.sample_user_query)].filter(Boolean).forEach((candidate) => {
          const candidateCompact = normalize(candidate);
          if (!candidateCompact) return;
          if (candidateCompact === compact) {
            exact = true;
            variantScore = Math.max(variantScore, 14);
            return;
          }
          const contains = compact.includes(candidateCompact) || candidateCompact.includes(compact);
          const similarity = diceSimilarity(compact, candidateCompact);
          if (contains && Math.min(compact.length, candidateCompact.length) >= 5) {
            variantScore = Math.max(variantScore, 7 + (3 * Math.min(compact.length, candidateCompact.length) / Math.max(compact.length, candidateCompact.length)));
          } else if (similarity >= 0.42) {
            variantScore = Math.max(variantScore, similarity * 8);
          }
        });

        const coreKeywords = splitValues(intent.core_keywords).map(normalize).filter(Boolean);
        let keywordScore = 0;
        let keywordMatches = 0;
        coreKeywords.forEach((keyword) => {
          if (compact.includes(keyword)) {
            keywordMatches += 1;
            keywordScore += keyword.length <= 2 ? 1.2 : 2.2;
            return;
          }
          if (queryTokens.some((token) => token.length >= 2 && (keyword.includes(token) || token.includes(keyword)))) {
            keywordMatches += 1;
            keywordScore += 1;
          }
        });
        synonymMatches.forEach((match) => {
          if (coreKeywords.some((keyword) => keyword.includes(match.canonical) || match.canonical.includes(keyword))) {
            keywordScore += match.weight;
            keywordMatches += 1;
          }
        });
        if (keywordMatches >= 2) keywordScore += Math.min(3, keywordMatches - 1);
        return { intent, score: variantScore + keywordScore, exact, keywordMatches };
      }).sort((a, b) => b.score - a.score || Number(b.exact) - Number(a.exact));

      const best = scored[0];
      const second = scored[1];
      const minimum = numberValue(best?.intent?.min_score, 4);
      const requiredMargin = numberValue(best?.intent?.min_margin, 1.2);
      const margin = best ? best.score - (second?.score || 0) : 0;
      const accepted = Boolean(best && best.score >= minimum && (best.exact || margin >= requiredMargin));
      return {
        accepted,
        ambiguous: Boolean(best && best.score >= Math.max(2.5, minimum * 0.7) && !accepted),
        candidates: scored.slice(0, 3),
        best,
        score: best?.score || 0,
        margin
      };
    }

    function scoreCourses(query) {
      const requestedSelectionType = selectionTypeFromQuery(query);
      const scoringQuery = withoutSelectionType(query);
      const requestedCourseGroup = courseGroupFromQuery(scoringQuery);
      const compact = normalize(scoringQuery);
      const queryTokens = tokens(scoringQuery);
      const scores = new Map();
      const exactNames = new Set();
      const exactBonus = setting("과목명 정확 일치 보너스", 100);
      const partialBonus = setting("과목명 부분 일치 보너스", 40);
      const synonymMultiplier = setting("동의어 DB 점수 배수", 4);
      const groupScore = setting("교과군 직접 일치", 3);

      const add = (subject, points, term, reason, sourceId = "", keywordPoints = 0) => {
        const name = String(subject?.["과목명"] || "").trim();
        if (!name || !Number.isFinite(points) || points <= 0) return;
        if (!scores.has(name)) scores.set(name, { subject, score: 0, keywordPoints: 0, terms: new Set(), canonicalTerms: new Set(), directCanonicalTerms: new Set(), reasons: new Set(), sourceIds: new Set(), directCourseMatch: false });
        const result = scores.get(name);
        result.score += points;
        result.keywordPoints += keywordPoints;
        if (term) result.terms.add(term);
        if (reason) result.reasons.add(reason);
        splitValues(sourceId).forEach((id) => result.sourceIds.add(id));
        splitValues(subject["출처ID"]).forEach((id) => result.sourceIds.add(id));
      };

      subjects.forEach((subject) => {
        const name = String(subject["과목명"] || "").trim();
        const normalizedName = normalize(name);
        if (normalizedName && compact.includes(normalizedName)) {
          exactNames.add(name);
          add(subject, exactBonus, name, "과목명 정확 일치");
        } else {
          const partial = queryTokens.find((token) => normalize(token).length >= 2 && normalizedName.includes(normalize(token)));
          if (partial) add(subject, partialBonus, partial, "과목명 부분 일치");
        }
        const group = String(subject["교과군"] || "").trim();
        if (group && compact.includes(normalize(group))) add(subject, groupScore, group, "교과군 일치");
      });

      const bestKeywordMatches = new Map();
      keywordWeights.forEach((row) => {
        const searchTerm = String(row["검색어"] || "").trim();
        const normalizedTerm = normalize(searchTerm);
        if (!normalizedTerm || normalizedTerm.length < 2 || !compact.includes(normalizedTerm)) return;
        splitValues(row["적용과목"]).forEach((courseName) => {
          const subject = subjectByName.get(normalize(courseName));
          if (!subject) return;
          const key = `${normalize(courseName)}\u0000${normalizedTerm}`;
          const points = numberValue(row["가중치"], 0) * synonymMultiplier;
          const previous = bestKeywordMatches.get(key);
          if (!previous || points > previous.points) bestKeywordMatches.set(key, { subject, points, searchTerm, row });
        });
      });
      bestKeywordMatches.forEach(({ subject, points, searchTerm, row }) => {
        const relation = String(row["관계유형"] || "DB 키워드 연관");
        add(subject, points, searchTerm, relation, String(row["출처ID"] || ""), points);
        const result = scores.get(String(subject["과목명"] || "").trim());
        if (row["기준어"]) result?.canonicalTerms.add(String(row["기준어"]).trim());
        if (/희망 교과 직접 연계|진로 직접 연관|추천 직업 직접 명시/u.test(relation) && result) {
          result.directCourseMatch = true;
          if (row["기준어"]) result.directCanonicalTerms.add(String(row["기준어"]).trim());
        }
      });

      const fieldRules = [
        ["이 과목을 누구에게 추천하나요?", setting("추천대상 필드 직접 일치", 8), "추천 대상 일치"],
        ["이 과목은 어떤 과목인가요?", setting("과목 설명 필드 직접 일치", 5), "과목 설명 일치"],
        ["과목의 주요 내용", setting("주요내용 필드 직접 일치", 6), "주요 내용 일치"]
      ];
      subjects.forEach((subject) => {
        queryTokens.forEach((token) => {
          const normalizedToken = normalize(token);
          if (normalizedToken.length < 2 || GENERIC_WORDS.has(token)) return;
          fieldRules.forEach(([field, points, reason]) => {
            if (normalize(subject[field]).includes(normalizedToken)) add(subject, points, token, reason);
          });
        });
      });

      const sorted = [...scores.values()].sort((a, b) => b.score - a.score || String(a.subject["과목명"]).localeCompare(String(b.subject["과목명"]), "ko"));
      const exactResults = sorted.filter((result) => exactNames.has(String(result.subject["과목명"])));
      if (exactResults.length) return {
        results: exactResults,
        narrowingResults: exactResults,
        candidateCount: exactResults.length,
        exact: true,
        confident: true,
        maximumScore: exactResults[0].score,
        requestedSelectionType,
        requestedCourseGroup
      };

      const maximumScore = sorted[0]?.score || 0;
      const minimumScore = setting("최소 과목 추천 점수", 12);
      const strongRatio = setting("강한 연관 점수 비율", 0.65);
      const maximumCount = Math.max(1, setting("최대 추천 개수", 80));
      let results = sorted.filter((result) => result.score >= minimumScore && (result.directCourseMatch || result.score >= maximumScore * strongRatio));
      if (requestedSelectionType) results = results.filter((result) => subjectSelectionType(result.subject) === requestedSelectionType);
      if (requestedCourseGroup) results = results.filter((result) => result.subject["교과군"] === requestedCourseGroup);

      let confident = Boolean(results.length && maximumScore >= minimumScore);
      if (!confident && (requestedSelectionType || requestedCourseGroup) && /과목|추천/u.test(String(query))) {
        results = subjects.filter((subject) => {
          if (requestedSelectionType && subjectSelectionType(subject) !== requestedSelectionType) return false;
          if (requestedCourseGroup && subject["교과군"] !== requestedCourseGroup) return false;
          return true;
        }).map((subject) => ({
          subject,
          score: minimumScore,
          keywordPoints: 0,
          terms: new Set([requestedSelectionType, requestedCourseGroup].filter(Boolean)),
          canonicalTerms: new Set(),
          directCanonicalTerms: new Set(),
          reasons: new Set(["선택 조건 일치"]),
          sourceIds: new Set(splitValues(subject["출처ID"])),
          directCourseMatch: false
        }));
        confident = Boolean(results.length);
      }

      const narrowingResults = results;
      return {
        results: results.slice(0, maximumCount),
        narrowingResults,
        candidateCount: narrowingResults.length,
        exact: false,
        confident,
        maximumScore,
        requestedSelectionType,
        requestedCourseGroup
      };
    }

    function courseSourceDetails(results, extraSourceIds = []) {
      const ids = [...extraSourceIds];
      results.forEach((result) => result.sourceIds?.forEach((id) => ids.push(id)));
      const details = sourcesForIds(ids);
      if (details.length) return details;
      const legacy = (Array.isArray(data.sources) ? data.sources : []).filter((source) => source["주소/자료"]);
      return legacy.slice(0, 1).map((source, index) => ({ id: `legacy-${index}`, label: [source["구분"], source["주소/자료"]].filter(Boolean).join(", "), url: /^https?:/i.test(source["주소/자료"]) ? source["주소/자료"] : "" }));
    }

    function clarificationResponse(rule) {
      const courseNames = splitValues(rule.recommended_courses);
      const results = courseNames.map((name) => {
        const subject = subjectByName.get(normalize(name));
        if (!subject) return null;
        return { subject, score: 0, terms: new Set(["교사"]), reasons: new Set(["교사 진로 공통 연관"]), sourceIds: new Set(splitValues(subject["출처ID"] || rule.source_id)) };
      }).filter(Boolean);
      const choices = splitValues(rule.options).map((option) => {
        const [label, prompt] = option.split("|").map((value) => value.trim());
        return { label, prompt: prompt || label };
      }).filter((choice) => choice.label);
      const sourceDetails = courseSourceDetails(results, splitValues(rule.source_id));
      return {
        kind: "clarification",
        intentId: String(rule.rule_id || ""),
        text: String(rule.acknowledgement || "조금 더 정확히 추천해 드리고 싶어요.").trim(),
        followupText: String(rule.prompt || "관심 분야를 조금 더 구체적으로 알려주시겠어요?").trim(),
        results,
        choices,
        sourceDetails,
        sourceText: citation(sourceDetails)
      };
    }

    function faqResponse(match) {
      const intent = match.best.intent;
      const intentId = String(intent.intent_id || "");
      const selectedAnswers = [...(answersByIntent.get(intentId) || [])]
        .filter((answer) => String(answer.answer_text || "").trim())
        .sort((a, b) => numberValue(a.answer_order, 999) - numberValue(b.answer_order, 999));
      if (!selectedAnswers.length || !selectedAnswers.some((answer) => splitValues(answer.source_id).length)) {
        return fallbackResponse("확인 가능한 공식 근거가 없어 단정해서 안내하기 어렵습니다. 해당 질문은 선생님에게 문의해 주세요.");
      }
      const locators = new Map();
      const sourceIds = [];
      selectedAnswers.forEach((answer) => {
        splitValues(answer.source_id).forEach((id) => {
          sourceIds.push(id);
          if (!locators.has(id)) locators.set(id, []);
          if (answer.source_locator) locators.get(id).push(String(answer.source_locator).trim());
        });
      });
      const sourceDetails = sourcesForIds(sourceIds, locators);
      const friendlyLead = /과목선택|이수순서|과목개설/u.test(String(intent.category || ""))
        ? "과목 선택 때문에 고민하고 계시는군요. DB에 확인된 기준부터 차근차근 말씀드릴게요."
        : "네, 확인된 자료를 기준으로 안내해 드릴게요.";
      const body = selectedAnswers.map((answer) => String(answer.answer_text).trim()).join(" ");
      return {
        kind: "faq",
        intentId,
        text: `${friendlyLead}\n\n${body}`,
        results: [],
        choices: [],
        sourceDetails,
        sourceText: citation(sourceDetails)
      };
    }

    function courseResponse(query, scored) {
      const sourceDetails = courseSourceDetails(scored.results);
      const text = scored.exact
        ? "말씀하신 과목을 찾았어요. DB에 기록된 과목 설명과 추천 대상을 안내해 드릴게요."
        : `말씀해 주신 진로와 관심사를 기준으로 직접 연결되는 과목 ${scored.results.length}개를 찾았어요. 한 과목만 고르지 않고, 연관도가 충분한 과목을 함께 보여드릴게요.`;
      const canonicalCounts = new Map();
      const hasDirectTerms = scored.results.some((result) => result.directCanonicalTerms?.size);
      scored.results.forEach((result) => (hasDirectTerms ? result.directCanonicalTerms : result.canonicalTerms)?.forEach((term) => canonicalCounts.set(term, (canonicalCounts.get(term) || 0) + 1)));
      const dominantCanonical = [...canonicalCounts].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0]?.[0] || "";
      return {
        kind: "courses",
        intentId: scored.exact ? `COURSE:${scored.results[0]?.subject?.["과목명"] || ""}` : (dominantCanonical ? `COURSE:${dominantCanonical}` : "COURSE_RECOMMENDATION"),
        exact: scored.exact,
        text,
        results: scored.results,
        choices: [],
        sourceDetails,
        sourceText: citation(sourceDetails)
      };
    }

    function courseNarrowingResponse(query, scored) {
      const candidates = scored.narrowingResults || scored.results;
      const sourceDetails = courseSourceDetails(candidates);
      const selectionCounts = new Map();
      const groupCounts = new Map();
      candidates.forEach((result) => {
        const selectionType = subjectSelectionType(result.subject);
        const courseGroup = String(result.subject["교과군"] || "").trim();
        if (selectionType) selectionCounts.set(selectionType, (selectionCounts.get(selectionType) || 0) + 1);
        if (courseGroup) groupCounts.set(courseGroup, (groupCounts.get(courseGroup) || 0) + 1);
      });

      let choices = [];
      let followupText = "희망하는 세부 진로나 학과를 조금 더 구체적으로 입력해 주세요. 예: 생명과학 연구원, 시각디자인, 경제·금융";
      if (!scored.requestedSelectionType && selectionCounts.size > 1) {
        followupText = "어떤 선택과목 유형을 찾고 있나요?";
        choices = SELECTION_TYPES.filter((type) => selectionCounts.has(type)).map((type) => ({
          label: `${type} (${selectionCounts.get(type)}개)`,
          prompt: `${query} 중 ${type === "공통과목" ? "공통과목만" : `${type} 과목만`} 추천해 주세요`
        }));
      } else if (!scored.requestedCourseGroup && groupCounts.size > 1) {
        followupText = "어느 교과 영역을 중심으로 찾을까요?";
        choices = [...groupCounts]
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"))
          .slice(0, 6)
          .map(([group, count]) => ({
            label: `${group} (${count}개)`,
            prompt: `${query} 중 ${group} 교과 영역을 중심으로 추천해 주세요`
          }));
      }

      return {
        kind: "clarification",
        intentId: "COURSE_SCOPE_CLARIFY",
        text: `조건에 맞는 과목 후보가 ${candidates.length}개라서 그대로 보여드리면 선택하기 어려워요. 범위를 조금 더 좁혀 볼게요.`,
        followupText,
        results: [],
        choices,
        candidateCount: candidates.length,
        sourceDetails,
        sourceText: citation(sourceDetails)
      };
    }

    function ambiguousResponse(match) {
      const choices = match.candidates.filter((candidate) => candidate.score > 0).map((candidate) => ({
        label: String(candidate.intent.canonical_question || "").trim(),
        prompt: String(candidate.intent.canonical_question || "").trim()
      })).filter((choice) => choice.label);
      return {
        kind: "clarification",
        intentId: "FAQ_CLARIFY",
        text: "질문의 뜻을 정확히 확인하고 싶어요. 아래에서 가장 가까운 질문을 골라 주시겠어요?",
        followupText: "",
        results: [],
        choices,
        sourceDetails: [],
        sourceText: "[출처: FAQ 질문 분류 DB]"
      };
    }

    function fallbackResponse(message = "현재 데이터베이스에서 질문과 충분히 가까운 근거를 찾지 못했어요. 잘못 안내해 드리면 안 되므로 해당 질문은 선생님에게 문의해 주세요.") {
      return {
        kind: "fallback",
        intentId: "FALLBACK",
        text: message,
        results: [],
        choices: [],
        sourceDetails: [],
        sourceText: "[출처: 데이터베이스에 확인 가능한 자료 없음]"
      };
    }

    function respond(query) {
      const cleanQuery = String(query || "").trim();
      if (!cleanQuery) return fallbackResponse();
      const clarification = findClarification(cleanQuery);
      if (clarification) return clarificationResponse(clarification);

      const faqMatch = scoreFaq(cleanQuery);
      const courseMatch = scoreCourses(cleanQuery);
      if (faqMatch.accepted && faqMatch.best.exact) return faqResponse(faqMatch);
      if (courseMatch.exact) {
        if (courseMatch.candidateCount >= COURSE_RESULT_CLARIFICATION_THRESHOLD) return courseNarrowingResponse(cleanQuery, courseMatch);
        return courseResponse(cleanQuery, courseMatch);
      }
      if (faqMatch.accepted && (!courseMatch.confident || !COURSE_SIGNAL.test(cleanQuery))) return faqResponse(faqMatch);
      if (courseMatch.confident && (COURSE_SIGNAL.test(cleanQuery) || courseMatch.results.some((result) => result.keywordPoints >= 12))) {
        if (!courseMatch.exact && courseMatch.candidateCount >= COURSE_RESULT_CLARIFICATION_THRESHOLD) return courseNarrowingResponse(cleanQuery, courseMatch);
        return courseResponse(cleanQuery, courseMatch);
      }
      if (faqMatch.accepted) return faqResponse(faqMatch);
      if (faqMatch.ambiguous) return ambiguousResponse(faqMatch);
      return fallbackResponse();
    }

    return {
      respond,
      scoreFaq,
      scoreCourses,
      findClarification,
      sourceById,
      subjects,
      database: data
    };
  }

  return { createEngine, normalize, splitValues, tokens, diceSimilarity };
});
