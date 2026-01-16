import axios from 'axios';
import * as cheerio from 'cheerio';
import { NodeHtmlMarkdown } from 'node-html-markdown';
import { getDatabase } from './database';
import { refreshAllFeeds } from './feedService';

const CONFIG = {
  // Refresh interval in milliseconds (default: 3 minutes)
  refreshInterval: parseInt(process.env.RSS_REFRESH_INTERVAL || '180000'),
  // Delay between article fetches
  delayBetweenRequests: 1000,
  // Request timeout
  timeout: 10000,
};

let schedulerInterval: NodeJS.Timeout | null = null;
let isRunning = false;

/**
 * Extract content from HTML (no AI)
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

/**
 * Fetch article content (HTML only, no AI)
 */
async function fetchArticleContentHtml(url: string, title: string): Promise<string> {
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

    const content = extractContentFromHtml(response.data);

    if (!content || content.length < 50) {
      return '';
    }

    return content;
  } catch (error) {
    console.error(`    [Scheduler] Fetch error for "${title.substring(0, 30)}...": ${(error as Error).message}`);
    return '';
  }
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch content for articles without content
 */
async function fetchMissingContent(): Promise<{ updated: number; failed: number }> {
  const db = getDatabase();

  // Get articles without HTML content (newest first)
  const articles = db.prepare(`
    SELECT id, title, link
    FROM articles
    WHERE (content_html IS NULL OR content_html = '')
    ORDER BY published_at DESC
  `).all() as Array<{
    id: number;
    title: string;
    link: string;
  }>;

  if (articles.length === 0) {
    return { updated: 0, failed: 0 };
  }

  console.log(`[Scheduler] Fetching content for ${articles.length} articles...`);

  let updated = 0;
  let failed = 0;

  const updateContent = db.prepare(`
    UPDATE articles
    SET content_html = ?, updated_at = datetime('now')
    WHERE id = ?
  `);

  for (const article of articles) {
    try {
      const content = await fetchArticleContentHtml(article.link, article.title);

      if (content && content.length >= 50) {
        updateContent.run(content, article.id);
        updated++;
        console.log(`    [OK] ${article.title.substring(0, 40)}...`);
      } else {
        // Mark as empty to avoid re-fetching
        updateContent.run('', article.id);
        failed++;
      }

      await sleep(CONFIG.delayBetweenRequests);
    } catch (error) {
      failed++;
    }
  }

  return { updated, failed };
}

/**
 * Run one scheduler cycle
 */
async function runCycle(): Promise<void> {
  if (isRunning) {
    console.log('[Scheduler] Previous cycle still running, skipping...');
    return;
  }

  isRunning = true;
  const startTime = Date.now();

  try {
    console.log('');
    console.log('='.repeat(50));
    console.log(`[Scheduler] Starting cycle at ${new Date().toLocaleTimeString('ja-JP')}`);
    console.log('='.repeat(50));

    // Step 1: Refresh all RSS feeds
    console.log('[Scheduler] Step 1: Refreshing RSS feeds...');
    const feedResult = await refreshAllFeeds();
    console.log(`[Scheduler] Feeds: ${feedResult.success} success, ${feedResult.failed} failed, ${feedResult.newArticles} new`);

    // Step 2: Fetch content for new articles
    console.log('[Scheduler] Step 2: Fetching article content (HTML)...');
    const contentResult = await fetchMissingContent();
    console.log(`[Scheduler] Content: ${contentResult.updated} updated, ${contentResult.failed} failed`);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[Scheduler] Cycle complete in ${elapsed}s`);
    console.log('='.repeat(50));
  } catch (error) {
    console.error('[Scheduler] Error:', (error as Error).message);
  } finally {
    isRunning = false;
  }
}

/**
 * Start the background scheduler
 */
export function startScheduler(): void {
  if (schedulerInterval) {
    console.log('[Scheduler] Already running');
    return;
  }

  const intervalMinutes = CONFIG.refreshInterval / 60000;
  console.log(`[Scheduler] Starting with ${intervalMinutes} minute interval`);

  // Run immediately on start
  runCycle();

  // Then run periodically
  schedulerInterval = setInterval(runCycle, CONFIG.refreshInterval);
}

/**
 * Stop the background scheduler
 */
export function stopScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('[Scheduler] Stopped');
  }
}

/**
 * Check if scheduler is running
 */
export function isSchedulerRunning(): boolean {
  return schedulerInterval !== null;
}

/**
 * Manually trigger a cycle
 */
export async function triggerCycle(): Promise<void> {
  await runCycle();
}
