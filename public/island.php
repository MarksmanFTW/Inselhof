<?php
/*
 * Cozy Island – gemeinsame Inseln: der Stand einer Insel liegt hier, damit beide
 * Freunde jederzeit (auch allein) daran weiterspielen können.
 *
 *   GET  island.php?id=…              → {"rev": 3, "updatedAt": …, "state": {…}}  (rev 0 = noch leer)
 *   POST island.php?id=…  {"baseRev": 3, "state": {…}}
 *        → {"ok": true, "rev": 4}  oder (jemand war schneller) {"ok": false, "rev": 5, "state": {…}}
 *
 * Gespeichert wird nur der Insel-Stand (Holz, Felder, Häuser …), keine persönlichen Daten.
 */
header('Content-Type: application/json');
header('Cache-Control: no-store');
header('Access-Control-Allow-Origin: *');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit;

$id = $_GET['id'] ?? '';
if (!preg_match('/^[a-z0-9]{8,40}$/', $id)) {
  http_response_code(400);
  exit('{"error":"id"}');
}
$dir = __DIR__ . '/island-data';
if (!is_dir($dir)) {
  @mkdir($dir, 0700);
  @file_put_contents("$dir/.htaccess", "Require all denied\nDeny from all\n");
}
$f = "$dir/$id.json";

$h = fopen($f, 'c+');
if (!$h || !flock($h, LOCK_EX)) {
  http_response_code(503);
  exit('{"error":"busy"}');
}
$raw = stream_get_contents($h);
$cur = $raw ? json_decode($raw, true) : null;
if (!is_array($cur)) $cur = ['rev' => 0, 'updatedAt' => 0, 'state' => null];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
  $body = file_get_contents('php://input', false, null, 0, 500000);
  $in = json_decode((string) $body, true);
  if (!is_array($in) || !isset($in['state']) || !is_array($in['state'])) {
    flock($h, LOCK_UN);
    http_response_code(400);
    exit('{"error":"body"}');
  }
  if ((int) ($in['baseRev'] ?? -1) !== (int) $cur['rev']) {
    // inzwischen hat der andere gespeichert → neuesten Stand zurückgeben, Client gleicht ab
    flock($h, LOCK_UN);
    exit(json_encode(['ok' => false, 'rev' => $cur['rev'], 'updatedAt' => $cur['updatedAt'], 'state' => $cur['state']]));
  }
  $cur = ['rev' => $cur['rev'] + 1, 'updatedAt' => round(microtime(true) * 1000), 'state' => $in['state']];
  ftruncate($h, 0);
  rewind($h);
  fwrite($h, json_encode($cur));
  fflush($h);
  flock($h, LOCK_UN);
  exit(json_encode(['ok' => true, 'rev' => $cur['rev'], 'updatedAt' => $cur['updatedAt']]));
}

flock($h, LOCK_UN);
echo json_encode($cur);
