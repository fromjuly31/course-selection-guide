param(
    [Parameter(Mandatory = $true)]
    [string]$InputPath,

    [string]$OutputPath = ''
)

$ErrorActionPreference = 'Stop'

if (-not $OutputPath) {
    $OutputPath = Join-Path (Split-Path -Parent $PSScriptRoot) 'data\departments.json'
}

function Get-EntryText {
    param(
        [System.IO.Compression.ZipArchive]$Archive,
        [string]$Name
    )

    $entry = $Archive.GetEntry($Name)
    if (-not $entry) { throw "엑셀 내부에서 '$Name' 파일을 찾을 수 없습니다." }
    $reader = [System.IO.StreamReader]::new($entry.Open(), [System.Text.Encoding]::UTF8, $true)
    try { return $reader.ReadToEnd() }
    finally { $reader.Dispose() }
}

function Get-CellText {
    param(
        [System.Xml.XmlElement]$Cell,
        [System.Xml.XmlNamespaceManager]$NamespaceManager,
        [object[]]$SharedStrings
    )

    if (-not $Cell) { return '' }
    $type = $Cell.GetAttribute('t')
    if ($type -eq 'inlineStr') {
        return (($Cell.SelectNodes('.//x:is//x:t', $NamespaceManager) | ForEach-Object { $_.InnerText }) -join '')
    }

    $valueNode = $Cell.SelectSingleNode('x:v', $NamespaceManager)
    if (-not $valueNode) { return '' }
    if ($type -eq 's') { return [string]$SharedStrings[[int]$valueNode.InnerText] }
    return [string]$valueNode.InnerText
}

function Split-List {
    param([object]$Value)

    if ($null -eq $Value) { return @() }
    return @([string]$Value -split '[,，;\r\n]+' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
}

function Split-SubjectUniversities {
    param([object]$Value)

    if ($null -eq $Value -or -not ([string]$Value).Trim()) { return @() }
    $items = [System.Collections.Generic.List[object]]::new()
    foreach ($part in ([string]$Value -split '[;\r\n]+')) {
        $text = $part.Trim()
        if (-not $text) { continue }
        $match = [regex]::Match($text, '^(.*?)\s*\(([^()]*)\)\s*$')
        if ($match.Success) {
            $items.Add([pscustomobject][ordered]@{
                name = $match.Groups[1].Value.Trim()
                universities = @(Split-List $match.Groups[2].Value)
            })
        }
        else {
            $items.Add([pscustomobject][ordered]@{
                name = $text
                universities = @()
            })
        }
    }
    return $items.ToArray()
}

function Get-GuidePart {
    param(
        [string]$Text,
        [string]$Heading,
        [string]$NextHeading = ''
    )

    $end = if ($NextHeading) { '(?=\s*\[' + [regex]::Escape($NextHeading) + '\]|$)' } else { '$' }
    $pattern = '\[' + [regex]::Escape($Heading) + '\]\s*(.*?)' + $end
    $match = [regex]::Match($Text, $pattern, [System.Text.RegularExpressions.RegexOptions]::Singleline)
    if (-not $match.Success) { return '' }
    return (($match.Groups[1].Value -replace '\r\n?', "`n") -replace "`n{3,}", "`n`n").Trim()
}

function Convert-Guide {
    param([object]$Value)

    $text = (([string]$Value -replace '\r\n?', "`n") -replace "`n{3,}", "`n`n").Trim()
    return [pscustomobject][ordered]@{
        overview = Get-GuidePart -Text $text -Heading '학과 개요' -NextHeading '흥미와 적성'
        aptitude = Get-GuidePart -Text $text -Heading '흥미와 적성' -NextHeading '졸업 후 진출 분야'
        careers = Get-GuidePart -Text $text -Heading '졸업 후 진출 분야'
    }
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$resolvedInput = (Resolve-Path -LiteralPath $InputPath).Path
$inputFile = Get-Item -LiteralPath $resolvedInput
$stream = [System.IO.File]::Open($resolvedInput, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
$archive = $null

try {
    $archive = [System.IO.Compression.ZipArchive]::new($stream, [System.IO.Compression.ZipArchiveMode]::Read, $false)
    [xml]$workbookXml = Get-EntryText -Archive $archive -Name 'xl/workbook.xml'
    [xml]$relationshipsXml = Get-EntryText -Archive $archive -Name 'xl/_rels/workbook.xml.rels'

    $workbookNs = [System.Xml.XmlNamespaceManager]::new($workbookXml.NameTable)
    $workbookNs.AddNamespace('x', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main')
    $sheetNode = $workbookXml.SelectSingleNode('//x:sheets/x:sheet[1]', $workbookNs)
    if (-not $sheetNode) { throw '엑셀에 읽을 수 있는 시트가 없습니다.' }
    $relationshipId = $sheetNode.GetAttribute('id', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships')
    $relationship = @($relationshipsXml.Relationships.Relationship) | Where-Object { $_.Id -eq $relationshipId } | Select-Object -First 1
    if (-not $relationship) { throw '첫 번째 시트의 내부 경로를 확인할 수 없습니다.' }
    $sheetTarget = ([string]$relationship.Target).TrimStart('/').Replace('\', '/')
    $sheetPath = if ($sheetTarget.StartsWith('xl/')) { $sheetTarget } else { 'xl/' + $sheetTarget }

    $sharedStrings = @()
    if ($archive.GetEntry('xl/sharedStrings.xml')) {
        [xml]$sharedXml = Get-EntryText -Archive $archive -Name 'xl/sharedStrings.xml'
        $sharedNs = [System.Xml.XmlNamespaceManager]::new($sharedXml.NameTable)
        $sharedNs.AddNamespace('x', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main')
        $sharedStrings = @($sharedXml.SelectNodes('//x:si', $sharedNs) | ForEach-Object {
            (($_.SelectNodes('.//x:t', $sharedNs) | ForEach-Object { $_.InnerText }) -join '')
        })
    }

    [xml]$sheetXml = Get-EntryText -Archive $archive -Name $sheetPath
    $sheetNs = [System.Xml.XmlNamespaceManager]::new($sheetXml.NameTable)
    $sheetNs.AddNamespace('x', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main')
    $rows = @($sheetXml.SelectNodes('//x:sheetData/x:row', $sheetNs))
    if ($rows.Count -lt 2) { throw '학과 데이터 행이 없습니다.' }

    $headers = [ordered]@{}
    foreach ($cell in $rows[0].SelectNodes('x:c', $sheetNs)) {
        $column = [regex]::Match($cell.GetAttribute('r'), '^[A-Z]+').Value
        $headers[$column] = (Get-CellText -Cell $cell -NamespaceManager $sheetNs -SharedStrings $sharedStrings).Trim()
    }
    $required = @('분야', '학과', '학과 안내', '관련 과목', '반영 과목', '과학 권장 과목')
    $missing = @($required | Where-Object { $_ -notin $headers.Values })
    if ($missing.Count) { throw ('필수 열이 없습니다: ' + ($missing -join ', ')) }

    $departments = [System.Collections.Generic.List[object]]::new()
    foreach ($row in $rows | Select-Object -Skip 1) {
        $record = [ordered]@{}
        foreach ($cell in $row.SelectNodes('x:c', $sheetNs)) {
            $column = [regex]::Match($cell.GetAttribute('r'), '^[A-Z]+').Value
            if ($headers.Contains($column) -and $headers[$column]) {
                $record[$headers[$column]] = Get-CellText -Cell $cell -NamespaceManager $sheetNs -SharedStrings $sharedStrings
            }
        }
        $name = ([string]$record['학과']).Trim()
        $field = ([string]$record['분야']).Trim()
        if (-not $name -and -not $field) { continue }
        if (-not $name -or -not $field) { throw ("{0}행의 분야 또는 학과가 비어 있습니다." -f $row.GetAttribute('r')) }

        $departments.Add([pscustomobject][ordered]@{
            id = 'department-{0:d3}' -f ($departments.Count + 1)
            field = $field
            name = $name
            guide = Convert-Guide $record['학과 안내']
            relatedSubjects = @(Split-List $record['관련 과목'])
            reflectedSubjects = @(Split-SubjectUniversities $record['반영 과목'])
            scienceRecommendedSubjects = @(Split-SubjectUniversities $record['과학 권장 과목'])
        })
    }

    $fieldNames = @($departments | ForEach-Object { $_.field } | Select-Object -Unique)
    $fields = [System.Collections.Generic.List[object]]::new()
    foreach ($fieldName in $fieldNames) {
        $fieldDepartments = @($departments | Where-Object { $_.field -eq $fieldName })
        $counts = @{}
        foreach ($department in $fieldDepartments) {
            $seenSubjects = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
            foreach ($subject in $department.relatedSubjects) {
                if ($seenSubjects.Add($subject)) { $counts[$subject] = 1 + [int]($counts[$subject]) }
            }
        }
        $minimumCount = [math]::Floor($fieldDepartments.Count / 2) + 1
        $commonSubjects = @($counts.GetEnumerator() | Where-Object { $_.Value -ge $minimumCount } | Sort-Object @{ Expression = 'Value'; Descending = $true }, @{ Expression = 'Name'; Descending = $false } | ForEach-Object {
            [pscustomobject][ordered]@{
                name = $_.Name
                coverageCount = $_.Value
                totalCount = $fieldDepartments.Count
                coverageRate = [math]::Round($_.Value / $fieldDepartments.Count, 3)
            }
        })
        $fields.Add([pscustomobject][ordered]@{
            name = $fieldName
            departmentCount = $fieldDepartments.Count
            commonSubjectThreshold = $minimumCount
            commonSubjects = $commonSubjects
        })
    }

    $payload = [ordered]@{
        meta = [ordered]@{
            title = '학과별 관련 과목 DB'
            sourceName = $inputFile.Name
            sourceUpdatedAt = $inputFile.LastWriteTime.ToString('o')
            generatedAt = (Get-Date).ToString('o')
            fieldCount = $fields.Count
            departmentCount = $departments.Count
            commonSubjectRule = '분야 내 전체 학과의 과반수에 포함된 관련 과목'
        }
        fields = $fields.ToArray()
        departments = $departments.ToArray()
    }

    $outputDirectory = Split-Path -Parent $OutputPath
    if (-not (Test-Path -LiteralPath $outputDirectory)) {
        New-Item -ItemType Directory -Path $outputDirectory | Out-Null
    }
    $json = $payload | ConvertTo-Json -Depth 10
    [System.IO.File]::WriteAllText($OutputPath, $json, [System.Text.UTF8Encoding]::new($false))

    Write-Output ("Created {0}" -f (Resolve-Path -LiteralPath $OutputPath).Path)
    Write-Output ("Fields: {0}" -f $fields.Count)
    Write-Output ("Departments: {0}" -f $departments.Count)
    Write-Output ("Reflected subject departments: {0}" -f @($departments | Where-Object { $_.reflectedSubjects.Count }).Count)
    Write-Output ("Science recommendation departments: {0}" -f @($departments | Where-Object { $_.scienceRecommendedSubjects.Count }).Count)
}
finally {
    if ($archive) { $archive.Dispose() }
    $stream.Dispose()
}
