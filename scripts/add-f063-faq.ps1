param(
    [string]$InputPath = ''
)

$ErrorActionPreference = 'Stop'

if (-not $InputPath) {
    $InputPath = Join-Path (Split-Path -Parent $PSScriptRoot) 'data\2022개정교육과정_과목선택_FAQ_챗봇DB.xlsx'
}

function Get-Worksheet {
    param([object]$Workbook, [string]$Name)
    foreach ($sheet in $Workbook.Worksheets) {
        if ($sheet.Name -eq $Name) { return $sheet }
    }
    throw "'$Name' 시트를 찾을 수 없습니다."
}

function Get-HeaderMap {
    param([object]$Sheet)
    $headers = @{}
    $columnCount = $Sheet.UsedRange.Columns.Count
    for ($column = 1; $column -le $columnCount; $column++) {
        $name = ([string]$Sheet.Cells.Item(1, $column).Value2).Trim()
        if ($name) { $headers[$name] = $column }
    }
    return $headers
}

function Remove-MatchingRows {
    param(
        [object]$Sheet,
        [string]$Header,
        [string[]]$Values
    )
    $headers = Get-HeaderMap -Sheet $Sheet
    if (-not $headers.ContainsKey($Header)) { throw "'$($Sheet.Name)' 시트에 '$Header' 열이 없습니다." }
    $targets = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    $Values | ForEach-Object { [void]$targets.Add([string]$_) }
    for ($row = $Sheet.UsedRange.Rows.Count; $row -ge 2; $row--) {
        $value = ([string]$Sheet.Cells.Item($row, $headers[$Header]).Value2).Trim()
        if ($targets.Contains($value)) { $Sheet.Rows.Item($row).Delete() | Out-Null }
    }
}

function Add-SheetRecords {
    param(
        [object]$Sheet,
        [object[]]$Records
    )
    if (-not $Records.Count) { return }
    $headers = Get-HeaderMap -Sheet $Sheet
    $columnCount = $Sheet.UsedRange.Columns.Count
    foreach ($record in $Records) {
        foreach ($property in $record.PSObject.Properties.Name) {
            if (-not $headers.ContainsKey($property)) {
                throw "'$($Sheet.Name)' 시트에 '$property' 열이 없습니다."
            }
        }
        $lastRow = $Sheet.Cells.Item($Sheet.Rows.Count, 1).End(-4162).Row
        $row = $lastRow + 1
        $sourceRange = $Sheet.Range($Sheet.Cells.Item($lastRow, 1), $Sheet.Cells.Item($lastRow, $columnCount))
        $targetRange = $Sheet.Range($Sheet.Cells.Item($row, 1), $Sheet.Cells.Item($row, $columnCount))
        $sourceRange.Copy($targetRange) | Out-Null
        $targetRange.ClearContents() | Out-Null
        $matrix = New-Object 'object[,]' 1, $columnCount
        for ($column = 0; $column -lt $columnCount; $column++) { $matrix[0, $column] = '' }
        foreach ($property in $record.PSObject.Properties) {
            $matrix[0, ($headers[$property.Name] - 1)] = $property.Value
        }
        $targetRange.Value2 = $matrix
        $targetRange.WrapText = $false
        $targetRange.VerticalAlignment = -4160
    }
}

function Normalize-Utterance {
    param([string]$Value)
    return (($Value.Normalize([Text.NormalizationForm]::FormKC) -replace '[?!.]+$', '').Trim())
}

$resolvedInput = (Resolve-Path -LiteralPath $InputPath).Path
$intentKeywords = '진로; 진로 미정; 꿈; 장래희망; 직업; 학과; 전공; 관심 분야; 적성; 흥미; 하고 싶은 것; 진로 탐색; 진로 고민; 선택과목; 진로 없음; 꿈 없음; 학과 미정; 관심 분야 미정; 적성 미정; 흥미 미정; 하고 싶은 것 없음'

$faqIntent = [pscustomobject][ordered]@{
    intent_id = 'F063'
    category = '진로탐색'
    canonical_question = '진로가 아직 없는데 어떻게 찾아야 하나요?'
    answer_mode = 'MULTI'
    risk_level = 'LOW'
    time_sensitive = 'N'
    external_needed = 'N'
    required_context = ''
    core_keywords = $intentKeywords
    min_score = 4
    min_margin = 0.8
    do_not_infer = '특정 과목·대학·학과·직업을 임의 추천하지 않음; 진로 확정을 압박하지 않음; DB 밖의 구체적인 대입 정보를 생성하지 않음'
    status = 'ACTIVE'
}

$utterances = @(
    '진로가 아직 없는데 어떻게 찾아야 하나요?',
    '진로가 없어요.',
    '진로를 못 정했어요.',
    '진로는 어떻게 찾아야 하나요?',
    '꿈이 없어요.',
    '장래희망이 없어요.',
    '하고 싶은 게 없어요.',
    '뭘 하고 싶은지 모르겠어요.',
    '희망 직업이 없어요.',
    '희망 학과를 못 정했어요.',
    '관심 있는 분야가 없어요.',
    '관심 분야를 모르겠어요.',
    '제 적성이 뭔지 모르겠어요.',
    '진로가 막막해요.',
    '미래에 뭘 해야 할지 모르겠어요.',
    '어떤 직업이 저한테 맞는지 모르겠어요.',
    '진로를 정하려면 뭐부터 해야 하나요?',
    '고등학생인데 아직 꿈이 없어요.',
    '진로를 꼭 지금 정해야 하나요?',
    '진로를 어떻게 결정하나요?',
    '하고 싶은 일을 찾는 방법이 있나요?',
    '좋아하는 게 뭔지도 모르겠어요.',
    '가고 싶은 학과가 없어요.',
    '대학에서 뭘 전공해야 할지 모르겠어요.',
    '선택과목 골라야 하는데 진로가 없어요.',
    '진로가 없으면 과목을 어떻게 골라야 하나요?'
)
$questionVariants = for ($index = 0; $index -lt $utterances.Count; $index++) {
    [pscustomobject][ordered]@{
        variant_id = 'V-F063-{0:D2}' -f ($index + 1)
        intent_id = 'F063'
        utterance = $utterances[$index]
        variant_type = if ($index -eq 0) { 'CANONICAL' } else { 'PARAPHRASE' }
        normalized_utterance = Normalize-Utterance -Value $utterances[$index]
        intent_keywords = $intentKeywords
        status = 'ACTIVE'
    }
}

$sourceLocator = '과목 선택 시 흥미·적성, 진로와의 연계, 과목의 위계, 학업량의 균형 등을 함께 고려하도록 안내'
$answers = @(
    [pscustomobject][ordered]@{
        answer_id='A-F063-01'; intent_id='F063'; answer_order=1; answer_type='핵심'
        answer_text='진로를 지금 당장 하나의 직업이나 학과로 확정할 필요는 없습니다. 먼저 자신이 좋아하거나 관심 있는 것, 잘하는 것부터 살펴보면서 관심 분야를 넓게 찾아보는 것이 좋습니다.'
        condition=''; caution='진로를 빨리 확정하도록 압박하지 않음'; source_id='S01'; source_locator=$sourceLocator
        valid_from=''; valid_to=''; source_priority=100; status='CURRENT'; source_status='CURRENT'
    },
    [pscustomobject][ordered]@{
        answer_id='A-F063-02'; intent_id='F063'; answer_order=2; answer_type='진로 탐색 방법'
        answer_text='진로검사, 진로상담, 독서, 동아리, 체험 활동, 교과 수업 등 다양한 경험을 해 보면서 어떤 분야에 더 관심이 생기는지 살펴보세요. 관심이 생긴 분야가 있다면 그와 관련된 계열, 학과, 직업을 차례로 탐색하면서 진로를 점차 구체화할 수 있습니다.'
        condition=''; caution='특정 학과나 직업을 임의로 추천하지 않음'; source_id='S01'; source_locator=$sourceLocator
        valid_from=''; valid_to=''; source_priority=100; status='CURRENT'; source_status='CURRENT'
    },
    [pscustomobject][ordered]@{
        answer_id='A-F063-03'; intent_id='F063'; answer_order=3; answer_type='선택과목과 연결'
        answer_text='선택과목을 정해야 하는데 진로가 아직 확실하지 않다면 특정 직업이나 학과에 지나치게 맞춰 과목을 선택하기보다는 자신의 흥미와 적성, 현재 관심 분야를 중심으로 여러 가능성을 열어 두고 선택하는 것이 좋습니다. 이후 학교생활과 다양한 경험을 통해 진로를 구체화해 나갈 수 있습니다.'
        condition='QUERY_HAS_ANY:선택과목;선택 과목;과목 선택;과목을;과목 골;과목 고르'; caution='특정 과목을 근거 없이 추천하지 않음'; source_id='S01'; source_locator=$sourceLocator
        valid_from=''; valid_to=''; source_priority=100; status='CURRENT'; source_status='CURRENT'
    },
    [pscustomobject][ordered]@{
        answer_id='A-F063-04'; intent_id='F063'; answer_order=4; answer_type='간단한 행동 순서'
        answer_text="진로가 막막하다면 다음 순서로 생각해 볼 수 있습니다.`n`n1. 내가 좋아하거나 관심 있는 것은 무엇인지 살펴본다.`n2. 내가 비교적 잘하거나 더 배우고 싶은 것을 찾아본다.`n3. 관련된 분야와 계열을 탐색한다.`n4. 그 분야의 학과와 직업을 찾아본다.`n5. 수업, 독서, 동아리, 체험 등을 통해 직접 경험해 본다.`n6. 경험한 내용을 바탕으로 진로 방향을 조금씩 좁혀 간다."
        condition=''; caution='학생이 단계적으로 탐색할 수 있도록 안내'; source_id='S01'; source_locator=$sourceLocator
        valid_from=''; valid_to=''; source_priority=100; status='CURRENT'; source_status='CURRENT'
    }
)

$synonymGroups = [ordered]@{
    K028 = @{ Canonical='진로 없음'; Weight=5.5; Values=@('진로가 없다','진로를 못 정했다','진로가 안 정해졌다','진로 미정') }
    K029 = @{ Canonical='꿈 없음'; Weight=5.5; Values=@('꿈이 없다','장래희망이 없다','희망 직업이 없다') }
    K030 = @{ Canonical='관심 분야 미정'; Weight=4.5; Values=@('관심 영역이 없다','관심 있는 분야가 없다','흥미 분야를 모르겠다','관심 분야를 모르겠다') }
    K031 = @{ Canonical='학과 미정'; Weight=4.5; Values=@('희망 학과가 없다','희망 학과를 못 정했다','전공을 모르겠다','가고 싶은 학과가 없다','대학 전공을 모르겠다') }
    K032 = @{ Canonical='진로 탐색'; Weight=3.5; Values=@('진로 찾기','꿈 찾기','하고 싶은 일 찾기') }
    K033 = @{ Canonical='적성 미정'; Weight=4; Values=@('잘하는 것을 모르겠다','나에게 맞는 것을 모르겠다','적성이 뭔지 모르겠다') }
    K034 = @{ Canonical='흥미 미정'; Weight=4; Values=@('좋아하는 것을 모르겠다','관심 있는 것을 모르겠다','흥미를 모르겠다') }
    K035 = @{ Canonical='하고 싶은 것 없음'; Weight=5; Values=@('하고 싶은 게 없다','뭘 하고 싶은지 모르겠다','하고 싶은 것을 모르겠다') }
}
$synonyms = [System.Collections.Generic.List[object]]::new()
foreach ($groupId in $synonymGroups.Keys) {
    $group = $synonymGroups[$groupId]
    for ($index = 0; $index -lt $group.Values.Count; $index++) {
        $synonyms.Add([pscustomobject][ordered]@{
            group_id=$groupId; canonical_term=$group.Canonical; synonym=$group.Values[$index]; weight=$group.Weight
            primary=if ($index -eq 0) { 'Y' } else { 'N' }; note='F063 진로 미정 표현 매칭'
        })
    }
}

$testDefinitions = @(
    @('저 진로가 없어요.','일반 진로 미정 질문에 답변 1·2·4를 순서대로 결합'),
    @('꿈이 없는데 어떻게 찾아야 해?','꿈 없음 표현을 진로 탐색으로 연결'),
    @('고1인데 하고 싶은 게 없어요.','하고 싶은 것 없음 표현을 진로 탐색으로 연결'),
    @('희망 학과가 아직 없는데 괜찮나요?','학과 미정 표현을 진로 탐색으로 연결'),
    @('선택과목 골라야 하는데 진로가 없어요.','답변 1·2·3·4를 순서대로 결합하고 특정 과목은 임의 추천하지 않음'),
    @('제가 뭘 좋아하는지도 모르겠어요.','흥미 미정 표현을 진로 탐색으로 연결'),
    @('진로를 꼭 지금 정해야 돼요?','진로 확정을 압박하지 않고 단계적 탐색을 안내'),
    @('진로가 없으니까 어떤 과목을 들으면 돼?','특정 과목 대신 흥미·적성·관심 분야 중심의 선택을 안내')
)
$testCases = for ($index = 0; $index -lt $testDefinitions.Count; $index++) {
    [pscustomobject][ordered]@{
        test_id='T{0:D3}' -f ($index + 31)
        sample_user_query=$testDefinitions[$index][0]
        expected_intent='F063'
        expected_behavior=$testDefinitions[$index][1]
        test_type='CAREER_EXPLORATION'
    }
}

$excel = $null
$workbook = $null
try {
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false
    $workbook = $excel.Workbooks.Open($resolvedInput)

    $intentSheet = Get-Worksheet -Workbook $workbook -Name 'FAQ_INTENTS'
    $variantSheet = Get-Worksheet -Workbook $workbook -Name 'QUESTION_VARIANTS'
    $answerSheet = Get-Worksheet -Workbook $workbook -Name 'ANSWERS'
    $synonymSheet = Get-Worksheet -Workbook $workbook -Name 'SYNONYMS'
    $testSheet = Get-Worksheet -Workbook $workbook -Name 'TEST_CASES'

    Remove-MatchingRows -Sheet $intentSheet -Header 'intent_id' -Values @('F063')
    Remove-MatchingRows -Sheet $variantSheet -Header 'intent_id' -Values @('F063')
    Remove-MatchingRows -Sheet $answerSheet -Header 'intent_id' -Values @('F063')
    Remove-MatchingRows -Sheet $synonymSheet -Header 'group_id' -Values @($synonymGroups.Keys)
    Remove-MatchingRows -Sheet $testSheet -Header 'test_id' -Values @($testCases.test_id)

    Add-SheetRecords -Sheet $intentSheet -Records @($faqIntent)
    Add-SheetRecords -Sheet $variantSheet -Records @($questionVariants)
    Add-SheetRecords -Sheet $answerSheet -Records @($answers)
    Add-SheetRecords -Sheet $synonymSheet -Records @($synonyms)
    Add-SheetRecords -Sheet $testSheet -Records @($testCases)

    $readmeSheet = Get-Worksheet -Workbook $workbook -Name 'README'
    $summaryCounts = @{
        'FAQ intent 수' = $intentSheet.UsedRange.Rows.Count - 1
        '질문 표현(variant) 수' = $variantSheet.UsedRange.Rows.Count - 1
        '답변 조각 수' = $answerSheet.UsedRange.Rows.Count - 1
        '테스트 케이스 수' = $testSheet.UsedRange.Rows.Count - 1
    }
    for ($row = 1; $row -le $readmeSheet.UsedRange.Rows.Count; $row++) {
        $label = ([string]$readmeSheet.Cells.Item($row, 1).Value2).Trim()
        if ($summaryCounts.ContainsKey($label)) {
            $readmeSheet.Cells.Item($row, 2).Value2 = [double]$summaryCounts[$label]
        }
    }

    foreach ($sheet in @($intentSheet,$variantSheet,$answerSheet,$synonymSheet,$testSheet)) {
        $sheet.UsedRange.Columns.AutoFit() | Out-Null
        for ($column = 1; $column -le $sheet.UsedRange.Columns.Count; $column++) {
            if ($sheet.Columns.Item($column).ColumnWidth -gt 48) { $sheet.Columns.Item($column).ColumnWidth = 48 }
        }
    }

    $workbook.Save()
    Write-Output "Updated F063 in $resolvedInput"
    Write-Output "Variants: $($questionVariants.Count), answers: $($answers.Count), synonyms: $($synonyms.Count), tests: $($testCases.Count)"
}
finally {
    if ($workbook) { $workbook.Close($false) }
    if ($excel) { $excel.Quit() }
    if ($workbook) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($workbook) }
    if ($excel) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($excel) }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
