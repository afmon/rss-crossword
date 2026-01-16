import { Router, Request, Response } from 'express';
import { getDatabase } from '../services/database';
import { refreshFeed, refreshAllFeeds, initializeDefaultFeeds } from '../services/feedService';

const router = Router();

// GET /api/feeds - List all feeds with unread counts
router.get('/', (_req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const feeds = db.prepare(`
      SELECT
        f.*,
        COUNT(a.id) as article_count,
        SUM(CASE WHEN a.is_read = 0 THEN 1 ELSE 0 END) as unread_count
      FROM feeds f
      LEFT JOIN articles a ON a.feed_id = f.id
      WHERE f.is_active = 1
      GROUP BY f.id
      ORDER BY f.folder_id, f.title
    `).all();

    const folders = db.prepare('SELECT * FROM folders ORDER BY sort_order, name').all();

    res.json({
      success: true,
      feeds,
      folders
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

// GET /api/feeds/:id - Get single feed
router.get('/:id', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const feed = db.prepare('SELECT * FROM feeds WHERE id = ?').get(req.params.id);

    if (!feed) {
      return res.status(404).json({
        success: false,
        error: 'Feed not found'
      });
    }

    res.json({ success: true, feed });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

// POST /api/feeds - Add new feed
router.post('/', (req: Request, res: Response) => {
  try {
    const { url, title, folderId } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required'
      });
    }

    const db = getDatabase();

    // Check if feed already exists
    const existing = db.prepare('SELECT id FROM feeds WHERE url = ?').get(url);
    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'Feed already exists'
      });
    }

    const result = db.prepare(`
      INSERT INTO feeds (url, title, folder_id)
      VALUES (?, ?, ?)
    `).run(url, title || url, folderId || null);

    const feed = db.prepare('SELECT * FROM feeds WHERE id = ?').get(result.lastInsertRowid);

    res.status(201).json({ success: true, feed });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

// PUT /api/feeds/:id - Update feed
router.put('/:id', (req: Request, res: Response) => {
  try {
    const { title, folderId, isActive } = req.body;
    const db = getDatabase();

    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    if (title !== undefined) {
      updates.push('title = ?');
      values.push(title);
    }
    if (folderId !== undefined) {
      updates.push('folder_id = ?');
      values.push(folderId);
    }
    if (isActive !== undefined) {
      updates.push('is_active = ?');
      values.push(isActive ? 1 : 0);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }

    updates.push("updated_at = datetime('now')");
    values.push(req.params.id);

    db.prepare(`UPDATE feeds SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    const feed = db.prepare('SELECT * FROM feeds WHERE id = ?').get(req.params.id);

    res.json({ success: true, feed });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

// DELETE /api/feeds/:id - Delete feed
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const result = db.prepare('DELETE FROM feeds WHERE id = ?').run(req.params.id);

    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        error: 'Feed not found'
      });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

// POST /api/feeds/:id/refresh - Refresh single feed
router.post('/:id/refresh', async (req: Request, res: Response) => {
  try {
    const feedId = parseInt(req.params.id, 10);
    const result = await refreshFeed(feedId);

    res.json({
      success: true,
      newArticles: result.newCount,
      totalArticles: result.totalCount
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

// POST /api/feeds/refresh-all - Refresh all feeds
router.post('/refresh-all', async (_req: Request, res: Response) => {
  try {
    const result = await refreshAllFeeds();

    res.json({
      ...result,
      success: true
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

// POST /api/feeds/initialize - Initialize default feeds
router.post('/initialize', async (_req: Request, res: Response) => {
  try {
    const result = await initializeDefaultFeeds();
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

export default router;
