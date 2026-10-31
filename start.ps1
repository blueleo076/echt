# ECHT ohne Node.js starten: kleiner Webserver mit dem, was Windows schon mitbringt.
# Aufruf ueber start.bat (Doppelklick). Datei absichtlich ohne Umlaute (Windows PowerShell 5.1 liest sie sonst falsch).
$ErrorActionPreference = 'Stop'
$port = 8734
$url = "http://localhost:$port/"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($url)
try {
  $listener.Start()
} catch {
  # Port belegt: laeuft ECHT vermutlich schon (zweiter Doppelklick). Dann einfach den Browser oeffnen.
  Write-Host "ECHT laeuft schon oder der Port $port ist belegt. Oeffne $url"
  if (-not $env:ECHT_NO_BROWSER) { Start-Process $url }
  exit 0
}

Write-Host "ECHT laeuft auf $url"
Write-Host "Dieses Fenster offen lassen, solange du ECHT benutzt. Zum Beenden schliessen."
if (-not $env:ECHT_NO_BROWSER) { Start-Process $url }

$types = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.css' = 'text/css; charset=utf-8'
  '.svg' = 'image/svg+xml'; '.png' = 'image/png'; '.webmanifest' = 'application/manifest+json'
}
$rootFiles = @('index.html', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'sw.js')

function Send-Text($res, $code, $text) {
  $bytes = [Text.Encoding]::UTF8.GetBytes($text)
  $res.StatusCode = $code
  $res.ContentType = 'text/plain; charset=utf-8'
  $res.OutputStream.Write($bytes, 0, $bytes.Length)
}

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $req = $ctx.Request
  $res = $ctx.Response
  try {
    $res.Headers.Add('Cache-Control', 'no-store')
    $res.Headers.Add('X-Content-Type-Options', 'nosniff')
    $res.Headers.Add('X-Frame-Options', 'DENY')
    $res.Headers.Add('Content-Security-Policy', "frame-ancestors 'none'")
    $res.Headers.Add('Referrer-Policy', 'no-referrer')

    if ($req.HttpMethod -ne 'GET' -and $req.HttpMethod -ne 'HEAD') { Send-Text $res 405 'Methode nicht erlaubt'; continue }
    $path = [Uri]::UnescapeDataString($req.Url.AbsolutePath).TrimStart('/')
    if ($path -eq '') { $path = 'index.html' }
    $bad = $path.Contains('..') -or $path.Contains('\') -or ($path -match '[:*?"<>|]') -or ($path -match '[. ]$')
    $allowed = ($rootFiles -contains $path) -or ($path -match '^(css|js)/[A-Za-z0-9._-]+$')
    $file = Join-Path $root $path
    if ($bad -or -not $allowed -or -not (Test-Path -LiteralPath $file -PathType Leaf)) { Send-Text $res 404 'Nicht gefunden'; continue }

    $ext = [IO.Path]::GetExtension($file).ToLower()
    $type = $types[$ext]
    if (-not $type) { $type = 'application/octet-stream' }
    $bytes = [IO.File]::ReadAllBytes($file)
    $res.StatusCode = 200
    $res.ContentType = $type
    if ($req.HttpMethod -ne 'HEAD') { $res.OutputStream.Write($bytes, 0, $bytes.Length) }
  } catch {
    try { Send-Text $res 404 'Nicht gefunden' } catch { }
  } finally {
    $res.Close()
  }
}
