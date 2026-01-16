const { v4: uuidv4 } = require('uuid');
const newsService = require('./newsService');
const articleService = require('./articleService');
const claudeService = require('./claudeService');
const crosswordGenerator = require('./crosswordGenerator');
const cacheService = require('./cacheService');

/**
 * Create a new crossword puzzle
 * @param {number} gridSize - Size of the grid (5-15)
 * @param {number} dataRange - Days to include from cache (1, 7, 30, 365)
 * @returns {Promise<object>}
 */
async function createPuzzle(gridSize = 10, dataRange = 7) {
  // Validate grid size
  gridSize = Math.max(5, Math.min(15, gridSize));

  // Calculate target word count - request many words for dense grids
  // More words = better chance of filling the grid (aim for 80%+ density)
  // キーワード数を2倍に増やして多様性を確保（交差の可能性を向上）
  const targetWords = gridSize <= 7 ? 50 : gridSize <= 10 ? 90 : 120;

  const totalStartTime = Date.now();
  console.log('');
  console.log(`========================================`);
  console.log(`  Generating ${gridSize}x${gridSize} Crossword Puzzle`);
  console.log(`  Data Range: ${dataRange} day(s)`);
  console.log(`========================================`);

  // Step 1: Fetch news headlines from all categories (5 per category)
  console.log('');
  console.log('[Step 1/6] Fetching news headlines...');
  const freshNews = await newsService.fetchMultipleCategories(null, 5);

  if (freshNews.length === 0) {
    throw new Error('Failed to fetch news');
  }

  // Step 1.5: Get cached articles and merge with fresh news
  console.log('');
  console.log('[Step 1.5] Loading cached articles...');
  const cachedArticles = articleService.getCachedArticles(dataRange);

  // Merge: fresh news takes priority, then add non-duplicate cached articles
  const seenLinks = new Set(freshNews.map(n => n.link));
  const mergedNews = [...freshNews];
  for (const cached of cachedArticles) {
    if (!seenLinks.has(cached.link)) {
      seenLinks.add(cached.link);
      mergedNews.push(cached);
    }
  }
  console.log(`  [Merge] Fresh: ${freshNews.length}, Cached: ${cachedArticles.length}, Total: ${mergedNews.length}`);

  // Step 2: Filter similar news headlines (Claude call 1)
  console.log('');
  console.log('[Step 2/6] Filtering similar headlines...');
  const uniqueNews = await claudeService.filterSimilarNews(mergedNews);

  if (uniqueNews.length === 0) {
    throw new Error('Failed to filter news');
  }

  // Step 3: Fetch article content (with Haiku refinement)
  // Note: Cached articles already have content, so they'll be skipped in fetching
  console.log('');
  console.log('[Step 3/6] Fetching article content...');
  const articlesWithContent = await articleService.fetchArticlesWithContent(uniqueNews);

  // Step 4: Extract keywords from articles (Claude call 2)
  console.log('');
  console.log('[Step 4/6] Extracting keywords with Claude...');
  const keywords = await claudeService.extractKeywords(articlesWithContent, targetWords);

  if (!keywords || keywords.length === 0) {
    throw new Error('Failed to extract keywords');
  }

  // Step 5: Generate clues for keywords (Claude call 3)
  console.log('');
  console.log('[Step 5/6] Generating clues with Claude...');
  const words = await claudeService.generateClues(keywords);

  if (!words || words.length === 0) {
    throw new Error('Failed to generate clues');
  }

  // Step 6: Generate crossword grid
  console.log('');
  console.log('[Step 6/6] Generating crossword grid...');
  const puzzle = crosswordGenerator.generateCrossword(words, gridSize);

  const totalElapsed = ((Date.now() - totalStartTime) / 1000).toFixed(1);
  console.log('');
  console.log(`========================================`);
  console.log(`  Puzzle Complete! (Total: ${totalElapsed}s)`);
  console.log(`========================================`);
  console.log('');

  // Step 4: Create puzzle response
  const id = uuidv4();
  const result = {
    id,
    createdAt: new Date().toISOString(),
    size: gridSize,
    ...puzzle,
    clues: {
      across: puzzle.words
        .filter(w => w.orientation === 'across')
        .map(w => ({
          number: w.position,
          clue: w.clue,
          length: w.length,
          articleLink: w.articleLink || null
        })),
      down: puzzle.words
        .filter(w => w.orientation === 'down')
        .map(w => ({
          number: w.position,
          clue: w.clue,
          length: w.length,
          articleLink: w.articleLink || null
        }))
    },
    // Store answers separately (for validation, not sent to client)
    _answers: puzzle.words.reduce((acc, w) => {
      acc[`${w.position}-${w.orientation}`] = w.answer;
      return acc;
    }, {})
  };

  // Cache the puzzle
  cacheService.set(id, result);

  // Remove answers from response
  const { _answers, ...clientPuzzle } = result;

  return clientPuzzle;
}

/**
 * Check answers for a puzzle
 * @param {string} puzzleId
 * @param {object} answers - User's answers {clueKey: answer}
 * @returns {{correct: Array, incorrect: Array}}
 */
function checkAnswers(puzzleId, answers) {
  const puzzle = cacheService.get(puzzleId);

  if (!puzzle) {
    throw new Error('Puzzle not found');
  }

  const correct = [];
  const incorrect = [];

  for (const [key, userAnswer] of Object.entries(answers)) {
    const correctAnswer = puzzle._answers[key];
    if (!correctAnswer) continue;

    const normalizedUser = crosswordGenerator.normalizeJapanese(userAnswer);

    if (normalizedUser === correctAnswer) {
      correct.push(key);
    } else {
      incorrect.push(key);
    }
  }

  return { correct, incorrect };
}

/**
 * Get a hint for a clue
 * @param {string} puzzleId
 * @param {number} clueNumber
 * @param {string} direction - 'across' or 'down'
 * @returns {{hint: string, revealed: number}}
 */
function getHint(puzzleId, clueNumber, direction) {
  const puzzle = cacheService.get(puzzleId);

  if (!puzzle) {
    throw new Error('Puzzle not found');
  }

  const key = `${clueNumber}-${direction}`;
  const answer = puzzle._answers[key];

  if (!answer) {
    throw new Error('Clue not found');
  }

  // Reveal first character
  const chars = [...answer];
  const hint = chars[0] + '＿'.repeat(chars.length - 1);

  return {
    hint,
    revealed: 1,
    total: chars.length
  };
}

/**
 * Get puzzle by ID (for resuming)
 * @param {string} puzzleId
 * @returns {object|null}
 */
function getPuzzle(puzzleId) {
  const puzzle = cacheService.get(puzzleId);
  if (!puzzle) return null;

  const { _answers, ...clientPuzzle } = puzzle;
  return clientPuzzle;
}

module.exports = {
  createPuzzle,
  checkAnswers,
  getHint,
  getPuzzle
};
