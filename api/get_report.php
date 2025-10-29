<?php
require __DIR__ . '/common.php';

$id = $_GET['id'] ?? null;
$url = $_GET['url'] ?? null;
$case = $_GET['case_id'] ?? null;
$gid = $_GET['group_id'] ?? null;
$lim = min((int) ($_GET['limit'] ?? 10), 100);

if ($gid) {
  $stmt = db()->prepare("SELECT * FROM reports WHERE group_id = :gid ORDER BY device");
  $stmt->execute([':gid' => $gid]);
  $rows = $stmt->fetchAll();
  // decode blobs:
  foreach ($rows as &$r) {
    $r['with_nitro_json'] = json_decode($r['with_nitro_json'], true);
    $r['without_nitro_json'] = json_decode($r['without_nitro_json'], true);
  }
  json($rows ?: []);
}

if ($id) {
  $stmt = db()->prepare("SELECT * FROM reports WHERE id = :id");
  $stmt->execute([':id' => $id]);
  $row = $stmt->fetch();
  if (!$row)
    json(['error' => 'Not found'], 404);
  $row['with_nitro_json'] = json_decode($row['with_nitro_json'], true);
  $row['without_nitro_json'] = json_decode($row['without_nitro_json'], true);
  json($row);
}

if ($url) {
  $stmt = db()->prepare("SELECT * FROM reports WHERE url = :url ORDER BY created_at DESC LIMIT {$lim}");
  $stmt->execute([':url' => $url]);
  $rows = $stmt->fetchAll();
  json($rows);
}

if ($case) {
  $stmt = db()->prepare("SELECT * FROM reports WHERE case_id = :c ORDER BY created_at DESC LIMIT {$lim}");
  $stmt->execute([':c' => $case]);
  $rows = $stmt->fetchAll();
  json($rows);
}

$stmt = db()->prepare("
  SELECT id, group_id, url, case_id, device, perf_with, perf_without, created_at
  FROM reports
  ORDER BY created_at DESC, id DESC
  LIMIT {$lim}
");
$stmt->execute();
json($stmt->fetchAll());
