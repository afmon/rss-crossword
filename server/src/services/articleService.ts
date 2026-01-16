import axios from 'axios';
import * as cheerio from 'cheerio';
import { NodeHtmlMarkdown } from 'node-html-markdown';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getDatabase } from './database';

const CONFIG = {
  baseDelay: 1000,        // 基本ウェイト（1秒）
  maxDelay: 10000,        // 最大ウェイト（10秒）
  fastPhaseCount: 100,    // 高速処理する件数
  timeout: 10000,
};

/**
 * Calculate delay based on request index (adaptive rate limiting)
 */
function calculateDelay(index: number): number {
  if (index < CONFIG.fastPhaseCount) {
    return CONFIG.baseDelay;
  }
  // 100件以降は徐々に増加（最大10秒）
  const extra = Math.min(
    (index - CONFIG.fastPhaseCount) * 100,
    CONFIG.maxDelay - CONFIG.baseDelay
  );
  return CONFIG.baseDelay + extra;
}

/**
 * Extract content from HTML using generic selectors
 */
function extractContentFromHtml(html: string): string {
  const $ = cheerio.load(html);

  // Remove unwanted elements
  $('script, style, nav, header, footer, aside, form, iframe, noscript, svg, [role="navigation"], [role="banner"], [role="contentinfo"], .ad, .advertisement, .social-share, .related-articles, .comments').remove();

  // Try to find main content
  let contentHtml = '';
  const selectors = [
    'article',
    'main',
    '[role="main"]',
    '.article-body',
    '.entry-content',
    '.post-content',
    '.news-body',
    '.story-body',
    '#article-body',
    '#main-content'
  ];

  for (const selector of selectors) {
    const el = $(selector);
    if (el.length > 0 && el.text().trim().length > 100) {
      contentHtml = el.html() || '';
      break;
    }
  }

  // Fallback: get all paragraphs
  if (!contentHtml) {
    const paragraphs = $('body p').map((_, el) => $.html(el)).get().join('');
    if (paragraphs.length > 100) {
      contentHtml = paragraphs;
    }
  }

  // Last resort: body content
  if (!contentHtml) {
    contentHtml = $('body').html() || '';
  }

  // Convert to Markdown
  const markdown = NodeHtmlMarkdown.translate(contentHtml);

  return markdown
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s+|\s+$/g, '');
}

const INPUT_LIMIT = 15000;

/**
 * Refine content using Claude Haiku
 */
async function refineContentWithHaiku(rawContent: string, title: string): Promise<{
  content: string;
  isTruncated: boolean;
}> {
  if (!rawContent || rawContent.length < 50) {
    return { content: '', isTruncated: false };
  }

  const isTruncated = rawContent.length > INPUT_LIMIT;

  const prompt = `以下は「${title}」という記事から抽出したテキストです。
記事の本文部分のみを完全に抽出してください。要約せず、元の内容をそのまま出力してください。
広告、ナビゲーション、関連記事、著作権表示、サイト内リンクなどは除外してください。
本文が見つからない場合は「本文なし」と出力してください。

---
${rawContent.substring(0, INPUT_LIMIT)}
---

記事本文:`;

  try {
    const tempFile = path.join(os.tmpdir(), `article-prompt-${Date.now()}.txt`);
    fs.writeFileSync(tempFile, prompt, 'utf8');

    const command = `type "${tempFile}" | claude -p --model haiku --permission-mode default --output-format text`;

    const stdout = execSync(command, {
      encoding: 'utf8',
      timeout: 30000,
      shell: true as unknown as string,
      maxBuffer: 10 * 1024 * 1024
    });

    try { fs.unlinkSync(tempFile); } catch {}

    const result = stdout.trim();

    if (result.includes('本文なし') || result.length < 20) {
      return { content: '', isTruncated: false };
    }

    return { content: result, isTruncated };
  } catch (error) {
    console.error(`    [Haiku] Error: ${(error as Error).message}`);
    return { content: '', isTruncated: false };
  }
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch article content from URL
 */
export async function fetchArticleContent(url: string, title: string): Promise<{
  content: string;
  isTruncated: boolean;
}> {
  try {
    const response = await axios.get(url, {
      timeout: CONFIG.timeout,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8'
      },
      maxRedirects: 5
    });

    const rawContent = extractContentFromHtml(response.data);

    if (!rawContent || rawContent.length < 50) {
      console.log(`    [Article] No content: ${title.substring(0, 30)}...`);
      return { content: '', isTruncated: false };
    }

    console.log(`    [Haiku] Processing: ${title.substring(0, 30)}...`);
    return await refineContentWithHaiku(rawContent, title);
  } catch (error) {
    console.error(`    [Article] Fetch error: ${(error as Error).message}`);
    return { content: '', isTruncated: false };
  }
}

/**
 * Fetch and update content for multiple articles
 */
export async function fetchArticlesContent(articleIds: number[]): Promise<{
  updated: number;
  failed: number;
}> {
  const db = getDatabase();

  const articles = db.prepare(`
    SELECT id, title, link, content
    FROM articles
    WHERE id IN (${articleIds.map(() => '?').join(',')})
  `).all(...articleIds) as Array<{
    id: number;
    title: string;
    link: string;
    content: string | null;
  }>;

  console.log(`  [Articles] Fetching content for ${articles.length} articles...`);

  let updated = 0;
  let failed = 0;

  const updateContent = db.prepare(`
    UPDATE articles
    SET content = ?, is_ai_processed = 1, is_content_truncated = ?, updated_at = datetime('now')
    WHERE id = ?
  `);

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    try {
      const result = await fetchArticleContent(article.link, article.title);

      if (result.content) {
        updateContent.run(result.content, result.isTruncated ? 1 : 0, article.id);
        updated++;
      } else {
        failed++;
      }

      // Adaptive rate limiting
      const delay = calculateDelay(i);
      await sleep(delay);
    } catch (error) {
      console.error(`    [Article] Error: ${(error as Error).message}`);
      failed++;
    }
  }

  console.log(`  [Articles] Complete: ${updated} updated, ${failed} failed`);

  return { updated, failed };
}

/**
 * Get articles with content for crossword generation
 */
export function getArticlesWithContent(options: {
  feedIds?: number[];
  days?: number;
  limit?: number;
}): Array<{ id: number; title: string; link: string; content: string }> {
  const db = getDatabase();
  const { feedIds, days = 7, limit = 50 } = options;

  let sql = `
    SELECT id, title, link, COALESCE(content, content_html) as content
    FROM articles
    WHERE ((content IS NOT NULL AND content != '')
       OR (content_html IS NOT NULL AND content_html != ''))
      AND fetched_at >= datetime('now', '-' || ? || ' days')
  `;
  const params: (number | string)[] = [days];

  if (feedIds && feedIds.length > 0) {
    sql += ` AND feed_id IN (${feedIds.map(() => '?').join(',')})`;
    params.push(...feedIds);
  }

  sql += ` ORDER BY published_at DESC LIMIT ?`;
  params.push(limit);

  return db.prepare(sql).all(...params) as Array<{
    id: number;
    title: string;
    link: string;
    content: string;
  }>;
}
