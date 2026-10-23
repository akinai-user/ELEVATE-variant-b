<?php
declare(strict_types=1);

// Shared endpoint implementation. Each page selects a fixed definition in submit.php.
ini_set('display_errors', '0');
header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function formResponse(int $code, array $data): never
{
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function formText(string $name, int $limit = 500): string
{
    $value = $_POST[$name] ?? '';
    if (!is_string($value) || strlen($value) > $limit || preg_match('//u', $value) !== 1 || strpos($value, "\0") !== false) {
        formResponse(422, ['message' => '入力内容の形式または文字数を確認してください。']);
    }
    return trim($value);
}

try {
    $definitions = [
        'contact' => ['title' => 'お問い合わせ', 'env' => 'CONTACT', 'fields' => ['name' => 'ご担当者名', 'company' => '企業名', 'email' => 'メールアドレス', 'email_chk' => '確認用メールアドレス', 'tel' => '電話番号', 'message' => 'お問い合わせ内容', 'policy_chk' => '個人情報の取り扱い']],
        'advance' => ['title' => '前払い申請', 'env' => 'ADVANCE', 'fields' => ['name' => '氏名', 'id' => 'ID', 'message' => '日付・勤務先', 'days' => '何日分', 'email' => 'メールアドレス', 'checkbox01' => '給与前払いの受け取り方法への同意', 'policy_chk' => '個人情報の取り扱い']],
        'transportation' => ['title' => '交通費申請', 'env' => 'TRANSPORTATION', 'fields' => ['name' => '氏名', 'id' => 'ID', 'message' => '日付・就業先・通勤方法', 'policy_chk' => '個人情報の取り扱い']],
    ];
    if (!defined('ELEVATE_FORM') || !defined('ELEVATE_FORM_DIRECTORY') || !isset($definitions[ELEVATE_FORM])) formResponse(404, ['message' => 'ページが見つかりません。']);
    $definition = $definitions[ELEVATE_FORM];
    $method = $_SERVER['REQUEST_METHOD'] ?? '';
    if (!in_array($method, ['GET', 'POST'], true)) {
        header('Allow: GET, POST');
        formResponse(405, ['message' => 'この送信方式は利用できません。']);
    }
    $config = [
        'to' => getenv('ELEVATE_' . $definition['env'] . '_TO') ?: '',
        'from' => getenv('ELEVATE_' . $definition['env'] . '_FROM') ?: '',
    ];
    if (is_file(ELEVATE_FORM_DIRECTORY . '/mail-config.local.php')) {
        $local = require ELEVATE_FORM_DIRECTORY . '/mail-config.local.php';
        if (is_array($local)) $config = array_merge($config, $local);
    }
    foreach (['to', 'from'] as $key) {
        if (!is_string($config[$key]) || !filter_var($config[$key], FILTER_VALIDATE_EMAIL) || preg_match('/[\r\n]/', $config[$key])) {
            formResponse(503, ['message' => '現在、送信の受付を準備中です。お電話でお問い合わせください。']);
        }
    }
    if (!function_exists('mail') || !class_exists('finfo')) formResponse(503, ['message' => '現在、送信を受け付けられません。お電話でお問い合わせください。']);
    if ($method === 'POST' && (int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 12 * 1024 * 1024) formResponse(413, ['message' => '添付ファイルは1点につき5MB以下、2点までにしてください。']);
    session_name('elevate_forms');
    if (!session_start(['use_strict_mode' => true, 'cookie_httponly' => true, 'cookie_secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off', 'cookie_samesite' => 'Strict'])) {
        throw new RuntimeException('Session unavailable');
    }
    if (!isset($_SESSION[ELEVATE_FORM])) $_SESSION[ELEVATE_FORM] = [];
    $state = &$_SESSION[ELEVATE_FORM];
    if ($method === 'GET') {
        if (empty($state['token']) || !empty($state['sent'])) {
            $state['token'] = bin2hex(random_bytes(32));
            unset($state['sent'], $state['digest']);
        }
        formResponse(200, ['token' => $state['token']]);
    }
    $token = formText('csrf_token', 128);
    if (!$token || !hash_equals($state['token'] ?? '', $token)) formResponse(403, ['message' => '送信の有効期限が切れました。入力画面に戻り、再度確認画面へお進みください。']);
    $fields = [];
    foreach ($definition['fields'] as $name => $label) {
        $fields[$name] = formText($name, $name === 'message' ? 15000 : 500);
        if ($fields[$name] === '') formResponse(422, ['message' => $label . 'を入力してください。']);
    }
    if ($fields['policy_chk'] !== '1') formResponse(422, ['message' => '個人情報の取り扱いに同意してください。']);
    if (ELEVATE_FORM === 'transportation' && $fields['id'] === '00000') {
        formResponse(422, ['message' => 'ID「00000」では申請できません。取得済みのIDを入力してください。']);
    }
    if (isset($fields['email']) && (!filter_var($fields['email'], FILTER_VALIDATE_EMAIL) || preg_match('/[\r\n]/', $fields['email']))) formResponse(422, ['message' => 'メールアドレスを確認してください。']);
    if (ELEVATE_FORM === 'contact') {
        if ($fields['email'] !== $fields['email_chk']) formResponse(422, ['message' => 'メールアドレスが一致していません。']);
        if (!preg_match('/^[0-9+() \-]{8,30}$/D', $fields['tel'])) formResponse(422, ['message' => '電話番号を確認してください。']);
    }
    if (ELEVATE_FORM === 'advance' && (!preg_match('/^[1-9][0-9]{0,8}$/D', $fields['days']) || $fields['checkbox01'] !== '同意する')) {
        formResponse(422, ['message' => '申請日数と給与前払いの受け取り方法への同意を確認してください。']);
    }
    $attachments = [];
    if (ELEVATE_FORM === 'advance') {
        $allowed = ['jpg' => ['image/jpeg'], 'jpeg' => ['image/jpeg'], 'png' => ['image/png'], 'pdf' => ['application/pdf'], 'heic' => ['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence']];
        foreach (['attachment1', 'attachment2'] as $name) {
            if (!isset($_FILES[$name])) continue;
            $file = $_FILES[$name];
            if (!isset($file['error']) || !is_int($file['error'])) formResponse(422, ['message' => '添付ファイルを選び直してください。']);
            if ($file['error'] === UPLOAD_ERR_NO_FILE) continue;
            if ($file['error'] !== UPLOAD_ERR_OK || !is_string($file['tmp_name']) || !is_uploaded_file($file['tmp_name']) || $file['size'] > 5 * 1024 * 1024) formResponse(422, ['message' => '添付ファイルは1点につき5MB以下にしてください。']);
            if (!is_string($file['name'])) formResponse(422, ['message' => '添付ファイルを選び直してください。']);
            $extension = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
            $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
            if (!isset($allowed[$extension]) || !in_array($mime, $allowed[$extension], true)) formResponse(422, ['message' => '添付形式を確認してください。JPEG、PNG、PDF、HEICに対応しています。']);
            $data = file_get_contents($file['tmp_name']);
            if ($data === false) throw new RuntimeException('Upload unavailable');
            $attachments[] = ['name' => $name . '.' . $extension, 'mime' => $mime, 'data' => $data];
        }
    }
    $digest = hash('sha256', serialize([$fields, $attachments]));
    // Session lock serializes concurrent sends; keep only hashes, never application data.
    if (!empty($state['sent'])) {
        if (hash_equals($state['digest'], $digest)) formResponse(200, ['ok' => true]);
        formResponse(409, ['message' => 'この画面からの送信は完了しています。新たな送信はページを再読み込みしてください。']);
    }
    if (time() - ($state['attempt'] ?? 0) < 10) formResponse(429, ['message' => '少し時間をおいてから再度お試しください。']);
    $lines = [$definition['title'] . 'がありました。', ''];
    foreach ($definition['fields'] as $name => $label) $lines[] = $label . '：' . ($name === 'policy_chk' ? '同意済み' : $fields[$name]);
    $boundary = 'elevate_' . bin2hex(random_bytes(16));
    $body = '--' . $boundary . "\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode(implode("\r\n", $lines)));
    foreach ($attachments as $attachment) {
        $body .= '--' . $boundary . "\r\nContent-Type: " . $attachment['mime'] . "\r\n";
        $body .= 'Content-Disposition: attachment; filename="' . $attachment['name'] . "\"\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($attachment['data']));
    }
    $body .= '--' . $boundary . "--\r\n";
    $headers = ['From' => $config['from'], 'MIME-Version' => '1.0', 'Content-Type' => 'multipart/mixed; boundary="' . $boundary . '"'];
    if (isset($fields['email'])) $headers['Reply-To'] = $fields['email'];
    $state['attempt'] = time();
    $subject = '=?UTF-8?B?' . base64_encode('【ELEVATE】' . $definition['title']) . '?=';
    if (!mail($config['to'], $subject, $body, $headers)) formResponse(502, ['message' => '送信を完了できませんでした。時間をおいて再度お試しいただくか、お電話でお問い合わせください。']);
    $state['sent'] = true;
    $state['digest'] = $digest;
    formResponse(200, ['ok' => true]);
} catch (Throwable $error) {
    error_log('ELEVATE form submission failed: ' . get_class($error));
    formResponse(500, ['message' => '送信処理でエラーが発生しました。時間をおいて再度お試しください。']);
}
