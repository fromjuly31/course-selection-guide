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
