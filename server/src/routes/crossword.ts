import { Router, Request, Response } from 'express';
import { createPuzzle, getPuzzle, checkAnswers, getHint, listPuzzles } from '../services/puzzleService';
import { getDatabase } from '../services/database';

const router = Router();

// POST /api/crossword/generate - Generate new crossword puzzle
router.post('/generate', async (req: Request, res: Response) => {
  try {
    const { size = 10, dataRange = 7, feedIds } = req.body;

    const puzzle = await createPuzzle({
      size,
      dataRange,
      feedIds
    });

    res.json({
      success: true,
      puzzle
    });
  } catch (error) {
    console.error('Puzzle generation error:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

// GET /api/crossword - List all puzzles
router.get('/', (_req: Request, res: Response) => {
  try {
    const puzzles = listPuzzles();

    res.json({
      success: true,
      puzzles
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

// GET /api/crossword/:id - Get puzzle by ID
router.get('/:id', (req: Request, res: Response) => {
  try {
    const puzzle = getPuzzle(req.params.id);

    if (!puzzle) {
      return res.status(404).json({
        success: false,
        error: 'Puzzle not found'
      });
    }

    // Remove answers from response
    const { _answers, ...clientPuzzle } = puzzle;

    res.json({
      success: true,
      puzzle: clientPuzzle
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

// POST /api/crossword/check - Check answers
router.post('/check', (req: Request, res: Response) => {
  try {
    const { puzzleId, answers } = req.body;

    if (!puzzleId || !answers) {
      return res.status(400).json({
        success: false,
        error: 'puzzleId and answers are required'
      });
    }

    const result = checkAnswers(puzzleId, answers);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

// POST /api/crossword/hint - Get hint for a clue
router.post('/hint', (req: Request, res: Response) => {
  try {
    const { puzzleId, clueNumber, direction } = req.body;

    if (!puzzleId || clueNumber === undefined || !direction) {
      return res.status(400).json({
        success: false,
        error: 'puzzleId, clueNumber, and direction are required'
      });
    }

    const result = getHint(puzzleId, clueNumber, direction);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

// DELETE /api/crossword/:id - Delete puzzle
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const result = db.prepare('DELETE FROM puzzles WHERE id = ?').run(req.params.id);

    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        error: 'Puzzle not found'
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

export default router;
