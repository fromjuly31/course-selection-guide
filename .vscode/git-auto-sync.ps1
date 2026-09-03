$ErrorActionPreference = 'Stop'

$workspacePath = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $workspacePath

$gitExe = 'C:\Program Files\Git\cmd\git.exe'
if (-not (Test-Path -LiteralPath $gitExe)) {
    $gitCommand = Get-Command git -ErrorAction SilentlyContinue
    if (-not $gitCommand) {
        throw 'Git was not found. Restart VS Code and try again.'
    }
    $gitExe = $gitCommand.Source
}

function Invoke-Git {
    param(
        [Parameter(ValueFromRemainingArguments = $true)]
        [string[]]$GitArguments
    )

    & $gitExe @GitArguments
    if ($LASTEXITCODE -ne 0) {
        throw "Git command failed: git $($GitArguments -join ' ')"
    }
}

$expectedRemote = 'https://github.com/fromjuly31/course-selection-guide.git'
$remoteUrl = (& $gitExe remote get-url origin).Trim()
if ($LASTEXITCODE -ne 0) {
    throw 'GitHub origin remote was not found.'
}

if ($remoteUrl.TrimEnd('/') -ne $expectedRemote.TrimEnd('/')) {
    throw "Unexpected GitHub remote. Expected: $expectedRemote / Current: $remoteUrl"
}

$sensitivePathPattern = '(?i)(^|[\\/])(?:\.env(?:\..*)?$|[^\\/]*\.(?:pem|p12|pfx|key)$|id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?$|(?:credentials?|secrets?|service[-_]?account)(?:\.[^\\/]*)?$)'
$changedPaths = @(& $gitExe status --porcelain=v1 --untracked-files=all | ForEach-Object {
    $path = if ($_.Length -gt 3) { $_.Substring(3).Trim() } else { '' }
    if ($path -like '* -> *') { $path = ($path -split ' -> ')[-1].Trim() }
    $path.Trim('"')
})
$sensitivePaths = @($changedPaths | Where-Object { $_ -match $sensitivePathPattern })

if ($sensitivePaths.Count -gt 0) {
    Write-Host '[GitHub] Sync stopped because sensitive-looking files were found:' -ForegroundColor Yellow
    $sensitivePaths | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
    throw 'Review or ignore these files before syncing again.'
}

Write-Host '[GitHub] Checking changes...'
Invoke-Git rev-parse --is-inside-work-tree
Invoke-Git add --all

& $gitExe diff --cached --quiet
$diffExitCode = $LASTEXITCODE

if ($diffExitCode -eq 0) {
    Write-Host '[GitHub] No changes to upload.'
    exit 0
}

if ($diffExitCode -ne 1) {
    throw 'Failed to inspect staged changes.'
}

$timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
Invoke-Git commit -m "Auto sync: $timestamp"

Write-Host '[GitHub] Checking remote changes...'
Invoke-Git pull --rebase

Write-Host '[GitHub] Uploading to GitHub...'
Invoke-Git push

Write-Host '[GitHub] Upload complete.' -ForegroundColor Green
