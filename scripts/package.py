"""Build portable ZIP files from an explicit source allowlist. Python 3.10+, stdlib only."""
from pathlib import Path
import hashlib
import json
import zipfile

ROOT = Path(__file__).resolve().parents[1]
VERSION = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))['version']
DIST = ROOT / 'dist'
DIST.mkdir(exist_ok=True)


def archive(name, entries):
    target = DIST / name
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as output:
        for source, path in sorted(entries, key=lambda item: item[1]):
            if source.is_symlink() or not source.resolve().is_relative_to(ROOT):
                raise ValueError(f'Refusing external or symlink source: {source}')
            # Fixed timestamp and permissions make repeated builds comparable.
            info = zipfile.ZipInfo(path, date_time=(2026, 11, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            output.writestr(info, source.read_bytes())
    with zipfile.ZipFile(target) as check:
        if check.testzip() is not None:
            raise ValueError(f'Invalid archive: {target}')
    return target


plugin = ROOT / 'plugins' / 'tokenloom'
plugin_files = [(p, p.relative_to(plugin).as_posix()) for p in plugin.rglob('*') if p.is_file()]
plugin_files.append((ROOT / 'LICENSE', 'LICENSE'))
archives = [archive(f'tokenloom-chatgpt-v{VERSION}.zip', plugin_files)]
skill = plugin / 'skills' / 'tokenloom' / 'SKILL.md'
archives.append(archive(f'tokenloom-codex-skill-v{VERSION}.zip', [
    (skill, 'tokenloom/SKILL.md'), (ROOT / 'LICENSE', 'tokenloom/LICENSE')
]))

files = [ROOT / name for name in (
    'README.md', 'README.en.md', 'LICENSE', 'NOTICE.md', 'SECURITY.md',
    'CONTRIBUTING.md', '.gitignore', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml'
)]
for name in ('src', 'scripts', 'tests', 'docs', 'integrations', 'plugins', 'benchmarks', '.agents', '.github'):
    files.extend(p for p in (ROOT / name).rglob('*') if p.is_file() and '__pycache__' not in p.parts)
archives.append(archive(f'tokenloom-source-v{VERSION}.zip', [
    (p, f'tokenloom/{p.relative_to(ROOT).as_posix()}') for p in files
]))
checksums = ''.join(f'{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.name}\n' for p in archives)
(DIST / 'SHA256SUMS.txt').write_text(checksums, encoding='utf-8')
print(checksums, end='')
