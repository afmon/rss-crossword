import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import { getDatabase } from './database';
import { queueSpeak } from './seikaService';

// Default Yahoo News RSS feeds (categories only)
export const DEFAULT_RSS_FEEDS = {
  '国内': 'https://news.yahoo.co.jp/rss/categories/domestic.xml',
  '国際': 'https://news.yahoo.co.jp/rss/categories/world.xml',
  '経済': 'https://news.yahoo.co.jp/rss/categories/business.xml',
  'エンタメ': 'https://news.yahoo.co.jp/rss/categories/entertainment.xml',
  'スポーツ': 'https://news.yahoo.co.jp/rss/categories/sports.xml',
  'IT・科学': 'https://news.yahoo.co.jp/rss/categories/it.xml',
  '地域': 'https://news.yahoo.co.jp/rss/categories/local.xml',
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  htmlEntities: true
});

/**
 * Extract link from various RSS/Atom formats
 */
function extractLink(link: unknown): string {
  if (!link) return '';
  if (typeof link === 'string') return link;
  if (Array.isArray(link)) {
    const first = link[0];
    return typeof first === 'string' ? first : (first?.href || first?.['@_href'] || '');
  }
  if (typeof link === 'object' && link !== null) {
    const obj = link as Record<string, unknown>;
    return (obj.href || obj['@_href'] || '') as string;
  }
  return '';
}

export interface RssItem {
  title: string;
  link: string;
  pubDate: string;
  description?: string;
  author?: string;
}

export interface Feed {
  id: number;
  folder_id: number | null;
  title: string;
  url: string;
  site_url: string | null;
  favicon_url: string | null;
  description: string | null;
  last_fetched_at: string | null;
  last_error: string | null;
  is_active: number;
  article_count?: number;
  unread_count?: number;
}

/**
 * Fetch RSS feed from URL
 */
export async function fetchRssFeed(url: string): Promise<{ title: string; items: RssItem[] }> {
  try {
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CrosswordBot/2.0)'
      }
    });

    const data = parser.parse(response.data);
    const channel = data?.rss?.channel;

    if (!channel) {
      throw new Error('Invalid RSS feed format');
    }

    const items = Array.isArray(channel.item) ? channel.item : [channel.item].filter(Boolean);

    return {
      title: channel.title || url,
      items: items.map((item: any) => ({
        title: item.title || '',
        link: extractLink(item.link),
        pubDate: item.pubDate || '',
        description: item.description || '',
        author: item.author || item['dc:creator'] || ''
      }))
    };
  } catch (error) {
    console.error(`Failed to fetch RSS feed ${url}:`, (error as Error).message);
    throw error;
  }
}

/**
 * Refresh a single feed and save articles to database
 */
export async function refreshFeed(feedId: number): Promise<{ newCount: number; totalCount: number }> {
  const db = getDatabase();

  const feed = db.prepare('SELECT * FROM feeds WHERE id = ?').get(feedId) as Feed | undefined;
  if (!feed) {
    throw new Error('Feed not found');
  }

  try {
    const { title, items } = await fetchRssFeed(feed.url);

    // Update feed title if it was auto-generated
    if (feed.title === feed.url) {
      db.prepare('UPDATE feeds SET title = ? WHERE id = ?').run(title, feedId);
    }

    // Prepare statement for inserting articles
    const insertArticle = db.prepare(`
      INSERT OR IGNORE INTO articles (feed_id, guid, title, link, author, published_at, summary)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    let newCount = 0;
    let skippedCount = 0;
    const newArticleTitles: string[] = [];
    const insertMany = db.transaction(() => {
      for (const item of items) {
        // Skip pickup URLs (intermediate pages without full content)
        if (item.link.includes('/pickup/')) {
          skippedCount++;
          continue;
        }

        const result = insertArticle.run(
          feedId,
          item.link, // Use link as GUID
          item.title,
          item.link,
          item.author || null,
          item.pubDate ? new Date(item.pubDate).toISOString() : null,
          item.description || null
        );
        if (result.changes > 0) {
          newCount++;
          newArticleTitles.push(item.title);
        }
      }
    });

    insertMany();

    // Speak new article titles via AssistantSeika
    for (const title of newArticleTitles) {
      queueSpeak(title);
    }

    // Update feed status
    db.prepare(`
      UPDATE feeds
      SET last_fetched_at = datetime('now'), last_error = NULL, updated_at = datetime('now')
      WHERE id = ?
    `).run(feedId);

    if (skippedCount > 0) {
      console.log(`  [Feed] ${feed.title}: ${newCount} new, ${skippedCount} skipped (pickup)`);
    } else {
      console.log(`  [Feed] ${feed.title}: ${newCount} new articles`);
    }

    return { newCount, totalCount: items.length };
  } catch (error) {
    // Update feed with error
    db.prepare(`
      UPDATE feeds
      SET last_error = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run((error as Error).message, feedId);

    throw error;
  }
}

/**
 * Refresh all active feeds
 */
export async function refreshAllFeeds(): Promise<{
  success: number;
  failed: number;
  newArticles: number
}> {
  const db = getDatabase();
  const feeds = db.prepare('SELECT * FROM feeds WHERE is_active = 1').all() as Feed[];

  let success = 0;
  let failed = 0;
  let newArticles = 0;

  console.log(`[Feeds] Refreshing ${feeds.length} feeds...`);

  for (const feed of feeds) {
    try {
      const result = await refreshFeed(feed.id);
      newArticles += result.newCount;
      success++;
    } catch (error) {
      console.error(`  [Feed] Failed to refresh ${feed.title}:`, (error as Error).message);
      failed++;
    }
  }

  console.log(`[Feeds] Complete: ${success} success, ${failed} failed, ${newArticles} new articles`);

  return { success, failed, newArticles };
}

/**
 * Initialize default Yahoo News feeds
 * - Creates folder if it doesn't exist
 * - Adds only feeds that don't already exist (by URL)
 */
export async function initializeDefaultFeeds(): Promise<{ added: number; skipped: number }> {
  const db = getDatabase();

  console.log('[Feeds] Initializing default Yahoo News feeds...');

  // Find or create folder
  let folder = db.prepare('SELECT id FROM folders WHERE name = ?').get('Yahoo! News') as { id: number } | undefined;

  if (!folder) {
    const folderResult = db.prepare(`
      INSERT INTO folders (name, color) VALUES ('Yahoo! News', '#ff0033')
    `).run();
    folder = { id: Number(folderResult.lastInsertRowid) };
    console.log('[Feeds] Created Yahoo! News folder');
  } else {
    console.log('[Feeds] Using existing Yahoo! News folder');
  }

  // Get existing feed URLs
  const existingUrls = new Set(
    (db.prepare('SELECT url FROM feeds').all() as { url: string }[]).map(f => f.url)
  );

  // Add feeds that don't exist
  const insertFeed = db.prepare(`
    INSERT INTO feeds (folder_id, title, url) VALUES (?, ?, ?)
  `);

  let added = 0;
  let skipped = 0;

  const insertMany = db.transaction(() => {
    for (const [name, url] of Object.entries(DEFAULT_RSS_FEEDS)) {
      if (existingUrls.has(url)) {
        skipped++;
        continue;
      }
      insertFeed.run(folder!.id, `Yahoo! ${name}`, url);
      added++;
    }
  });

  insertMany();

  console.log(`[Feeds] Added ${added} feeds, skipped ${skipped} existing`);
  return { added, skipped };
}

/**
 * Get articles for crossword generation
 */
export function getArticlesForCrossword(options: {
  feedIds?: number[];
  days?: number;
  limit?: number;
}): Array<{ id: number; title: string; link: string; content: string | null }> {
  const db = getDatabase();
  const { feedIds, days = 7, limit = 100 } = options;

  let sql = `
    SELECT id, title, link, content
    FROM articles
    WHERE fetched_at >= datetime('now', '-' || ? || ' days')
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
    content: string | null;
  }>;
}
