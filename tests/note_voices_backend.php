<?php
declare(strict_types=1);
require __DIR__ . '/../commn/php/note-voices.php';

use function Elevate\NoteVoices\parseFeed;
use function Elevate\NoteVoices\articles;

function check(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}
function rss(string $items = ''): string {
    return '<rss xmlns:media="http://search.yahoo.com/mrss/"><channel>' . $items . '</channel></rss>';
}
$item = '<item><title>&lt;script&gt;記事&lt;/script&gt;</title><link>https://note.com/elevate/n/n123</link>'
    . '<media:thumbnail>https://assets.st-note.com/image.png</media:thumbnail>'
    . '<pubDate>Tue, 20 Oct 2026 19:52:53 +0900</pubDate></item>';
$raw = rss($item . $item . '<item><title>危険</title><link>javascript:alert(1)</link></item>');
$cards = parseFeed($raw);
check(count($cards) === 1, 'Deduplication and unsafe link filtering');
check($cards[0]['date'] === '2026-10-20', 'Publication date');
check($cards[0]['image'] === 'https://assets.st-note.com/image.png', 'Namespaced thumbnail');
check($cards[0]['title'] === '<script>記事</script>', 'Title retained as text for safe DOM rendering');
check(parseFeed(rss()) === [], 'Empty RSS');
foreach (['<html/>', '<rss>', '<!DOCTYPE rss><rss><channel/></rss>', rss('<item><title>X</title><link>https://example.com</link></item>')] as $bad) {
    $failed = false;
    try { parseFeed($bad); } catch (Throwable $error) { $failed = true; }
    check($failed, 'Invalid RSS must fail rather than clear articles');
}
$directory = sys_get_temp_dir() . '/elevate-note-test-' . bin2hex(random_bytes(8));
$calls = 0;
$fetch = static function () use (&$calls, $raw): string { $calls++; return $raw; };
$fail = static function (): string { throw new RuntimeException('offline'); };
try {
    check(articles($directory, $fetch, 1000) === $cards, 'Initial fetch');
    check(articles($directory, $fetch, 1299) === $cards && $calls === 1, 'Five-minute cache');
    check(articles($directory, $fail, 1301) === $cards, 'Stale cache retained on failure');
    check(articles($directory, $fetch, 1400) === $cards && $calls === 1, 'Failure backoff');
    check(articles($directory, static fn() => rss(), 1602) === [], 'Deletion of all articles');
    check(articles($directory, $fail, 1903) === [], 'Empty last success remains valid');
    unlink($directory . '/articles.json');
    $failed = false;
    try { articles($directory, $fail, 2204); } catch (Throwable $error) { $failed = true; }
    check($failed, 'No-cache failure must preserve browser fallback');
} finally {
    foreach (glob($directory . '/*') ?: [] as $path) unlink($path);
    if (is_dir($directory)) rmdir($directory);
}
echo "PASS: RSS validation, images, dates, cache, outage fallback, backoff, deletion\n";
