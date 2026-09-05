param(
    [Parameter(Mandatory = $true)]
    [string]$FaqInputPath,

    [string]$CourseDatabasePath = '',

    [string]$OutputPath = ''
)

$ErrorActionPreference = 'Stop'

if (-not $CourseDatabasePath) {
    $CourseDatabasePath = Join-Path (Split-Path -Parent $PSScriptRoot) 'data\database.json'
}
if (-not $OutputPath) {
    $OutputPath = Join-Path (Split-Path -Parent $PSScriptRoot) 'data\2022개정교육과정_과목선택_FAQ_챗봇DB.xlsx'
}

function Get-CellValue {
    param([object]$Values, [int]$Row, [int]$Column, [int]$RowCount, [int]$ColumnCount)
    if ($RowCount -eq 1 -and $ColumnCount -eq 1) { return $Values }
    return $Values[$Row, $Column]
}

function Get-SheetRecords {
    param([object]$Sheet)

    $range = $Sheet.UsedRange
    $values = $range.Value2
    $rowCount = $range.Rows.Count
    $columnCount = $range.Columns.Count
    $headers = for ($column = 1; $column -le $columnCount; $column++) {
        ([string](Get-CellValue -Values $values -Row 1 -Column $column -RowCount $rowCount -ColumnCount $columnCount)).Trim()
    }
    $records = [System.Collections.Generic.List[object]]::new()
    for ($row = 2; $row -le $rowCount; $row++) {
        $record = [ordered]@{}
        $hasValue = $false
        for ($column = 1; $column -le $columnCount; $column++) {
            $header = $headers[$column - 1]
            if (-not $header) { continue }
            $value = Get-CellValue -Values $values -Row $row -Column $column -RowCount $rowCount -ColumnCount $columnCount
            if ($null -eq $value) { $value = '' }
            if ($value -is [string]) { $value = $value.Trim() }
            if ($value -ne '') { $hasValue = $true }
            $record[$header] = $value
        }
        if ($hasValue) { $records.Add([pscustomobject]$record) }
    }
    return $records.ToArray()
}

function Get-Worksheet {
    param([object]$Workbook, [string]$Name)
    foreach ($sheet in $Workbook.Worksheets) {
        if ($sheet.Name -eq $Name) { return $sheet }
    }
    return $null
}

function Set-SheetRecords {
    param(
        [object]$Workbook,
        [string]$Name,
        [string[]]$Headers,
        [object[]]$Records,
        [switch]$Replace
    )

    $sheet = Get-Worksheet -Workbook $Workbook -Name $Name
    if ($sheet -and $Replace) {
        $sheet.Cells.Clear() | Out-Null
    } elseif (-not $sheet) {
        $sheet = $Workbook.Worksheets.Add()
        $sheet.Name = $Name
    }

    $rowCount = $Records.Count + 1
    $columnCount = $Headers.Count
    $matrix = New-Object 'object[,]' $rowCount, $columnCount
    for ($column = 0; $column -lt $columnCount; $column++) {
        $matrix[0, $column] = $Headers[$column]
    }
    for ($rowIndex = 0; $rowIndex -lt $Records.Count; $rowIndex++) {
        for ($column = 0; $column -lt $columnCount; $column++) {
            $value = $Records[$rowIndex].($Headers[$column])
            $matrix[($rowIndex + 1), $column] = if ($null -eq $value) { '' } else { $value }
        }
    }

    $target = $sheet.Range($sheet.Cells.Item(1, 1), $sheet.Cells.Item($rowCount, $columnCount))
    $target.Value2 = $matrix
    $headerRange = $sheet.Range($sheet.Cells.Item(1, 1), $sheet.Cells.Item(1, $columnCount))
    $headerRange.Font.Bold = $true
    $headerRange.Interior.Color = 0xE8F3EF
    $sheet.Rows.Item(1).AutoFilter() | Out-Null
    $sheet.Application.ActiveWindow.SplitRow = 1
    $sheet.Application.ActiveWindow.FreezePanes = $true
    $target.VerticalAlignment = -4160
    $target.WrapText = $false
    $sheet.Columns.AutoFit() | Out-Null
    for ($column = 1; $column -le $columnCount; $column++) {
        if ($sheet.Columns.Item($column).ColumnWidth -gt 48) { $sheet.Columns.Item($column).ColumnWidth = 48 }
    }
    return $sheet
}

function Normalize-Key {
    param([object]$Value)
    return ([string]$Value).Normalize([Text.NormalizationForm]::FormKC).ToLowerInvariant() -replace '\s+', '' -replace '[ㆍ･・]', '·'
}

function Split-Values {
    param([object]$Value)
    return @(([string]$Value -split '[;,，|\n]') | ForEach-Object { $_.Trim() } | Where-Object { $_ })
}

$resolvedFaqPath = (Resolve-Path -LiteralPath $FaqInputPath).Path
$resolvedCoursePath = (Resolve-Path -LiteralPath $CourseDatabasePath).Path
$resolvedOutputDirectory = Split-Path -Parent $OutputPath
if (-not (Test-Path -LiteralPath $resolvedOutputDirectory)) {
    New-Item -ItemType Directory -Path $resolvedOutputDirectory | Out-Null
}
Copy-Item -LiteralPath $resolvedFaqPath -Destination $OutputPath -Force

$courseDatabase = Get-Content -Raw -Encoding UTF8 -LiteralPath $resolvedCoursePath | ConvertFrom-Json
$courseRows = @($courseDatabase.rows)
$legacyKeywords = @($courseDatabase.chatbot.keywordWeights)
$legacySettings = @($courseDatabase.chatbot.searchSettings)

$courseHeaders = @(
    'course_id', 'course_type', 'subject_name', 'curriculum_area', 'course_category', 'selection_type',
    'achievement_level', 'rank_grade', 'csat_included', 'description', 'recommended_for', 'key_contents',
    'faq_1', 'faq_2', 'field', 'source_id', 'status'
)
$courseRecords = [System.Collections.Generic.List[object]]::new()
$courseByName = @{}
for ($index = 0; $index -lt $courseRows.Count; $index++) {
    $row = $courseRows[$index]
    $courseId = 'C{0:D4}' -f ($index + 1)
    $record = [pscustomobject][ordered]@{
        course_id = $courseId
        course_type = $row.'과목유형'
        subject_name = $row.'과목명'
        curriculum_area = ([string]$row.'교과군') -replace '[ㆍ･・]', '·'
        course_category = $row.'과목 구분'
        selection_type = $row.'선택과목의 종류'
        achievement_level = $row.'성취도'
        rank_grade = $row.'석차등급'
        csat_included = $row.'수능 출제 여부'
        description = $row.'이 과목은 어떤 과목인가요?'
        recommended_for = $row.'이 과목을 누구에게 추천하나요?'
        key_contents = $row.'과목의 주요 내용'
        faq_1 = $row.'그 외 질문 1'
        faq_2 = $row.'그 외 질문 2'
        field = $row.'계열'
        source_id = 'CS01'
        status = 'ACTIVE'
    }
    $courseRecords.Add($record)
    $courseByName[(Normalize-Key $record.subject_name)] = $record
}

$keywordHeaders = @(
    'keyword_id', 'curriculum_area', 'canonical_term', 'search_term', 'weight', 'relation_type',
    'course_id', 'subject_name', 'evidence_field', 'source_id', 'note', 'status'
)
$keywordRecords = [System.Collections.Generic.List[object]]::new()
$keywordByKey = @{}

function Add-CourseKeyword {
    param(
        [string]$Area,
        [string]$CanonicalTerm,
        [string]$SearchTerm,
        [double]$Weight,
        [string]$RelationType,
        [object]$Course,
        [string]$EvidenceField,
        [string]$SourceId,
        [string]$Note = ''
    )
    if (-not $Course -or -not $SearchTerm) { return }
    $key = '{0}|{1}' -f (Normalize-Key $Course.subject_name), (Normalize-Key $SearchTerm)
    if ($keywordByKey.ContainsKey($key)) {
        $existing = $keywordByKey[$key]
        $preferNew = $Weight -gt [double]$existing.weight -or $RelationType -match '직접|희망 교과'
        if ($preferNew) {
            $existing.curriculum_area = $Area
            $existing.canonical_term = $CanonicalTerm
            $existing.search_term = $SearchTerm
            $existing.weight = $Weight
            $existing.relation_type = $RelationType
            $existing.evidence_field = $EvidenceField
            $existing.source_id = $SourceId
            $existing.note = $Note
        }
        return
    }
    $record = [pscustomobject][ordered]@{
        keyword_id = 'CK{0:D5}' -f ($keywordRecords.Count + 1)
        curriculum_area = $Area
        canonical_term = $CanonicalTerm
        search_term = $SearchTerm
        weight = $Weight
        relation_type = $RelationType
        course_id = $Course.course_id
        subject_name = $Course.subject_name
        evidence_field = $EvidenceField
        source_id = $SourceId
        note = $Note
        status = 'ACTIVE'
    }
    $keywordRecords.Add($record)
    $keywordByKey[$key] = $record
}

foreach ($legacy in $legacyKeywords) {
    foreach ($subjectName in (Split-Values $legacy.'적용과목')) {
        $course = $courseByName[(Normalize-Key $subjectName)]
        if (-not $course) { continue }
        $legacyEvidence = if ($legacy.'근거필드') { [string]$legacy.'근거필드' } else { 'legacy_keyword_db' }
        $legacySource = if ($legacy.'출처ID') { [string]$legacy.'출처ID' } else { 'CS06' }
        Add-CourseKeyword -Area (([string]$legacy.'교과군') -replace '[ㆍ･・]', '·') `
            -CanonicalTerm ([string]$legacy.'기준어') -SearchTerm ([string]$legacy.'검색어') `
            -Weight ([double]$legacy.'가중치') -RelationType ([string]$legacy.'관계유형') `
            -Course $course -EvidenceField $legacyEvidence -SourceId $legacySource -Note ([string]$legacy.'비고')
    }
}

$genericTeacherLinks = @(
    @{ Name = '교육의 이해'; Weight = 10; Relation = '진로 직접 연관'; Evidence = 'description' },
    @{ Name = '화법과 언어'; Weight = 9; Relation = '추천 직업 직접 명시'; Evidence = 'recommended_for' },
    @{ Name = '인간과 심리'; Weight = 7; Relation = '학생 이해 역량 연관'; Evidence = 'description' }
)
$genericTeacherTerms = @('교사', '선생님', '교직', '교육자', '사범대', '교육대학', '교대')
foreach ($link in $genericTeacherLinks) {
    $course = $courseByName[(Normalize-Key $link.Name)]
    foreach ($term in $genericTeacherTerms) {
        Add-CourseKeyword -Area $course.curriculum_area -CanonicalTerm '교사' -SearchTerm $term `
            -Weight $link.Weight -RelationType $link.Relation -Course $course -EvidenceField $link.Evidence `
            -SourceId 'CS01' -Note '교과를 정하지 않은 교사 진로의 공통 추천'
    }
}

$teacherProfiles = @(
    @{ Canonical = '국어교사'; Area = '국어'; Terms = @('국어교사', '국어 교사', '국어선생님', '국어 선생님', '국어교육과') },
    @{ Canonical = '수학교사'; Area = '수학'; Terms = @('수학교사', '수학 교사', '수학선생님', '수학 선생님', '수학교육과') },
    @{ Canonical = '영어교사'; Area = '영어'; Terms = @('영어교사', '영어 교사', '영어선생님', '영어 선생님', '영어교육과') },
    @{ Canonical = '사회교사'; Area = '사회(역사/도덕 포함)'; Terms = @('사회교사', '사회 교사', '사회선생님', '사회 선생님', '사회교육과') },
    @{ Canonical = '과학교사'; Area = '과학'; Terms = @('과학교사', '과학 교사', '과학선생님', '과학 선생님', '과학교육과') },
    @{ Canonical = '체육교사'; Area = '체육'; Terms = @('체육교사', '체육 교사', '체육선생님', '체육 선생님', '체육교육과') },
    @{ Canonical = '정보교사'; Area = '정보'; Terms = @('정보교사', '정보 교사', '정보선생님', '정보 선생님', '컴퓨터교육과') },
    @{ Canonical = '기술가정교사'; Area = '기술·가정'; Terms = @('기술가정교사', '기술 가정 교사', '기술·가정 교사', '가정교육과', '기술교육과') },
    @{ Canonical = '한문교사'; Area = '한문'; Terms = @('한문교사', '한문 교사', '한문선생님', '한문 선생님', '한문교육과') },
    @{ Canonical = '제2외국어교사'; Area = '제2외국어'; Terms = @('외국어교사', '제2외국어 교사', '일본어교사', '중국어교사', '독일어교사', '프랑스어교사') }
)
foreach ($profile in $teacherProfiles) {
    foreach ($course in $courseRecords) {
        if ((Normalize-Key $course.curriculum_area) -ne (Normalize-Key $profile.Area)) { continue }
        foreach ($term in $profile.Terms) {
            Add-CourseKeyword -Area $course.curriculum_area -CanonicalTerm $profile.Canonical -SearchTerm $term `
                -Weight 10 -RelationType '희망 교과 직접 연계' -Course $course -EvidenceField 'curriculum_area' `
                -SourceId 'CS01' -Note '교사 희망 교과와 동일 교과군'
        }
    }
}

$artProfiles = @(
    @{ Canonical = '음악교사'; Pattern = '음악|시창|청음|합창|합주'; Terms = @('음악교사', '음악 교사', '음악선생님', '음악 선생님', '음악교육과') },
    @{ Canonical = '미술교사'; Pattern = '미술|드로잉|조형'; Terms = @('미술교사', '미술 교사', '미술선생님', '미술 선생님', '미술교육과') }
)
foreach ($profile in $artProfiles) {
    foreach ($course in $courseRecords) {
        if ($course.curriculum_area -ne '예술' -or $course.subject_name -notmatch $profile.Pattern) { continue }
        foreach ($term in $profile.Terms) {
            Add-CourseKeyword -Area $course.curriculum_area -CanonicalTerm $profile.Canonical -SearchTerm $term `
                -Weight 10 -RelationType '희망 교과 직접 연계' -Course $course -EvidenceField 'subject_name' `
                -SourceId 'CS01' -Note '교사 희망 교과와 동일 예술 세부 영역'
        }
    }
}

$elementaryLinks = @('교육의 이해', '화법과 언어', '인간과 심리', '아동발달과 부모')
foreach ($name in $elementaryLinks) {
    $course = $courseByName[(Normalize-Key $name)]
    foreach ($term in @('초등교사', '초등 교사', '초등선생님', '초등 선생님', '초등교육과')) {
        Add-CourseKeyword -Area $course.curriculum_area -CanonicalTerm '초등교사' -SearchTerm $term `
            -Weight 10 -RelationType '초등교육 진로 연관' -Course $course -EvidenceField 'description' `
            -SourceId 'CS01' -Note '초등교육 진로 공통 역량 과목'
    }
}

$settingHeaders = @('setting_group', 'item', 'value', 'description')
$settingRecords = [System.Collections.Generic.List[object]]::new()
foreach ($setting in $legacySettings) {
    if ([string]$setting.'항목' -in @('최대 추천 개수', '최소 과목 추천 점수', '강한 연관 점수 비율')) { continue }
    $settingRecords.Add([pscustomobject][ordered]@{
        setting_group = $setting.'설정구분'
        item = $setting.'항목'
        value = $setting.'값'
        description = $setting.'설명'
    })
}
$settingRecords.Add([pscustomobject][ordered]@{ setting_group = '출력'; item = '최대 추천 개수'; value = 80; description = '직접 연결된 과목은 임의로 1개만 남기지 않고 최대 이 개수까지 모두 표시합니다.' })
$settingRecords.Add([pscustomobject][ordered]@{ setting_group = '신뢰도'; item = '최소 과목 추천 점수'; value = 12; description = '이 점수보다 낮으면 과목을 추정하지 않고 안전 답변을 사용합니다.' })
$settingRecords.Add([pscustomobject][ordered]@{ setting_group = '신뢰도'; item = '강한 연관 점수 비율'; value = 0.65; description = '최고점 대비 이 비율 이상인 과목을 관련 과목으로 함께 제시합니다.' })

$clarificationHeaders = @('rule_id', 'trigger_terms', 'specific_terms', 'acknowledgement', 'prompt', 'options', 'recommended_courses', 'source_id', 'status')
$clarificationRecords = @(
    [pscustomobject][ordered]@{
        rule_id = 'CL001'
        trigger_terms = '교사;선생님;교직;교육자;사범대;교육대학;교대'
        specific_terms = '국어교사;국어교육과;수학교사;수학교육과;영어교사;영어교육과;사회교사;사회교육과;과학교사;과학교육과;체육교사;체육교육과;음악교사;음악교육과;미술교사;미술교육과;정보교사;컴퓨터교육과;기술가정교사;가정교육과;기술교육과;한문교사;한문교육과;외국어교사;일본어교사;중국어교사;초등교사;초등교육과'
        acknowledgement = '교사를 희망하시는군요. 교과를 정하기 전에도 교육과 의사소통, 학생 이해에 연결되는 과목을 함께 살펴볼 수 있어요.'
        prompt = '어떤 교과의 교사를 희망하시나요? 관심 있는 교과를 고르면 그 교과와 직접 연결된 과목을 여러 개 찾아드릴게요.'
        options = '국어 교사|국어 교사;수학 교사|수학 교사;영어 교사|영어 교사;사회 교사|사회 교사;과학 교사|과학 교사;체육 교사|체육 교사;음악 교사|음악 교사;미술 교사|미술 교사;정보 교사|정보 교사;기술·가정 교사|기술·가정 교사;초등 교사|초등 교사'
        recommended_courses = '교육의 이해;화법과 언어;인간과 심리'
        source_id = 'CS01'
        status = 'ACTIVE'
    }
)

$excel = $null
$workbook = $null
try {
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false
    $workbook = $excel.Workbooks.Open((Resolve-Path -LiteralPath $OutputPath).Path)

    $sourceSheet = Get-Worksheet -Workbook $workbook -Name 'SOURCES'
    if (-not $sourceSheet) { throw "SOURCES 시트를 찾을 수 없습니다." }
    $sourceRows = [System.Collections.Generic.List[object]]::new()
    foreach ($source in (Get-SheetRecords -Sheet $sourceSheet)) {
        if ([string]$source.source_id -notlike 'CS*') { $sourceRows.Add($source) }
    }
    $courseSources = @(
        [pscustomobject][ordered]@{ source_id='CS01'; institution='인천광역시교육청'; title='2022 개정 교육과정에 따른 고등학교 과목 안내서'; published=''; accessed='2026-09-05'; type='공식 안내서 게시 자료'; priority=100; status='CURRENT'; url='https://www.ice.go.kr/hakjeom/na/ntt/selectNttInfo.do?mi=10631&nttSn=3369594'; scope='보통교과·전문과목 목록, 과목 설명, 주요 내용, 추천 대상'; note='과목 프로필의 기본 출처' },
        [pscustomobject][ordered]@{ source_id='CS02'; institution='2022SubjectGuide'; title='2022 개정 교육과정 과목 안내서 웹 재구성'; published=''; accessed='2026-09-05'; type='웹 재구성 자료'; priority=70; status='SUPPORTING'; url='https://wlog31.github.io/2022SubjectGuide/'; scope='290개 과목 목차와 과목별 상세 페이지 구조 교차검증'; note='공식 안내서와 함께 교차검증용으로만 사용' },
        [pscustomobject][ordered]@{ source_id='CS03'; institution='2022SubjectGuide'; title='2022 개정 교육과정 과목 목록'; published=''; accessed='2026-09-05'; type='웹 재구성 자료'; priority=70; status='SUPPORTING'; url='https://wlog31.github.io/2022SubjectGuide/subjects/index.html'; scope='보통교과 155과목, 전문과목 135과목 목록과 순서'; note='과목 수와 목차 교차검증' },
        [pscustomobject][ordered]@{ source_id='CS04'; institution='FlipHTML5'; title='2022 개정 교육과정 고등학교 과목 안내서 열람본'; published=''; accessed='2026-09-05'; type='온라인 열람본'; priority=60; status='SUPPORTING'; url='https://fliphtml5.com/buyec/bbom/2022%EA%B0%9C%EC%A0%95_%EA%B5%90%EC%9C%A1%EA%B3%BC%EC%A0%95_%EA%B3%A0%EB%93%B1%ED%95%99%EA%B5%90_%EA%B3%BC%EB%AA%A9_%EC%95%88%EB%82%B4%EC%84%9C/'; scope='과목별 질문 영역과 설명 구성 교차검증'; note='공식 게시 자료 보조' },
        [pscustomobject][ordered]@{ source_id='CS05'; institution='기존 과목 DB 제공 자료'; title='진로 학업 설계 안내서 수정본'; published=''; accessed='2026-09-05'; type='내부 제공 자료'; priority=60; status='SUPPORTING'; url='진로 학업 설계 안내서_수정 중(202600622 수정본).hwpx'; scope='선택과목 분류, 성적 산출 방식, 과목 설명 교차검증'; note='원본 파일명 유지' },
        [pscustomobject][ordered]@{ source_id='CS06'; institution='과목 선택 안내 플랫폼'; title='과목 키워드·가중치 DB'; published='2026-09-05'; accessed='2026-09-05'; type='내부 매칭 DB'; priority=50; status='CURRENT'; url=''; scope='과목명·교과군·과목 설명에 연결한 검색어와 가중치'; note='추천 근거는 CS01 과목 프로필과 함께 사용' }
    )
    foreach ($source in $courseSources) { $sourceRows.Add($source) }
    $sourceHeaders = @('source_id','institution','title','published','accessed','type','priority','status','url','scope','note')

    Set-SheetRecords -Workbook $workbook -Name 'SOURCES' -Headers $sourceHeaders -Records $sourceRows.ToArray() -Replace | Out-Null
    Set-SheetRecords -Workbook $workbook -Name 'COURSES' -Headers $courseHeaders -Records $courseRecords.ToArray() -Replace | Out-Null
    Set-SheetRecords -Workbook $workbook -Name 'COURSE_KEYWORDS' -Headers $keywordHeaders -Records $keywordRecords.ToArray() -Replace | Out-Null
    Set-SheetRecords -Workbook $workbook -Name 'SEARCH_SETTINGS' -Headers $settingHeaders -Records $settingRecords.ToArray() -Replace | Out-Null
    Set-SheetRecords -Workbook $workbook -Name 'CLARIFICATION_RULES' -Headers $clarificationHeaders -Records $clarificationRecords -Replace | Out-Null

    $testSheet = Get-Worksheet -Workbook $workbook -Name 'TEST_CASES'
    $testRows = [System.Collections.Generic.List[object]]::new()
    foreach ($test in (Get-SheetRecords -Sheet $testSheet)) {
        if ([string]$test.test_id -notlike 'TC*') { $testRows.Add($test) }
    }
    @(
        [pscustomobject][ordered]@{ test_id='TC001'; sample_user_query='교사가 진로야'; expected_intent='CL001'; expected_behavior='공통 관련 과목을 여러 개 보여주고 희망 교과를 확인'; test_type='COURSE_CLARIFY' },
        [pscustomobject][ordered]@{ test_id='TC002'; sample_user_query='국어 교사가 되고 싶어'; expected_intent='COURSE:국어교사'; expected_behavior='국어 교과군의 직접 연관 과목을 여러 개 추천'; test_type='COURSE_RECOMMEND' },
        [pscustomobject][ordered]@{ test_id='TC003'; sample_user_query='수학교육과를 희망해'; expected_intent='COURSE:수학교사'; expected_behavior='수학 교과군의 직접 연관 과목을 여러 개 추천'; test_type='COURSE_RECOMMEND' },
        [pscustomobject][ordered]@{ test_id='TC004'; sample_user_query='교육의 이해는 어떤 과목이야?'; expected_intent='COURSE:교육의 이해'; expected_behavior='정확한 과목 설명과 출처 표시'; test_type='COURSE_EXACT' },
        [pscustomobject][ordered]@{ test_id='TC005'; sample_user_query='오늘 급식 뭐야?'; expected_intent='FALLBACK'; expected_behavior='DB 밖 질문으로 교사 문의 안내'; test_type='OUT_OF_SCOPE' },
        [pscustomobject][ordered]@{ test_id='TC006'; sample_user_query='고교학점제가 뭐야?'; expected_intent='F001'; expected_behavior='활성 답변을 순서대로 결합하고 출처 표시'; test_type='FAQ_EXACT' }
    ) | ForEach-Object { $testRows.Add($_) }
    Set-SheetRecords -Workbook $workbook -Name 'TEST_CASES' -Headers @('test_id','sample_user_query','expected_intent','expected_behavior','test_type') -Records $testRows.ToArray() -Replace | Out-Null

    $readme = Get-Worksheet -Workbook $workbook -Name 'README'
    for ($rowIndex = 1; $rowIndex -le $readme.UsedRange.Rows.Count; $rowIndex++) {
        $label = [string]$readme.Cells.Item($rowIndex, 1).Value2
        if ($label -eq '출처 수') { $readme.Cells.Item($rowIndex, 2).Value2 = $sourceRows.Count }
        elseif ($label -eq '테스트 케이스 수') { $readme.Cells.Item($rowIndex, 2).Value2 = $testRows.Count }
    }
    $nextRow = $readme.UsedRange.Rows.Count + 2
    $readme.Cells.Item($nextRow, 1).Value2 = '통합 과목 추천 DB'
    $readme.Cells.Item($nextRow + 1, 1).Value2 = '과목 프로필 수'
    $readme.Cells.Item($nextRow + 1, 2).Value2 = $courseRecords.Count
    $readme.Cells.Item($nextRow + 2, 1).Value2 = '과목 키워드 수'
    $readme.Cells.Item($nextRow + 2, 2).Value2 = $keywordRecords.Count
    $readme.Cells.Item($nextRow + 3, 1).Value2 = '명확화 규칙 수'
    $readme.Cells.Item($nextRow + 3, 2).Value2 = $clarificationRecords.Count
    $readme.Cells.Item($nextRow + 4, 1).Value2 = '운영 방식'
    $readme.Cells.Item($nextRow + 4, 2).Value2 = '이 파일을 단일 원본으로 관리하고 convert-course-excel.ps1로 database.json을 다시 생성합니다.'
    $readme.Columns.AutoFit() | Out-Null

    $workbook.Save()
    Write-Output ("Created canonical workbook: {0}" -f (Resolve-Path -LiteralPath $OutputPath).Path)
    Write-Output ("Courses: {0}" -f $courseRecords.Count)
    Write-Output ("Course keywords: {0}" -f $keywordRecords.Count)
    Write-Output ("FAQ sources: {0}" -f $sourceRows.Count)
}
finally {
    if ($workbook) { $workbook.Close($false) }
    if ($excel) { $excel.Quit() }
    if ($workbook) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($workbook) }
    if ($excel) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($excel) }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
