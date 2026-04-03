param(
    [Parameter(Mandatory = $true)]
    [string]$ScriptPath,

    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$ScriptArgs
)

$scriptCommand = Get-Command py -ErrorAction SilentlyContinue
if (-not $scriptCommand) {
    Write-Error "py.exe wurde nicht gefunden. Installiere Python fuer Windows oder repariere den Python Launcher."
    exit 1
}

try {
    $resolvedScript = (Resolve-Path -LiteralPath $ScriptPath -ErrorAction Stop).Path
} catch {
    Write-Error "Python-Skript nicht gefunden: $ScriptPath"
    exit 1
}

$tempFile = [System.IO.Path]::GetTempFileName()
try {
    cmd /c "`"$($scriptCommand.Source)`" -0p > `"$tempFile`" 2>&1" | Out-Null
    $launcherText = (Get-Content -LiteralPath $tempFile -Raw -ErrorAction SilentlyContinue).Trim()
} finally {
    Remove-Item -LiteralPath $tempFile -Force -ErrorAction SilentlyContinue
}

if (
    [string]::IsNullOrWhiteSpace($launcherText) -or
    $launcherText -match "No installed Python found"
) {
    Write-Error "py.exe ist vorhanden, aber es ist keine Python-Installation hinterlegt. Installiere Python und versuche es erneut."
    exit 1
}

& $scriptCommand.Source -3 $resolvedScript @ScriptArgs
exit $LASTEXITCODE
