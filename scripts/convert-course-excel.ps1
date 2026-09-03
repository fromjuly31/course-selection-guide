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
        [object]$Value,
        [string]$ColumnName
    )

    if ($null -eq $Value) { return '' }
    if ($Value -is [string]) { return $Value.Trim() }
    if ($ColumnName -eq '가중치' -and $Value -is [double]) { return [int]$Value }
    return $Value
}

function Get-SheetData {
    param(
        [object]$Workbook,
        [string]$SheetName,
        [hashtable]$ExtraColumns = @{}
    )

    $sheet = $Workbook.Worksheets.Item($SheetName)
    $range = $sheet.UsedRange
    $values = $range.Value2
    $rowCount = $range.Rows.Count
    $columnCount = $range.Columns.Count
    $headers = @()

    for ($column = 1; $column -le $columnCount; $column++) {
        $header = [string]$values[1, $column]
        $headers += $header.Trim()
    }

    $rows = [System.Collections.Generic.List[object]]::new()
    for ($row = 2; $row -le $rowCount; $row++) {
        $record = [ordered]@{}
        foreach ($key in $ExtraColumns.Keys) {
            $record[$key] = $ExtraColumns[$key]
        }

        $hasValue = $false
        for ($column = 1; $column -le $columnCount; $column++) {
            $header = $headers[$column - 1]
            if (-not $header) { continue }
            $value = Get-CellValue -Value $values[$row, $column] -ColumnName $header
            if ($value -ne '') { $hasValue = $true }
            $record[$header] = $value
        }

        if ($hasValue) { $rows.Add([pscustomobject]$record) }
    }

    return [pscustomobject]@{
        headers = $headers
        rows = $rows.ToArray()
    }
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

    $regular = Get-SheetData -Workbook $workbook -SheetName '보통교과' -ExtraColumns @{ '과목유형' = '보통교과' }
    $special = Get-SheetData -Workbook $workbook -SheetName '전문과목' -ExtraColumns @{ '과목유형' = '전문과목' }
    $keywordWeights = Get-SheetData -Workbook $workbook -SheetName '챗봇_동의어가중치'
    $searchSettings = Get-SheetData -Workbook $workbook -SheetName '챗봇_검색설정'
    $sources = Get-SheetData -Workbook $workbook -SheetName '출처'

    $columns = [System.Collections.Generic.List[string]]::new()
    $columns.Add('과목유형')
    foreach ($header in @($regular.headers) + @($special.headers)) {
        if ($header -and -not $columns.Contains($header)) { $columns.Add($header) }
    }

    $subjectRows = @($regular.rows) + @($special.rows)
    $inputFile = Get-Item -LiteralPath $resolvedInput
    $database = [ordered]@{
        meta = [ordered]@{
            title = '2022 개정 교육과정 고등학교 과목 DB'
            sourceType = 'default'
            sourceName = $inputFile.Name
            sourceUpdatedAt = $inputFile.LastWriteTime.ToString('o')
            generatedAt = (Get-Date).ToString('o')
            regularSubjectCount = @($regular.rows).Count
            specialSubjectCount = @($special.rows).Count
            subjectCount = $subjectRows.Count
            keywordWeightCount = @($keywordWeights.rows).Count
            searchSettingCount = @($searchSettings.rows).Count
        }
        columns = $columns.ToArray()
        rows = $subjectRows
        chatbot = [ordered]@{
            keywordWeights = @($keywordWeights.rows)
            searchSettings = @($searchSettings.rows)
        }
        sources = @($sources.rows)
    }

    $json = $database | ConvertTo-Json -Depth 8
    $utf8WithoutBom = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllText($OutputPath, $json, $utf8WithoutBom)

    Write-Output ("Created {0}" -f (Resolve-Path -LiteralPath $OutputPath).Path)
    Write-Output ("Subjects: {0} (regular {1}, special {2})" -f $subjectRows.Count, @($regular.rows).Count, @($special.rows).Count)
    Write-Output ("Keyword weights: {0}" -f @($keywordWeights.rows).Count)
    Write-Output ("Search settings: {0}" -f @($searchSettings.rows).Count)
}
finally {
    if ($workbook) { $workbook.Close($false) }
    if ($excel) { $excel.Quit() }
    if ($workbook) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($workbook) }
    if ($excel) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($excel) }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
