import { useState, useEffect, useRef, useCallback } from 'react';
import { crosswordApi, feedsApi } from '../services/api';
import type { Puzzle, PuzzleSummary, GridCell, Clue, Feed } from '../types';

type Direction = 'across' | 'down';

export function CrosswordPage() {
  const [puzzles, setPuzzles] = useState<PuzzleSummary[]>([]);
  const [currentPuzzle, setCurrentPuzzle] = useState<Puzzle | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  // Generation options
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [gridSize, setGridSize] = useState(10);
  const [dataRange, setDataRange] = useState(7);
  const [selectedFeeds, setSelectedFeeds] = useState<number[]>([]);
  const [availableFeeds, setAvailableFeeds] = useState<Feed[]>([]);

  // Crossword state
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: number } | null>(null);
  const [direction, setDirection] = useState<Direction>('across');
  const [checkResult, setCheckResult] = useState<{ correct: string[]; incorrect: string[] } | null>(
    null
  );

  useEffect(() => {
    loadPuzzles();
    loadFeeds();
  }, []);

  const loadPuzzles = async () => {
    try {
      const data = await crosswordApi.list();
      setPuzzles(data.puzzles);
    } catch (error) {
      console.error('Failed to load puzzles:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadFeeds = async () => {
    try {
      const data = await feedsApi.getAll();
      setAvailableFeeds(data.feeds);
    } catch (error) {
      console.error('Failed to load feeds:', error);
    }
  };

  const handleGeneratePuzzle = async () => {
    setGenerating(true);
    setShowGenerateModal(false);

    try {
      const data = await crosswordApi.generate({
        size: gridSize,
        dataRange,
        feedIds: selectedFeeds.length > 0 ? selectedFeeds : undefined,
      });
      setCurrentPuzzle(data.puzzle);
      setUserAnswers({});
      setCheckResult(null);
      await loadPuzzles();
    } catch (error) {
      console.error('Failed to generate puzzle:', error);
      alert('パズルの生成に失敗しました');
    } finally {
      setGenerating(false);
    }
  };

  const handleLoadPuzzle = async (id: string) => {
    try {
      const data = await crosswordApi.get(id);
      setCurrentPuzzle(data.puzzle);
      setUserAnswers({});
      setCheckResult(null);
    } catch (error) {
      console.error('Failed to load puzzle:', error);
    }
  };

  const handleDeletePuzzle = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('このパズルを削除しますか？')) return;

    try {
      await crosswordApi.delete(id);
      if (currentPuzzle?.id === id) {
        setCurrentPuzzle(null);
      }
      await loadPuzzles();
    } catch (error) {
      console.error('Failed to delete puzzle:', error);
    }
  };

  const handleCheckAnswers = async () => {
    if (!currentPuzzle) return;

    try {
      const result = await crosswordApi.check(currentPuzzle.id, userAnswers);
      setCheckResult(result);
    } catch (error) {
      console.error('Failed to check answers:', error);
    }
  };

  const handleGetHint = async (clueNumber: number, dir: Direction) => {
    if (!currentPuzzle) return;

    try {
      const result = await crosswordApi.getHint(currentPuzzle.id, clueNumber, dir);
      alert(`ヒント: ${result.hint}\n(${result.revealed}/${result.total}文字)`);
    } catch (error) {
      console.error('Failed to get hint:', error);
    }
  };

  if (loading) {
    return (
      <div className="crossword-page">
        <div className="loading">読み込み中...</div>
      </div>
    );
  }

  return (
    <div className="crossword-page">
      <div className="crossword-sidebar">
        <div className="puzzle-list-header">
          <h3>パズル一覧</h3>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => setShowGenerateModal(true)}
            disabled={generating}
          >
            {generating ? '生成中...' : '+ 新規作成'}
          </button>
        </div>

        <div className="puzzle-list">
          {puzzles.length === 0 ? (
            <div className="empty-hint">パズルがありません</div>
          ) : (
            puzzles.map((puzzle) => (
              <div
                key={puzzle.id}
                className={`puzzle-item ${currentPuzzle?.id === puzzle.id ? 'active' : ''}`}
                onClick={() => handleLoadPuzzle(puzzle.id)}
              >
                <div className="puzzle-item-info">
                  <span className="puzzle-date">
                    {new Date(puzzle.createdAt).toLocaleDateString('ja-JP')}
                  </span>
                  <span className="puzzle-size">{puzzle.size}x{puzzle.size}</span>
                </div>
                <button
                  className="btn btn-sm btn-danger"
                  onClick={(e) => handleDeletePuzzle(puzzle.id, e)}
                >
                  削除
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="crossword-main">
        {currentPuzzle ? (
          <>
            <div className="crossword-header">
              <h2>クロスワードパズル</h2>
              <div className="crossword-actions">
                <button className="btn btn-primary" onClick={handleCheckAnswers}>
                  答え合わせ
                </button>
              </div>
            </div>

            {checkResult && (
              <div className="check-result">
                <span className="correct">正解: {checkResult.correct.length}</span>
                <span className="incorrect">不正解: {checkResult.incorrect.length}</span>
              </div>
            )}

            <div className="crossword-content">
              <CrosswordGrid
                puzzle={currentPuzzle}
                userAnswers={userAnswers}
                selectedCell={selectedCell}
                direction={direction}
                checkResult={checkResult}
                onCellSelect={(row, col) => setSelectedCell({ row, col })}
                onDirectionToggle={() => setDirection((d) => (d === 'across' ? 'down' : 'across'))}
                onAnswerChange={(key, value) =>
                  setUserAnswers((prev) => ({ ...prev, [key]: value }))
                }
              />

              <CluePanel
                puzzle={currentPuzzle}
                direction={direction}
                selectedCell={selectedCell}
                checkResult={checkResult}
                onSelectClue={(clue, dir) => {
                  setDirection(dir);
                  setSelectedCell({ row: clue.row, col: clue.col });
                }}
                onGetHint={handleGetHint}
              />
            </div>
          </>
        ) : (
          <div className="crossword-empty">
            <h2>クロスワードパズル</h2>
            <p>パズルを選択するか、新しいパズルを生成してください</p>
            <button
              className="btn btn-primary btn-lg"
              onClick={() => setShowGenerateModal(true)}
              disabled={generating}
            >
              {generating ? '生成中...' : '新しいパズルを生成'}
            </button>
          </div>
        )}
      </div>

      {/* Generate Modal */}
      {showGenerateModal && (
        <div className="modal-overlay" onClick={() => setShowGenerateModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>新しいパズルを生成</h3>
              <button className="modal-close" onClick={() => setShowGenerateModal(false)}>
                ×
              </button>
            </div>
            <div className="form-group">
              <label>グリッドサイズ</label>
              <select value={gridSize} onChange={(e) => setGridSize(Number(e.target.value))}>
                <option value={8}>8 × 8 (小)</option>
                <option value={10}>10 × 10 (中)</option>
                <option value={12}>12 × 12 (大)</option>
                <option value={15}>15 × 15 (特大)</option>
              </select>
            </div>
            <div className="form-group">
              <label>記事の範囲</label>
              <select value={dataRange} onChange={(e) => setDataRange(Number(e.target.value))}>
                <option value={1}>1日</option>
                <option value={7}>1週間</option>
                <option value={30}>1ヶ月</option>
                <option value={365}>1年</option>
              </select>
            </div>
            <div className="form-group">
              <label>使用するフィード (任意)</label>
              <div className="feed-checkboxes">
                {availableFeeds.map((feed) => (
                  <label key={feed.id} className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={selectedFeeds.includes(feed.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedFeeds([...selectedFeeds, feed.id]);
                        } else {
                          setSelectedFeeds(selectedFeeds.filter((id) => id !== feed.id));
                        }
                      }}
                    />
                    {feed.title}
                  </label>
                ))}
              </div>
              {availableFeeds.length === 0 && (
                <p className="empty-hint">フィードがありません</p>
              )}
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setShowGenerateModal(false)}>
                キャンセル
              </button>
              <button className="btn btn-primary" onClick={handleGeneratePuzzle}>
                生成
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Crossword Grid Component
interface CrosswordGridProps {
  puzzle: Puzzle;
  userAnswers: Record<string, string>;
  selectedCell: { row: number; col: number } | null;
  direction: Direction;
  checkResult: { correct: string[]; incorrect: string[] } | null;
  onCellSelect: (row: number, col: number) => void;
  onDirectionToggle: () => void;
  onAnswerChange: (key: string, value: string) => void;
}

function CrosswordGrid({
  puzzle,
  userAnswers,
  selectedCell,
  direction,
  checkResult,
  onCellSelect,
  onDirectionToggle,
  onAnswerChange,
}: CrosswordGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // IME composition state
  const [compositionText, setCompositionText] = useState<string>('');
  const [isComposing, setIsComposing] = useState(false);

  // Focus input when cell is selected
  useEffect(() => {
    if (selectedCell && inputRef.current) {
      inputRef.current.focus();
    }
  }, [selectedCell]);

  const getCellKey = (row: number, col: number) => `${row}-${col}`;

  const isInSelectedWord = useCallback(
    (row: number, col: number) => {
      if (!selectedCell) return false;

      const cell = puzzle.grid[selectedCell.row][selectedCell.col];
      if (!cell || cell.isBlack) return false;

      if (direction === 'across') {
        if (row !== selectedCell.row) return false;
        // Find word boundaries
        let start = selectedCell.col;
        let end = selectedCell.col;
        while (start > 0 && !puzzle.grid[row][start - 1].isBlack) start--;
        while (end < puzzle.grid[0].length - 1 && !puzzle.grid[row][end + 1].isBlack) end++;
        return col >= start && col <= end;
      } else {
        if (col !== selectedCell.col) return false;
        let start = selectedCell.row;
        let end = selectedCell.row;
        while (start > 0 && !puzzle.grid[start - 1][col].isBlack) start--;
        while (end < puzzle.grid.length - 1 && !puzzle.grid[end + 1][col].isBlack) end++;
        return row >= start && row <= end;
      }
    },
    [selectedCell, direction, puzzle.grid]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!selectedCell) return;

    const { row, col } = selectedCell;

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        if (row > 0 && !puzzle.grid[row - 1][col].isBlack) {
          onCellSelect(row - 1, col);
        }
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (row < puzzle.grid.length - 1 && !puzzle.grid[row + 1][col].isBlack) {
          onCellSelect(row + 1, col);
        }
        break;
      case 'ArrowLeft':
        e.preventDefault();
        if (col > 0 && !puzzle.grid[row][col - 1].isBlack) {
          onCellSelect(row, col - 1);
        }
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (col < puzzle.grid[0].length - 1 && !puzzle.grid[row][col + 1].isBlack) {
          onCellSelect(row, col + 1);
        }
        break;
      case 'Tab':
        e.preventDefault();
        onDirectionToggle();
        break;
      case 'Backspace':
        e.preventDefault();
        // Clear any accumulated input
        if (inputRef.current) {
          inputRef.current.value = '';
        }
        const key = getCellKey(row, col);
        if (userAnswers[key]) {
          onAnswerChange(key, '');
        } else {
          // Move to previous cell
          if (direction === 'across' && col > 0 && !puzzle.grid[row][col - 1].isBlack) {
            onCellSelect(row, col - 1);
          } else if (direction === 'down' && row > 0 && !puzzle.grid[row - 1][col].isBlack) {
            onCellSelect(row - 1, col);
          }
        }
        break;
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedCell) return;

    const value = e.target.value;
    if (!value) return;

    // Get the last character (for IME composition)
    const char = value.slice(-1).toUpperCase();

    // Only accept katakana or alphabet
    if (/^[\u30A0-\u30FF\u3040-\u309Fー]$/.test(char) || /^[A-Z]$/.test(char)) {
      // Convert hiragana to katakana
      const katakana = char.replace(/[\u3040-\u309F]/g, (c) =>
        String.fromCharCode(c.charCodeAt(0) + 0x60)
      );

      const key = getCellKey(selectedCell.row, selectedCell.col);
      onAnswerChange(key, katakana);

      // Move to next cell
      const { row, col } = selectedCell;
      if (direction === 'across') {
        if (col < puzzle.grid[0].length - 1 && !puzzle.grid[row][col + 1].isBlack) {
          onCellSelect(row, col + 1);
        }
      } else {
        if (row < puzzle.grid.length - 1 && !puzzle.grid[row + 1][col].isBlack) {
          onCellSelect(row + 1, col);
        }
      }
    }

    // Clear input
    e.target.value = '';
  };

  // IME composition handlers
  const handleCompositionStart = () => {
    setIsComposing(true);
  };

  const handleCompositionUpdate = (e: React.CompositionEvent<HTMLInputElement>) => {
    setCompositionText(e.data || '');
  };

  const handleCompositionEnd = () => {
    setIsComposing(false);
    setCompositionText('');
    // Clear input after composition
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  const getCellClass = (cell: GridCell, row: number, col: number) => {
    const classes = ['grid-cell'];

    if (cell.isBlack) {
      classes.push('black');
    } else {
      if (selectedCell?.row === row && selectedCell?.col === col) {
        classes.push('selected');
      } else if (isInSelectedWord(row, col)) {
        classes.push('highlighted');
      }

      const key = getCellKey(row, col);
      if (checkResult) {
        if (checkResult.correct.includes(key)) {
          classes.push('correct');
        } else if (checkResult.incorrect.includes(key)) {
          classes.push('incorrect');
        }
      }
    }

    return classes.join(' ');
  };

  return (
    <div className="crossword-grid-container">
      <div
        ref={gridRef}
        className="crossword-grid"
        style={{
          gridTemplateColumns: `repeat(${puzzle.grid[0].length}, 1fr)`,
        }}
      >
        {puzzle.grid.map((row, rowIndex) =>
          row.map((cell, colIndex) => (
            <div
              key={getCellKey(rowIndex, colIndex)}
              className={getCellClass(cell, rowIndex, colIndex)}
              onClick={() => {
                if (!cell.isBlack) {
                  if (selectedCell?.row === rowIndex && selectedCell?.col === colIndex) {
                    onDirectionToggle();
                  } else {
                    onCellSelect(rowIndex, colIndex);
                  }
                  // クリック後に明示的にフォーカスを設定
                  inputRef.current?.focus();
                }
              }}
            >
              {cell.number && <span className="cell-number">{cell.number}</span>}
              {!cell.isBlack && (
                <span className="cell-letter">
                  {selectedCell?.row === rowIndex && selectedCell?.col === colIndex && isComposing
                    ? compositionText
                    : userAnswers[getCellKey(rowIndex, colIndex)] || ''}
                </span>
              )}
            </div>
          ))
        )}
      </div>

      {/* Hidden input for keyboard handling */}
      <input
        ref={inputRef}
        className="hidden-input"
        type="text"
        autoComplete="off"
        onKeyDown={handleKeyDown}
        onChange={handleInput}
        onCompositionStart={handleCompositionStart}
        onCompositionUpdate={handleCompositionUpdate}
        onCompositionEnd={handleCompositionEnd}
      />

      <div className="grid-hint">
        <span>
          方向: {direction === 'across' ? 'ヨコ →' : 'タテ ↓'} (Tabで切替)
        </span>
      </div>
    </div>
  );
}

// Clue Panel Component
interface CluePanelProps {
  puzzle: Puzzle;
  direction: Direction;
  selectedCell: { row: number; col: number } | null;
  checkResult: { correct: string[]; incorrect: string[] } | null;
  onSelectClue: (clue: Clue, direction: Direction) => void;
  onGetHint: (clueNumber: number, direction: Direction) => void;
}

function CluePanel({
  puzzle,
  direction,
  selectedCell,
  onSelectClue,
  onGetHint,
}: CluePanelProps) {
  const getSelectedClueNumber = () => {
    if (!selectedCell) return null;

    const cell = puzzle.grid[selectedCell.row][selectedCell.col];
    if (!cell || cell.isBlack) return null;

    // Find the clue number for the current word
    const clues = direction === 'across' ? puzzle.clues.across : puzzle.clues.down;

    for (const clue of clues) {
      if (direction === 'across') {
        if (clue.row === selectedCell.row && clue.col <= selectedCell.col) {
          // Check if selectedCell is within this word
          let endCol = clue.col;
          while (
            endCol < puzzle.grid[0].length - 1 &&
            !puzzle.grid[clue.row][endCol + 1].isBlack
          ) {
            endCol++;
          }
          if (selectedCell.col <= endCol) {
            return clue.number;
          }
        }
      } else {
        if (clue.col === selectedCell.col && clue.row <= selectedCell.row) {
          let endRow = clue.row;
          while (
            endRow < puzzle.grid.length - 1 &&
            !puzzle.grid[endRow + 1][clue.col].isBlack
          ) {
            endRow++;
          }
          if (selectedCell.row <= endRow) {
            return clue.number;
          }
        }
      }
    }

    return null;
  };

  const selectedClueNumber = getSelectedClueNumber();

  return (
    <div className="clue-panel">
      <div className="clue-section">
        <h4 className={direction === 'across' ? 'active' : ''}>ヨコのカギ</h4>
        <div className="clue-list">
          {puzzle.clues.across.map((clue) => (
            <div
              key={`across-${clue.number}`}
              className={`clue-item ${
                direction === 'across' && selectedClueNumber === clue.number ? 'active' : ''
              }`}
              onClick={() => onSelectClue(clue, 'across')}
            >
              <span className="clue-number">{clue.number}</span>
              <span className="clue-text">{clue.clue}</span>
              <button
                className="hint-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onGetHint(clue.number, 'across');
                }}
              >
                ?
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="clue-section">
        <h4 className={direction === 'down' ? 'active' : ''}>タテのカギ</h4>
        <div className="clue-list">
          {puzzle.clues.down.map((clue) => (
            <div
              key={`down-${clue.number}`}
              className={`clue-item ${
                direction === 'down' && selectedClueNumber === clue.number ? 'active' : ''
              }`}
              onClick={() => onSelectClue(clue, 'down')}
            >
              <span className="clue-number">{clue.number}</span>
              <span className="clue-text">{clue.clue}</span>
              <button
                className="hint-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onGetHint(clue.number, 'down');
                }}
              >
                ?
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
