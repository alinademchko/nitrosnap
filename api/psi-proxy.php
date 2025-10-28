<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Handle preflight CORS
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

//Input validation
$url = $_GET['url'] ?? '';
$strategy = $_GET['strategy'] ?? 'mobile';

if (!$url || !preg_match('#^https?://#i', $url)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid or missing URL']);
    exit();
}

//Server-side API key only
$apiKey = getenv('PSI_API_KEY');
if (!$apiKey) {
    http_response_code(500);
    echo json_encode(['error' => 'Server not configured with API key']);
    exit();
}

//Build PSI API endpoint
$psiUrl = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed?' . http_build_query([
    'url' => $url,
    'strategy' => $strategy,
    'key' => $apiKey,
    'category' => 'performance',
    'locale' => 'en'
]);

// --- cURL request ---
$ch = curl_init();
curl_setopt_array($ch, [
    CURLOPT_URL => $psiUrl,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 300,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_SSL_VERIFYPEER => true,
    CURLOPT_ENCODING => '',
    CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_2TLS,
]);
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$error = curl_error($ch);
curl_close($ch);

//Output handling
if ($error) {
    http_response_code(502);
    echo json_encode(['error' => 'Upstream request failed', 'detail' => $error]);
    exit();
}

http_response_code($httpCode);
echo $response ?: json_encode(['error' => 'Empty response from PSI']);
