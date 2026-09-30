# Minimaler lokaler Webserver für Core Business (ES-Module brauchen HTTP statt file://).
# Eigener Port, damit das Original (8642) parallel laufen kann.
# -Dev öffnet den Testmodus (Testszenarien und Test-Parameter), optional mit Startgeld: server.ps1 -Dev 100000
param([switch]$Dev, [long]$Cash = 0)
$port = 8643
$root = $PSScriptRoot
$prefix = "http://localhost:$port/"
$url = if (-not $Dev) { $prefix } elseif ($Cash -gt 0) { "${prefix}?dev&cash=$Cash" } else { "${prefix}?dev" }

$mime = @{
  ".html" = "text/html; charset=utf-8"
  ".js"   = "text/javascript; charset=utf-8"
  ".wasm" = "application/wasm"
  ".swf"  = "application/x-shockwave-flash"
  ".map"  = "application/json"
  ".css"  = "text/css; charset=utf-8"
  ".json" = "application/json"
  ".glb"  = "model/gltf-binary"
  ".wav"  = "audio/wav"
  ".mp3"  = "audio/mpeg"
  ".png"  = "image/png"
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
try { $listener.Start() } catch {
  Write-Host "Port $port ist belegt - läuft der Server schon? Öffne $url" -ForegroundColor Yellow
  Start-Process $url
  exit
}

Write-Host "Core Business läuft auf $url  (Fenster schließen zum Beenden)" -ForegroundColor Green
Start-Process $url

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $res = $ctx.Response
  try {
    $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
    if ($rel -eq "") { $rel = "index.html" }
    $path = [IO.Path]::GetFullPath((Join-Path $root $rel))
    if ($path.StartsWith($root) -and (Test-Path $path -PathType Leaf)) {
      $ext = [IO.Path]::GetExtension($path).ToLower()
      # immer beim Server nachfragen, sonst mischt der Browser nach Updates alte und neue Dateien
      $res.Headers.Add("Cache-Control", "no-cache")
      $res.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { "application/octet-stream" }
      $bytes = [IO.File]::ReadAllBytes($path)
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $res.StatusCode = 404
    }
  } catch {
    $res.StatusCode = 500
  } finally {
    $res.Close()
  }
}
