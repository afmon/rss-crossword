import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from './database';
import { getArticlesWithContent } from './articleService';
import { filterSimilarNews, extractKeywords, generateClues } from './claudeService';
import { generateCrossword, normalizeJapanese } from './crosswordGenerator';
import type { PlacedWord, GridCell } from './crosswordGenerator';

export interface Puzzle {
  id: string;
  title?: string;
  createdAt: string;
  size: number;
  width: number;
  height: number;
  grid: GridCell[][];
  words: PlacedWord[];
  clues: {
    across: Array<{ number: number; clue: string; length: number; row: number; col: number; articleLink?: string }>;
    down: Array<{ number: number; clue: string; length: number; row: number; col: number; articleLink?: string }>;
  };
  density: number;
  _answers?: Record<string, string>;
}

/**
 * Create a new crossword puzzle
 */
export async function createPuzzle(options: {
  size?: number;
  dataRange?: number;
  feedIds?: number[];
}): Promise<Puzzle> {
  const { size = 10, dataRange = 7, feedIds } = options;
  const gridSize = Math.max(5, Math.min(15, size));
  const targetWords = gridSize <= 7 ? 50 : gridSize <= 10 ? 90 : 120;

  const totalStartTime = Date.now();
  console.log('');
  console.log('========================================');
  console.log(`  Generating ${gridSize}x${gridSize} Crossword Puzzle`);
  console.log(`  Data Range: ${dataRange} day(s)`);
  console.log('========================================');

  // Step 1: Get articles with content from database
  console.log('');
  console.log('[Step 1/4] Getting articles from database...');
  const articlesWithContent = getArticlesWithContent({ feedIds, days: dataRange, limit: 50 });

  if (articlesWithContent.length < 10) {
    throw new Error(
      `フェッチ済みの記事が不足しています（現在${articlesWithContent.length}件）。` +
      `フィード更新を待つか、記事一覧から手動でフェッチを実行してください。`
    );
  }

  console.log(`  [Articles] Found ${articlesWithContent.length} articles with content`);

  // Step 2: Filter similar headlines
  console.log('');
  console.log('[Step 2/4] Filtering similar headlines...');
  const uniqueArticles = await filterSimilarNews(articlesWithContent);

  if (uniqueArticles.length === 0) {
    throw new Error('Failed to filter articles');
  }

  // Step 3: Extract keywords
  console.log('');
  console.log('[Step 3/4] Extracting keywords with Claude...');
  const keywords = await extractKeywords(
    uniqueArticles.map(a => ({
      id: a.id,
      title: a.title,
      link: a.link,
      content: a.content
    })),
    targetWords
  );

  if (!keywords || keywords.length === 0) {
    throw new Error('Failed to extract keywords');
  }

  // Step 4: Generate clues
  console.log('');
  console.log('[Step 4/4] Generating clues and crossword...');
  const wordClues = await generateClues(keywords);

  if (!wordClues || wordClues.length === 0) {
    throw new Error('Failed to generate clues');
  }

  // Generate crossword grid
  const puzzle = generateCrossword(wordClues, gridSize);

  const totalElapsed = ((Date.now() - totalStartTime) / 1000).toFixed(1);
  console.log('');
  console.log('========================================');
  console.log(`  Puzzle Complete! (Total: ${totalElapsed}s)`);
  console.log('========================================');
  console.log('');

  // Create puzzle object
  const id = uuidv4();
  const result: Puzzle = {
    id,
    createdAt: new Date().toISOString(),
    size: gridSize,
    width: puzzle.width,
    height: puzzle.height,
    grid: puzzle.grid,
    words: puzzle.words,
    clues: {
      across: puzzle.words
        .filter(w => w.orientation === 'across')
        .map(w => ({
          number: w.position,
          clue: w.clue,
          length: w.length,
          row: w.startRow,
          col: w.startCol,
          articleLink: w.articleLink
        })),
      down: puzzle.words
        .filter(w => w.orientation === 'down')
        .map(w => ({
          number: w.position,
          clue: w.clue,
          length: w.length,
          row: w.startRow,
          col: w.startCol,
          articleLink: w.articleLink
        }))
    },
    density: puzzle.density,
    _answers: puzzle.words.reduce((acc, w) => {
      acc[`${w.position}-${w.orientation}`] = w.answer;
      return acc;
    }, {} as Record<string, string>)
  };

  // Save to database
  savePuzzle(result);

  // Remove answers from returned object
  const { _answers, ...clientPuzzle } = result;

  return clientPuzzle;
}

/**
 * Save puzzle to database
 */
function savePuzzle(puzzle: Puzzle): void {
  const db = getDatabase();

  db.prepare(`
    INSERT INTO puzzles (id, title, size, width, height, grid_json, words_json, clues_json, answers_json, word_count, data_range_days)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    puzzle.id,
    puzzle.title || `Puzzle ${new Date().toLocaleDateString('ja-JP')}`,
    puzzle.size,
    puzzle.width,
    puzzle.height,
    JSON.stringify(puzzle.grid),
    JSON.stringify(puzzle.words),
    JSON.stringify(puzzle.clues),
    JSON.stringify(puzzle._answers),
    puzzle.words.length,
    7 // Default data range
  );
}

/**
 * Get puzzle by ID
 */
export function getPuzzle(id: string): Puzzle | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM puzzles WHERE id = ?').get(id) as any;

  if (!row) return null;

  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    size: row.size,
    width: row.width,
    height: row.height,
    grid: JSON.parse(row.grid_json),
    words: JSON.parse(row.words_json),
    clues: JSON.parse(row.clues_json),
    density: 0, // Not stored
    _answers: JSON.parse(row.answers_json)
  };
}

/**
 * Check answers for a puzzle
 */
export function checkAnswers(
  puzzleId: string,
  answers: Record<string, string>
): { correct: string[]; incorrect: string[] } {
  const puzzle = getPuzzle(puzzleId);

  if (!puzzle || !puzzle._answers) {
    throw new Error('Puzzle not found');
  }

  const correct: string[] = [];
  const incorrect: string[] = [];

  for (const [key, userAnswer] of Object.entries(answers)) {
    const correctAnswer = puzzle._answers[key];
    if (!correctAnswer) continue;

    const normalizedUser = normalizeJapanese(userAnswer);

    if (normalizedUser === correctAnswer) {
      correct.push(key);
    } else {
      incorrect.push(key);
    }
  }

  return { correct, incorrect };
}

/**
 * Get hint for a clue
 */
export function getHint(
  puzzleId: string,
  clueNumber: number,
  direction: string
): { hint: string; revealed: number; total: number } {
  const puzzle = getPuzzle(puzzleId);

  if (!puzzle || !puzzle._answers) {
    throw new Error('Puzzle not found');
  }

  const key = `${clueNumber}-${direction}`;
  const answer = puzzle._answers[key];

  if (!answer) {
    throw new Error('Clue not found');
  }

  const chars = [...answer];
  const hint = chars[0] + '＿'.repeat(chars.length - 1);

  return {
    hint,
    revealed: 1,
    total: chars.length
  };
}

/**
 * List saved puzzles
 */
export function listPuzzles(limit: number = 50): Array<{
  id: string;
  title: string;
  size: number;
  wordCount: number;
  createdAt: string;
}> {
  const db = getDatabase();
  return db.prepare(`
    SELECT id, title, size, word_count as wordCount, created_at as createdAt
    FROM puzzles
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit) as any[];
}
