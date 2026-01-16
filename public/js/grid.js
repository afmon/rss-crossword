/**
 * Crossword grid renderer and interaction handler
 */
class CrosswordGrid {
  constructor(container, puzzle) {
    this.container = container;
    this.puzzle = puzzle;
    this.cells = new Map(); // Map<"row,col", HTMLInputElement>
    this.currentCell = null;
    this.direction = 'across'; // or 'down'
    this.wordCells = new Map(); // Map<"number-direction", Set<"row,col">>
    this.isComposing = false; // IME composition state
  }

  render() {
    this.container.innerHTML = '';

    const table = document.createElement('table');
    table.className = 'crossword-grid';

    // Build word-to-cells mapping
    this.buildWordCellsMap();

    for (let row = 0; row < this.puzzle.height; row++) {
      const tr = document.createElement('tr');
      for (let col = 0; col < this.puzzle.width; col++) {
        const td = this.createCell(row, col);
        tr.appendChild(td);
      }
      table.appendChild(tr);
    }

    this.container.appendChild(table);
    this.attachEventListeners();
  }

  buildWordCellsMap() {
    for (const word of this.puzzle.words) {
      const key = `${word.position}-${word.orientation}`;
      const cells = new Set();

      for (let i = 0; i < word.length; i++) {
        const r = word.orientation === 'across' ? word.startRow : word.startRow + i;
        const c = word.orientation === 'across' ? word.startCol + i : word.startCol;
        cells.add(`${r},${c}`);
      }

      this.wordCells.set(key, cells);
    }
  }

  createCell(row, col) {
    const td = document.createElement('td');
    const cellData = this.puzzle.grid[row][col];

    if (cellData === null) {
      td.className = 'blocked';
    } else {
      const input = document.createElement('input');
      input.type = 'text';
      input.maxLength = 1;
      input.dataset.row = row;
      input.dataset.col = col;
      input.dataset.answer = cellData.letter;

      if (cellData.number) {
        const span = document.createElement('span');
        span.className = 'cell-number';
        span.textContent = cellData.number;
        td.appendChild(span);
      }

      td.appendChild(input);
      this.cells.set(`${row},${col}`, input);
    }

    return td;
  }

  attachEventListeners() {
    for (const [key, input] of this.cells.entries()) {
      input.addEventListener('focus', () => this.onCellFocus(key));
      input.addEventListener('input', (e) => this.onCellInput(e, key));
      input.addEventListener('keydown', (e) => this.onKeyDown(e, key));
      input.addEventListener('click', () => this.onCellClick(key));

      // IME composition events for Japanese input
      input.addEventListener('compositionstart', () => {
        this.isComposing = true;
      });
      input.addEventListener('compositionend', (e) => {
        this.isComposing = false;
        this.onCompositionEnd(e, key);
      });
    }
  }

  onCellFocus(key) {
    this.currentCell = key;
    this.highlightCurrentWord();
  }

  onCellClick(key) {
    if (this.currentCell === key) {
      // Toggle direction on same cell click
      this.direction = this.direction === 'across' ? 'down' : 'across';
      this.highlightCurrentWord();
    }
  }

  onCellInput(e, key) {
    // Skip during IME composition
    if (this.isComposing) {
      return;
    }

    const input = e.target;
    let value = input.value;

    // Convert to katakana if hiragana
    value = this.toKatakana(value);

    // Keep only the last character (for direct input)
    if (value.length > 1) {
      value = value.slice(-1);
    }

    input.value = value;

    if (value) {
      this.moveToNextCell(key);
    }
  }

  onCompositionEnd(e, key) {
    const input = e.target;
    let value = input.value;

    // Convert to katakana
    value = this.toKatakana(value);

    // Keep only the first character after conversion
    if (value.length > 0) {
      value = value.charAt(0);
    }

    input.value = value;

    if (value) {
      this.moveToNextCell(key);
    }
  }

  onKeyDown(e, key) {
    // Skip during IME composition
    if (this.isComposing) {
      return;
    }

    const [row, col] = key.split(',').map(Number);

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        this.moveTo(row - 1, col);
        break;
      case 'ArrowDown':
        e.preventDefault();
        this.moveTo(row + 1, col);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        this.moveTo(row, col - 1);
        break;
      case 'ArrowRight':
        e.preventDefault();
        this.moveTo(row, col + 1);
        break;
      case 'Backspace':
        if (!this.cells.get(key).value) {
          e.preventDefault();
          this.moveToPrevCell(key);
        }
        break;
      case 'Tab':
        e.preventDefault();
        this.moveToNextWord();
        break;
      case ' ':
        e.preventDefault();
        this.direction = this.direction === 'across' ? 'down' : 'across';
        this.highlightCurrentWord();
        break;
    }
  }

  toKatakana(str) {
    return str.replace(/[\u3041-\u3096]/g, (char) =>
      String.fromCharCode(char.charCodeAt(0) + 0x60)
    );
  }

  moveTo(row, col) {
    const key = `${row},${col}`;
    const input = this.cells.get(key);
    if (input) {
      input.focus();
    }
  }

  moveToNextCell(currentKey) {
    const [row, col] = currentKey.split(',').map(Number);

    if (this.direction === 'across') {
      this.moveTo(row, col + 1);
    } else {
      this.moveTo(row + 1, col);
    }
  }

  moveToPrevCell(currentKey) {
    const [row, col] = currentKey.split(',').map(Number);

    if (this.direction === 'across') {
      this.moveTo(row, col - 1);
    } else {
      this.moveTo(row - 1, col);
    }
  }

  moveToNextWord() {
    // Find current word and move to next
    const words = this.puzzle.words.filter(w => w.orientation === this.direction);
    const currentWord = this.getCurrentWord();

    if (!currentWord) {
      // Switch direction and try again
      this.direction = this.direction === 'across' ? 'down' : 'across';
      const firstWord = this.puzzle.words.find(w => w.orientation === this.direction);
      if (firstWord) {
        this.moveTo(firstWord.startRow, firstWord.startCol);
      }
      return;
    }

    const currentIndex = words.findIndex(w =>
      w.position === currentWord.position && w.orientation === currentWord.orientation
    );

    const nextIndex = (currentIndex + 1) % words.length;
    const nextWord = words[nextIndex];

    if (nextWord) {
      this.moveTo(nextWord.startRow, nextWord.startCol);
    }
  }

  getCurrentWord() {
    if (!this.currentCell) return null;

    const [row, col] = this.currentCell.split(',').map(Number);

    return this.puzzle.words.find(word => {
      if (word.orientation !== this.direction) return false;

      if (word.orientation === 'across') {
        return row === word.startRow &&
               col >= word.startCol &&
               col < word.startCol + word.length;
      } else {
        return col === word.startCol &&
               row >= word.startRow &&
               row < word.startRow + word.length;
      }
    });
  }

  highlightCurrentWord() {
    // Clear all highlights
    for (const input of this.cells.values()) {
      input.parentElement.classList.remove('current-word', 'current-cell');
    }

    if (!this.currentCell) return;

    // Highlight current cell
    const currentInput = this.cells.get(this.currentCell);
    if (currentInput) {
      currentInput.parentElement.classList.add('current-cell');
    }

    // Highlight current word
    const word = this.getCurrentWord();
    if (word) {
      const key = `${word.position}-${word.orientation}`;
      const wordCells = this.wordCells.get(key);

      if (wordCells) {
        for (const cellKey of wordCells) {
          const input = this.cells.get(cellKey);
          if (input) {
            input.parentElement.classList.add('current-word');
          }
        }
      }
    }
  }

  getAnswers() {
    const answers = {};

    for (const word of this.puzzle.words) {
      const key = `${word.position}-${word.orientation}`;
      let answer = '';

      for (let i = 0; i < word.length; i++) {
        const r = word.orientation === 'across' ? word.startRow : word.startRow + i;
        const c = word.orientation === 'across' ? word.startCol + i : word.startCol;
        const input = this.cells.get(`${r},${c}`);
        answer += input?.value || '';
      }

      answers[key] = answer;
    }

    return answers;
  }

  showResults(correct, incorrect) {
    // Clear previous results
    for (const input of this.cells.values()) {
      input.parentElement.classList.remove('correct', 'incorrect');
    }

    // Mark correct
    for (const key of correct) {
      const word = this.puzzle.words.find(w =>
        `${w.position}-${w.orientation}` === key
      );
      if (word) {
        const wordCells = this.wordCells.get(key);
        for (const cellKey of wordCells) {
          const input = this.cells.get(cellKey);
          if (input) {
            input.parentElement.classList.add('correct');
          }
        }
      }
    }

    // Mark incorrect
    for (const key of incorrect) {
      const word = this.puzzle.words.find(w =>
        `${w.position}-${w.orientation}` === key
      );
      if (word) {
        const wordCells = this.wordCells.get(key);
        for (const cellKey of wordCells) {
          const input = this.cells.get(cellKey);
          if (input && !input.parentElement.classList.contains('correct')) {
            input.parentElement.classList.add('incorrect');
          }
        }
      }
    }
  }

  setHint(clueNumber, direction, hint) {
    const word = this.puzzle.words.find(w =>
      w.position === clueNumber && w.orientation === direction
    );

    if (word) {
      const chars = [...hint];
      for (let i = 0; i < chars.length && i < word.length; i++) {
        // Skip both half-width and full-width underscores
        if (chars[i] !== '_' && chars[i] !== '＿') {
          const r = word.orientation === 'across' ? word.startRow : word.startRow + i;
          const c = word.orientation === 'across' ? word.startCol + i : word.startCol;
          const input = this.cells.get(`${r},${c}`);
          if (input && !input.value) {
            input.value = chars[i];
          }
        }
      }
    }
  }

  selectWord(clueNumber, direction) {
    const word = this.puzzle.words.find(w =>
      w.position === clueNumber && w.orientation === direction
    );

    if (word) {
      this.direction = direction;
      this.moveTo(word.startRow, word.startCol);
    }
  }

  /**
   * Generate text representation of the grid
   * @param {boolean} includeAnswers - Include user's current answers
   * @returns {string}
   */
  toText(includeAnswers = true) {
    const lines = [];

    for (let row = 0; row < this.puzzle.height; row++) {
      let line = '';
      for (let col = 0; col < this.puzzle.width; col++) {
        const cellData = this.puzzle.grid[row][col];

        if (cellData === null) {
          line += '■';
        } else if (includeAnswers) {
          const input = this.cells.get(`${row},${col}`);
          const value = input?.value || '';
          line += value || '□';
        } else {
          line += '□';
        }
      }
      lines.push(line);
    }

    return lines.join('\n');
  }

  /**
   * Copy grid to clipboard
   * @param {boolean} includeAnswers - Include user's current answers
   * @returns {Promise<boolean>}
   */
  async copyToClipboard(includeAnswers = true) {
    const text = this.toText(includeAnswers);

    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.error('Failed to copy:', err);
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        document.body.removeChild(textarea);
        return true;
      } catch (e) {
        document.body.removeChild(textarea);
        return false;
      }
    }
  }
}
