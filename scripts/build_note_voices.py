#!/usr/bin/env python3
"""Build note magazine cards into static HTML; no browser-side RSS dependency."""
import argparse
from email.utils import parsedate_to_datetime
from html import escape
import json
from pathlib import Path
import re
import shutil
import sys
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
START = '<!-- NOTE-VOICES:START -->'
END = '<!-- NOTE-VOICES:END -->'
MAX_BYTES = 3_000_000


def note_url(value, pattern):
    if not isinstance(value, str):
        return ''
    parsed = urlsplit(value.strip())
    if parsed.scheme != 'https' or parsed.netloc != 'note.com':
        return ''
    path = parsed.path.rstrip('/')
    return 'https://note.com' + path if re.fullmatch(pattern, path) else ''


def settings(path):
    config = json.loads(path.read_text(encoding='utf-8'))
    magazine = config.get('magazine_url', '')
    if magazine:
        magazine = note_url(magazine, r'/[A-Za-z0-9_-]+/m/[A-Za-z0-9_-]+')
        if not magazine:
            raise ValueError('magazine_urlには https://note.com/ユーザー名/m/マガジンID を設定してください（一覧URLは不可）。')
    collection = note_url(config.get('collection_url'), r'/[A-Za-z0-9_-]+/magazines')
    if not collection:
        raise ValueError('collection_urlにnoteのマガジン一覧URLを設定してください。')
    limit = config.get('limit', 6)
    if type(limit) is not int or not 1 <= limit <= 25:
        raise ValueError('limitは1〜25の整数にしてください。')
    return magazine, collection, limit


def image_url(value):
    value = (value or '').strip()
    parsed = urlsplit(value)
    if parsed.scheme == 'https' and parsed.hostname and not parsed.username and not parsed.password:
        return value
    return ''


def parse_feed(raw, limit):
    if len(raw) > MAX_BYTES or b'<!DOCTYPE' in raw.upper() or b'<!ENTITY' in raw.upper():
        raise ValueError('RSSのサイズまたは形式が不正です。')
    root = ET.fromstring(raw)
    channel = root.find('channel')
    if root.tag != 'rss' or channel is None:
        raise ValueError('noteのRSS形式ではありません。')
    cards, seen = [], set()
    items = channel.findall('item')
    for item in items:
        url = note_url(item.findtext('link'), r'/[A-Za-z0-9_-]+/n/[A-Za-z0-9_-]+')
        title = ' '.join((item.findtext('title') or '').split())
        if not url or not title or url in seen:
            continue
        seen.add(url)
        thumbnail = ''
        for child in item:
            if child.tag.rsplit('}', 1)[-1] in ('thumbnail', 'content', 'enclosure'):
                thumbnail = image_url(child.get('url') or child.text)
                if thumbnail:
                    break
        date = ''
        try:
            date = parsedate_to_datetime(item.findtext('pubDate') or '').date().isoformat()
        except (ValueError, TypeError, OverflowError):
            pass
        cards.append({'url': url, 'title': title, 'image': thumbnail, 'date': date})
        if len(cards) == limit:
            break
    if items and not cards:
        raise ValueError('RSSに記事がありますが、有効な記事リンクを取得できませんでした。')
    return cards


def fetch_feed(magazine):
    request = Request(magazine + '/rss', headers={'User-Agent': 'ELEVATE-Website-RSS/1.0', 'Accept': 'application/rss+xml, application/xml, text/xml'})
    with urlopen(request, timeout=30) as response:
        return response.read(MAX_BYTES + 1)


def render(cards, destination):
    link = escape(destination, quote=True)
    if not cards:
        body = '''<div class="voices-empty">
            <p class="voices-empty__label">COMING SOON</p>
            <h3>お客様の声は、ただいま準備中です。</h3>
            <p>サービスをご利用いただいたお客様のストーリーを、順次ご紹介します。</p>
          </div>'''
    else:
        slides = []
        for card in cards:
            url, title = escape(card['url'], quote=True), escape(card['title'])
            image = escape(card['image'] or 'images/common/logo.png', quote=True)
            fallback = ' voice-card__media--fallback' if not card['image'] else ''
            date = card['date']
            published = f'<time datetime="{date}">{date.replace("-", ".")}</time>' if date else ''
            slides.append(f'''<div class="swiper-slide">
                <a class="interview-card voice-card hover-image hover-lift" href="{url}" target="_blank" rel="noopener noreferrer" aria-label="{escape(card['title'], quote=True)}（note・別タブで開く）">
                  <div class="voice-card__media{fallback}"><img src="{image}" alt="" width="1200" height="675" loading="lazy" decoding="async" /></div>
                  <h3>{title}</h3>
                  <p class="voice-card__meta">{published}<span>noteで読む ↗</span></p>
                </a>
              </div>''')
        body = '''<div class="carousel-wrap">
            <button class="carousel-arrow carousel-arrow--prev" type="button" aria-label="前のお客様の声" data-carousel-prev hidden>←</button>
            <div class="swiper interview-slider" id="interview-list" aria-label="お客様の声">
              <div class="swiper-wrapper">''' + '\n'.join(slides) + '''</div>
              <div class="swiper-pagination"></div>
            </div>
            <button class="carousel-arrow carousel-arrow--next" type="button" aria-label="次のお客様の声" data-carousel-next hidden>→</button>
          </div>'''
    return body + f'''
          <div class="voices-more"><a class="text-link hover-underline" href="{link}" target="_blank" rel="noopener noreferrer">noteで事例を見る <span aria-hidden="true">↗</span><span class="voices-sr-only">（別タブで開く）</span></a></div>'''


def replace_block(source, block):
    if source.count(START) != 1 or source.count(END) != 1:
        raise ValueError('index.htmlのnote連携マーカーが見つからないか重複しています。')
    before, rest = source.split(START)
    _, after = rest.split(END)
    return before + START + '\n          ' + block + '\n          ' + END + after


def build(config_path, output, fixture=None):
    magazine, collection, limit = settings(config_path)
    if fixture:
        cards = parse_feed(fixture.read_bytes(), limit)
    else:
        cards = parse_feed(fetch_feed(magazine), limit) if magazine else []
    # All validation/fetching happens before output is written. Failed builds never deploy.
    html = replace_block((ROOT / 'index.html').read_text(encoding='utf-8'), render(cards, magazine or collection))
    output = output.resolve()
    if output == ROOT or ROOT.is_relative_to(output) or (output.is_relative_to(ROOT) and output != ROOT / '_site'):
        raise ValueError('出力先にはソースとは別のディレクトリを指定してください。')
    output.mkdir(parents=True, exist_ok=True)
    excluded = {'_site', '.git', '.github', 'scripts', 'tests', 'config', '__pycache__', output.name}
    for source in ROOT.iterdir():
        if source.name in excluded or source.name.startswith('.') and source.name != '.nojekyll' or source.suffix == '.md':
            continue
        target = output / source.name
        if source.is_dir():
            shutil.copytree(source, target, dirs_exist_ok=True)
        else:
            shutil.copy2(source, target)
    (output / 'index.html').write_text(html, encoding='utf-8')
    print(f'note voices: {len(cards)} cards; output: {output}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, default=ROOT / 'config/note-voices.json')
    parser.add_argument('--output', type=Path, default=ROOT / '_site')
    parser.add_argument('--fixture', type=Path, help='Local RSS for offline preview only')
    args = parser.parse_args()
    try:
        build(args.config, args.output, args.fixture)
    except Exception as error:
        print(f'note voices build failed: {error}', file=sys.stderr)
        sys.exit(1)
