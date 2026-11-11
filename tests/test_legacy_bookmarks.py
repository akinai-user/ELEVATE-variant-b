"""Exercise bookmark entry points on PHP; no mail is sent."""
import json
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import time
import unittest
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
PLAN = json.loads((ROOT / 'config/release/url-map.json').read_text())


@unittest.skipUnless(shutil.which('php'), 'PHP is required')
class LegacyBookmarkTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix='elevate-bookmarks-')
        cls.addClassCleanup(cls.temp.cleanup)
        site = Path(cls.temp.name)
        cls.aliases = [route for route in PLAN['routes'] if 'legacy_php_file' in route]
        cls.redirects = {
            **{f'{name}/thanks/index.php': f'{name}/' for name in
               ['contact', 'web-registered', 'advance-payment', 'transportation-expenses']},
            'human-register/index.php': 'web-registered/',
            'human-register/thanks/index.php': 'web-registered/',
        }
        files = ['commn/php/legacy-page.php', *cls.redirects]
        for route in cls.aliases:
            files.extend([route['legacy_php_file'], route['new_file']])
        for prefix in ['', 'stg']:
            for name in files:
                target = site / prefix / name
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(ROOT / name, target)
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        cls.base = f'http://127.0.0.1:{port}'
        cls.server = subprocess.Popen(['php', '-S', f'127.0.0.1:{port}', '-t', str(site)],
                                      stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        cls.addClassCleanup(cls.stop_server)

        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, *args, **kwargs):
                return None
        cls.client = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
        for _ in range(100):
            try:
                cls.request('/index.php')
                return
            except OSError:
                time.sleep(.03)
        raise RuntimeError('PHP test server did not start')

    @classmethod
    def stop_server(cls):
        cls.server.terminate()
        cls.server.wait(timeout=5)

    @classmethod
    def request(cls, path, method='GET'):
        try:
            response = cls.client.open(urllib.request.Request(cls.base + path, method=method), timeout=3)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            return response.status, response.headers, response.read()

    def test_existing_php_bookmarks_render_current_html_at_same_url(self):
        self.assertEqual(len(self.aliases), 17)
        for prefix in ['/', '/stg/']:
            for route in self.aliases:
                path = prefix + route['legacy_php_file']
                with self.subTest(path=path):
                    status, headers, body = self.request(path + '?source=bookmark')
                    self.assertEqual(status, 200)
                    self.assertIsNone(headers.get('Location'))
                    self.assertEqual(body, (ROOT / route['new_file']).read_bytes())
                    self.assertIn('text/html', headers.get('Content-Type'))
                    self.assertEqual(self.request(path, 'HEAD')[2], b'')
                    status, headers, _ = self.request(path, 'POST')
                    self.assertEqual(status, 405)
                    self.assertEqual(headers.get('Allow'), 'GET, HEAD')

    def test_old_registration_and_completion_bookmarks_reach_input_form(self):
        for prefix in ['/', '/stg/']:
            for source, target in self.redirects.items():
                for alias in [source, source.removesuffix('index.php')]:
                    path = prefix + alias
                    with self.subTest(path=path):
                        for method in ['GET', 'HEAD']:
                            status, headers, _ = self.request(path + '?source=old', method)
                            self.assertEqual(status, 301)
                            destination = urllib.parse.urljoin(self.base + path, headers['Location'])
                            self.assertEqual(destination, self.base + prefix + target + '?source=old')
                            with self.client.open(destination) as response:
                                self.assertEqual(response.status, 200)
                        self.assertEqual(self.request(path, 'POST')[0], 405)
