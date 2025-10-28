<?php
require __DIR__ . '/common.php';

$in = body();
$required = ['url','device','group_id'];
foreach ($required as $k) {
  if (!isset($in[$k]) || $in[$k] === '') {
    json(['error' => "Missing field: $k"], 400);
  }
}

$toFloat = function($k) use ($in) { return isset($in[$k]) ? (float)$in[$k] : null; };
$toInt   = function($k) use ($in) { return isset($in[$k]) ? (int)$in[$k] : null; };

$sql = "INSERT INTO reports
  (group_id, case_id, url, device, nitro_header,
   perf_with, perf_without,
   fcp_with_s, fcp_without_s,
   lcp_with_s, lcp_without_s,
   tbt_with_ms, tbt_without_ms,
   cls_with, cls_without)
VALUES
  (:group_id, :case_id, :url, :device, :nitro_header,
   :perf_with, :perf_without,
   :fcp_with_s, :fcp_without_s,
   :lcp_with_s, :lcp_without_s,
   :tbt_with_ms, :tbt_without_ms,
   :cls_with, :cls_without)";

$stmt = db()->prepare($sql);
$stmt->execute([
  ':group_id'      => $in['group_id'],
  ':case_id'       => $in['case_id'] ?? null,
  ':url'           => $in['url'],
  ':device'        => $in['device'],
  ':nitro_header'  => $in['nitro_header'] ?? null,
  ':perf_with'     => $toInt('perf_with'),
  ':perf_without'  => $toInt('perf_without'),
  ':fcp_with_s'    => $toFloat('fcp_with_s'),
  ':fcp_without_s' => $toFloat('fcp_without_s'),
  ':lcp_with_s'    => $toFloat('lcp_with_s'),
  ':lcp_without_s' => $toFloat('lcp_without_s'),
  ':tbt_with_ms'   => $toFloat('tbt_with_ms'),
  ':tbt_without_ms'=> $toFloat('tbt_without_ms'),
  ':cls_with'      => $toFloat('cls_with'),
  ':cls_without'   => $toFloat('cls_without'),
]);

json(['ok' => true, 'id' => db()->lastInsertId()]);
