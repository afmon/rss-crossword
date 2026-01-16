/**
 * Puzzle cache service with file persistence
 */

const fs = require('fs');
const path = require('path');

// In-memory cache for active puzzles
const memoryCache = new Map();
const MEMORY_TTL = 60 * 60 * 1000; // 1 hour

// File storage path
const PUZZLES_DIR = path.join(__dirname, '../../data/puzzles');

// Ensure puzzles directory exists
if (!fs.existsSync(PUZZLES_DIR)) {
  fs.mkdirSync(PUZZLES_DIR, { recursive: true });
}

/**
 * Store a puzzle in memory cache and save to file
 * @param {string} id
 * @param {object} puzzle
 */
function set(id, puzzle) {
  // Store in memory
  memoryCache.set(id, {
    puzzle,
    timestamp: Date.now()
  });

  // Save to file
  savePuzzleToFile(id, puzzle);
}

/**
 * Get a puzzle from cache (memory first, then file)
 * @param {string} id
 * @returns {object|null}
 */
function get(id) {
  // Check memory cache first
  const entry = memoryCache.get(id);
  if (entry) {
    return entry.puzzle;
  }

  // Try to load from file
  const puzzle = loadPuzzleFromFile(id);
  if (puzzle) {
    // Add back to memory cache
    memoryCache.set(id, {
      puzzle,
      timestamp: Date.now()
    });
    return puzzle;
  }

  return null;
}

/**
 * Delete a puzzle from cache and file
 * @param {string} id
 */
function del(id) {
  memoryCache.delete(id);
  deletePuzzleFile(id);
}

/**
 * Save puzzle to file
 * @param {string} id
 * @param {object} puzzle
 */
function savePuzzleToFile(id, puzzle) {
  try {
    const filePath = path.join(PUZZLES_DIR, `${id}.json`);
    const data = {
      ...puzzle,
      savedAt: new Date().toISOString()
    };
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error(`[Cache] Failed to save puzzle ${id}:`, e.message);
  }
}

/**
 * Load puzzle from file
 * @param {string} id
 * @returns {object|null}
 */
function loadPuzzleFromFile(id) {
  try {
    const filePath = path.join(PUZZLES_DIR, `${id}.json`);
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return data;
    }
  } catch (e) {
    console.error(`[Cache] Failed to load puzzle ${id}:`, e.message);
  }
  return null;
}

/**
 * Delete puzzle file
 * @param {string} id
 */
function deletePuzzleFile(id) {
  try {
    const filePath = path.join(PUZZLES_DIR, `${id}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (e) {
    console.error(`[Cache] Failed to delete puzzle ${id}:`, e.message);
  }
}

/**
 * Get list of all saved puzzles
 * @returns {Array<{id: string, createdAt: string, size: number, wordCount: number}>}
 */
function listSavedPuzzles() {
  try {
    const files = fs.readdirSync(PUZZLES_DIR).filter(f => f.endsWith('.json'));
    const puzzles = [];

    for (const file of files) {
      try {
        const filePath = path.join(PUZZLES_DIR, file);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        puzzles.push({
          id: data.id,
          createdAt: data.createdAt,
          savedAt: data.savedAt,
          size: data.size,
          wordCount: data.words ? data.words.length : 0
        });
      } catch (e) {
        // Skip invalid files
      }
    }

    // Sort by createdAt descending (newest first)
    puzzles.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return puzzles;
  } catch (e) {
    console.error('[Cache] Failed to list puzzles:', e.message);
    return [];
  }
}

/**
 * Clear expired entries from memory cache
 */
function cleanup() {
  const now = Date.now();
  for (const [id, entry] of memoryCache.entries()) {
    if (now - entry.timestamp > MEMORY_TTL) {
      memoryCache.delete(id);
    }
  }
}

// Run cleanup every 10 minutes
setInterval(cleanup, 10 * 60 * 1000);

module.exports = {
  set,
  get,
  del,
  cleanup,
  listSavedPuzzles
};
