<?php
/*
 * Koop-Umleitung (Cozy Island): Wenn zwei Handys keine direkte Verbindung schaffen
 * (z. B. Mobilfunk), tauschen sie ihre Nachrichten über diese Datei aus.
 *
 *   POST relay.php?room=ABCD&side=h   Nachrichten (JSON-Liste) an den anderen
 *   GET  relay.php?room=ABCD&side=h   eigene Nachrichten abholen (wartet bis ~8 s)
 *
 * Die Warteschlangen liegen als kleine Dateien in relay-data/ und werden nach
 * kurzer Zeit gelöscht. Es wird nichts dauerhaft gespeichert.
 */
header('Content-Type: application/json');
header('Cache-Control: no-store');
header('Access-Control-Allow-Origin: *');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit;

$room = $_GET['room'] ?? '';
$side = $_GET['side'] ?? '';
if (!preg_match('/^[A-Z]{4}$/', $room) || ($side !== 'h' && $side !== 'g')) {
  http_response_code(400);
  exit('[]');
}

$dir = __DIR__ . '/relay-data';
if (!is_dir($dir)) {
  @mkdir($dir, 0700);
  @file_put_contents("$dir/.htaccess", "Require all denied\nDeny from all\n");
}
// Aufräumen: alte Warteschlangen weg
if (mt_rand(0, 40) === 0) {
  foreach (glob("$dir/*.q") ?: [] as $f) if (@filemtime($f) < time() - 600) @unlink($f);
}

$STALE = 90; // Sekunden: ältere Nachrichten gehören zu einer vergangenen Runde

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
  $other = $side === 'h' ? 'g' : 'h';
  $body = file_get_contents('php://input', false, null, 0, 400000);
  if ($body === false || $body === '' || $body[0] !== '[') {
    http_response_code(400);
    exit('[]');
  }
  $f = "$dir/$room-$other.q";
  clearstatcache(true, $f);
  // Stau oder Reste einer alten Runde: wegwerfen
  if (is_file($f) && (filesize($f) > 3000000 || filemtime($f) < time() - $STALE)) @unlink($f);
  file_put_contents($f, str_replace("\n", ' ', $body) . "\n", FILE_APPEND | LOCK_EX);
  exit('[]');
}

// GET: auf Nachrichten warten, alles Vorhandene auf einmal liefern und leeren
@set_time_limit(20);
ignore_user_abort(false);
$f = "$dir/$room-$side.q";
$until = microtime(true) + 8;
while (true) {
  clearstatcache(true, $f);
  if (is_file($f) && filemtime($f) < time() - $STALE) @unlink($f); // Reste einer alten Runde
  if (is_file($f) && filesize($f) > 0) {
    $h = fopen($f, 'c+');
    if ($h && flock($h, LOCK_EX)) {
      $data = stream_get_contents($h);
      ftruncate($h, 0);
      flock($h, LOCK_UN);
      fclose($h);
      $lines = array_filter(explode("\n", (string) $data), 'strlen');
      if ($lines) exit('[' . implode(',', $lines) . ']');
    } elseif ($h) {
      fclose($h);
    }
  }
  if (microtime(true) > $until || connection_aborted()) exit('[]');
  usleep(15000);
}
