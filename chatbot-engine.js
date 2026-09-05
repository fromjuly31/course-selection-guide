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
  const CAREER_UNCERTAINTY_SIGNAL = /(?:진로|꿈|장래희망|희망직업|희망학과|관심분야|전공|적성|흥미).{0,12}(?:없|미정|불확실|확실하지않|애매|모호|고민|막막|모르|못정|안정|정해지지않|결정하지못|헷갈)/u;
  const CAREER_ROLE_PATTERN = /(교사|선생님|교육자|연구원|과학자|화학자|개발자|프로그래머|엔지니어|디자이너|간호사|의사|약사|수의사|변호사|판사|검사|상담사|심리사|공무원|경찰|소방관|기자|작가|번역가|통역사|회계사|세무사|건축가|교수|영양사|치료사|예술가|음악가|연주자|운동선수|조종사|승무원)(?=$|은|는|이|가|을|를|도|와|과|로|의|에게|한테|처럼|부터|까지|만|야|예요|이에요|입니다|되고|되려|하고|희망|진로|꿈|목표|에대해|설명|알려)/u;
  const COURSE_RESULT_CLARIFICATION_THRESHOLD = 6;
  const DIRECT_RECOMMENDATION_LIMIT = 10;
  const COURSE_DETAIL_REQUEST_PROMPT = "희망 진로나 학과에 맞는 과목을 추천받고 싶어요.";
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

  const parseChoices = (value) => {
    const labels = new Set();
    return String(value ?? "")
      .split(/[;\n]+/u)
      .map((item) => {
        const [label = "", ...promptParts] = item.split("|");
        const cleanLabel = label.trim();
        const prompt = promptParts.join("|").trim() || cleanLabel;
        return { label: cleanLabel, prompt };
      })
      .filter((choice) => {
        const key = normalize(choice.label);
        if (!key || labels.has(key)) return false;
        labels.add(key);
        return true;
      });
  };

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

  function careerFocusFromQuery(query, fallback = "") {
    const focus = String(query ?? "")
      .normalize("NFKC")
      .trim()
      .replace(/[.!?]+$/u, "")
      .replace(/^(?:나는|저는|제가)\s*/u, "")
      .replace(/^(?:내|제|저의|나의)\s*(?:진로|희망\s*직업|장래희망|꿈|목표)\s*(?:은|는|이|가)?\s*/u, "")
      .replace(/\s*(?:이|가|을|를)?\s*(?:되고\s*싶(?:어|어요|습니다)?|하고\s*싶(?:어|어요|습니다)?|가고\s*싶(?:어|어요|습니다)?|진학하고\s*싶(?:어|어요|습니다)?|희망(?:해|해요|합니다)|(?:내\s*)?진로(?:야|예요|이에요|입니다)|꿈(?:이야|이에요|입니다)|목표(?:야|예요|입니다))\s*$/u, "")
      .replace(/(?:이야|야|예요|이에요|입니다)$/u, "")
      .trim();
    return focus || fallback;
  }

  function classifyRequest(query) {
    const compact = normalize(query);
    const hasCourseTarget = /과목|수업|교과/u.test(compact);
    const hasDepartmentTarget = /학과|전공|학부|교육과(?!정)/u.test(compact);
    const courseRecommendation = hasCourseTarget && (
      /(?:과목|수업|교과).{0,18}(?:추천|골라|고를|선택해|선택할|선택해야|수강해|수강할|들어야|들으면|들까|맞을까|좋을까)/u.test(compact)
      || /(?:추천|골라|고를|선택해|선택할).{0,12}(?:과목|수업|교과)/u.test(compact)
      || /(?:어떤|무슨).{0,8}(?:과목|수업|교과).{0,18}(?:추천|골라|고를|선택|수강|들어|들을|필요|도움|좋)/u.test(compact)
      || /(?:되려면|가려면|진로|희망직업|희망학과).{0,24}(?:과목|수업|교과).{0,12}(?:필요|도움)/u.test(compact)
    );
    const departmentRecommendation = hasDepartmentTarget && (
      /(?:학과|전공|학부).{0,18}(?:추천|골라|고를|선택해|선택할|가야|진학|어디|맞을까|좋을까)/u.test(compact)
      || /(?:추천|골라|고를|선택해|선택할).{0,12}(?:학과|전공|학부)/u.test(compact)
      || /(?:어떤|무슨|어느).{0,8}(?:학과|전공|학부)/u.test(compact)
    );
    const careerRole = compact.match(CAREER_ROLE_PATTERN)?.[0] || "";
    const hasCareerRole = Boolean(careerRole);
    const counseling = CAREER_UNCERTAINTY_SIGNAL.test(compact)
      || /진로.{0,10}(?:고민|걱정|막막|헷갈|모르)|적성.{0,10}(?:고민|모르)|무엇을해야할지모르/u.test(compact);
    const careerDeclaration = (hasCareerRole || hasDepartmentTarget || /진로|희망직업|장래희망|꿈|목표/u.test(compact))
      && /되고싶|하고싶|가고싶|진학하고싶|희망해|희망합니다|진로(?:는|가|야|이다|입니다)|희망직업(?:은|는|이|가|야|이다|입니다)|장래희망(?:은|는|이|가|야|이다|입니다)|꿈(?:은|는|이|가|야|이다|입니다)|목표(?:은|는|이|가|야|이다|입니다)/u.test(compact);
    const concept = /무엇|뭐야|뭔가요|무슨뜻|의미|개념|설명|알려줘|어떤과목이|배우는|배워|내용|차이/u.test(compact);

    const context = { hasCareerRole, careerRole, hasCourseTarget, hasDepartmentTarget };
    if (courseRecommendation && departmentRecommendation) return { kind: "combined-recommendation", target: "both", ...context };
    if (courseRecommendation) return { kind: "course-recommendation", target: "courses", ...context };
    if (departmentRecommendation) return { kind: "department-recommendation", target: "departments", ...context };
    if (counseling) return { kind: "career-counseling", target: "counseling", ...context };
    if (careerDeclaration) return { kind: "career-declaration", target: "career", ...context };
    if (concept && hasCareerRole && !hasCourseTarget) return { kind: "career-information", target: "career", ...context };
    if (concept) return { kind: "concept-question", target: "information", ...context };
    if (hasCareerRole) return { kind: "career-declaration", target: "career", ...context };
    if (COURSE_SIGNAL.test(String(query))) return { kind: "career-exploration", target: "career", ...context };
    return { kind: "general-question", target: "information", ...context };
  }

  function createEngine(database) {
    const data = database && typeof database === "object" ? database : {};
    const chatbot = data.chatbot && typeof data.chatbot === "object" ? data.chatbot : {};
    const subjects = (Array.isArray(data.rows) ? data.rows : []).filter((row) => row && row["과목명"] && isActive(row));
    const subjectByName = new Map(subjects.map((row) => [normalize(row["과목명"]), row]));
    const departments = (Array.isArray(data.departments) ? data.departments : []).filter((department) => department && department.name);
    const keywordWeights = (Array.isArray(chatbot.keywordWeights) ? chatbot.keywordWeights : []).filter(isActive);
    const settings = new Map((Array.isArray(chatbot.searchSettings) ? chatbot.searchSettings : []).map((row) => [String(row["항목"] || "").trim(), row]));
    const faqIntents = (Array.isArray(chatbot.faqIntents) ? chatbot.faqIntents : []).filter(isActive);
    const careerUncertainIntent = faqIntents.find((intent) => String(intent.intent_id || "") === "F063") || null;
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

    function departmentNameBases(name) {
      const segments = String(name || "").normalize("NFKC").split(/[()（）·ㆍ,，/]+/u);
      return [...new Set(segments.map((segment) => normalize(segment).replace(/(?:학부|전공)$/u, "").replace(/과$/u, "")).filter((segment) => segment.length >= 2))];
    }

    function careerFocusTerms(query) {
      const ignored = /^(?:과목|수업|교과|학과|전공|학부|추천|추천해줘|추천해주세요|골라|골라줘|선택|선택해줘|되고|되려면|되고싶어|되고싶은데|싶어|싶어요|어떤|무슨|어느|관련|진로|직업|관심|분야)$/u;
      const terms = new Set();
      tokens(query).map(normalize).filter((term) => term.length >= 2 && !ignored.test(term)).forEach((term) => {
        terms.add(term);
        const roleStem = /^(?:화학|물리학|생물학|지질학|천문학|수학|과학)자$/u.test(term)
          ? term.slice(0, -1)
          : term.replace(/(?:교사|선생님|교육자|연구원|개발자|프로그래머|엔지니어|디자이너|간호사|의사|약사|수의사|변호사|판사|검사|상담사|심리사|공무원|경찰|소방관|기자|작가|번역가|통역사|회계사|세무사|건축가|교수|영양사|치료사)$/u, "");
        if (roleStem.length >= 2) terms.add(roleStem);
      });
      return [...terms];
    }

    function scoreDepartments(query) {
      const compact = normalize(query);
      const focusTerms = careerFocusTerms(query);
      const teachingCareer = /교사|선생님|교육자|사범대|교대/u.test(compact);
      const engineeringCareer = /엔지니어|공학|공정|설계/u.test(compact);
      const scored = departments.map((department) => {
        const name = String(department.name || "").trim();
        const normalizedName = normalize(name);
        const nameBases = departmentNameBases(name);
        const overview = normalize(department.guide?.overview);
        const aptitude = normalize(department.guide?.aptitude);
        const careers = normalize(department.guide?.careers);
        const matchedTerms = new Set();
        const reasons = new Set();
        let score = 0;
        let directNameMatch = false;
        let nameMatchScore = 0;
        let careerMatchScore = 0;
        let overviewMatchScore = 0;
        let aptitudeMatchScore = 0;

        if (normalizedName.length >= 2 && compact.includes(normalizedName)) {
          score += 60;
          directNameMatch = true;
          matchedTerms.add(name);
          reasons.add("학과명 직접 일치");
        }
        focusTerms.forEach((term) => {
          if (term.length < 2) return;
          if (nameBases.some((base) => base === term)) {
            nameMatchScore = Math.max(nameMatchScore, 34);
            directNameMatch = true;
            matchedTerms.add(term);
            reasons.add("진로 핵심어와 학과명 일치");
          } else if (nameBases.some((base) => base.startsWith(term) || term.startsWith(base))) {
            nameMatchScore = Math.max(nameMatchScore, 20);
            directNameMatch = true;
            matchedTerms.add(term);
            reasons.add("진로 핵심어와 학과명 연관");
          }
          if (careers.includes(term)) {
            careerMatchScore = Math.max(careerMatchScore, 5);
            matchedTerms.add(term);
            reasons.add("졸업 후 진로 연관");
          }
          if (overview.includes(term)) {
            overviewMatchScore = Math.max(overviewMatchScore, 3);
            matchedTerms.add(term);
            reasons.add("학과 개요 연관");
          }
          if (aptitude.includes(term)) {
            aptitudeMatchScore = Math.max(aptitudeMatchScore, 2);
            matchedTerms.add(term);
            reasons.add("흥미·적성 연관");
          }
        });
        score += nameMatchScore + careerMatchScore + overviewMatchScore + aptitudeMatchScore;
        if (teachingCareer && /교육/u.test(normalizedName)) {
          score += 16;
          reasons.add("교사 진로와 교육계열 직접 연관");
        } else if (!teachingCareer && /교육/u.test(normalizedName)) {
          score -= 10;
        }
        if (engineeringCareer && /공학/u.test(normalizedName)) {
          score += 12;
          reasons.add("공학 진로 직접 연관");
        }
        return { department, score, terms: matchedTerms, reasons, sourceIds: new Set(), directNameMatch };
      }).filter((result) => result.score > 0)
        .sort((a, b) => b.score - a.score || String(a.department.name).localeCompare(String(b.department.name), "ko"));
      const maximumScore = scored[0]?.score || 0;
      const directMatches = scored.filter((result) => result.directNameMatch);
      const resultPool = directMatches.length ? directMatches : scored;
      const results = resultPool.filter((result) => result.score >= 10 && result.score >= maximumScore * 0.48);
      return {
        results: results.slice(0, DIRECT_RECOMMENDATION_LIMIT),
        candidates: results,
        candidateCount: results.length,
        confident: Boolean(results.length && maximumScore >= 10),
        maximumScore,
        focusTerms
      };
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
      const requestIntent = classifyRequest(query);
      const recommendationQuery = requestIntent.target === "courses" || requestIntent.target === "both";
      const directCourseInformation = requestIntent.kind === "concept-question"
        && (!requestIntent.hasCareerRole || requestIntent.hasCourseTarget);
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
          if (recommendationQuery || !directCourseInformation) {
            add(subject, groupScore, name, "진로 표현과 과목명 연관");
          } else {
            exactNames.add(name);
            add(subject, exactBonus, name, "과목명 정확 일치");
          }
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
      const resultLimit = recommendationQuery ? DIRECT_RECOMMENDATION_LIMIT : maximumCount;
      return {
        results: results.slice(0, resultLimit),
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

    function copyCourseResult(result) {
      return {
        ...result,
        terms: new Set(result.terms || []),
        canonicalTerms: new Set(result.canonicalTerms || []),
        directCanonicalTerms: new Set(result.directCanonicalTerms || []),
        reasons: new Set(result.reasons || []),
        sourceIds: new Set(result.sourceIds || [])
      };
    }

    function expandCoursesFromDepartments(scored, departmentScored) {
      const courseMap = new Map();
      (scored.narrowingResults || scored.results || []).forEach((result) => {
        const copy = copyCourseResult(result);
        courseMap.set(normalize(copy.subject?.["과목명"]), copy);
      });
      const addDepartmentCourses = (departmentResult, entries, points, reason) => {
        (entries || []).forEach((entry) => {
          const courseName = typeof entry === "string" ? entry : entry?.name;
          const subject = subjectByName.get(normalize(courseName));
          if (!subject) return;
          if (scored.requestedSelectionType && subjectSelectionType(subject) !== scored.requestedSelectionType) return;
          if (scored.requestedCourseGroup && subject["교과군"] !== scored.requestedCourseGroup) return;
          const key = normalize(subject["과목명"]);
          if (!courseMap.has(key)) {
            courseMap.set(key, {
              subject,
              score: 0,
              keywordPoints: 0,
              terms: new Set(),
              canonicalTerms: new Set(),
              directCanonicalTerms: new Set(),
              reasons: new Set(),
              sourceIds: new Set(splitValues(subject["출처ID"])),
              directCourseMatch: false
            });
          }
          const result = courseMap.get(key);
          result.score += points;
          result.terms.add(departmentResult.department.name);
          result.reasons.add(reason);
        });
      };

      (departmentScored?.results || []).slice(0, 3).forEach((departmentResult) => {
        const department = departmentResult.department;
        const weightedCourses = new Map();
        const collect = (entries, points, reason) => (entries || []).forEach((entry) => {
          const courseName = typeof entry === "string" ? entry : entry?.name;
          const key = normalize(courseName);
          if (!key) return;
          const current = weightedCourses.get(key);
          if (!current || current.points < points) weightedCourses.set(key, { entry, points, reason });
        });
        collect(department.relatedSubjects, 12, `${department.name} 관련 과목`);
        collect(department.scienceRecommendedSubjects, 20, `${department.name} 과학 권장 과목`);
        collect(department.reflectedSubjects, 28, `${department.name} 반영 과목`);
        weightedCourses.forEach(({ entry, points, reason }) => addDepartmentCourses(departmentResult, [entry], points, reason));
      });

      const candidates = [...courseMap.values()].sort((a, b) => {
        const commonDifference = Number(subjectSelectionType(a.subject) === "공통과목") - Number(subjectSelectionType(b.subject) === "공통과목");
        const keywordDifference = Number((b.keywordPoints || 0) > 0) - Number((a.keywordPoints || 0) > 0);
        return commonDifference || keywordDifference || b.score - a.score || String(a.subject["과목명"]).localeCompare(String(b.subject["과목명"]), "ko");
      });
      return {
        ...scored,
        results: candidates.slice(0, DIRECT_RECOMMENDATION_LIMIT),
        narrowingResults: candidates,
        candidateCount: candidates.length,
        confident: Boolean(candidates.length),
        maximumScore: candidates[0]?.score || scored.maximumScore || 0,
        relatedDepartments: departmentScored?.results || []
      };
    }

    function recommendationFocusTerm(scored, departmentScored) {
      const departmentTerms = (departmentScored?.results || []).flatMap((result) => [...(result.terms || [])]);
      const canonicalTerms = (scored?.results || []).flatMap((result) => [...(result.directCanonicalTerms || []), ...(result.canonicalTerms || [])]);
      const roleOnly = /^(?:교사|선생님|교육자|연구원|과학자|화학자|개발자|프로그래머|엔지니어|디자이너|간호사|의사|약사|수의사|변호사|판사|검사|상담사|심리사|공무원|경찰|소방관|기자|작가|번역가|통역사|회계사|세무사|건축가|교수|영양사|치료사)$/u;
      return [...new Set([...departmentTerms, ...canonicalTerms].map((term) => String(term || "").trim()).filter((term) => term.length >= 2 && !roleOnly.test(term)))]
        .sort((a, b) => a.length - b.length || a.localeCompare(b, "ko"))[0] || "";
    }

    function recommendationActions(scored, departmentScored) {
      const focusTerm = recommendationFocusTerm(scored, departmentScored);
      const actions = (departmentScored?.results || []).slice(0, 4).map((result) => ({
        label: `${result.department.name} 안내 바로가기`,
        href: `section.html?tab=departments&detail=${encodeURIComponent(result.department.id)}`,
        entity: "department"
      }));
      if ((scored?.candidateCount || 0) > (scored?.results?.length || 0) && focusTerm) {
        actions.push({
          label: `‘${focusTerm}’ 관련 과목 더 보기`,
          href: `section.html?tab=subjects&q=${encodeURIComponent(focusTerm)}`,
          entity: "course"
        });
      }
      if ((departmentScored?.candidateCount || 0) > 4 && focusTerm) {
        actions.push({
          label: `‘${focusTerm}’ 관련 학과 더 보기`,
          href: `section.html?tab=departments&q=${encodeURIComponent(focusTerm)}`,
          entity: "department"
        });
      }
      return actions;
    }

    function departmentResponse(departmentScored) {
      const departmentSource = { id: "DEPARTMENT_DB", label: "커리어넷 기반 학과 정보 데이터베이스", url: "" };
      const shownCount = departmentScored.results.length;
      const hasMore = departmentScored.candidateCount > shownCount;
      return {
        kind: "departments",
        intentId: "DEPARTMENT_RECOMMENDATION",
        text: hasMore
          ? `진로 키워드와 직접 연결되는 학과가 ${departmentScored.candidateCount}개 있어 연관도가 높은 ${shownCount}개를 먼저 보여드릴게요.`
          : `진로 키워드와 직접 연결되는 학과 ${shownCount}개를 찾았어요. 학과 소개와 관련 과목을 함께 확인해 보세요.`,
        results: departmentScored.results,
        choices: [],
        actions: recommendationActions(null, departmentScored),
        actionText: "학과 안내 화면으로 바로 이동할 수 있어요.",
        sourceDetails: [departmentSource],
        sourceText: citation([departmentSource])
      };
    }

    function clarificationResponse(rule) {
      const courseNames = splitValues(rule.recommended_courses);
      const results = courseNames.map((name) => {
        const subject = subjectByName.get(normalize(name));
        if (!subject) return null;
        return { subject, score: 0, terms: new Set(["교사"]), reasons: new Set(["교사 진로 공통 연관"]), sourceIds: new Set(splitValues(subject["출처ID"] || rule.source_id)) };
      }).filter(Boolean);
      const choices = parseChoices(rule.options);
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

    function answerMatchesQuery(answer, query) {
      const condition = String(answer.condition || "").trim();
      if (!condition) return true;
      const queryHasAny = condition.match(/^QUERY_HAS_ANY:(.+)$/iu);
      if (!queryHasAny) return true;
      const compact = normalize(query);
      return splitValues(queryHasAny[1]).some((term) => compact.includes(normalize(term)));
    }

    function faqResponse(match, query) {
      const intent = match.best.intent;
      const intentId = String(intent.intent_id || "");
      const selectedAnswers = [...(answersByIntent.get(intentId) || [])]
        .filter((answer) => String(answer.answer_text || "").trim())
        .filter((answer) => answerMatchesQuery(answer, query))
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
      const body = selectedAnswers.map((answer) => String(answer.answer_text).trim()).join("\n\n");
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

    function courseResponse(query, scored, departmentScored = null) {
      const sourceDetails = courseSourceDetails(scored.results);
      if (departmentScored?.results?.length) sourceDetails.push({ id: "DEPARTMENT_DB", label: "커리어넷 기반 학과 정보 데이터베이스", url: "" });
      const shownCount = scored.results.length;
      const hasMore = scored.candidateCount > shownCount;
      const text = scored.exact
        ? "말씀하신 과목을 찾았어요. DB에 기록된 과목 설명과 추천 대상을 안내해 드릴게요."
        : hasMore
          ? `말씀해 주신 진로와 직접 연결되는 과목 후보 ${scored.candidateCount}개 중 연관도가 높은 ${shownCount}개를 보여드릴게요. 한 과목만 고르지 않고 관련 학과의 과목 정보까지 함께 반영했어요.`
          : `말씀해 주신 진로와 직접 연결되는 과목 ${shownCount}개를 찾았어요. 한 과목만 고르지 않고, 연관도가 충분한 과목을 함께 보여드릴게요.`;
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
        actions: scored.exact ? [] : recommendationActions(scored, departmentScored),
        actionText: scored.exact ? "" : "관련 학과나 더 많은 과목은 아래 바로가기에서 이어서 확인할 수 있어요.",
        sourceDetails,
        sourceText: citation(sourceDetails)
      };
    }

    function combinedRecommendationResponse(query, scored, departmentScored) {
      const departmentResults = (departmentScored.results || []).slice(0, 3);
      const courseResults = (scored.results || []).slice(0, Math.max(0, DIRECT_RECOMMENDATION_LIMIT - departmentResults.length));
      const sourceDetails = courseSourceDetails(courseResults);
      sourceDetails.push({ id: "DEPARTMENT_DB", label: "커리어넷 기반 학과 정보 데이터베이스", url: "" });
      return {
        kind: "recommendations",
        intentId: "CAREER_COURSE_DEPARTMENT_RECOMMENDATION",
        text: `말씀해 주신 진로를 기준으로 관련 학과 ${departmentResults.length}개와 과목 ${courseResults.length}개를 함께 추렸어요. 전체 추천 카드는 최대 ${DIRECT_RECOMMENDATION_LIMIT}개까지 보여드려요.`,
        results: [...departmentResults, ...courseResults],
        choices: [],
        actions: recommendationActions(scored, departmentScored),
        actionText: "각 학과 안내와 남은 과목 후보는 아래에서 바로 확인할 수 있어요.",
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

    function faqCourseClarificationResponse(match) {
      const faqQuestion = String(match.best?.intent?.canonical_question || "FAQ 안내를 확인하고 싶어요.").trim();
      return {
        kind: "clarification",
        intentId: "FAQ_CLARIFY",
        text: "질문에 두 가지 뜻으로 해석될 수 있는 표현이 함께 있어요. 바로 답을 정하지 않고 먼저 어떤 도움을 원하는지 확인할게요.",
        followupText: "아래에서 가장 가까운 경우를 선택해 주세요.",
        results: [],
        choices: [
          { label: faqQuestion, prompt: faqQuestion },
          { label: "진로·관심사에 맞는 과목을 추천받고 싶어요.", prompt: COURSE_DETAIL_REQUEST_PROMPT }
        ],
        sourceDetails: [],
        sourceText: "[출처: FAQ 질문 분류 DB / 과목 키워드 DB]"
      };
    }

    function courseDetailRequestResponse() {
      return {
        kind: "clarification",
        intentId: "COURSE_DETAIL_CLARIFY",
        text: "관련 과목은 희망 진로나 학과가 구체적일수록 더 신중하게 찾을 수 있어요. 아직은 특정 과목을 제시하지 않을게요.",
        followupText: "희망 직업·학과·관심 분야 중 하나를 구체적으로 입력해 주세요. 예: 간호사, 컴퓨터공학과, 생명과학 연구",
        results: [],
        choices: [],
        sourceDetails: [],
        sourceText: "[출처: 질문 범위 확인 단계]"
      };
    }

    function careerGoalClarificationResponse(requestIntent, query) {
      const careerRole = String(requestIntent?.careerRole || "").trim();
      const careerFocus = requestIntent?.kind === "career-declaration"
        ? careerFocusFromQuery(query, careerRole)
        : careerRole;
      const promptPrefix = careerFocus ? `${careerFocus} 진로와 관련된` : "희망 진로와 관련된";
      return {
        kind: "clarification",
        intentId: "CAREER_GOAL_CLARIFY",
        text: careerFocus
          ? `희망 진로를 '${careerFocus}'로 이해했어요. 아직 어떤 정보를 원하는지는 정해지지 않았으므로 과목 하나를 바로 안내하지 않을게요.`
          : "희망 진로를 말씀해 주셨군요. 아직 어떤 정보를 원하는지는 정해지지 않았으므로 과목 하나를 바로 안내하지 않을게요.",
        followupText: "관련 과목, 관련 학과, 또는 학과와 과목을 함께 확인할지 선택해 주세요.",
        results: [],
        choices: [
          { label: "관련 과목 추천", prompt: `${promptPrefix} 과목을 추천해 주세요.` },
          { label: "관련 학과 추천", prompt: `${promptPrefix} 학과를 추천해 주세요.` },
          { label: "학과·과목 함께 추천", prompt: `${promptPrefix} 학과와 과목을 함께 추천해 주세요.` }
        ],
        sourceDetails: [],
        sourceText: "[출처: 질문 의도 확인 단계]"
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
      if (normalize(cleanQuery) === normalize(COURSE_DETAIL_REQUEST_PROMPT)) return courseDetailRequestResponse();
      const requestIntent = classifyRequest(cleanQuery);
      const clarification = findClarification(cleanQuery);
      if (clarification && requestIntent.kind !== "concept-question" && requestIntent.kind !== "career-counseling") return clarificationResponse(clarification);

      const faqMatch = scoreFaq(cleanQuery);
      const courseMatch = scoreCourses(cleanQuery);
      const departmentMatch = scoreDepartments(cleanQuery);
      const explicitCareerUncertainty = Boolean(careerUncertainIntent && CAREER_UNCERTAINTY_SIGNAL.test(normalize(cleanQuery)));
      if (explicitCareerUncertainty) {
        const uncertaintyMatch = faqMatch.accepted ? faqMatch : { best: { intent: careerUncertainIntent } };
        return faqResponse(uncertaintyMatch, cleanQuery);
      }
      const admissionSpecificQuestion = /[가-힣]{2,}대(?:학교)?|대학|입시|지원|모집|전형|반영|권장/u.test(cleanQuery);
      if (faqMatch.accepted && admissionSpecificQuestion) return faqResponse(faqMatch, cleanQuery);
      if (["career-declaration", "career-information"].includes(requestIntent.kind)) {
        return careerGoalClarificationResponse(requestIntent, cleanQuery);
      }
      if (requestIntent.kind === "department-recommendation") {
        if (departmentMatch.confident) return departmentResponse(departmentMatch);
        return fallbackResponse("말씀하신 진로와 충분히 가깝다고 확인되는 학과를 찾지 못했어요. 관심 분야나 희망 직업을 조금 더 구체적으로 알려주세요.");
      }
      if (requestIntent.kind === "course-recommendation" || requestIntent.kind === "combined-recommendation") {
        const broadFieldRequest = /(?:자연|인문|사회|공학|의학|교육|예체능|기타)분야/u.test(normalize(cleanQuery));
        const meaningfulDirectCourseMatch = courseMatch.results.some((result) => [...(result.directCanonicalTerms || [])]
          .some((term) => !/^(?:진로|직업|관심|교과군공통|진로직업|진로와직업)$/u.test(normalize(term))));
        const specificFocus = requestIntent.hasCareerRole
          || (!broadFieldRequest && departmentMatch.results.some((result) => result.directNameMatch))
          || meaningfulDirectCourseMatch;
        if (!specificFocus && courseMatch.candidateCount >= COURSE_RESULT_CLARIFICATION_THRESHOLD) {
          return courseNarrowingResponse(cleanQuery, courseMatch);
        }
        const hasRefinedCourseScope = Boolean(courseMatch.requestedSelectionType || courseMatch.requestedCourseGroup);
        if (!specificFocus && !hasRefinedCourseScope) {
          if (faqMatch.accepted) return faqResponse(faqMatch, cleanQuery);
          return courseDetailRequestResponse();
        }
        const expandedCourses = expandCoursesFromDepartments(courseMatch, departmentMatch);
        if (!expandedCourses.confident) {
          if (faqMatch.accepted) return faqResponse(faqMatch, cleanQuery);
          return courseDetailRequestResponse();
        }
        const refinedCourseScope = Boolean(expandedCourses.requestedSelectionType || expandedCourses.requestedCourseGroup);
        if (requestIntent.kind === "combined-recommendation" && departmentMatch.confident && !refinedCourseScope) {
          return combinedRecommendationResponse(cleanQuery, expandedCourses, departmentMatch);
        }
        return courseResponse(cleanQuery, expandedCourses, departmentMatch);
      }
      if (faqMatch.accepted && faqMatch.best.exact) return faqResponse(faqMatch, cleanQuery);
      if (requestIntent.kind === "concept-question" && courseMatch.exact) {
        if (courseMatch.candidateCount >= COURSE_RESULT_CLARIFICATION_THRESHOLD) return courseNarrowingResponse(cleanQuery, courseMatch);
        return courseResponse(cleanQuery, courseMatch);
      }
      const courseRecommendationLikely = courseMatch.confident
        && (COURSE_SIGNAL.test(cleanQuery) || courseMatch.results.some((result) => result.keywordPoints >= 12));
      if ((faqMatch.accepted || faqMatch.ambiguous) && courseRecommendationLikely) return faqCourseClarificationResponse(faqMatch);
      if (faqMatch.accepted && String(faqMatch.best?.intent?.intent_id || "") === "F063") return faqResponse(faqMatch, cleanQuery);
      if (faqMatch.accepted && (!courseMatch.confident || !COURSE_SIGNAL.test(cleanQuery))) return faqResponse(faqMatch, cleanQuery);
      if (courseMatch.confident && (COURSE_SIGNAL.test(cleanQuery) || courseMatch.results.some((result) => result.keywordPoints >= 12))) {
        if (!courseMatch.exact && courseMatch.candidateCount >= COURSE_RESULT_CLARIFICATION_THRESHOLD) return courseNarrowingResponse(cleanQuery, courseMatch);
        return courseResponse(cleanQuery, courseMatch);
      }
      if (faqMatch.accepted) return faqResponse(faqMatch, cleanQuery);
      if (faqMatch.ambiguous) return ambiguousResponse(faqMatch);
      return fallbackResponse();
    }

    return {
      respond,
      scoreFaq,
      scoreCourses,
      scoreDepartments,
      findClarification,
      sourceById,
      subjects,
      departments,
      database: data
    };
  }

  return { createEngine, normalize, splitValues, tokens, diceSimilarity, classifyRequest };
});
