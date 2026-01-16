/**
 * API client for crossword puzzle backend
 */
const api = {
  /**
   * Generate a new puzzle
   * @param {number} size - Grid size (5-15)
   * @param {number} dataRange - Days to include from cache (1, 7, 30, 365)
   * @returns {Promise<object>}
   */
  async generatePuzzle(size, dataRange = 7) {
    const response = await fetch('/api/puzzle/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ size, dataRange })
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to generate puzzle');
    }

    return data.puzzle;
  },

  /**
   * Get an existing puzzle
   * @param {string} id - Puzzle ID
   * @returns {Promise<object>}
   */
  async getPuzzle(id) {
    const response = await fetch(`/api/puzzle/${id}`);
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Puzzle not found');
    }

    return data.puzzle;
  },

  /**
   * Check answers
   * @param {string} puzzleId
   * @param {object} answers
   * @returns {Promise<{correct: string[], incorrect: string[]}>}
   */
  async checkAnswers(puzzleId, answers) {
    const response = await fetch('/api/puzzle/check', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ puzzleId, answers })
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to check answers');
    }

    return {
      correct: data.correct,
      incorrect: data.incorrect
    };
  },

  /**
   * Get a hint
   * @param {string} puzzleId
   * @param {number} clueNumber
   * @param {string} direction
   * @returns {Promise<{hint: string, revealed: number, total: number}>}
   */
  async getHint(puzzleId, clueNumber, direction) {
    const response = await fetch('/api/puzzle/hint', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ puzzleId, clueNumber, direction })
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to get hint');
    }

    return {
      hint: data.hint,
      revealed: data.revealed,
      total: data.total
    };
  },

  /**
   * Get list of saved puzzles
   * @returns {Promise<Array<{id: string, createdAt: string, size: number, wordCount: number}>>}
   */
  async getSavedPuzzles() {
    const response = await fetch('/api/puzzles');
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to get saved puzzles');
    }

    return data.puzzles;
  }
};
