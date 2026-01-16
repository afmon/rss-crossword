/**
 * Main application controller
 */
class CrosswordApp {
  constructor() {
    this.grid = null;
    this.puzzle = null;

    this.gridContainer = document.getElementById('gridContainer');
    this.acrossClues = document.getElementById('acrossClues');
    this.downClues = document.getElementById('downClues');
    this.loadingEl = document.getElementById('loading');
    this.messageEl = document.getElementById('message');

    this.gridSizeSelect = document.getElementById('gridSize');
    this.dataRangeSelect = document.getElementById('dataRange');
    this.newPuzzleBtn = document.getElementById('newPuzzle');
    this.checkAnswersBtn = document.getElementById('checkAnswers');
    this.showSavedBtn = document.getElementById('showSaved');
    this.closeSavedBtn = document.getElementById('closeSaved');
    this.savedPuzzlesEl = document.getElementById('savedPuzzles');
    this.savedPuzzleList = document.getElementById('savedPuzzleList');
    this.copyGridBtn = document.getElementById('copyGrid');

    this.init();
  }

  init() {
    this.newPuzzleBtn.addEventListener('click', () => this.loadNewPuzzle());
    this.checkAnswersBtn.addEventListener('click', () => this.checkAnswers());
    this.showSavedBtn.addEventListener('click', () => this.showSavedPuzzles());
    this.closeSavedBtn.addEventListener('click', () => this.hideSavedPuzzles());
    this.copyGridBtn.addEventListener('click', () => this.copyGrid());

    // Show welcome message
    this.showMessage('「新しいパズル」をクリックして始めましょう！', 'info');
  }

  async loadNewPuzzle() {
    const size = parseInt(this.gridSizeSelect.value);
    const dataRange = parseInt(this.dataRangeSelect.value);

    this.showLoading(true);
    this.checkAnswersBtn.disabled = true;
    this.copyGridBtn.disabled = true;

    try {
      this.puzzle = await api.generatePuzzle(size, dataRange);
      this.renderPuzzle();
      this.renderClues();
      this.checkAnswersBtn.disabled = false;
      this.copyGridBtn.disabled = false;
      this.showMessage('パズルが完成しました！頑張ってください！', 'success');
    } catch (error) {
      console.error('Failed to generate puzzle:', error);
      this.showMessage('パズル生成に失敗しました: ' + error.message, 'error');
    }

    this.showLoading(false);
  }

  renderPuzzle() {
    this.grid = new CrosswordGrid(this.gridContainer, this.puzzle);
    this.grid.render();
  }

  renderClues() {
    this.acrossClues.innerHTML = '';
    this.downClues.innerHTML = '';

    // Across clues
    for (const clue of this.puzzle.clues.across) {
      const li = this.createClueElement(clue, 'across');
      this.acrossClues.appendChild(li);
    }

    // Down clues
    for (const clue of this.puzzle.clues.down) {
      const li = this.createClueElement(clue, 'down');
      this.downClues.appendChild(li);
    }
  }

  createClueElement(clue, direction) {
    const li = document.createElement('li');
    li.dataset.number = clue.number;
    li.dataset.direction = direction;

    const numberSpan = document.createElement('span');
    numberSpan.className = 'clue-number';
    numberSpan.textContent = clue.number + '.';

    const clueText = document.createTextNode(' ' + clue.clue);

    const lengthSpan = document.createElement('span');
    lengthSpan.className = 'clue-length';
    lengthSpan.textContent = `(${clue.length})`;

    const hintBtn = document.createElement('button');
    hintBtn.className = 'hint-btn';
    hintBtn.textContent = 'ヒント';
    hintBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.getHint(clue.number, direction);
    });

    li.appendChild(numberSpan);
    li.appendChild(clueText);
    li.appendChild(lengthSpan);
    li.appendChild(hintBtn);

    // Add article link button if available
    if (clue.articleLink) {
      const articleBtn = document.createElement('a');
      articleBtn.className = 'article-btn';
      articleBtn.href = clue.articleLink;
      articleBtn.target = '_blank';
      articleBtn.rel = 'noopener noreferrer';
      articleBtn.textContent = '記事';
      articleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
      });
      li.appendChild(articleBtn);
    }

    li.addEventListener('click', () => {
      this.selectClue(clue.number, direction);
    });

    return li;
  }

  selectClue(number, direction) {
    // Remove active class from all clues
    document.querySelectorAll('.clues-section li').forEach(li => {
      li.classList.remove('active');
    });

    // Add active class to selected clue
    const selector = `.clues-section li[data-number="${number}"][data-direction="${direction}"]`;
    const li = document.querySelector(selector);
    if (li) {
      li.classList.add('active');
    }

    // Select word in grid
    if (this.grid) {
      this.grid.selectWord(number, direction);
    }
  }

  async checkAnswers() {
    if (!this.puzzle || !this.grid) return;

    const answers = this.grid.getAnswers();

    try {
      const result = await api.checkAnswers(this.puzzle.id, answers);

      this.grid.showResults(result.correct, result.incorrect);

      // Update clue styles
      document.querySelectorAll('.clues-section li').forEach(li => {
        li.classList.remove('completed');
      });

      for (const key of result.correct) {
        const [number, direction] = key.split('-');
        const selector = `.clues-section li[data-number="${number}"][data-direction="${direction}"]`;
        const li = document.querySelector(selector);
        if (li) {
          li.classList.add('completed');
        }
      }

      const total = this.puzzle.words.length;
      const correctCount = result.correct.length;

      if (correctCount === total) {
        this.showMessage('おめでとうございます！全問正解です！', 'success');
      } else {
        this.showMessage(`${correctCount}/${total} 問正解！`, 'info');
      }
    } catch (error) {
      this.showMessage('答え合わせに失敗しました: ' + error.message, 'error');
    }
  }

  async getHint(clueNumber, direction) {
    if (!this.puzzle) return;

    try {
      const result = await api.getHint(this.puzzle.id, clueNumber, direction);
      this.grid.setHint(clueNumber, direction, result.hint);
      this.showMessage(`ヒント: ${result.hint}`, 'info');
    } catch (error) {
      this.showMessage('ヒント取得に失敗しました: ' + error.message, 'error');
    }
  }

  showLoading(show) {
    if (show) {
      this.loadingEl.classList.remove('hidden');
    } else {
      this.loadingEl.classList.add('hidden');
    }
  }

  showMessage(text, type = 'info') {
    this.messageEl.textContent = text;
    this.messageEl.className = type;

    // Auto-hide after 5 seconds
    setTimeout(() => {
      this.messageEl.classList.add('hidden');
    }, 5000);
  }

  async showSavedPuzzles() {
    try {
      const puzzles = await api.getSavedPuzzles();
      this.savedPuzzleList.innerHTML = '';

      if (puzzles.length === 0) {
        const li = document.createElement('li');
        li.textContent = '保存済みのパズルはありません';
        li.className = 'empty-message';
        this.savedPuzzleList.appendChild(li);
      } else {
        for (const puzzle of puzzles) {
          const li = document.createElement('li');
          li.className = 'saved-puzzle-item';

          const date = new Date(puzzle.createdAt);
          const dateStr = date.toLocaleDateString('ja-JP', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });

          li.innerHTML = `
            <span class="puzzle-info">${puzzle.size}x${puzzle.size} (${puzzle.wordCount}問)</span>
            <span class="puzzle-date">${dateStr}</span>
          `;

          li.addEventListener('click', () => this.loadSavedPuzzle(puzzle.id));
          this.savedPuzzleList.appendChild(li);
        }
      }

      this.savedPuzzlesEl.classList.remove('hidden');
    } catch (error) {
      this.showMessage('保存済みパズルの取得に失敗しました', 'error');
    }
  }

  hideSavedPuzzles() {
    this.savedPuzzlesEl.classList.add('hidden');
  }

  async loadSavedPuzzle(id) {
    this.showLoading(true);
    this.hideSavedPuzzles();

    try {
      this.puzzle = await api.getPuzzle(id);
      this.renderPuzzle();
      this.renderClues();
      this.checkAnswersBtn.disabled = false;
      this.copyGridBtn.disabled = false;
      this.showMessage('パズルを読み込みました！', 'success');
    } catch (error) {
      this.showMessage('パズルの読み込みに失敗しました: ' + error.message, 'error');
    }

    this.showLoading(false);
  }

  async copyGrid() {
    if (!this.grid) return;

    const success = await this.grid.copyToClipboard(true);
    if (success) {
      this.showMessage('グリッドをクリップボードにコピーしました！', 'success');
    } else {
      this.showMessage('コピーに失敗しました', 'error');
    }
  }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new CrosswordApp();
});
