# Run on 64-bit Windows using PowerShell 7, Node.js 22+ and npm.
[CmdletBinding()]
param([string]$OutputDirectory = (Join-Path $PSScriptRoot 'dist'))
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$online = Join-Path $root 'online'
$version = (Get-Content -Raw -LiteralPath "$online/package.json" | ConvertFrom-Json).version
$sdkVersion = '1.0.3650.58'
$sdkHash = '911A472128C82AC8BAA0C486C23342CC9DD6E7DC50D754E676726642CA065C60'
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$temp = New-Item -ItemType Directory -Path (Join-Path ([IO.Path]::GetTempPath()) ("VectorWorkbench-build-" + [guid]::NewGuid()))
$stage = New-Item -ItemType Directory -Path (Join-Path $temp 'VectorWorkbench')
$sdk = Join-Path $temp 'sdk'
$package = Join-Path $temp 'webview2.nupkg'
$assets = Join-Path $stage 'app'
$out = [IO.Directory]::CreateDirectory([IO.Path]::GetFullPath($OutputDirectory))
$archive = Join-Path $out.FullName "VectorWorkbench-Windows-x64.zip"
try {
    Push-Location $online
    try {
        npm ci --omit=optional --ignore-scripts --no-audit --no-fund
        if ($LASTEXITCODE) { throw 'npm ci failed' }
        node build.cjs $assets
        if ($LASTEXITCODE) { throw 'Editor build failed' }
    } finally { Pop-Location }

    # Virtual host mapping reads local files directly, so carry over the site's CSP.
    $cspLine = Get-Content -LiteralPath "$assets/_headers" | Where-Object { $_ -match '^\s*Content-Security-Policy:' }
    $csp = ($cspLine -split ':', 2)[1].Trim()
    $html = [IO.File]::ReadAllText("$assets/index.html").Replace('在线工作台', '桌面工作台')
    $html = $html.Replace('<meta name="viewport"', ('<meta http-equiv="Content-Security-Policy" content="' + [Net.WebUtility]::HtmlEncode($csp) + '"><meta name="viewport"'))
    [IO.File]::WriteAllText("$assets/index.html", $html)

    $base = 'https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2'
    Invoke-WebRequest "$base/$sdkVersion/microsoft.web.webview2.$sdkVersion.nupkg" -OutFile $package
    if ((Get-FileHash $package).Hash -ne $sdkHash) { throw 'WebView2 SDK checksum mismatch' }
    [IO.Compression.ZipFile]::ExtractToDirectory($package, $sdk)
    $dlls = @('Microsoft.Web.WebView2.Core.dll', 'Microsoft.Web.WebView2.WinForms.dll')
    foreach ($dll in $dlls) { Copy-Item -LiteralPath "$sdk/lib/net462/$dll" -Destination $stage }
    Copy-Item -LiteralPath "$sdk/runtimes/win-x64/native/WebView2Loader.dll" -Destination $stage
    foreach ($name in @('LICENSE', 'NOTICE')) {
        Copy-Item -LiteralPath "$sdk/$name.txt" -Destination "$assets/licenses/WebView2-$name.txt"
    }
    $info = Join-Path $temp 'Version.cs'
    @"
using System.Reflection;
[assembly: AssemblyTitle("矢量快改")]
[assembly: AssemblyProduct("Vector Workbench")]
[assembly: AssemblyCompany("shuoshuowa")]
[assembly: AssemblyVersion("$version.0")]
[assembly: AssemblyFileVersion("$version.0")]
"@ | Set-Content -LiteralPath $info -Encoding utf8BOM
    & $compiler /nologo /target:winexe /platform:x64 /optimize+ /codepage:65001 "/out:$($stage.FullName)\VectorWorkbench.exe" `
        "/win32manifest:$PSScriptRoot\app.manifest" "/win32icon:$PSScriptRoot\workbench.ico" `
        /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Net.Http.dll `
        "/r:$($stage.FullName)\$($dlls[0])" "/r:$($stage.FullName)\$($dlls[1])" "$PSScriptRoot\Workbench.cs" $info
    if ($LASTEXITCODE) { throw 'Windows executable build failed' }
    Copy-Item -LiteralPath "$PSScriptRoot/使用说明.txt" -Destination $stage
    $built = Join-Path $temp 'desktop.zip'
    [IO.Compression.ZipFile]::CreateFromDirectory($stage.FullName, $built, [IO.Compression.CompressionLevel]::Optimal, $true)
    Copy-Item -LiteralPath $built -Destination $archive
    $digest = (Get-FileHash $archive).Hash.ToLowerInvariant()
    "$digest  $([IO.Path]::GetFileName($archive))" | Set-Content -LiteralPath "$archive.sha256" -Encoding ascii
    Write-Output $archive
} finally {
    $expected = Join-Path ([IO.Path]::GetTempPath()) $temp.Name
    if ($temp.Name -match '^VectorWorkbench-build-[0-9a-f-]{36}$' -and $temp.FullName -eq [IO.Path]::GetFullPath($expected)) {
        Remove-Item -LiteralPath $temp.FullName -Recurse -Force
    }
}
