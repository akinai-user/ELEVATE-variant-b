<?php
declare(strict_types=1);

// Only fixed paths supplied by the compatibility entry points are accepted.
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if (!in_array($method, ['GET', 'HEAD'], true)) {
    http_response_code(405);
    header('Allow: GET, HEAD');
    header('Content-Type: text/plain; charset=UTF-8');
    echo 'この画面は更新されています。入力ページを開き直してください。';
    exit;
}
if (isset($legacyDestination)) {
    $query = $_SERVER['QUERY_STRING'] ?? '';
    // Reject raw header separators; keep ordinary bookmarked query parameters.
    if (strpbrk($query, "\r\n") !== false) {
        http_response_code(400);
        exit;
    }
    header('Location: ' . $legacyDestination . ($query === '' ? '' : '?' . $query), true, 301);
    exit;
}
if (!isset($legacyPage) || !is_file($legacyPage)) {
    http_response_code(404);
    exit;
}
header('Content-Type: text/html; charset=UTF-8');
if ($method !== 'HEAD') {
    readfile($legacyPage);
}
