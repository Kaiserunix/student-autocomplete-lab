[CmdletBinding()]
param(
  [string]$SourcePath = "",
  [string]$ProblemUrl = "https://codeforces.com/contest/4/problem/A",
  [ValidateSet("accepted", "wrong_answer", "compile_error", "unknown", "login_required")]
  [string]$Scenario = "accepted",
  [switch]$Yes,
  [string]$RuntimeDescriptorPath = ""
)

$ErrorActionPreference = "Stop"

try {
  if ([string]::IsNullOrWhiteSpace($RuntimeDescriptorPath)) {
    $RuntimeDescriptorPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\..\..\.runtime\oj-console\server.json"))
  }
  if (-not (Test-Path -LiteralPath $RuntimeDescriptorPath -PathType Leaf)) {
    throw "OJ Console backend is not running. Start it with npm run prototype:oj:backend."
  }

  if ([string]::IsNullOrWhiteSpace($SourcePath)) {
    Add-Type -AssemblyName System.Windows.Forms
    $dialog = New-Object System.Windows.Forms.OpenFileDialog
    $dialog.Title = "Select source file"
    $dialog.Filter = "Source files|*.c;*.cc;*.cpp;*.cxx;*.py;*.py3;*.java;*.kt;*.rs;*.go;*.js;*.ts;*.cs;*.swift|All files|*.*"
    if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
      throw "No source file selected."
    }
    $SourcePath = $dialog.FileName
  }

  $sourceFile = Get-Item -LiteralPath $SourcePath
  $descriptor = Get-Content -LiteralPath $RuntimeDescriptorPath -Raw | ConvertFrom-Json
  if ([string]::IsNullOrWhiteSpace([string]$descriptor.baseUrl) -or [string]$descriptor.token -notmatch '^[a-f0-9]{64}$') {
    throw "Runtime descriptor is invalid."
  }
  [Uri]$baseUri = $null
  $validBaseUri = [Uri]::TryCreate([string]$descriptor.baseUrl, [UriKind]::Absolute, [ref]$baseUri)
  if (-not $validBaseUri -or $baseUri.Scheme -cne "http" -or $baseUri.Host -cne "127.0.0.1" -or $baseUri.Port -le 0 -or $baseUri.AbsolutePath -cne "/" -or -not [string]::IsNullOrEmpty($baseUri.Query) -or -not [string]::IsNullOrEmpty($baseUri.Fragment)) {
    throw "Runtime descriptor must point to http://127.0.0.1 on a local port."
  }
  $baseUrl = $baseUri.GetLeftPart([UriPartial]::Authority)

  $headers = @{ "X-OJ-Console-Token" = [string]$descriptor.token }
  $uploadHeaders = @{
    "X-OJ-Console-Token" = [string]$descriptor.token
    "X-Source-Name" = $sourceFile.Name
  }
  $source = Invoke-RestMethod -Uri "$baseUrl/api/source" -Method Post -Headers $uploadHeaders -ContentType "application/octet-stream" -Body ([IO.File]::ReadAllBytes($sourceFile.FullName))
  $previewRequest = @{
    sourceId = $source.sourceId
    problemUrl = $ProblemUrl
    mode = "demo"
    scenario = $Scenario
  } | ConvertTo-Json
  $preview = Invoke-RestMethod -Uri "$baseUrl/api/preview" -Method Post -Headers $headers -ContentType "application/json" -Body $previewRequest

  Write-Output "[preview] mode=$($preview.mode) scenario=$($preview.scenario)"
  Write-Output "[source] name=$($preview.source.fileName) language=$($preview.source.language) bytes=$($preview.source.byteSize) digest=$($preview.source.digest)"
  Write-Output "[target] $($preview.target.canonicalUrl)"

  if (-not $Yes) {
    $answer = Read-Host "Type SUBMIT to run this one-time demo submission"
    if ($answer -cne "SUBMIT") {
      throw "Submission cancelled."
    }
  }

  $confirmRequest = @{ confirmationId = $preview.confirmationId } | ConvertTo-Json
  $confirmation = Invoke-RestMethod -Uri "$baseUrl/api/confirm" -Method Post -Headers $headers -ContentType "application/json" -Body $confirmRequest
  $deadline = [DateTime]::UtcNow.AddSeconds(15)
  $terminalStates = @("accepted", "rejected", "unknown", "failed")
  do {
    $encodedJobId = [Uri]::EscapeDataString([string]$confirmation.jobId)
    $job = Invoke-RestMethod -Uri "$baseUrl/api/submissions/$encodedJobId" -Method Get -Headers $headers
    if ($terminalStates -contains [string]$job.state) {
      break
    }
    Start-Sleep -Milliseconds 250
  } while ([DateTime]::UtcNow -lt $deadline)

  if (-not ($terminalStates -contains [string]$job.state)) {
    throw "Timed out while waiting for the demo result."
  }
  Write-Output "[result] state=$($job.state) verdict=$($job.verdict) message=$($job.message)"
  exit 0
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
