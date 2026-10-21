#!/usr/bin/env python3
"""Create a new FileZilla upload folder for the PHP staging server."""
import argparse
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
DIRECTORIES = (
    'advance-payment', 'commn', 'company', 'contact', 'css', 'images',
    'introduction', 'js', 'privacy', 'registered', 'service',
    'transportation-expenses', 'web-registered',
)


def prepare(output):
    output = output.expanduser().resolve()
    if output == ROOT or output.is_relative_to(ROOT):
        raise ValueError('アップロード用フォルダは作業ディレクトリの外に指定してください。')
    output.mkdir(parents=True, exist_ok=False)
    for name in ('index.html', 'favicon.ico', '.nojekyll'):
        shutil.copy2(ROOT / name, output / name)
    for name in DIRECTORIES:
        shutil.copytree(ROOT / name, output / name,
                        ignore=shutil.ignore_patterns('.*', '*.md', '*.example.php', '__pycache__', 'template.html'))
    files = sum(path.is_file() for path in output.rglob('*'))
    print(f'FileZilla用ファイル: {files}件 / {output}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT.parent / 'ELEVATE-stg-upload')
    prepare(parser.parse_args().output)
