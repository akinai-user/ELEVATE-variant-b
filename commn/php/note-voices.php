<?php
declare(strict_types=1);

namespace Elevate\NoteVoices;

// Fixed public source; request parameters can never change the fetched URL.
const SOURCE = 'https://note.com/clever_macaw2454';
const LIMIT = 6;
const TTL = 300;
const MAX_BYTES = 3000000;

function parseFeed(string $raw): array
{
    if (strlen($raw) > MAX_BYTES || preg_match('/<!DOCTYPE|<!ENTITY/i', $raw)) {
        throw new \RuntimeException('Invalid RSS');
    }
    $previous = libxml_use_internal_errors(true);
    try {
        $xml = simplexml_load_string($raw, 'SimpleXMLElement', LIBXML_NONET);
        if ($xml === false || $xml->getName() !== 'rss' || !isset($xml->channel)) {
            throw new \RuntimeException('Invalid RSS');
        }
        $cards = [];
        $seen = [];
        foreach ($xml->channel->item as $item) {
            $url = trim((string) $item->link);
            $title = trim(preg_replace('/\s+/u', ' ', (string) $item->title) ?? '');
            if (!preg_match('~^https://note\.com/[A-Za-z0-9_-]+/n/[A-Za-z0-9_-]+/?$~D', $url)
                || $title === '' || isset($seen[$url])) {
                continue;
            }
            $seen[$url] = true;
            $image = '';
            foreach ($item->xpath('./*[local-name()="thumbnail" or local-name()="content" or local-name()="enclosure"]') as $media) {
                $candidate = trim((string) ($media['url'] ?? $media));
                $parts = parse_url($candidate);
                if ($parts && ($parts['scheme'] ?? '') === 'https' && !empty($parts['host'])
                    && !isset($parts['user']) && !isset($parts['pass'])) {
                    $image = $candidate;
                    break;
                }
            }
            $date = '';
            try {
                if (trim((string) $item->pubDate) !== '') {
                    $date = (new \DateTimeImmutable((string) $item->pubDate))->format('Y-m-d');
                }
            } catch (\Exception $error) {
                // An invalid date must not hide an otherwise usable article.
            }
            $cards[] = compact('url', 'title', 'image', 'date');
            if (count($cards) === LIMIT) break;
        }
        if (count($xml->channel->item) > 0 && !$cards) {
            throw new \RuntimeException('No valid article links');
        }
        return $cards;
    } finally {
        libxml_clear_errors();
        libxml_use_internal_errors($previous);
    }
}

function fetchFeed(): string
{
    $url = SOURCE . '/rss';
    if (function_exists('curl_init')) {
        $raw = '';
        $curl = curl_init($url);
        curl_setopt_array($curl, [
            CURLOPT_CONNECTTIMEOUT => 3,
            CURLOPT_TIMEOUT => 8,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
            CURLOPT_USERAGENT => 'ELEVATE-Website-RSS/1.0',
            CURLOPT_HTTPHEADER => ['Accept: application/rss+xml, application/xml, text/xml'],
            CURLOPT_WRITEFUNCTION => static function ($handle, string $chunk) use (&$raw): int {
                if (strlen($raw) + strlen($chunk) > MAX_BYTES) return 0;
                $raw .= $chunk;
                return strlen($chunk);
            },
        ]);
        $ok = curl_exec($curl);
        $status = curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
        if ($ok === false || $status !== 200) throw new \RuntimeException('RSS fetch failed');
        return $raw;
    }
    $context = stream_context_create(['http' => [
        'timeout' => 8, 'follow_location' => 0,
        'header' => "User-Agent: ELEVATE-Website-RSS/1.0\r\nAccept: application/rss+xml\r\n",
    ]]);
    $raw = @file_get_contents($url, false, $context, 0, MAX_BYTES + 1);
    if ($raw === false || !preg_match('~^HTTP/\S+ 200\b~', $http_response_header[0] ?? '')) {
        throw new \RuntimeException('RSS fetch failed');
    }
    return $raw;
}

// A private temporary directory keeps cache files outside the document root.
// Injectable transport/clock let tests exercise failures without contacting note.
function articles(string $directory, callable $fetch, int $now): array
{
    if (!is_dir($directory) && !@mkdir($directory, 0700, true) && !is_dir($directory)) {
        throw new \RuntimeException('Cache unavailable');
    }
    $path = $directory . '/articles.json';
    $cached = json_decode((string) @file_get_contents($path), true);
    if (!is_array($cached) || !isset($cached['checked_at'], $cached['cards']) || !is_array($cached['cards'])) {
        $cached = null;
    }
    if ($cached !== null && $now - $cached['checked_at'] < TTL) return $cached['cards'];
    $lock = @fopen($directory . '/refresh.lock', 'c');
    if ($lock === false) {
        if ($cached !== null) return $cached['cards'];
        throw new \RuntimeException('Cache unavailable');
    }
    if (!flock($lock, LOCK_EX | LOCK_NB)) {
        fclose($lock);
        if ($cached !== null) return $cached['cards'];
        throw new \RuntimeException('Refresh in progress');
    }
    try {
        try {
            $cards = parseFeed($fetch());
        } catch (\Throwable $error) {
            if ($cached === null) throw $error;
            // Back off for five minutes during an upstream outage as well.
            $cards = $cached['cards'];
        }
        $json = json_encode(['checked_at' => $now, 'cards' => $cards], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        $temp = tempnam($directory, 'rss-');
        if ($temp !== false) {
            if (file_put_contents($temp, $json) !== false) @rename($temp, $path);
            if (is_file($temp)) @unlink($temp);
        }
        return $cards;
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}

function respond(): void
{
    header('Content-Type: application/json; charset=UTF-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
        http_response_code(405);
        header('Allow: GET');
        echo '{"error":"Method not allowed"}';
        return;
    }
    try {
        $directory = sys_get_temp_dir() . '/elevate-note-' . hash('sha256', __FILE__ . SOURCE);
        $cards = articles($directory, __NAMESPACE__ . '\\fetchFeed', time());
        echo json_encode(['cards' => $cards, 'destination' => SOURCE], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    } catch (\Throwable $error) {
        http_response_code(503);
        echo '{"error":"Articles temporarily unavailable"}';
    }
}

if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) respond();
