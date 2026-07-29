import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export function requireSearchablePdfText(value) {
  const text = String(value || '').replace(/\r\n?/g, '\n').replace(/\n{2,}/g, '\n').trim();
  if (text.length < 20) throw new Error('PDF 未包含可搜索文字；请上传可搜索版本，扫描版暂不支持');
  return { text };
}

export async function extractSearchablePdf(filePath) {
  try {
    const { stdout } = await execFileAsync('pdftotext', ['-layout', filePath, '-'], { maxBuffer: 8 * 1024 * 1024 });
    return requireSearchablePdfText(stdout);
  } catch (error) {
    if (/可搜索文字/.test(error?.message || '')) throw error;
    throw new Error('PDF 无法读取；请上传未加密、可搜索文字的 PDF');
  }
}
