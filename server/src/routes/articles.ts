import { Router, Request, Response } from 'express';
import { getDatabase } from '../services/database';
import { fetchArticlesContent } from '../services/articleService';

const router = Router();

interface ArticleQuery {
  feedId?: string;
  folderId?: string;
  filter?: 'all' | 'unread' | 'favorites' | 'unprocessed';
  sortBy?: 'date' | 'title';
  order?: 'asc' | 'desc';
  search?: string;
  page?: string;
  limit?: string;
}

// GET /api/articles - List articles with filtering
router.get('/', (req: Request<{}, {}, {}, ArticleQuery>, res: Response) => {
  try {
    const {
      feedId,
      folderId,
      filter = 'all',
      sortBy = 'date',
      order = 'desc',
      search,
      page = '1',
      limit = '50'
    } = req.query;

    const db = getDatabase();
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const offset = (pageNum - 1) * limitNum;

    let whereClause = '1=1';
    const params: (string | number)[] = [];

    if (feedId) {
      whereClause += ' AND a.feed_id = ?';
      params.push(feedId);
    }

    if (folderId) {
      whereClause += ' AND f.folder_id = ?';
      params.push(folderId);
    }

    if (filter === 'unread') {
      whereClause += ' AND a.is_read = 0';
    } else if (filter === 'favorites') {
      whereClause += ' AND a.is_favorite = 1';
    } else if (filter === 'unprocessed') {
      // Show articles that have HTML content but not AI processed
      whereClause += " AND a.is_ai_processed = 0 AND a.content_html IS NOT NULL AND a.content_html != ''";
    }

    if (search) {
      whereClause += ' AND (a.title LIKE ? OR a.summary LIKE ?)';
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern);
    }

    const orderColumn = sortBy === 'title' ? 'a.title' : 'a.published_at';
    const orderDir = order === 'asc' ? 'ASC' : 'DESC';

    // Get total count
    const countResult = db.prepare(`
      SELECT COUNT(*) as total
      FROM articles a
      JOIN feeds f ON f.id = a.feed_id
      WHERE ${whereClause}
    `).get(...params) as { total: number };

    // Get articles
    const articles = db.prepare(`
      SELECT
        a.*,
        f.title as feed_title,
        f.favicon_url as feed_favicon
      FROM articles a
      JOIN feeds f ON f.id = a.feed_id
      WHERE ${whereClause}
      ORDER BY ${orderColumn} ${orderDir}
      LIMIT ? OFFSET ?
    `).all(...params, limitNum, offset);

    res.json({
      success: true,
      articles,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: countResult.total,
        totalPages: Math.ceil(countResult.total / limitNum)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

// GET /api/articles/:id - Get single article with full content
router.get('/:id', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const article = db.prepare(`
      SELECT
        a.*,
        f.title as feed_title,
        f.favicon_url as feed_favicon
      FROM articles a
      JOIN feeds f ON f.id = a.feed_id
      WHERE a.id = ?
    `).get(req.params.id);

    if (!article) {
      return res.status(404).json({
        success: false,
        error: 'Article not found'
      });
    }

    res.json({ success: true, article });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

// PUT /api/articles/:id/read - Mark article as read/unread
router.put('/:id/read', (req: Request, res: Response) => {
  try {
    const { read } = req.body;
    const db = getDatabase();

    if (read) {
      db.prepare(`
        UPDATE articles
        SET is_read = 1, read_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ?
      `).run(req.params.id);
    } else {
      db.prepare(`
        UPDATE articles
        SET is_read = 0, read_at = NULL, updated_at = datetime('now')
        WHERE id = ?
      `).run(req.params.id);
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

// PUT /api/articles/:id/favorite - Toggle favorite status
router.put('/:id/favorite', (req: Request, res: Response) => {
  try {
    const { favorite } = req.body;
    const db = getDatabase();

    if (favorite) {
      db.prepare(`
        UPDATE articles
        SET is_favorite = 1, favorite_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ?
      `).run(req.params.id);
    } else {
      db.prepare(`
        UPDATE articles
        SET is_favorite = 0, favorite_at = NULL, updated_at = datetime('now')
        WHERE id = ?
      `).run(req.params.id);
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

// POST /api/articles/mark-all-read - Mark all articles as read
router.post('/mark-all-read', (req: Request, res: Response) => {
  try {
    const { feedId, folderId } = req.body;
    const db = getDatabase();

    let sql = `
      UPDATE articles
      SET is_read = 1, read_at = datetime('now'), updated_at = datetime('now')
      WHERE is_read = 0
    `;
    const params: (string | number)[] = [];

    if (feedId) {
      sql += ' AND feed_id = ?';
      params.push(feedId);
    } else if (folderId) {
      sql += ' AND feed_id IN (SELECT id FROM feeds WHERE folder_id = ?)';
      params.push(folderId);
    }

    const result = db.prepare(sql).run(...params);

    res.json({
      success: true,
      count: result.changes
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

// POST /api/articles/extract-content - Extract content for selected articles using AI
router.post('/extract-content', async (req: Request, res: Response) => {
  try {
    const { articleIds } = req.body;

    if (!articleIds || !Array.isArray(articleIds) || articleIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'articleIds array is required'
      });
    }

    console.log(`[API] Extract content for ${articleIds.length} articles...`);

    const result = await fetchArticlesContent(articleIds);

    res.json({
      success: true,
      ...result,
      processed: articleIds.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

export default router;
