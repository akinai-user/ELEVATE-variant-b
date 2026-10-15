<?php
// PHPサーバー上でのみ mail-config.local.php にコピーし、両方のアドレスを設定します。
// 環境変数 ELEVATE_ADVANCE_TO / ELEVATE_ADVANCE_FROM でも設定できます。
return [
    'to' => '', // このフォームの通知先
    'from' => '', // サーバーで送信を許可された自社ドメインのアドレス
];
