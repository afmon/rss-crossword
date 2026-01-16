const axios = require('axios');
const { XMLParser } = require('fast-xml-parser');

const RSS_URLS = {
  // トピックス系（9種類）
  'top-picks': 'https://news.yahoo.co.jp/rss/topics/top-picks.xml',
  'domestic': 'https://news.yahoo.co.jp/rss/topics/domestic.xml',
  'world': 'https://news.yahoo.co.jp/rss/topics/world.xml',
  'business': 'https://news.yahoo.co.jp/rss/topics/business.xml',
  'entertainment': 'https://news.yahoo.co.jp/rss/topics/entertainment.xml',
  'sports': 'https://news.yahoo.co.jp/rss/topics/sports.xml',
  'it': 'https://news.yahoo.co.jp/rss/topics/it.xml',
  'science': 'https://news.yahoo.co.jp/rss/topics/science.xml',
  'local': 'https://news.yahoo.co.jp/rss/topics/local.xml',

  // カテゴリ系（別系統 - 異なる記事が取得できる）
  'cat-domestic': 'https://news.yahoo.co.jp/rss/categories/domestic.xml',
  'cat-world': 'https://news.yahoo.co.jp/rss/categories/world.xml',
  'cat-business': 'https://news.yahoo.co.jp/rss/categories/business.xml',
  'cat-entertainment': 'https://news.yahoo.co.jp/rss/categories/entertainment.xml',
  'cat-sports': 'https://news.yahoo.co.jp/rss/categories/sports.xml',
  'cat-it': 'https://news.yahoo.co.jp/rss/categories/it.xml',
  'cat-science': 'https://news.yahoo.co.jp/rss/categories/science.xml',
  'cat-local': 'https://news.yahoo.co.jp/rss/categories/local.xml',
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_'
});

/**
 * Fetch news headlines from Yahoo Japan RSS
 * @param {string} category - News category (default: 'top-picks')
 * @returns {Promise<Array<{title: string, link: string, pubDate: string}>>}
 */
async function fetchNews(category = 'top-picks') {
  const url = RSS_URLS[category] || RSS_URLS['top-picks'];

  try {
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CrosswordBot/1.0)'
      }
    });

    const data = parser.parse(response.data);
    const items = data?.rss?.channel?.item || [];

    return items.map(item => ({
      title: item.title || '',
      link: item.link || '',
      pubDate: item.pubDate || ''
    }));
  } catch (error) {
    console.error(`Failed to fetch news from ${category}:`, error.message);
    return [];
  }
}

/**
 * Fetch news from multiple categories
 * @param {string[]} categories - Array of category names
 * @param {number} perCategory - Number of items per category
 * @returns {Promise<Array>}
 */
async function fetchMultipleCategories(categories = null, perCategory = 5) {
  // Use all categories by default for diversity
  if (!categories) {
    categories = Object.keys(RSS_URLS);
  }

  console.log(`  [News] Fetching from ${categories.length} categories...`);

  const results = await Promise.all(
    categories.map(async (cat) => {
      const items = await fetchNews(cat);
      console.log(`    - ${cat}: ${items.length} items`);
      return { category: cat, items };
    })
  );

  // Take limited items from each category, deduplicate by title
  const seen = new Set();
  const headlines = [];

  for (const { category, items } of results) {
    let count = 0;
    for (const item of items) {
      if (count >= perCategory) break;
      if (!seen.has(item.title)) {
        seen.add(item.title);
        headlines.push(item);
        count++;
      }
    }
  }

  console.log(`  [News] Total: ${headlines.length} unique headlines`);
  return headlines;
}

module.exports = {
  fetchNews,
  fetchMultipleCategories,
  RSS_URLS
};
