<?php
/*
 * Cozy Island – gemeinsame Inseln. Hier liegt für jede gemeinsame Insel:
 *   - ein Gesamtstand (state, bei Nummer srev) und danach ein Protokoll aller
 *     Aktionen in fester Reihenfolge (ops, jede mit Nummer r);
 *   - wer gerade auf der Insel ist (Anwesenheit, eigene kleine Datei).
 *
 *   POST island.php?id=…&do=sync   {"pid","since","ops":[…],"me":{…}|null,"init"?:{…},"snap"?:{"rev","state"}}
 *        → {"rev","srev","state"?,"ops":[{"r","id","by","op"}],"ack":[ids],"others":[…],"compact"?}
 *   POST island.php?id=…&do=leave&pid=…   (beim Verlassen)
 *
 * Ältere Spielversionen (GET / POST mit baseRev) werden weiter beantwortet.
 * Gespeichert werden nur Insel-Daten und Name/Aussehen der Figur, nichts Persönliches.
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
$pf = "$dir/$id.p.json";
$do = $_GET['do'] ?? '';
$now = (int) round(microtime(true) * 1000);
// ab so vielen Aktionen um einen Gesamtstand bitten; Kennungen so lange merken
const COMPACT_AT = 150;
const SEEN_MAX = 800;
// so lange gilt jemand als anwesend (ms)
const AWAY_MS = 8000;

/** Anwesenheit lesen/ändern (eigene Datei, damit der große Stand selten geschrieben wird) */
function presence($pf, $now, $pid, $me) {
  $h = fopen($pf, 'c+');
  if (!$h || !flock($h, LOCK_EX)) return [];
  $raw = stream_get_contents($h);
  $all = $raw ? json_decode($raw, true) : [];
  if (!is_array($all)) $all = [];
  foreach ($all as $k => $p) if (!is_array($p) || $now - (int) ($p['t'] ?? 0) > AWAY_MS) unset($all[$k]);
  if ($pid !== '') {
    if (is_array($me)) {
      $clean = [];
      foreach (['n', 'l', 'x', 'y', 'd', 'm', 'sw', 'tl', 'rh', 'in', 'sp'] as $key) if (array_key_exists($key, $me)) $clean[$key] = $me[$key];
      $clean['n'] = mb_substr(preg_replace('/[<>&"]/', '', (string) ($clean['n'] ?? '')), 0, 12);
      $clean['t'] = $now;
      $all[$pid] = $clean;
    } else unset($all[$pid]);
  }
  ftruncate($h, 0);
  rewind($h);
  fwrite($h, json_encode($all ?: new stdClass()));
  fflush($h);
  flock($h, LOCK_UN);
  fclose($h);
  $others = [];
  foreach ($all as $k => $p) {
    if ($k === $pid) continue;
    $p['pid'] = $k;
    $p['age'] = $now - (int) $p['t'];
    unset($p['t']);
    $others[] = $p;
  }
  return $others;
}

if ($do === 'leave') {
  $pid = preg_replace('/[^a-z0-9]/', '', (string) ($_GET['pid'] ?? ''));
  if ($pid !== '') presence($pf, $now, $pid, null);
  exit('{"ok":true}');
}

$h = fopen($f, 'c+');
if (!$h || !flock($h, LOCK_EX)) {
  http_response_code(503);
  exit('{"error":"busy"}');
}
$raw = stream_get_contents($h);
$cur = $raw ? json_decode($raw, true) : null;
if (!is_array($cur)) $cur = ['rev' => 0, 'updatedAt' => 0, 'state' => null];
// ältere Datei (nur Gesamtstand) → Protokoll anfangen
if (!isset($cur['srev'])) $cur['srev'] = (int) $cur['rev'];
if (!isset($cur['ops']) || !is_array($cur['ops'])) $cur['ops'] = [];
if (!isset($cur['seen']) || !is_array($cur['seen'])) $cur['seen'] = [];

function save($h, $cur) {
  ftruncate($h, 0);
  rewind($h);
  fwrite($h, json_encode($cur));
  fflush($h);
}
function done($h, $out) {
  flock($h, LOCK_UN);
  fclose($h);
  exit(json_encode($out));
}

if ($do === 'sync') {
  $body = file_get_contents('php://input', false, null, 0, 900000);
  $in = json_decode((string) $body, true);
  $pid = preg_replace('/[^a-z0-9]/', '', (string) ($in['pid'] ?? ''));
  if (!is_array($in) || $pid === '') {
    flock($h, LOCK_UN);
    http_response_code(400);
    exit('{"error":"body"}');
  }
  $dirty = false;
  // Insel zum ersten Mal teilen
  if ($cur['state'] === null && isset($in['init']) && is_array($in['init'])) {
    $cur['state'] = $in['init'];
    $cur['rev'] = $cur['srev'] = 1;
    $cur['ops'] = [];
    $dirty = true;
  }
  // neue Aktionen ans Protokoll hängen (doppelt geschickte erkennen)
  $ack = [];
  if ($cur['state'] !== null && isset($in['ops']) && is_array($in['ops'])) {
    $seen = array_flip($cur['seen']);
    foreach (array_slice($in['ops'], 0, 80) as $op) {
      if (!is_array($op) || !isset($op['id']) || !is_string($op['id']) || strlen($op['id']) > 64) continue;
      $oid = $op['id'];
      $ack[] = $oid;
      if (isset($seen[$oid])) continue;
      unset($op['id']);
      if (strlen(json_encode($op)) > 4000) continue;
      $cur['rev']++;
      $cur['ops'][] = ['r' => $cur['rev'], 'id' => $oid, 'by' => $pid, 'op' => $op];
      $cur['seen'][] = $oid;
      $seen[$oid] = true;
      $dirty = true;
    }
    if (count($cur['seen']) > SEEN_MAX) $cur['seen'] = array_slice($cur['seen'], -SEEN_MAX);
  }
  // Protokoll kürzen: Gesamtstand bei rev übernehmen
  if (isset($in['snap']) && is_array($in['snap']) && is_array($in['snap']['state'] ?? null)) {
    $sr = (int) ($in['snap']['rev'] ?? 0);
    if ($sr > $cur['srev'] && $sr <= $cur['rev']) {
      $cur['state'] = $in['snap']['state'];
      $cur['srev'] = $sr;
      $cur['ops'] = array_values(array_filter($cur['ops'], fn($o) => $o['r'] > $sr));
      $dirty = true;
    }
  }
  if ($dirty) {
    $cur['updatedAt'] = $now;
    save($h, $cur);
  }
  $since = (int) ($in['since'] ?? 0);
  $out = ['rev' => $cur['rev'], 'srev' => $cur['srev'], 'ops' => [], 'ack' => $ack];
  if ($cur['state'] === null) $out['state'] = null;
  elseif ($since < $cur['srev']) {
    $out['state'] = $cur['state'];
    $since = $cur['srev'];
  }
  foreach ($cur['ops'] as $o) if ($o['r'] > $since) $out['ops'][] = $o;
  if (count($cur['ops']) > COMPACT_AT) $out['compact'] = true;
  flock($h, LOCK_UN);
  fclose($h);
  $out['others'] = presence($pf, $now, $pid, $in['me'] ?? null);
  exit(json_encode($out));
}

// ---------- ältere Spielversionen ----------
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
  $body = file_get_contents('php://input', false, null, 0, 900000);
  $in = json_decode((string) $body, true);
  if (!is_array($in) || !isset($in['state']) || !is_array($in['state'])) {
    flock($h, LOCK_UN);
    http_response_code(400);
    exit('{"error":"body"}');
  }
  // nur übernehmen, wenn es kein neueres Protokoll gibt (sonst ginge etwas verloren)
  if ((int) ($in['baseRev'] ?? -1) !== (int) $cur['rev'] || count($cur['ops'])) {
    done($h, ['ok' => false, 'rev' => $cur['srev'], 'updatedAt' => $cur['updatedAt'], 'state' => $cur['state']]);
  }
  $cur['rev'] = $cur['srev'] = $cur['rev'] + 1;
  $cur['state'] = $in['state'];
  $cur['updatedAt'] = $now;
  save($h, $cur);
  done($h, ['ok' => true, 'rev' => $cur['rev'], 'updatedAt' => $cur['updatedAt']]);
}
done($h, ['rev' => $cur['srev'], 'updatedAt' => $cur['updatedAt'], 'state' => $cur['state']]);
