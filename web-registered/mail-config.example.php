<?php
// Copy to mail-config.local.php ON THE PHP SERVER ONLY, then set both addresses.
// Alternatively set ELEVATE_REGISTRATION_TO and ELEVATE_REGISTRATION_FROM.
return [
    'to' => '', // Web登録の通知を受け取るメールアドレス
    'from' => '', // サーバーで送信を許可された自社ドメインのメールアドレス
];
