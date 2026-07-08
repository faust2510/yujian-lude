import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { parseEpub } from './textbook-epub.js';

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'ignore' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited ${code}`));
    });
  });
}

async function writeFixture(root) {
  await mkdir(path.join(root, 'META-INF'), { recursive: true });
  await mkdir(path.join(root, 'OEBPS'), { recursive: true });
  await writeFile(path.join(root, 'mimetype'), 'application/epub+zip');
  await writeFile(path.join(root, 'META-INF/container.xml'), `<?xml version="1.0"?>
<container>
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);
  await writeFile(path.join(root, 'OEBPS/content.opf'), `<?xml version="1.0"?>
<package>
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Fixture Book</dc:title>
    <dc:creator>Fixture Author</dc:creator>
    <dc:description>Fixture Description</dc:description>
  </metadata>
  <manifest>
    <item id="toc" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="c1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
    <item id="c1b" href="chapter1b.xhtml" media-type="application/xhtml+xml"/>
    <item id="c2" href="chapter2.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine toc="toc">
    <itemref idref="c1"/>
    <itemref idref="c1b"/>
    <itemref idref="c2"/>
  </spine>
</package>`);
  await writeFile(path.join(root, 'OEBPS/toc.ncx'), `<?xml version="1.0"?>
<ncx>
  <navMap>
    <navPoint><navLabel><text>Chapter One</text></navLabel><content src="chapter1.xhtml"/></navPoint>
    <navPoint><navLabel><text>Chapter Two</text></navLabel><content src="chapter2.xhtml"/></navPoint>
  </navMap>
</ncx>`);
  await writeFile(path.join(root, 'OEBPS/chapter1.xhtml'), '<html><body><h1 onclick="x()">Ignored</h1><script>bad()</script><p>Alpha beta</p></body></html>');
  await writeFile(path.join(root, 'OEBPS/chapter1b.xhtml'), '<html><body><p>Split continuation</p></body></html>');
  await writeFile(path.join(root, 'OEBPS/chapter2.xhtml'), '<html><body><h1>Second</h1><p>Gamma delta</p></body></html>');
}

test('parseEpub reads metadata, spine order, toc titles, and sanitized chapters', async (t) => {
  if (!existsSync('/usr/bin/zip')) {
    t.skip('zip command unavailable');
    return;
  }

  const tmp = await mkdtemp(path.join(os.tmpdir(), 'textbook-epub-'));
  t.after(() => rm(tmp, { recursive: true, force: true }));
  await writeFixture(tmp);
  await run('/usr/bin/zip', ['-q', '-r', 'fixture.epub', 'mimetype', 'META-INF', 'OEBPS'], tmp);

  const book = await parseEpub(path.join(tmp, 'fixture.epub'));

  assert.equal(book.title, 'Fixture Book');
  assert.equal(book.author, 'Fixture Author');
  assert.equal(book.description, 'Fixture Description');
  assert.equal(book.chapters.length, 2);
  assert.equal(book.chapters[0].chapterIndex, 1);
  assert.equal(book.chapters[0].title, 'Chapter One');
  assert.equal(book.chapters[0].sourceHref, 'chapter1.xhtml');
  assert.match(book.chapters[0].bodyHtml, /<p>Alpha beta<\/p>/);
  assert.match(book.chapters[0].bodyHtml, /<p>Split continuation<\/p>/);
  assert.doesNotMatch(book.chapters[0].bodyHtml, /script|onclick/i);
});
