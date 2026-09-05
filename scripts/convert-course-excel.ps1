param(
    [Parameter(Mandatory = $true)]
    [string]$InputPath,

    [string]$OutputPath = ''
)

$ErrorActionPreference = 'Stop'

if (-not $OutputPath) {
    $OutputPath = Join-Path (Split-Path -Parent $PSScriptRoot) 'data\database.json'
}

function Get-CellValue {
    param(
        [object]$Values,
        [int]$Row,
        [int]$Column,
        [int]$RowCount,
        [int]$ColumnCount
    )
    if ($RowCount -eq 1 -and $ColumnCount -eq 1) { return $Values }
    return $Values[$Row, $Column]
}

function Get-SheetData {
    param(
        [object]$Workbook,
        [string]$SheetName,
        [hashtable]$ExtraColumns = @{},
        [switch]$Optional
    )

    $sheet = $null
    foreach ($candidate in $Workbook.Worksheets) {
        if ($candidate.Name -eq $SheetName) { $sheet = $candidate; break }
    }
    if (-not $sheet) {
        if ($Optional) { return [pscustomobject]@{ headers = @(); rows = @() } }
        throw "'$SheetName' 시트를 찾을 수 없습니다."
    }

    $range = $sheet.UsedRange
    $values = $range.Value2
    $rowCount = $range.Rows.Count
    $columnCount = $range.Columns.Count
    $headers = @()

    for ($column = 1; $column -le $columnCount; $column++) {
        $header = [string](Get-CellValue -Values $values -Row 1 -Column $column -RowCount $rowCount -ColumnCount $columnCount)
        $headers += $header.Trim()
    }

    $rows = [System.Collections.Generic.List[object]]::new()
    for ($row = 2; $row -le $rowCount; $row++) {
        $record = [ordered]@{}
        foreach ($key in $ExtraColumns.Keys) { $record[$key] = $ExtraColumns[$key] }
        $hasValue = $false
        for ($column = 1; $column -le $columnCount; $column++) {
            $header = $headers[$column - 1]
            if (-not $header) { continue }
            $value = Get-CellValue -Values $values -Row $row -Column $column -RowCount $rowCount -ColumnCount $columnCount
            if ($null -eq $value) { $value = '' }
            if ($value -is [string]) { $value = $value.Trim() }
            if ($header -in @('가중치', 'weight', 'priority', 'source_priority', 'answer_order', 'min_score', 'min_margin') -and $value -is [double]) {
                if ([Math]::Floor($value) -eq $value) { $value = [int]$value }
            }
            if ($value -ne '') { $hasValue = $true }
            $record[$header] = $value
        }
        if ($hasValue) { $rows.Add([pscustomobject]$record) }
    }

    return [pscustomobject]@{ headers = $headers; rows = $rows.ToArray() }
}

function Test-Sheet {
    param([object]$Workbook, [string]$SheetName)
    foreach ($sheet in $Workbook.Worksheets) {
        if ($sheet.Name -eq $SheetName) { return $true }
    }
    return $false
}

function Convert-StandardCourses {
    param([object[]]$Rows)
    return @($Rows | ForEach-Object {
        [pscustomobject][ordered]@{
            '과목유형' = $_.course_type
            '과목명' = $_.subject_name
            '교과군' = ([string]$_.curriculum_area) -replace '[ㆍ･・]', '·'
            '과목 구분' = $_.course_category
            '선택과목의 종류' = $_.selection_type
            '성취도' = $_.achievement_level
            '석차등급' = $_.rank_grade
            '수능 출제 여부' = $_.csat_included
            '이 과목은 어떤 과목인가요?' = $_.description
            '이 과목을 누구에게 추천하나요?' = $_.recommended_for
            '과목의 주요 내용' = $_.key_contents
            '그 외 질문 1' = $_.faq_1
            '그 외 질문 2' = $_.faq_2
            '계열' = $_.field
            '과목ID' = $_.course_id
            '출처ID' = $_.source_id
            '상태' = $_.status
        }
    })
}

function Convert-StandardKeywords {
    param([object[]]$Rows)
    return @($Rows | Where-Object { -not $_.status -or $_.status -eq 'ACTIVE' } | ForEach-Object {
        [pscustomobject][ordered]@{
            '교과군' = ([string]$_.curriculum_area) -replace '[ㆍ･・]', '·'
            '기준어' = $_.canonical_term
            '검색어' = $_.search_term
            '가중치' = $_.weight
            '관계유형' = $_.relation_type
            '적용과목' = $_.subject_name
            '비고' = $_.note
            '키워드ID' = $_.keyword_id
            '과목ID' = $_.course_id
            '근거필드' = $_.evidence_field
            '출처ID' = $_.source_id
            '상태' = $_.status
        }
    })
}

function Convert-StandardSettings {
    param([object[]]$Rows)
    return @($Rows | ForEach-Object {
        [pscustomobject][ordered]@{
            '설정구분' = $_.setting_group
            '항목' = $_.item
            '값' = $_.value
            '설명' = $_.description
        }
    })
}

$resolvedInput = (Resolve-Path -LiteralPath $InputPath).Path
$outputDirectory = Split-Path -Parent $OutputPath
if (-not (Test-Path -LiteralPath $outputDirectory)) {
    New-Item -ItemType Directory -Path $outputDirectory | Out-Null
}

$excel = $null
$workbook = $null
try {
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false
    $workbook = $excel.Workbooks.Open($resolvedInput, 0, $true)

    $isStandard = Test-Sheet -Workbook $workbook -SheetName 'COURSES'
    if ($isStandard) {
        $courseSheet = Get-SheetData -Workbook $workbook -SheetName 'COURSES'
        $keywordSheet = Get-SheetData -Workbook $workbook -SheetName 'COURSE_KEYWORDS'
        $settingSheet = Get-SheetData -Workbook $workbook -SheetName 'SEARCH_SETTINGS'
        $subjectRows = Convert-StandardCourses -Rows $courseSheet.rows
        $keywordWeights = Convert-StandardKeywords -Rows $keywordSheet.rows
        $searchSettings = Convert-StandardSettings -Rows $settingSheet.rows
        $regularCount = @($subjectRows | Where-Object { $_.'과목유형' -eq '보통교과' }).Count
        $specialCount = @($subjectRows | Where-Object { $_.'과목유형' -eq '전문과목' }).Count
    } else {
        $regular = Get-SheetData -Workbook $workbook -SheetName '보통교과' -ExtraColumns @{ '과목유형' = '보통교과' }
        $special = Get-SheetData -Workbook $workbook -SheetName '전문과목' -ExtraColumns @{ '과목유형' = '전문과목' }
        $keywordSheet = Get-SheetData -Workbook $workbook -SheetName '챗봇_동의어가중치'
        $settingSheet = Get-SheetData -Workbook $workbook -SheetName '챗봇_검색설정'
        $subjectRows = @($regular.rows) + @($special.rows)
        $keywordWeights = @($keywordSheet.rows)
        $searchSettings = @($settingSheet.rows)
        $regularCount = @($regular.rows).Count
        $specialCount = @($special.rows).Count
    }

    $sourceSheetName = if (Test-Sheet -Workbook $workbook -SheetName 'SOURCES') { 'SOURCES' } else { '출처' }
    $sources = Get-SheetData -Workbook $workbook -SheetName $sourceSheetName
    $faqIntents = Get-SheetData -Workbook $workbook -SheetName 'FAQ_INTENTS' -Optional
    $questionVariants = Get-SheetData -Workbook $workbook -SheetName 'QUESTION_VARIANTS' -Optional
    $answers = Get-SheetData -Workbook $workbook -SheetName 'ANSWERS' -Optional
    $synonyms = Get-SheetData -Workbook $workbook -SheetName 'SYNONYMS' -Optional
    $safetyRules = Get-SheetData -Workbook $workbook -SheetName 'SAFETY_RULES' -Optional
    $conflicts = Get-SheetData -Workbook $workbook -SheetName 'CONFLICTS' -Optional
    $matchingGuide = Get-SheetData -Workbook $workbook -SheetName 'MATCHING_GUIDE' -Optional
    $testCases = Get-SheetData -Workbook $workbook -SheetName 'TEST_CASES' -Optional
    $clarificationRules = Get-SheetData -Workbook $workbook -SheetName 'CLARIFICATION_RULES' -Optional

    $columns = [System.Collections.Generic.List[string]]::new()
    foreach ($column in @('과목유형','과목명','교과군','과목 구분','선택과목의 종류','성취도','석차등급','수능 출제 여부','이 과목은 어떤 과목인가요?','이 과목을 누구에게 추천하나요?','과목의 주요 내용','그 외 질문 1','그 외 질문 2','계열','과목ID','출처ID','상태')) {
        if (@($subjectRows | Where-Object { $_.PSObject.Properties.Name -contains $column }).Count -and -not $columns.Contains($column)) { $columns.Add($column) }
    }

    $inputFile = Get-Item -LiteralPath $resolvedInput
    $database = [ordered]@{
        meta = [ordered]@{
            title = '2022 개정 교육과정 과목선택 통합 챗봇 DB'
            schemaVersion = 2
            sourceType = 'default'
            sourceName = $inputFile.Name
            sourceUpdatedAt = $inputFile.LastWriteTime.ToString('o')
            generatedAt = (Get-Date).ToString('o')
            regularSubjectCount = $regularCount
            specialSubjectCount = $specialCount
            subjectCount = @($subjectRows).Count
            keywordWeightCount = @($keywordWeights).Count
            faqIntentCount = @($faqIntents.rows).Count
            answerCount = @($answers.rows).Count
            sourceCount = @($sources.rows).Count
            searchSettingCount = @($searchSettings).Count
        }
        columns = $columns.ToArray()
        rows = @($subjectRows)
        chatbot = [ordered]@{
            schemaVersion = 2
            keywordWeights = @($keywordWeights)
            searchSettings = @($searchSettings)
            faqIntents = @($faqIntents.rows)
            questionVariants = @($questionVariants.rows)
            answers = @($answers.rows)
            sources = @($sources.rows)
            synonyms = @($synonyms.rows)
            safetyRules = @($safetyRules.rows)
            conflicts = @($conflicts.rows)
            matchingGuide = @($matchingGuide.rows)
            clarificationRules = @($clarificationRules.rows)
            testCases = @($testCases.rows)
        }
        sources = @($sources.rows)
    }

    $json = $database | ConvertTo-Json -Depth 10
    $utf8WithoutBom = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllText($OutputPath, $json, $utf8WithoutBom)

    Write-Output ("Created {0}" -f (Resolve-Path -LiteralPath $OutputPath).Path)
    Write-Output ("Schema: {0}" -f $(if ($isStandard) { 'standard v2' } else { 'legacy' }))
    Write-Output ("Subjects: {0} (regular {1}, special {2})" -f @($subjectRows).Count, $regularCount, $specialCount)
    Write-Output ("Course keywords: {0}" -f @($keywordWeights).Count)
    Write-Output ("FAQ intents: {0}, answers: {1}, sources: {2}" -f @($faqIntents.rows).Count, @($answers.rows).Count, @($sources.rows).Count)
}
finally {
    if ($workbook) { $workbook.Close($false) }
    if ($excel) { $excel.Quit() }
    if ($workbook) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($workbook) }
    if ($excel) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($excel) }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
