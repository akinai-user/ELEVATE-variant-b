<?php
declare(strict_types=1);

// PHP 8.1+, fileinfo, sessions, and a working mail() transport are required.
ini_set('display_errors', '0');
header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function respond(int $code, array $data): never
{
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function textField(string $name, int $limit = 500, bool $required = false): string
{
    $value = $_POST[$name] ?? '';
    if (!is_string($value) || strlen($value) > $limit || preg_match('//u', $value) !== 1 || strpos($value, "\0") !== false) {
        respond(422, ['message' => '入力内容の形式または文字数を確認してください。']);
    }
    $value = trim($value);
    if ($required && $value === '') {
        respond(422, ['message' => '必須項目を入力してください。入力画面に戻ってご確認ください。']);
    }
    return $value;
}

try {
    $method = $_SERVER['REQUEST_METHOD'] ?? '';
    if (!in_array($method, ['GET', 'POST'], true)) {
        header('Allow: GET, POST');
        respond(405, ['message' => 'この送信方式は利用できません。']);
    }
    $config = ['to' => getenv('ELEVATE_REGISTRATION_TO') ?: '', 'from' => getenv('ELEVATE_REGISTRATION_FROM') ?: ''];
    if (is_file(__DIR__ . '/mail-config.local.php')) {
        $local = require __DIR__ . '/mail-config.local.php';
        if (is_array($local)) $config = array_merge($config, $local);
    }
    foreach (['to', 'from'] as $key) {
        if (!is_string($config[$key]) || !filter_var($config[$key], FILTER_VALIDATE_EMAIL) || preg_match('/[\r\n]/', $config[$key])) {
            respond(503, ['message' => '現在、送信の受付を準備中です。お電話でお問い合わせください。']);
        }
    }
    if (!function_exists('mail') || !class_exists('finfo')) {
        respond(503, ['message' => '現在、送信を受け付けられません。お電話でお問い合わせください。']);
    }
    session_name('elevate_registration');
    session_start([
        'use_strict_mode' => true,
        'cookie_httponly' => true,
        'cookie_secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
        'cookie_samesite' => 'Strict',
    ]);
    if ($method === 'GET') {
        // One token per browser session also identifies retries of the same request.
        if (empty($_SESSION['registration_token']) || !empty($_SESSION['registration_sent'])) {
            $_SESSION['registration_token'] = bin2hex(random_bytes(32));
            unset($_SESSION['registration_sent'], $_SESSION['registration_digest']);
        }
        respond(200, ['token' => $_SESSION['registration_token']]);
    }
    $token = textField('csrf_token', 128);
    if (!$token || !hash_equals($_SESSION['registration_token'] ?? '', $token)) {
        respond(403, ['message' => '送信の有効期限が切れました。入力画面に戻り、再度確認画面へお進みください。']);
    }
    $fields = [];
    foreach (['job_no', 'last_name', 'first_name', 'last_name_kana', 'first_name_kana', 'gender', 'postal_code', 'address1', 'address2', 'phone', 'email', 'birth_year', 'birth_month', 'birth_day', 'policy_chk'] as $name) {
        $fields[$name] = textField($name, 500, $name !== 'job_no');
    }
    $fields['remarks'] = textField('remarks', 15000);
    if (!in_array($fields['gender'], ['男', '女'], true) || $fields['policy_chk'] !== '1'
        || !preg_match('/^[0-9]{7}$/D', $fields['postal_code'])
        || !preg_match('/^[0-9+() \-]{8,30}$/D', $fields['phone'])
        || !filter_var($fields['email'], FILTER_VALIDATE_EMAIL) || preg_match('/[\r\n]/', $fields['email'])) {
        respond(422, ['message' => '性別・郵便番号・電話番号・メールアドレス・同意欄を確認してください。']);
    }
    foreach (['birth_year', 'birth_month', 'birth_day'] as $name) {
        if (!ctype_digit($fields[$name])) respond(422, ['message' => '生年月日を確認してください。']);
    }
    $year = (int)$fields['birth_year'];
    $month = (int)$fields['birth_month'];
    $day = (int)$fields['birth_day'];
    $today = new DateTimeImmutable('today', new DateTimeZone('Asia/Tokyo'));
    if (!checkdate($month, $day, $year) || $year < (int)$today->format('Y') - 120
        || sprintf('%04d-%02d-%02d', $year, $month, $day) > $today->format('Y-m-d')) {
        respond(422, ['message' => '生年月日を確認してください。']);
    }
    $commute = $_POST['commute_method'] ?? [];
    if (!is_array($commute) || !$commute || count($commute) > 5) {
        respond(422, ['message' => '通勤手段を1つ以上選択してください。']);
    }
    foreach ($commute as $value) {
        if (!is_string($value) || !in_array($value, ['徒歩', '自転車', '公共交通機関', 'バイク', '車'], true)) {
            respond(422, ['message' => '通勤手段を確認してください。']);
        }
    }
    $attachment = null;
    if (isset($_FILES['face_photo'])) {
        $file = $_FILES['face_photo'];
        if (!isset($file['error']) || !is_int($file['error'])) respond(422, ['message' => '顔写真を選び直してください。']);
        if ($file['error'] !== UPLOAD_ERR_NO_FILE) {
            if ($file['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($file['tmp_name']) || $file['size'] > 5 * 1024 * 1024) {
                respond(422, ['message' => '顔写真は5MB以下のファイルを選択してください。']);
            }
            $extension = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
            $allowed = ['jpg' => ['image/jpeg'], 'jpeg' => ['image/jpeg'], 'png' => ['image/png'], 'gif' => ['image/gif'], 'heic' => ['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence']];
            $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
            if (!isset($allowed[$extension]) || !in_array($mime, $allowed[$extension], true)) {
                respond(422, ['message' => '顔写真の形式を確認してください。JPEG、PNG、GIF、HEICに対応しています。']);
            }
            $attachment = ['mime' => $mime, 'extension' => $extension, 'data' => file_get_contents($file['tmp_name'])];
        }
    }
    $digest = hash('sha256', serialize([$fields, $commute, $attachment]));
    // PHP's session lock serializes double clicks; only identical retries succeed.
    if (!empty($_SESSION['registration_sent'])) {
        if (hash_equals($_SESSION['registration_digest'], $digest)) respond(200, ['ok' => true]);
        respond(409, ['message' => 'この画面からのお申し込みは送信済みです。新たなお申し込みはページを再読み込みしてください。']);
    }
    if (time() - ($_SESSION['registration_attempt'] ?? 0) < 10) {
        respond(429, ['message' => '少し時間をおいてから再度お試しください。']);
    }
    $labels = ['job_no' => 'お仕事No.', 'last_name' => '姓', 'first_name' => '名', 'last_name_kana' => 'セイ', 'first_name_kana' => 'メイ', 'gender' => '性別', 'birth_year' => '生まれた年', 'birth_month' => '月', 'birth_day' => '日', 'postal_code' => '郵便番号', 'address1' => '都道府県・市区町村', 'address2' => '番地・建物名', 'phone' => '電話番号', 'email' => 'メールアドレス', 'remarks' => '備考'];
    $lines = ['Web登録のお申し込みがありました。', ''];
    foreach ($labels as $name => $label) $lines[] = $label . '：' . ($fields[$name] ?: '未入力');
    $lines[] = '通勤手段：' . implode('、', array_unique($commute));
    $lines[] = '個人情報の取り扱い：同意済み';
    $boundary = 'elevate_' . bin2hex(random_bytes(16));
    $body = '--' . $boundary . "\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n";
    $body .= chunk_split(base64_encode(implode("\r\n", $lines)));
    if ($attachment !== null) {
        $filename = 'face-photo.' . $attachment['extension'];
        $body .= '--' . $boundary . "\r\nContent-Type: " . $attachment['mime'] . "\r\n";
        $body .= 'Content-Disposition: attachment; filename="' . $filename . "\"\r\nContent-Transfer-Encoding: base64\r\n\r\n";
        $body .= chunk_split(base64_encode($attachment['data']));
    }
    $body .= '--' . $boundary . "--\r\n";
    $headers = ['From' => $config['from'], 'Reply-To' => $fields['email'], 'MIME-Version' => '1.0', 'Content-Type' => 'multipart/mixed; boundary="' . $boundary . '"'];
    $_SESSION['registration_attempt'] = time();
    $subject = '=?UTF-8?B?' . base64_encode('【ELEVATE】Web登録のお申し込み') . '?=';
    if (!mail($config['to'], $subject, $body, $headers)) {
        respond(502, ['message' => '送信を完了できませんでした。時間をおいて再度お試しいただくか、お電話でお問い合わせください。']);
    }
    $_SESSION['registration_sent'] = true;
    $_SESSION['registration_digest'] = $digest;
    respond(200, ['ok' => true]);
} catch (Throwable $error) {
    // Do not log form values, photo content, or addresses.
    error_log('ELEVATE registration submission failed: ' . get_class($error));
    respond(500, ['message' => '送信処理でエラーが発生しました。時間をおいて再度お試しください。']);
}
