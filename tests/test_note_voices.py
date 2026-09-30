import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import build_note_voices as voices


def feed(items=''):
    return ('<rss xmlns:media="http://search.yahoo.com/mrss/"><channel>' + items + '</channel></rss>').encode()


def item(title='お客様の声', link='https://note.com/elevate/n/n123', extra=''):
    return f'<item><title>{title}</title><link>{link}</link>{extra}</item>'


class NoteVoicesTest(unittest.TestCase):
    def test_note_namespace_thumbnail_and_date(self):
        cards = voices.parse_feed(feed(item(extra='<media:thumbnail>https://assets.st-note.com/example.jpg</media:thumbnail><pubDate>Wed, 30 Sep 2026 00:30:00 +0900</pubDate>')), 6)
        self.assertEqual(cards[0]['date'], '2026-09-30')
        self.assertEqual(cards[0]['image'], 'https://assets.st-note.com/example.jpg')
        html = voices.render(cards, 'https://note.com/elevate/m/m123')
        self.assertIn('href="https://note.com/elevate/n/n123"', html)
        self.assertIn('target="_blank" rel="noopener noreferrer"', html)
        self.assertIn('2026.09.30', html)

    def test_empty_feed_shows_preparing(self):
        self.assertEqual(voices.parse_feed(feed(), 6), [])
        html = voices.render([], 'https://note.com/elevate/magazines')
        self.assertIn('ただいま準備中', html)
        self.assertNotIn('swiper-slide', html)
        self.assertNotIn('data-carousel-next', html)

    def test_order_limit_duplicates_and_deleted_articles(self):
        raw = feed(item('最初') + item('重複') + item('次', 'https://note.com/elevate/n/n456') + item('最後', 'https://note.com/elevate/n/n789'))
        self.assertEqual([c['title'] for c in voices.parse_feed(raw, 2)], ['最初', '次'])
        self.assertEqual(len(voices.parse_feed(feed(item('残った記事')), 6)), 1)

    def test_unsafe_links_html_and_image_fallback(self):
        raw = feed(item('無効', 'javascript:alert(1)') + item('&lt;script&gt;alert(1)&lt;/script&gt;', extra='<media:thumbnail>javascript:alert(1)</media:thumbnail><pubDate>invalid</pubDate>'))
        cards = voices.parse_feed(raw, 6)
        html = voices.render(cards, 'https://note.com/elevate/magazines')
        self.assertEqual(len(cards), 1)
        self.assertNotIn('<script>', html)
        self.assertIn('&lt;script&gt;', html)
        self.assertIn('images/common/logo.png', html)
        self.assertNotIn('datetime=', html)
        self.assertNotIn('javascript:', html)

    def test_xml_errors_do_not_look_like_empty_feed(self):
        for raw in [b'<html>error</html>', b'<rss>', b'<!DOCTYPE rss><rss><channel/></rss>', feed(item(link='https://example.com/story'))]:
            with self.assertRaises(Exception):
                voices.parse_feed(raw, 6)

    def test_magazine_url_and_config_validation(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'config.json'
            config = {'magazine_url': '', 'collection_url': 'https://note.com/elevate/magazines', 'limit': 6}
            path.write_text(json.dumps(config))
            self.assertEqual(voices.settings(path)[0], '')
            config['magazine_url'] = 'https://note.com/elevate/m/m123/'
            path.write_text(json.dumps(config))
            self.assertEqual(voices.settings(path)[0], 'https://note.com/elevate/m/m123')
            config['magazine_url'] = 'https://note.com/elevate/magazines'
            path.write_text(json.dumps(config))
            with self.assertRaises(ValueError): voices.settings(path)
            config['magazine_url'] = ''
            config['limit'] = 0
            path.write_text(json.dumps(config))
            with self.assertRaises(ValueError): voices.settings(path)

    def test_failed_fetch_preserves_previous_output(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / 'site'
            output.mkdir()
            target = output / 'index.html'
            target.write_text('previous successful page')
            config = Path(tmp) / 'config.json'
            config.write_text(json.dumps({'magazine_url': 'https://note.com/elevate/m/m123', 'collection_url': 'https://note.com/elevate/magazines'}))
            with patch.object(voices, 'fetch_feed', side_effect=TimeoutError('network timeout')):
                with self.assertRaises(TimeoutError): voices.build(config, output)
            self.assertEqual(target.read_text(), 'previous successful page')

    def test_page_structure_and_replacement(self):
        source = (voices.ROOT / 'index.html').read_text()
        html = voices.replace_block(source, voices.render(voices.parse_feed(feed(item()), 6), 'https://note.com/elevate/m/m123'))
        self.assertLess(html.index('id="service"'), html.index('id="voices"'))
        self.assertLess(html.index('id="voices"'), html.index('id="news"'))
        self.assertNotIn('interview-modal', html)
        self.assertNotIn('ただいま準備中', html)
        self.assertEqual(html.count('class="swiper-slide"'), 1)
        self.assertIn('hero-wordmark', html)


if __name__ == '__main__':
    unittest.main()
