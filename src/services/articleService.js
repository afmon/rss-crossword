const axios = require('axios');
const cheerio = require('cheerio');
const { NodeHtmlMarkdown } = require('node-html-markdown');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const CONFIG = {
  delayBetweenRequests: 1000,  // 1秒間隔
  maxContentLength: 500,       // Haiku整形後の最大文字数
  timeout: 10000,              // 10秒タイムアウト
  cacheExpireDays: 7,          // キャッシュ有効期限（7日）
};

// Cache file path
const CACHE_FILE = path.join(__dirname, '../../data/article-cache.json');

// In-memory cache
let articleCache = new Map();

/**
 * Load cache from file
 */
function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      const now = Date.now();
      const expireMs = CONFIG.cacheExpireDays * 24 * 60 * 60 * 1000;

      // Filter out expired entries
      for (const [url, entry] of Object.entries(data)) {
        if (now - entry.timestamp < expireMs) {
          articleCache.set(url, entry);
        }
      }
      console.log(`  [Cache] Loaded ${articleCache.size} cached articles`);
    }
  } catch (e) {
    console.error('  [Cache] Failed to load cache:', e.message);
  }
}

/**
 * Save cache to file
 */
function saveCache() {
  try {
    const data = Object.fromEntries(articleCache);
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('  [Cache] Failed to save cache:', e.message);
  }
}

// Load cache on startup
loadCache();

/**
 * Sleep for specified milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Extract content from HTML using generic selectors (site-independent)
 * @param {string} html - Raw HTML
 * @returns {string} - Markdown content
 */
function extractContentFromHtml(html) {
  const $ = cheerio.load(html);

  // Remove unwanted elements
  $('script, style, nav, header, footer, aside, form, iframe, noscript, svg, [role="navigation"], [role="banner"], [role="contentinfo"], .ad, .advertisement, .social-share, .related-articles, .comments').remove();

  // Try to find main content using common selectors
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
      contentHtml = el.html();
      break;
    }
  }

  // Fallback: get all paragraphs from body
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

  // Clean up excessive whitespace
  return markdown
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s+|\s+$/g, '')
    .substring(0, 5000); // Limit for Haiku processing
}

/**
 * Refine content using Claude Haiku
 * @param {string} rawContent - Raw markdown content
 * @param {string} title - Article title
 * @returns {Promise<string>} - Refined content
 */
async function refineContentWithHaiku(rawContent, title) {
  if (!rawContent || rawContent.length < 50) {
    return '';
  }

  const prompt = `以下は「${title}」という記事から抽出したテキストです。
記事の本文部分のみを抽出して、${CONFIG.maxContentLength}文字以内で要約してください。
広告、ナビゲーション、関連記事、著作権表示などは除外してください。
本文が見つからない場合は「本文なし」と出力してください。

---
${rawContent.substring(0, 4000)}
---

記事本文の要約:`;

  try {
    const tempFile = path.join(require('os').tmpdir(), `article-prompt-${Date.now()}.txt`);
    fs.writeFileSync(tempFile, prompt, 'utf8');

    const command = `type "${tempFile}" | claude -p --model haiku --permission-mode default --output-format text`;

    const stdout = execSync(command, {
      encoding: 'utf8',
      timeout: 30000,
      shell: true,
      maxBuffer: 10 * 1024 * 1024
    });

    try { fs.unlinkSync(tempFile); } catch (e) {}

    const result = stdout.trim();

    // Check if content was found
    if (result.includes('本文なし') || result.length < 20) {
      return '';
    }

    return result.substring(0, CONFIG.maxContentLength);
  } catch (error) {
    console.error(`    [Haiku] Error: ${error.message}`);
    return '';
  }
}

/**
 * Fetch article content from URL
 * @param {string} url - Article URL
 * @param {string} title - Article title (for Haiku)
 * @returns {Promise<string>} - Article content
 */
async function fetchArticleContent(url, title) {
  // Check cache first
  if (articleCache.has(url)) {
    const cached = articleCache.get(url);
    console.log(`    [Cache] Hit: ${title.substring(0, 30)}...`);
    return cached.content;
  }

  try {
    // Fetch HTML
    const response = await axios.get(url, {
      timeout: CONFIG.timeout,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8'
      },
      maxRedirects: 5
    });

    // Extract content from HTML
    const rawContent = extractContentFromHtml(response.data);

    if (!rawContent || rawContent.length < 50) {
      console.log(`    [Article] No content: ${title.substring(0, 30)}...`);
      return '';
    }

    // Refine with Haiku
    console.log(`    [Haiku] Processing: ${title.substring(0, 30)}...`);
    const refinedContent = await refineContentWithHaiku(rawContent, title);

    // Cache the result
    if (refinedContent) {
      articleCache.set(url, {
        content: refinedContent,
        title: title,
        timestamp: Date.now()
      });
      saveCache();
    }

    return refinedContent;
  } catch (error) {
    console.error(`    [Article] Fetch error: ${error.message}`);
    return '';
  }
}

/**
 * Fetch content for multiple articles with rate limiting
 * @param {Array<{title: string, link: string}>} newsItems - News items from RSS
 * @returns {Promise<Array<{title: string, link: string, content: string}>>}
 */
async function fetchArticlesWithContent(newsItems) {
  console.log(`  [Articles] Fetching content for ${newsItems.length} articles...`);

  const results = [];
  let fetchedCount = 0;
  let cachedCount = 0;

  for (let i = 0; i < newsItems.length; i++) {
    const item = newsItems[i];

    // Check if cached (for counting)
    const isCached = articleCache.has(item.link);
    if (isCached) cachedCount++;

    const content = await fetchArticleContent(item.link, item.title);

    results.push({
      ...item,
      content: content || ''
    });

    if (content && !isCached) {
      fetchedCount++;
    }

    // Rate limiting: wait between requests (skip if cached)
    if (i < newsItems.length - 1 && !isCached) {
      await sleep(CONFIG.delayBetweenRequests);
    }
  }

  const withContent = results.filter(r => r.content.length > 0);
  console.log(`  [Articles] Complete: ${withContent.length}/${results.length} with content (${cachedCount} cached, ${fetchedCount} fetched)`);

  return results;
}

/**
 * Get cached articles within time range
 * @param {number} days - Number of days to look back (1, 7, 30, 365)
 * @returns {Array<{title: string, link: string, content: string}>}
 */
function getCachedArticles(days = 7) {
  const now = Date.now();
  const rangeMs = days * 24 * 60 * 60 * 1000;
  const results = [];

  for (const [url, entry] of articleCache.entries()) {
    if (now - entry.timestamp < rangeMs && entry.content) {
      results.push({
        title: entry.title,
        link: url,
        content: entry.content
      });
    }
  }

  console.log(`  [Cache] Found ${results.length} cached articles within ${days} days`);
  return results;
}

/**
 * Clear expired cache entries
 */
function clearExpiredCache() {
  const now = Date.now();
  const expireMs = CONFIG.cacheExpireDays * 24 * 60 * 60 * 1000;
  let removed = 0;

  for (const [url, entry] of articleCache.entries()) {
    if (now - entry.timestamp >= expireMs) {
      articleCache.delete(url);
      removed++;
    }
  }

  if (removed > 0) {
    saveCache();
    console.log(`  [Cache] Removed ${removed} expired entries`);
  }
}

module.exports = {
  fetchArticleContent,
  fetchArticlesWithContent,
  extractContentFromHtml,
  getCachedArticles,
  clearExpiredCache,
  CONFIG
};
