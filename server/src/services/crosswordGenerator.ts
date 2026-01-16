import type { WordClue } from './claudeService';

export interface GridCell {
  letter: string | null;
  number: number | null;
  isBlack: boolean;
}

export interface PlacedWord {
  answer: string;
  clue: string;
  startRow: number;
  startCol: number;
  position: number;
  orientation: 'across' | 'down';
  length: number;
  articleLink?: string;
  articleId?: number;
}

export interface CrosswordResult {
  width: number;
  height: number;
  grid: GridCell[][];
  words: PlacedWord[];
  density: number;
}

/**
 * Normalize Japanese text (hiragana to katakana, small kana to normal)
 */
export function normalizeJapanese(text: string): string {
  return text
    .split('')
    .map(char => {
      const code = char.charCodeAt(0);
      // Convert hiragana to katakana
      if (code >= 0x3041 && code <= 0x3096) {
        return String.fromCharCode(code + 0x60);
      }
      return char;
    })
    .join('')
    .replace(/ァ/g, 'ア')
    .replace(/ィ/g, 'イ')
    .replace(/ゥ/g, 'ウ')
    .replace(/ェ/g, 'エ')
    .replace(/ォ/g, 'オ')
    .replace(/ッ/g, 'ツ')
    .replace(/ャ/g, 'ヤ')
    .replace(/ュ/g, 'ユ')
    .replace(/ョ/g, 'ヨ')
    .replace(/ヮ/g, 'ワ')
    .toUpperCase();
}

interface Placement {
  row: number;
  col: number;
  horizontal: boolean;
  intersections: number;
}

/**
 * Check if a word can be placed at the given position
 */
function canPlaceWord(
  grid: (string | null)[][],
  word: string,
  row: number,
  col: number,
  horizontal: boolean,
  requireIntersection: boolean
): boolean {
  const size = grid.length;
  const chars = [...word];
  const len = chars.length;

  // Check bounds
  if (horizontal) {
    if (col + len > size) return false;
    if (col > 0 && grid[row][col - 1] !== null) return false;
    if (col + len < size && grid[row][col + len] !== null) return false;
  } else {
    if (row + len > size) return false;
    if (row > 0 && grid[row - 1][col] !== null) return false;
    if (row + len < size && grid[row + len][col] !== null) return false;
  }

  let hasIntersection = false;

  for (let i = 0; i < len; i++) {
    const r = horizontal ? row : row + i;
    const c = horizontal ? col + i : col;
    const existing = grid[r][c];

    if (existing !== null) {
      if (existing !== chars[i]) {
        return false;
      }
      hasIntersection = true;
    } else {
      // Check perpendicular adjacency for non-intersection cells
      if (horizontal) {
        if (r > 0 && grid[r - 1][c] !== null) return false;
        if (r < size - 1 && grid[r + 1][c] !== null) return false;
      } else {
        if (c > 0 && grid[r][c - 1] !== null) return false;
        if (c < size - 1 && grid[r][c + 1] !== null) return false;
      }
    }
  }

  if (requireIntersection && !hasIntersection) {
    return false;
  }

  return true;
}

/**
 * Find all valid placements for a word
 */
function findPlacements(
  grid: (string | null)[][],
  word: string,
  requireIntersection: boolean
): Placement[] {
  const size = grid.length;
  const chars = [...word];
  const placements: Placement[] = [];

  // Find placements that intersect with existing letters
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r][c] !== null) {
        const existingChar = grid[r][c];

        for (let i = 0; i < chars.length; i++) {
          if (chars[i] === existingChar) {
            // Try horizontal
            const hCol = c - i;
            if (hCol >= 0 && canPlaceWord(grid, word, r, hCol, true, requireIntersection)) {
              const intersections = countIntersections(grid, word, r, hCol, true);
              placements.push({ row: r, col: hCol, horizontal: true, intersections });
            }

            // Try vertical
            const vRow = r - i;
            if (vRow >= 0 && canPlaceWord(grid, word, vRow, c, false, requireIntersection)) {
              const intersections = countIntersections(grid, word, vRow, c, false);
              placements.push({ row: vRow, col: c, horizontal: false, intersections });
            }
          }
        }
      }
    }
  }

  // If no intersecting placements found and not required, try adjacent placements
  if (placements.length === 0 && !requireIntersection) {
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (canPlaceWord(grid, word, r, c, true, false)) {
          placements.push({ row: r, col: c, horizontal: true, intersections: 0 });
        }
        if (canPlaceWord(grid, word, r, c, false, false)) {
          placements.push({ row: r, col: c, horizontal: false, intersections: 0 });
        }
      }
    }
  }

  return placements.sort((a, b) => b.intersections - a.intersections);
}

/**
 * Count intersections for a placement
 */
function countIntersections(
  grid: (string | null)[][],
  word: string,
  row: number,
  col: number,
  horizontal: boolean
): number {
  const chars = [...word];
  let count = 0;

  for (let i = 0; i < chars.length; i++) {
    const r = horizontal ? row : row + i;
    const c = horizontal ? col + i : col;
    if (grid[r][c] !== null) {
      count++;
    }
  }

  return count;
}

/**
 * Place a word on the grid
 */
function placeWord(
  grid: (string | null)[][],
  word: string,
  row: number,
  col: number,
  horizontal: boolean
): void {
  const chars = [...word];
  for (let i = 0; i < chars.length; i++) {
    const r = horizontal ? row : row + i;
    const c = horizontal ? col + i : col;
    grid[r][c] = chars[i];
  }
}

/**
 * Calculate grid density
 */
function calculateDensity(grid: (string | null)[][]): number {
  let filled = 0;
  let total = 0;
  for (const row of grid) {
    for (const cell of row) {
      total++;
      if (cell !== null) filled++;
    }
  }
  return (filled / total) * 100;
}

/**
 * Generate crossword puzzle
 */
export function generateCrossword(words: WordClue[], size: number): CrosswordResult {
  // Filter and prepare words
  const normalizedWords = words
    .map(w => ({
      ...w,
      answer: normalizeJapanese(w.answer)
    }))
    .filter(w => {
      const len = [...w.answer].length;
      return len >= 2 && len <= size;
    });

  // Remove duplicates
  const seen = new Set<string>();
  const uniqueWords = normalizedWords.filter(w => {
    if (seen.has(w.answer)) return false;
    seen.add(w.answer);
    return true;
  });

  // Sort by length preference (3-5 chars first)
  uniqueWords.sort((a, b) => {
    const lenA = [...a.answer].length;
    const lenB = [...b.answer].length;
    const scoreA = lenA >= 3 && lenA <= 5 ? 0 : 1;
    const scoreB = lenB >= 3 && lenB <= 5 ? 0 : 1;
    return scoreA - scoreB || lenA - lenB;
  });

  const minWords = size <= 7 ? 6 : size <= 10 ? 18 : size <= 12 ? 25 : 35;
  const targetDensity = 80;
  const maxAttempts = 100;

  let bestResult: {
    grid: (string | null)[][];
    placed: Array<{ word: WordClue; row: number; col: number; horizontal: boolean }>;
    density: number;
  } | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const grid: (string | null)[][] = Array(size).fill(null).map(() => Array(size).fill(null));
    const placed: Array<{ word: WordClue; row: number; col: number; horizontal: boolean }> = [];

    // Shuffle words for this attempt
    const shuffled = [...uniqueWords].sort(() => Math.random() - 0.5);

    // Place first word in center
    if (shuffled.length > 0) {
      const firstWord = shuffled[0];
      const chars = [...firstWord.answer];
      const startCol = Math.floor((size - chars.length) / 2);
      const startRow = Math.floor(size / 2);

      if (canPlaceWord(grid, firstWord.answer, startRow, startCol, true, false)) {
        placeWord(grid, firstWord.answer, startRow, startCol, true);
        placed.push({ word: firstWord, row: startRow, col: startCol, horizontal: true });
      }
    }

    // Place remaining words
    for (let i = 1; i < shuffled.length; i++) {
      const word = shuffled[i];
      const placements = findPlacements(grid, word.answer, true);

      if (placements.length > 0) {
        const best = placements[0];
        placeWord(grid, word.answer, best.row, best.col, best.horizontal);
        placed.push({ word, row: best.row, col: best.col, horizontal: best.horizontal });
      }
    }

    // Edge filling pass: place short words on edges (no intersection required)
    const shortWords = shuffled
      .filter(w => !placed.some(p => p.word.answer === w.answer))
      .filter(w => [...w.answer].length <= 3);

    for (const word of shortWords) {
      const edgePlacements = findPlacements(grid, word.answer, false)
        .filter(p =>
          p.row === 0 || p.row === size - 1 ||
          p.col === 0 || p.col === size - 1 ||
          (p.horizontal && (p.col + [...word.answer].length === size)) ||
          (!p.horizontal && (p.row + [...word.answer].length === size))
        );

      if (edgePlacements.length > 0) {
        const best = edgePlacements[0];
        placeWord(grid, word.answer, best.row, best.col, best.horizontal);
        placed.push({ word, row: best.row, col: best.col, horizontal: best.horizontal });
      }
    }

    const density = calculateDensity(grid);

    if (!bestResult || density > bestResult.density || placed.length > bestResult.placed.length) {
      bestResult = { grid, placed, density };
    }

    // Early exit if good enough
    if (density >= targetDensity && placed.length >= minWords) {
      break;
    }
  }

  if (!bestResult || bestResult.placed.length === 0) {
    throw new Error('Failed to generate crossword');
  }

  // Assign position numbers
  const numberGrid: number[][] = Array(size).fill(0).map(() => Array(size).fill(0));
  let positionNumber = 1;

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (bestResult.grid[r][c] !== null) {
        const isHorizontalStart = (c === 0 || bestResult.grid[r][c - 1] === null) &&
          (c < size - 1 && bestResult.grid[r][c + 1] !== null);
        const isVerticalStart = (r === 0 || bestResult.grid[r - 1][c] === null) &&
          (r < size - 1 && bestResult.grid[r + 1][c] !== null);

        if (isHorizontalStart || isVerticalStart) {
          numberGrid[r][c] = positionNumber++;
        }
      }
    }
  }

  // Build final result
  const finalGrid: GridCell[][] = bestResult.grid.map((row, r) =>
    row.map((cell, c) => ({
      letter: cell,
      number: numberGrid[r][c] || null,
      isBlack: cell === null
    }))
  );

  const finalWords: PlacedWord[] = bestResult.placed.map(p => ({
    answer: p.word.answer,
    clue: p.word.clue,
    startRow: p.row,
    startCol: p.col,
    position: numberGrid[p.row][p.col],
    orientation: p.horizontal ? 'across' : 'down',
    length: [...p.word.answer].length,
    articleLink: p.word.articleLink,
    articleId: p.word.articleId
  }));

  console.log(`  [Grid] Generated: ${finalWords.length} words, ${bestResult.density.toFixed(1)}% density`);

  return {
    width: size,
    height: size,
    grid: finalGrid,
    words: finalWords,
    density: bestResult.density
  };
}
