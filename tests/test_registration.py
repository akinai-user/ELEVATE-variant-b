"""Exercise the PHP endpoint with a fake sendmail executable; no mail leaves the machine."""
import base64
import email
import http.cookiejar
import json
import os
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


class RegistrationFrontendTests(unittest.TestCase):
    @unittest.skipUnless(shutil.which('node'), 'Node is needed for frontend state tests')
    def test_frontend_transitions(self):
        subprocess.run(['node', str(ROOT / 'tests/registration_frontend.cjs')], check=True)

    @unittest.skipUnless(shutil.which('node'), 'Node is needed for frontend state tests')
    def test_other_frontend_transitions(self):
        subprocess.run(['node', str(ROOT / 'tests/mail_form_frontend.cjs')], check=True)


@unittest.skipUnless(shutil.which('php'), 'PHP is needed for registration integration tests')
class RegistrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.directory = Path(cls.temp.name)
        # Test the actual endpoint in an isolated document root, never production config.
        shutil.copy2(ROOT / 'web-registered/submit.php', cls.directory / 'submit.php')
        for directory in ['contact', 'advance-payment', 'transportation-expenses']:
            (cls.directory / directory).mkdir()
            shutil.copy2(ROOT / directory / 'submit.php', cls.directory / directory / 'submit.php')
        (cls.directory / 'commn/php').mkdir(parents=True)
        shutil.copy2(ROOT / 'commn/php/mail-form.php', cls.directory / 'commn/php/mail-form.php')
        capture = cls.directory / 'capture.py'
        capture.write_text('#!/usr/bin/env python3\nimport os, sys\nfrom pathlib import Path\n'
                           'if Path(os.environ["REGISTRATION_TEST_MAIL"] + ".fail").exists(): sys.exit(1)\n'
                           'with Path(os.environ["REGISTRATION_TEST_MAIL"]).open("ab") as out:\n'
                           '    out.write(sys.stdin.buffer.read())\n')
        capture.chmod(0o700)
        cls.mail = cls.directory / 'mail.eml'
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        env = dict(os.environ, ELEVATE_REGISTRATION_TO='registration@example.invalid',
                   ELEVATE_REGISTRATION_FROM='website@example.invalid',
                   REGISTRATION_TEST_MAIL=str(cls.mail))
        for prefix in ['CONTACT', 'ADVANCE', 'TRANSPORTATION']:
            env['ELEVATE_' + prefix + '_TO'] = prefix.lower() + '@example.invalid'
            env['ELEVATE_' + prefix + '_FROM'] = 'website@example.invalid'
        cls.server = subprocess.Popen(['php', '-d', f'sendmail_path={capture}', '-d',
                                       f'session.save_path={cls.directory}', '-d', 'upload_max_filesize=6M',
                                       '-d', 'post_max_size=16M', '-S', f'127.0.0.1:{port}',
                                       '-t', str(cls.directory)], env=env,
                                      stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        cls.url = f'http://127.0.0.1:{port}/submit.php'
        for _ in range(100):
            try:
                urllib.request.urlopen(cls.url, timeout=1).close()
                return
            except (OSError, urllib.error.URLError):
                if cls.server.poll() is not None:
                    raise RuntimeError('PHP test server failed to start')
                time.sleep(.05)
        raise RuntimeError('PHP test server did not become ready')

    @classmethod
    def tearDownClass(cls):
        cls.server.terminate()
        cls.server.wait(timeout=5)
        cls.temp.cleanup()

    def setUp(self):
        self.mail.unlink(missing_ok=True)
        self.client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.token = self.request()[1]['token']
        self.fields = dict(csrf_token=self.token, last_name='登録', first_name='テスト',
                           last_name_kana='トウロク', first_name_kana='テスト', gender='男',
                           birth_year='2000', birth_month='2', birth_day='29', postal_code='5300001',
                           address1='大阪府大阪市', address2='テスト用住所', phone='09000000000',
                           email='applicant@example.invalid', policy_chk='1', **{'commute_method[]': '徒歩'})

    def request(self, fields=None, photo=None, endpoint=None, attachments=None):
        data = None
        headers = {}
        if fields is not None:
            if photo is None and attachments is None:
                data = urllib.parse.urlencode(fields, doseq=True).encode()
            else:
                boundary = 'registrationTestBoundary'
                chunks = []
                for name, value in fields.items():
                    chunks.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode())
                uploads = attachments if attachments is not None else [('face_photo', 'photo.png', photo)]
                for name, filename, content in uploads:
                    chunks.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"; filename="{filename}"\r\nContent-Type: application/octet-stream\r\n\r\n'.encode() + content + b'\r\n')
                chunks.append(f'--{boundary}--\r\n'.encode())
                data = b''.join(chunks)
                headers['Content-Type'] = f'multipart/form-data; boundary={boundary}'
        try:
            target = self.url if endpoint is None else self.url.rsplit('/', 1)[0] + '/' + endpoint + '/submit.php'
            response = self.client.open(urllib.request.Request(target, data=data, headers=headers))
        except urllib.error.HTTPError as error:
            response = error
        with response:
            return response.code, json.load(response)

    def test_csrf_and_validation(self):
        self.assertEqual(self.request({**self.fields, 'csrf_token': 'invalid'})[0], 403)
        self.assertEqual(self.request({**self.fields, 'birth_day': '30'})[0], 422)
        self.assertEqual(self.request({**self.fields, 'email': 'a@example.invalid\r\nBcc: victim@example.invalid'})[0], 422)
        self.assertEqual(self.request({**self.fields, 'policy_chk': '0'})[0], 422)
        self.assertEqual(self.request({**self.fields, 'commute_method[]': ['徒歩', 'other']})[0], 422)
        self.assertEqual(self.request({**self.fields, 'last_name[]': 'array'})[0], 422)

    def test_fake_image_rejected(self):
        self.assertEqual(self.request(self.fields, b'<?php echo "not a picture"; ?>')[0], 422)

    def test_photo_mail_and_idempotent_retry(self):
        image = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jG3sAAAAASUVORK5CYII=')
        self.assertEqual(self.request(self.fields, image), (200, {'ok': True}))
        raw = self.mail.read_bytes()
        message = email.message_from_bytes(raw)
        self.assertEqual(message['To'], 'registration@example.invalid')
        self.assertEqual(message['Reply-To'], 'applicant@example.invalid')
        parts = message.get_payload()
        self.assertIn('登録', parts[0].get_payload(decode=True).decode())
        self.assertEqual(parts[1].get_payload(decode=True), image)
        self.assertEqual(parts[1].get_filename(), 'face-photo.png')
        # Simulate response loss and retry: no second email is generated.
        self.assertEqual(self.request(self.fields, image), (200, {'ok': True}))
        self.assertEqual(self.mail.read_bytes(), raw)
        self.assertEqual(self.request({**self.fields, 'first_name': '別の登録'}, image)[0], 409)
        self.assertNotEqual(self.request()[1]['token'], self.token)

    def test_without_photo(self):
        self.assertEqual(self.request(self.fields), (200, {'ok': True}))

    def test_unconfigured_server(self):
        local = self.directory / 'mail-config.local.php'
        local.write_text("<?php return ['to' => '', 'from' => ''];")
        try:
            self.assertEqual(self.request()[0], 503)
        finally:
            local.unlink()

    def other_form(self, directory):
        token = self.request(endpoint=directory)[1]['token']
        data = dict(csrf_token=token, name='申請テスト', policy_chk='1', message='テスト用の内容')
        if directory == 'contact':
            data.update(company='テスト企業', email='person@example.invalid', email_chk='person@example.invalid', tel='09000000000')
        else:
            data.update(id='00000')
        if directory == 'advance-payment':
            data.update(days='2', email='person@example.invalid', checkbox01='同意する')
        return data

    def test_other_forms_mail_and_retry(self):
        for directory, recipient in [('contact', 'contact'), ('advance-payment', 'advance'), ('transportation-expenses', 'transportation')]:
            with self.subTest(form=directory):
                self.mail.unlink(missing_ok=True)
                data = self.other_form(directory)
                self.assertEqual(self.request(data, endpoint=directory), (200, {'ok': True}))
                raw = self.mail.read_bytes()
                message = email.message_from_bytes(raw)
                self.assertEqual(message['To'], recipient + '@example.invalid')
                self.assertIn('テスト用の内容', message.get_payload()[0].get_payload(decode=True).decode())
                self.assertEqual(message['Reply-To'], None if directory == 'transportation-expenses' else 'person@example.invalid')
                self.assertEqual(self.request(data, endpoint=directory), (200, {'ok': True}))
                self.assertEqual(self.mail.read_bytes(), raw)
                self.assertEqual(self.request({**data, 'message': '別の申請'}, endpoint=directory)[0], 409)

    def test_other_form_validation_and_isolation(self):
        contact = self.other_form('contact')
        advance = self.other_form('advance-payment')
        transportation = self.other_form('transportation-expenses')
        self.assertEqual(self.request({**contact, 'email_chk': 'wrong@example.invalid'}, endpoint='contact')[0], 422)
        self.assertEqual(self.request({**contact, 'email': 'x@example.invalid\r\nBcc:x@example.invalid'}, endpoint='contact')[0], 422)
        self.assertEqual(self.request({**advance, 'csrf_token': contact['csrf_token']}, endpoint='advance-payment')[0], 403)
        for days in ['0', '-1', '1.5']:
            self.assertEqual(self.request({**advance, 'days': days}, endpoint='advance-payment')[0], 422)
        self.assertEqual(self.request({**advance, 'checkbox01': ''}, endpoint='advance-payment')[0], 422)
        self.assertEqual(self.request({**transportation, 'policy_chk': '0'}, endpoint='transportation-expenses')[0], 422)
        self.assertEqual(self.request({**transportation, 'message': '   '}, endpoint='transportation-expenses')[0], 422)
        self.assertEqual(self.request({**contact, 'name[]': 'array'}, endpoint='contact')[0], 422)
        self.assertFalse(self.mail.exists())

    def test_advance_two_attachments_and_limits(self):
        data = self.other_form('advance-payment')
        image = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jG3sAAAAASUVORK5CYII=')
        pdf = b'%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF'
        self.assertEqual(self.request(data, endpoint='advance-payment', attachments=[('attachment1', 'proof.pdf', b'fake PDF')])[0], 422)
        self.assertEqual(self.request(data, endpoint='advance-payment', attachments=[('attachment1', 'proof.png', image + b'x' * (5 * 1024 * 1024))])[0], 422)
        self.assertEqual(self.request(data, endpoint='advance-payment', attachments=[('attachment1', 'proof.png', image), ('attachment2', 'proof.pdf', pdf)]), (200, {'ok': True}))
        parts = email.message_from_bytes(self.mail.read_bytes()).get_payload()
        self.assertEqual(len(parts), 3)
        self.assertEqual(parts[1].get_payload(decode=True), image)
        self.assertEqual(parts[2].get_payload(decode=True), pdf)

    def test_other_form_transport_failure(self):
        data = self.other_form('contact')
        flag = Path(str(self.mail) + '.fail')
        flag.touch()
        try:
            self.assertEqual(self.request(data, endpoint='contact')[0], 502)
            self.assertEqual(self.request(data, endpoint='contact')[0], 429)
            self.assertFalse(self.mail.exists())
        finally:
            flag.unlink()


if __name__ == '__main__':
    unittest.main()
