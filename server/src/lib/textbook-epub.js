import { access } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { sanitizeChapterHtml, htmlToText, countWords } from './textbook-html.js';

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.trim() || `${command} exited ${code}`));
    });
  });
}

function decodeXml(value = '') {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'");
}

function firstText(xml, tagName) {
  const escaped = tagName.replace(':', '\\:');
  const match = xml.match(new RegExp(`<${escaped}\\b[^>]*>([\\s\\S]*?)<\\/${escaped}>`, 'i'));
  return match ? decodeXml(match[1].replace(/<[^>]+>/g, '').trim()) : '';
}

function attrs(source = '') {
  const out = {};
  for (const match of source.matchAll(/([A-Za-z0-9:_-]+)=["']([^"']*)["']/g)) {
    out[match[1]] = decodeXml(match[2]);
  }
  return out;
}

function itemTags(xml, tagName) {
  return [...xml.matchAll(new RegExp(`<${tagName}\\b([^>]*)\\/?>`, 'gi'))].map((match) => attrs(match[1]));
}

function joinZipPath(baseFile, href) {
  const baseDir = path.posix.dirname(baseFile);
  return path.posix.normalize(baseDir === '.' ? href : path.posix.join(baseDir, href));
}

function stripFragment(href = '') {
  return href.split('#')[0];
}

function tocEntries(ncx = '') {
  const entries = [];
  for (const match of ncx.matchAll(/<navPoint\b[^>]*>([\s\S]*?)<\/navPoint>/gi)) {
    const block = match[1];
    const title = firstText(block, 'text');
    const content = block.match(/<content\b([^>]*)\/?>/i);
    const src = content ? stripFragment(attrs(content[1]).src || '') : '';
    if (title && src) entries.push({ title, src });
  }
  return entries;
}

function fallbackTitle(html, index) {
  const match = html.match(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/i);
  const text = match ? htmlToText(match[1]) : '';
  return text || `第 ${index} 章`;
}

export async function parseEpub(filePath) {
  await access(filePath);
  const container = await run('/usr/bin/unzip', ['-p', filePath, 'META-INF/container.xml']);
  const rootfile = container.match(/<rootfile\b([^>]*)\/?>/i);
  if (!rootfile) throw new Error('EPUB 缺少 rootfile');

  const opfPath = attrs(rootfile[1])['full-path'];
  if (!opfPath) throw new Error('EPUB rootfile 缺少 full-path');

  const opf = await run('/usr/bin/unzip', ['-p', filePath, opfPath]);
  const manifest = new Map(itemTags(opf, 'item').map((item) => [item.id, item]));
  const spine = itemTags(opf, 'itemref').map((item) => item.idref).filter(Boolean);
  const ncxItem = [...manifest.values()].find((item) => item['media-type'] === 'application/x-dtbncx+xml' || item.id === 'toc');
  let navEntries = [];
  if (ncxItem?.href) {
    try {
      const ncx = await run('/usr/bin/unzip', ['-p', filePath, joinZipPath(opfPath, ncxItem.href)]);
      navEntries = tocEntries(ncx);
    } catch {
      navEntries = [];
    }
  }

  const sections = [];
  for (const idref of spine) {
    const item = manifest.get(idref);
    if (!item?.href || !/xhtml|html/i.test(item['media-type'] || '')) continue;
    const sourceHref = item.href;
    const zipPath = joinZipPath(opfPath, sourceHref);
    const raw = await run('/usr/bin/unzip', ['-p', filePath, zipPath]);
    const bodyHtml = sanitizeChapterHtml(raw);
    const bodyText = htmlToText(bodyHtml);
    if (!bodyText) continue;
    sections.push({ raw, bodyHtml, bodyText, sourceHref });
  }

  const starts = navEntries
    .map((entry) => ({
      ...entry,
      sectionIndex: sections.findIndex((section) => (
        section.sourceHref === entry.src || joinZipPath(opfPath, section.sourceHref) === entry.src
      )),
    }))
    .filter((entry) => entry.sectionIndex >= 0)
    .sort((a, b) => a.sectionIndex - b.sectionIndex)
    .filter((entry, index, all) => index === 0 || entry.sectionIndex !== all[index - 1].sectionIndex);

  const chapters = [];
  if (starts.length > 0) {
    for (const [index, entry] of starts.entries()) {
      const end = starts[index + 1]?.sectionIndex ?? sections.length;
      const chunk = sections.slice(entry.sectionIndex, end);
      const bodyText = chunk.map((section) => section.bodyText).join(' ').trim();
      if (!bodyText) continue;
      chapters.push({
        chapterIndex: chapters.length + 1,
        title: entry.title,
        bodyHtml: chunk.map((section) => section.bodyHtml).join('\n'),
        bodyText,
        sourceHref: chunk[0].sourceHref,
        wordCount: countWords(bodyText),
      });
    }
  } else {
    for (const section of sections) {
      const chapterIndex = chapters.length + 1;
      chapters.push({
        chapterIndex,
        title: fallbackTitle(section.raw, chapterIndex),
        bodyHtml: section.bodyHtml,
        bodyText: section.bodyText,
        sourceHref: section.sourceHref,
        wordCount: countWords(section.bodyText),
      });
    }
  }

  return {
    title: firstText(opf, 'dc:title') || path.basename(filePath, path.extname(filePath)),
    author: [...opf.matchAll(/<dc:creator\b[^>]*>([\s\S]*?)<\/dc:creator>/gi)]
      .map((match) => decodeXml(match[1].replace(/<[^>]+>/g, '').trim()))
      .filter(Boolean)
      .join('、'),
    description: firstText(opf, 'dc:description'),
    chapters,
  };
}
