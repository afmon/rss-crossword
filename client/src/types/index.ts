// Feed types
export interface Folder {
  id: number;
  name: string;
  color: string;
  sort_order: number;
}

export interface Feed {
  id: number;
  folder_id: number | null;
  title: string;
  url: string;
  site_url: string | null;
  favicon_url: string | null;
  description: string | null;
  last_fetched_at: string | null;
  last_error: string | null;
  is_active: number;
  article_count: number;
  unread_count: number;
}

// Article types
export interface Article {
  id: number;
  feed_id: number;
  title: string;
  link: string;
  author: string | null;
  published_at: string | null;
  summary: string | null;
  content: string | null;
  content_html: string | null;
  is_read: number;
  is_favorite: number;
  is_ai_processed: number;
  is_content_truncated: number;
  feed_title?: string;
  feed_favicon?: string;
}

// Crossword types
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
}

export interface Clue {
  number: number;
  clue: string;
  length: number;
  row: number;
  col: number;
  articleLink?: string;
}

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
    across: Clue[];
    down: Clue[];
  };
  density?: number;
}

export interface PuzzleSummary {
  id: string;
  title: string;
  size: number;
  wordCount: number;
  createdAt: string;
}

// API response types
export interface ApiResponse<T> {
  success: boolean;
  error?: string;
  data?: T;
}
