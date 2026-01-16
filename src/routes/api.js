const express = require('express');
const router = express.Router();
const puzzleService = require('../services/puzzleService');
const newsService = require('../services/newsService');
const cacheService = require('../services/cacheService');

/**
 * POST /api/puzzle/generate
 * Generate a new crossword puzzle
 */
router.post('/puzzle/generate', async (req, res) => {
  try {
    const { size = 10, dataRange = 7 } = req.body;
    console.log(`Generating puzzle with size ${size}, dataRange ${dataRange}...`);

    const puzzle = await puzzleService.createPuzzle(size, dataRange);

    res.json({
      success: true,
      puzzle
    });
  } catch (error) {
    console.error('Failed to generate puzzle:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate puzzle'
    });
  }
});

/**
 * GET /api/puzzle/:id
 * Get an existing puzzle
 */
router.get('/puzzle/:id', (req, res) => {
  try {
    const puzzle = puzzleService.getPuzzle(req.params.id);

    if (!puzzle) {
      return res.status(404).json({
        success: false,
        error: 'Puzzle not found'
      });
    }

    res.json({
      success: true,
      puzzle
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/puzzle/check
 * Check answers for a puzzle
 */
router.post('/puzzle/check', (req, res) => {
  try {
    const { puzzleId, answers } = req.body;

    if (!puzzleId || !answers) {
      return res.status(400).json({
        success: false,
        error: 'puzzleId and answers are required'
      });
    }

    const result = puzzleService.checkAnswers(puzzleId, answers);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/puzzle/hint
 * Get a hint for a clue
 */
router.post('/puzzle/hint', (req, res) => {
  try {
    const { puzzleId, clueNumber, direction } = req.body;

    if (!puzzleId || clueNumber === undefined || !direction) {
      return res.status(400).json({
        success: false,
        error: 'puzzleId, clueNumber, and direction are required'
      });
    }

    const hint = puzzleService.getHint(puzzleId, clueNumber, direction);

    res.json({
      success: true,
      ...hint
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/puzzles
 * Get list of saved puzzles
 */
router.get('/puzzles', (req, res) => {
  try {
    const puzzles = cacheService.listSavedPuzzles();

    res.json({
      success: true,
      count: puzzles.length,
      puzzles
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/news/headlines
 * Get current news headlines (for debugging)
 */
router.get('/news/headlines', async (req, res) => {
  try {
    const { category = 'top-picks' } = req.query;
    const headlines = await newsService.fetchNews(category);

    res.json({
      success: true,
      count: headlines.length,
      headlines
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
