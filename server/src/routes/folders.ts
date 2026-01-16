import { Router, Request, Response } from 'express';
import { getDatabase } from '../services/database';

const router = Router();

/**
 * GET /api/folders - Get all folders
 */
router.get('/', (_req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const folders = db.prepare('SELECT * FROM folders ORDER BY sort_order, name').all();
    res.json({ success: true, folders });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

/**
 * POST /api/folders - Create a new folder
 */
router.post('/', (req: Request, res: Response) => {
  try {
    const { name, color } = req.body;

    if (!name || typeof name !== 'string' || name.trim() === '') {
      res.status(400).json({
        success: false,
        error: 'Folder name is required'
      });
      return;
    }

    const db = getDatabase();

    // Get max sort_order
    const maxOrder = db.prepare('SELECT MAX(sort_order) as max FROM folders').get() as { max: number | null };
    const sortOrder = (maxOrder.max ?? -1) + 1;

    const result = db.prepare(`
      INSERT INTO folders (name, color, sort_order) VALUES (?, ?, ?)
    `).run(name.trim(), color || '#6366f1', sortOrder);

    const folder = db.prepare('SELECT * FROM folders WHERE id = ?').get(result.lastInsertRowid);

    res.json({ success: true, folder });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

/**
 * PUT /api/folders/:id - Update a folder
 */
router.put('/:id', (req: Request, res: Response) => {
  try {
    const folderId = parseInt(req.params.id, 10);
    const { name, color, sort_order } = req.body;

    if (isNaN(folderId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid folder ID'
      });
      return;
    }

    const db = getDatabase();

    // Check if folder exists
    const existing = db.prepare('SELECT id FROM folders WHERE id = ?').get(folderId);
    if (!existing) {
      res.status(404).json({
        success: false,
        error: 'Folder not found'
      });
      return;
    }

    // Build update query
    const updates: string[] = [];
    const values: (string | number)[] = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }
    if (color !== undefined) {
      updates.push('color = ?');
      values.push(color);
    }
    if (sort_order !== undefined) {
      updates.push('sort_order = ?');
      values.push(sort_order);
    }

    if (updates.length === 0) {
      res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
      return;
    }

    updates.push("updated_at = datetime('now')");
    values.push(folderId);

    db.prepare(`UPDATE folders SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    const folder = db.prepare('SELECT * FROM folders WHERE id = ?').get(folderId);
    res.json({ success: true, folder });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

/**
 * DELETE /api/folders/:id - Delete a folder
 * Feeds in the folder will have their folder_id set to NULL (due to ON DELETE SET NULL)
 */
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const folderId = parseInt(req.params.id, 10);

    if (isNaN(folderId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid folder ID'
      });
      return;
    }

    const db = getDatabase();

    // Check if folder exists
    const existing = db.prepare('SELECT id FROM folders WHERE id = ?').get(folderId);
    if (!existing) {
      res.status(404).json({
        success: false,
        error: 'Folder not found'
      });
      return;
    }

    // Get count of feeds in folder
    const feedCount = db.prepare('SELECT COUNT(*) as count FROM feeds WHERE folder_id = ?').get(folderId) as { count: number };

    // Delete folder (feeds will have folder_id set to NULL)
    db.prepare('DELETE FROM folders WHERE id = ?').run(folderId);

    res.json({
      success: true,
      message: `Folder deleted. ${feedCount.count} feed(s) moved to root.`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

export default router;
