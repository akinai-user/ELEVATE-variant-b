"""Validate the release draft on an isolated local Apache, never production."""
import getpass
import grp
import json
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import time
import unittest
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
PLAN = json.loads((ROOT / 'config/release/url-map.json').read_text())


class ReleasePlanTests(unittest.TestCase):
    def test_main_pages_and_sitemap_match(self):
        pages = [route for route in PLAN['routes'] if 'new_file' in route]
        sitemap = ET.parse(ROOT / 'config/release/sitemap.xml.example')
        urls = [node.text for node in sitemap.findall('.//{*}loc')]
        self.assertEqual(set(urls), {PLAN['production_origin'] + page['new_url'] for page in pages})
        self.assertEqual(len(urls), len(set(urls)))
        for page in pages:
            self.assertTrue((ROOT / page['new_file']).is_file(), page['new_file'])
        self.assertFalse(any('/stg/' in url or 'thanks' in url for url in urls))


@unittest.skipUnless(Path('/usr/sbin/httpd').exists() and Path('/usr/libexec/apache2/mod_rewrite.so').exists(),
                     'Local macOS Apache is required for actual redirect tests')
class ApacheRedirectTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix='elevate-release-test-')
        directory = Path(cls.temp.name)
        document_root = directory / 'site'
        document_root.mkdir()
        for route in PLAN['routes']:
            if 'new_file' in route:
                page = document_root / route['new_file']
                page.parent.mkdir(parents=True, exist_ok=True)
                page.write_text('NEW PAGE')
                page.with_suffix('.php').write_text('OLD PAGE')
        for name in ['lp/index.php', 'lp2/index.php', 'human-register/index.php',
                     'commn/php/note-voices.php', 'contact/submit.php', 'stg/index.html']:
            path = document_root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text('PRESERVED')
        shutil.copy2(ROOT / 'config/release/apache-redirects.conf.example', document_root / '.htaccess')
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        modules = ['mpm_prefork', 'unixd', 'authz_core', 'authz_host', 'dir', 'mime', 'rewrite']
        config = [f'ServerRoot "{directory}"', f'PidFile "{directory}/httpd.pid"',
                  f'DefaultRuntimeDir "{directory}"', f'Listen 127.0.0.1:{port}',
                  'ServerName elevate-works.jp', f'ErrorLog "{directory}/error.log"']
        config += [f'LoadModule {name}_module /usr/libexec/apache2/mod_{name}.so' for name in modules]
        config += [f'User {getpass.getuser()}', f'Group {grp.getgrgid(directory.stat().st_gid).gr_name}',
                   'TypesConfig /etc/apache2/mime.types', f'DocumentRoot "{document_root}"',
                   f'<Directory "{document_root}">', 'AllowOverride All', 'Require all granted', '</Directory>']
        conf = directory / 'httpd.conf'
        conf.write_text('\n'.join(config) + '\n')
        subprocess.run(['/usr/sbin/httpd', '-t', '-f', str(conf)], check=True, capture_output=True)
        cls.server = subprocess.Popen(['/usr/sbin/httpd', '-f', str(conf), '-DFOREGROUND'],
                                      stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
                                      start_new_session=True)
        cls.base = f'http://127.0.0.1:{port}'
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, *args, **kwargs):
                return None
        cls.client = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
        for _ in range(100):
            if cls.server.poll() is not None:
                raise RuntimeError(cls.server.stderr.read().decode() + (directory / 'error.log').read_text())
            try:
                status, _ = cls.request('/')
                if status == 200:
                    return
            except OSError:
                pass
            time.sleep(.03)
        raise RuntimeError((directory / 'error.log').read_text())

    @classmethod
    def tearDownClass(cls):
        cls.server.terminate()
        cls.server.wait(timeout=5)
        cls.server.stderr.close()
        cls.temp.cleanup()

    @classmethod
    def request(cls, path, method='GET', host='elevate-works.jp'):
        request = urllib.request.Request(cls.base + path, method=method, headers={'Host': host})
        try:
            response = cls.client.open(request, timeout=3)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            return response.status, response.headers.get('Location')

    def test_main_pages_keep_urls_and_index_aliases_redirect(self):
        for route in PLAN['routes']:
            if 'new_file' not in route:
                continue
            with self.subTest(url=route['new_url']):
                self.assertEqual(self.request(route['new_url'])[0], 200)
                target = PLAN['production_origin'] + route['new_url']
                for alias in route['explicit_index_aliases']:
                    self.assertEqual(self.request(alias), (301, target))
                    self.assertEqual(self.request(alias + '?source=old')[1], target + '?source=old')
                if route['new_url'] != '/':
                    self.assertEqual(self.request(route['new_url'].rstrip('/')), (301, target))

    def test_legacy_routes_and_head(self):
        for route in PLAN['routes']:
            if route['action'] != 'redirect_get_head_301':
                continue
            target = PLAN['production_origin'] + route['new_url']
            for alias in [route['old_url']] + ([route['old_index_alias']] if 'old_index_alias' in route else []):
                self.assertEqual(self.request(alias), (301, target))
                self.assertEqual(self.request(alias, method='HEAD'), (301, target))

    def test_apis_lps_staging_and_pending_form_are_not_redirected(self):
        for path in ['/lp/index.php', '/lp2/index.php', '/human-register/',
                     '/commn/php/note-voices.php', '/contact/submit.php', '/stg/index.html']:
            with self.subTest(path=path):
                self.assertEqual(self.request(path)[0], 200)
        self.assertNotEqual(self.request('/contact/index.php', method='POST')[0], 301)
        self.assertEqual(self.request('/unknown-page')[0], 404)
        self.assertNotEqual(self.request('/index.php', host='unrelated.invalid')[0], 301)

    def test_host_normalization(self):
        for host in ['www.elevate-works.jp', 'accorl.jp', 'www.accorl.jp']:
            self.assertEqual(self.request('/company/?a=1', host=host),
                             (301, 'https://elevate-works.jp/company/?a=1'))
