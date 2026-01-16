/**
 * Crossword puzzle grid generator
 * Optimized for Japanese (Katakana) words
 */

/**
 * Normalize Japanese text for crossword
 * - Convert hiragana to katakana
 * - Convert small kana to normal size
 * @param {string} text
 * @returns {string}
 */
function normalizeJapanese(text) {
  // Hiragana to Katakana (あ-ん → ア-ン)
  let result = text.replace(/[\u3041-\u3096]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) + 0x60)
  );

  // Small kana to normal (ァィゥェォッャュョ → アイウエオツヤユヨ)
  const smallToNormal = {
    'ァ': 'ア', 'ィ': 'イ', 'ゥ': 'ウ', 'ェ': 'エ', 'ォ': 'オ',
    'ッ': 'ツ', 'ャ': 'ヤ', 'ュ': 'ユ', 'ョ': 'ヨ', 'ヮ': 'ワ'
  };

  for (const [small, normal] of Object.entries(smallToNormal)) {
    result = result.replace(new RegExp(small, 'g'), normal);
  }

  return result;
}

/**
 * Create an empty grid
 * @param {number} size
 * @returns {Array<Array<string|null>>}
 */
function createEmptyGrid(size) {
  return Array(size).fill(null).map(() => Array(size).fill(null));
}

/**
 * Check if a word can be placed at the given position
 * @param {Array<Array<string|null>>} grid
 * @param {string} word
 * @param {number} row
 * @param {number} col
 * @param {boolean} horizontal
 * @param {boolean} strict - if false, allows more adjacent placements
 * @returns {boolean}
 */
function canPlaceWord(grid, word, row, col, horizontal, strict = false) {
  const size = grid.length;
  const chars = [...word];
  const len = chars.length;

  // Check bounds
  if (horizontal) {
    if (col + len > size) return false;
  } else {
    if (row + len > size) return false;
  }

  // Check for conflicts
  let hasIntersection = false;

  for (let i = 0; i < len; i++) {
    const r = horizontal ? row : row + i;
    const c = horizontal ? col + i : col;
    const char = chars[i];
    const cell = grid[r][c];

    if (cell !== null) {
      // Cell is occupied - must match
      if (cell !== char) return false;
      hasIntersection = true;
    } else {
      // ★修正: 交差点以外のセルで垂直/水平隣接チェック（常に実行）
      // これにより「ガンダムア」のような不正な文字連結を防止
      if (horizontal) {
        // 横配置時: 上下に既存文字があれば拒否
        if (r > 0 && grid[r - 1][c] !== null) return false;
        if (r < size - 1 && grid[r + 1][c] !== null) return false;
      } else {
        // 縦配置時: 左右に既存文字があれば拒否
        if (c > 0 && grid[r][c - 1] !== null) return false;
        if (c < size - 1 && grid[r][c + 1] !== null) return false;
      }
    }
  }

  // Check cells before and after word (prevent word merging)
  if (horizontal) {
    if (col > 0 && grid[row][col - 1] !== null) return false;
    if (col + len < size && grid[row][col + len] !== null) return false;
  } else {
    if (row > 0 && grid[row - 1][col] !== null) return false;
    if (row + len < size && grid[row + len][col] !== null) return false;
  }

  // First word doesn't need intersection
  const isFirstWord = grid.every(row => row.every(cell => cell === null));
  if (isFirstWord) return true;

  // Require intersection unless non-strict mode allows standalone placement
  return hasIntersection || !strict;
}

/**
 * Place a word on the grid
 * @param {Array<Array<string|null>>} grid
 * @param {string} word
 * @param {number} row
 * @param {number} col
 * @param {boolean} horizontal
 */
function placeWord(grid, word, row, col, horizontal) {
  const chars = [...word];
  for (let i = 0; i < chars.length; i++) {
    const r = horizontal ? row : row + i;
    const c = horizontal ? col + i : col;
    grid[r][c] = chars[i];
  }
}

/**
 * Find possible placements for a word
 * @param {Array<Array<string|null>>} grid
 * @param {string} word
 * @param {boolean} allowNonIntersecting - allow placements that don't intersect
 * @returns {Array<{row: number, col: number, horizontal: boolean, intersections: number}>}
 */
function findPlacements(grid, word, allowNonIntersecting = false) {
  const size = grid.length;
  const chars = [...word];
  const placements = [];

  // Try to find intersections with existing letters
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r][c] !== null) {
        const gridChar = grid[r][c];
        // Find matching character in word
        for (let i = 0; i < chars.length; i++) {
          if (chars[i] === gridChar) {
            // Try horizontal placement
            const hCol = c - i;
            if (hCol >= 0 && canPlaceWord(grid, word, r, hCol, true)) {
              const intersections = countIntersections(grid, word, r, hCol, true);
              placements.push({ row: r, col: hCol, horizontal: true, intersections });
            }
            // Try vertical placement
            const vRow = r - i;
            if (vRow >= 0 && canPlaceWord(grid, word, vRow, c, false)) {
              const intersections = countIntersections(grid, word, vRow, c, false);
              placements.push({ row: vRow, col: c, horizontal: false, intersections });
            }
          }
        }
      }
    }
  }

  // If grid is empty, place in center
  if (placements.length === 0 && grid.every(row => row.every(cell => cell === null))) {
    const startCol = Math.floor((size - chars.length) / 2);
    const startRow = Math.floor(size / 2);
    if (startCol >= 0) {
      placements.push({ row: startRow, col: startCol, horizontal: true, intersections: 0 });
    }
  }

  // If no intersecting placements and allowed, try adjacent placements
  if (placements.length === 0 && allowNonIntersecting) {
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        // Try horizontal
        if (canPlaceWord(grid, word, r, c, true)) {
          // Check if adjacent to existing words
          if (hasAdjacentWord(grid, word, r, c, true)) {
            placements.push({ row: r, col: c, horizontal: true, intersections: 0 });
          }
        }
        // Try vertical
        if (canPlaceWord(grid, word, r, c, false)) {
          if (hasAdjacentWord(grid, word, r, c, false)) {
            placements.push({ row: r, col: c, horizontal: false, intersections: 0 });
          }
        }
      }
    }
  }

  return placements;
}

/**
 * Count intersections for a placement
 */
function countIntersections(grid, word, row, col, horizontal) {
  const chars = [...word];
  let count = 0;
  for (let i = 0; i < chars.length; i++) {
    const r = horizontal ? row : row + i;
    const c = horizontal ? col + i : col;
    if (grid[r][c] !== null) count++;
  }
  return count;
}

/**
 * Check if placement is adjacent to existing words
 */
function hasAdjacentWord(grid, word, row, col, horizontal) {
  const size = grid.length;
  const chars = [...word];

  for (let i = 0; i < chars.length; i++) {
    const r = horizontal ? row : row + i;
    const c = horizontal ? col + i : col;

    // Check perpendicular neighbors
    if (horizontal) {
      if (r > 0 && grid[r - 1][c] !== null) return true;
      if (r < size - 1 && grid[r + 1][c] !== null) return true;
    } else {
      if (c > 0 && grid[r][c - 1] !== null) return true;
      if (c < size - 1 && grid[r][c + 1] !== null) return true;
    }
  }
  return false;
}

/**
 * Calculate grid density (filled cells / total cells)
 */
function calculateDensity(grid) {
  let filled = 0;
  const total = grid.length * grid.length;
  for (const row of grid) {
    for (const cell of row) {
      if (cell !== null) filled++;
    }
  }
  return filled / total;
}

/**
 * Get minimum requirements based on grid size
 */
function getRequirements(gridSize) {
  // Target 80%+ density for all grid sizes
  const requirements = {
    5: { minWords: 6, minDensity: 0.8 },
    6: { minWords: 8, minDensity: 0.8 },
    7: { minWords: 10, minDensity: 0.8 },
    8: { minWords: 12, minDensity: 0.8 },
    9: { minWords: 15, minDensity: 0.8 },
    10: { minWords: 18, minDensity: 0.8 },
    12: { minWords: 25, minDensity: 0.8 },
    15: { minWords: 35, minDensity: 0.8 }
  };
  return requirements[gridSize] || { minWords: Math.ceil(gridSize * 2.5), minDensity: 0.8 };
}

/**
 * Generate a crossword puzzle from word list
 * @param {Array<{answer: string, clue: string}>} wordList
 * @param {number} gridSize
 * @returns {{grid: Array, words: Array, width: number, height: number}}
 */
function generateCrossword(wordList, gridSize = 10) {
  const { minWords, minDensity } = getRequirements(gridSize);

  // Normalize and filter words
  let processedWords = wordList
    .map(w => ({
      answer: normalizeJapanese(w.answer),
      clue: w.clue
    }))
    .filter(w => w.answer.length >= 2 && w.answer.length <= gridSize);

  // Remove duplicates
  const seen = new Set();
  processedWords = processedWords.filter(w => {
    if (seen.has(w.answer)) return false;
    seen.add(w.answer);
    return true;
  });

  // Sort: mix of lengths for better grid coverage
  // Start with medium-length words, then alternate
  processedWords.sort((a, b) => {
    const aLen = a.answer.length;
    const bLen = b.answer.length;
    // Prefer 3-5 character words first (easier to place)
    const aScore = (aLen >= 3 && aLen <= 5) ? 2 : (aLen <= 7 ? 1 : 0);
    const bScore = (bLen >= 3 && bLen <= 5) ? 2 : (bLen <= 7 ? 1 : 0);
    if (aScore !== bScore) return bScore - aScore;
    return bLen - aLen;
  });

  let bestResult = null;
  let bestScore = 0;

  // Try many times for better results - more attempts for larger grids
  const maxAttempts = gridSize <= 7 ? 80 : gridSize <= 10 ? 120 : 150;

  console.log(`  [Grid] Starting generation (${processedWords.length} words available, ${maxAttempts} attempts)`);
  const startTime = Date.now();
  let lastLogTime = startTime;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Log progress every 2 seconds
    const now = Date.now();
    if (now - lastLogTime > 2000) {
      const progress = ((attempt / maxAttempts) * 100).toFixed(0);
      const bestDensity = bestResult ? (bestResult.density * 100).toFixed(1) : '0';
      const bestWords = bestResult ? bestResult.words.length : 0;
      console.log(`  [Grid] Progress: ${progress}% (attempt ${attempt}/${maxAttempts}, best: ${bestWords} words, ${bestDensity}% density)`);
      lastLogTime = now;
    }
    const grid = createEmptyGrid(gridSize);
    const placedWords = [];
    const usedWords = new Set();

    // Shuffle words for variety
    const wordsToTry = [...processedWords];
    if (attempt > 0) {
      for (let i = wordsToTry.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [wordsToTry[i], wordsToTry[j]] = [wordsToTry[j], wordsToTry[i]];
      }
    }

    // PASS 1: Place words with intersections
    let position = 1;
    for (const word of wordsToTry) {
      if (usedWords.has(word.answer)) continue;

      const placements = findPlacements(grid, word.answer, false);

      if (placements.length > 0) {
        // Sort by intersections (more is better)
        placements.sort((a, b) => b.intersections - a.intersections);

        // Pick best or random from top choices
        const topPlacements = placements.slice(0, Math.min(3, placements.length));
        const placement = topPlacements[Math.floor(Math.random() * topPlacements.length)];

        placeWord(grid, word.answer, placement.row, placement.col, placement.horizontal);
        usedWords.add(word.answer);

        placedWords.push({
          answer: word.answer,
          clue: word.clue,
          articleLink: word.articleLink || null,
          startRow: placement.row,
          startCol: placement.col,
          position: position++,
          orientation: placement.horizontal ? 'across' : 'down',
          length: [...word.answer].length
        });
      }
    }

    // PASS 2: Try to fill gaps with remaining short words (交差必須)
    const shortWords = wordsToTry
      .filter(w => !usedWords.has(w.answer) && w.answer.length <= 4)
      .sort((a, b) => a.answer.length - b.answer.length);

    for (const word of shortWords) {
      if (usedWords.has(word.answer)) continue;

      // 交差必須: 孤立した単語を防ぐ
      const placements = findPlacements(grid, word.answer, false);

      if (placements.length > 0) {
        const placement = placements[Math.floor(Math.random() * placements.length)];
        placeWord(grid, word.answer, placement.row, placement.col, placement.horizontal);
        usedWords.add(word.answer);

        placedWords.push({
          answer: word.answer,
          clue: word.clue,
          articleLink: word.articleLink || null,
          startRow: placement.row,
          startCol: placement.col,
          position: position++,
          orientation: placement.horizontal ? 'across' : 'down',
          length: [...word.answer].length
        });
      }
    }

    // PASS 3: Try remaining words (交差必須)
    for (const word of wordsToTry) {
      if (usedWords.has(word.answer)) continue;

      // 交差必須: 孤立した単語を防ぐ
      const placements = findPlacements(grid, word.answer, false);

      if (placements.length > 0) {
        placements.sort((a, b) => b.intersections - a.intersections);
        const placement = placements[0];
        placeWord(grid, word.answer, placement.row, placement.col, placement.horizontal);
        usedWords.add(word.answer);

        placedWords.push({
          answer: word.answer,
          clue: word.clue,
          articleLink: word.articleLink || null,
          startRow: placement.row,
          startCol: placement.col,
          position: position++,
          orientation: placement.horizontal ? 'across' : 'down',
          length: [...word.answer].length
        });
      }
    }

    // PASS 4 削除: 孤立した単語を配置するため廃止

    // Score by density (prioritize filling the grid)
    const density = calculateDensity(grid);
    // Heavily weight density, bonus for word count
    const score = density * 1000 + placedWords.length * 10;

    if (score > bestScore) {
      bestScore = score;
      bestResult = { grid, words: placedWords, density };
    }

    // Early exit only if we achieve excellent density (85%+)
    if (density >= 0.85 && placedWords.length >= minWords) {
      bestResult = { grid, words: placedWords, density };
      break;
    }
  }

  if (!bestResult || bestResult.words.length === 0) {
    throw new Error('Failed to generate crossword');
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const filledCells = Math.round(bestResult.density * gridSize * gridSize);
  const totalCells = gridSize * gridSize;
  console.log(`  [Grid] Complete in ${elapsed}s`);
  console.log(`  [Grid] Result: ${bestResult.words.length} words, ${filledCells}/${totalCells} cells (${(bestResult.density * 100).toFixed(1)}% density)`);

  // Assign clue numbers based on position
  const numberGrid = createEmptyGrid(gridSize);
  let clueNumber = 1;

  // Sort words by position (top-to-bottom, left-to-right)
  bestResult.words.sort((a, b) => {
    if (a.startRow !== b.startRow) return a.startRow - b.startRow;
    return a.startCol - b.startCol;
  });

  for (const word of bestResult.words) {
    const key = `${word.startRow},${word.startCol}`;
    if (!numberGrid[word.startRow][word.startCol]) {
      numberGrid[word.startRow][word.startCol] = clueNumber++;
    }
    word.position = numberGrid[word.startRow][word.startCol];
  }

  // Build cell grid with metadata
  const cellGrid = bestResult.grid.map((row, r) =>
    row.map((cell, c) => {
      if (cell === null) return null;
      return {
        letter: cell,
        number: numberGrid[r][c] || null
      };
    })
  );

  return {
    width: gridSize,
    height: gridSize,
    grid: cellGrid,
    words: bestResult.words
  };
}

module.exports = {
  generateCrossword,
  normalizeJapanese
};
