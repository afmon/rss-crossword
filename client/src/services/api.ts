import type { Feed, Folder, Article, Puzzle, PuzzleSummary } from '../types';

const API_BASE = '/api';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'API request failed');
  }

  return data;
}

// Feeds API
export const feedsApi = {
  async getAll(): Promise<{ feeds: Feed[]; folders: Folder[] }> {
    return fetchJson('/feeds');
  },

  async add(url: string, title?: string, folderId?: number): Promise<{ feed: Feed }> {
    return fetchJson('/feeds', {
      method: 'POST',
      body: JSON.stringify({ url, title, folderId }),
    });
  },

  async update(id: number, data: Partial<Feed>): Promise<{ feed: Feed }> {
    return fetchJson(`/feeds/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async delete(id: number): Promise<void> {
    await fetchJson(`/feeds/${id}`, { method: 'DELETE' });
  },

  async refresh(id: number): Promise<{ newArticles: number; totalArticles: number }> {
    return fetchJson(`/feeds/${id}/refresh`, { method: 'POST' });
  },

  async refreshAll(): Promise<{ success: number; failed: number; newArticles: number }> {
    return fetchJson('/feeds/refresh-all', { method: 'POST' });
  },

  async initialize(): Promise<{ added: number; skipped: number }> {
    return fetchJson('/feeds/initialize', { method: 'POST' });
  },
};

// Folders API
export const foldersApi = {
  async getAll(): Promise<{ folders: Folder[] }> {
    return fetchJson('/folders');
  },

  async create(name: string, color?: string): Promise<{ folder: Folder }> {
    return fetchJson('/folders', {
      method: 'POST',
      body: JSON.stringify({ name, color }),
    });
  },

  async update(id: number, data: { name?: string; color?: string }): Promise<{ folder: Folder }> {
    return fetchJson(`/folders/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async delete(id: number): Promise<void> {
    await fetchJson(`/folders/${id}`, { method: 'DELETE' });
  },
};

// Articles API
export const articlesApi = {
  async getAll(params?: {
    feedId?: number;
    filter?: 'all' | 'unread' | 'favorites' | 'unprocessed';
    page?: number;
    limit?: number;
    search?: string;
  }): Promise<{
    articles: Article[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const searchParams = new URLSearchParams();
    if (params?.feedId) searchParams.set('feedId', params.feedId.toString());
    if (params?.filter) searchParams.set('filter', params.filter);
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.search) searchParams.set('search', params.search);

    return fetchJson(`/articles?${searchParams}`);
  },

  async get(id: number): Promise<{ article: Article }> {
    return fetchJson(`/articles/${id}`);
  },

  async markRead(id: number, read: boolean): Promise<void> {
    await fetchJson(`/articles/${id}/read`, {
      method: 'PUT',
      body: JSON.stringify({ read }),
    });
  },

  async toggleFavorite(id: number, favorite: boolean): Promise<void> {
    await fetchJson(`/articles/${id}/favorite`, {
      method: 'PUT',
      body: JSON.stringify({ favorite }),
    });
  },

  async markAllRead(feedId?: number): Promise<{ count: number }> {
    return fetchJson('/articles/mark-all-read', {
      method: 'POST',
      body: JSON.stringify({ feedId }),
    });
  },

  async extractContent(articleIds: number[]): Promise<{
    updated: number;
    failed: number;
    processed: number;
  }> {
    return fetchJson('/articles/extract-content', {
      method: 'POST',
      body: JSON.stringify({ articleIds }),
    });
  },
};

// Crossword API
export const crosswordApi = {
  async generate(options: {
    size?: number;
    dataRange?: number;
    feedIds?: number[];
  }): Promise<{ puzzle: Puzzle }> {
    return fetchJson('/crossword/generate', {
      method: 'POST',
      body: JSON.stringify(options),
    });
  },

  async get(id: string): Promise<{ puzzle: Puzzle }> {
    return fetchJson(`/crossword/${id}`);
  },

  async list(): Promise<{ puzzles: PuzzleSummary[] }> {
    return fetchJson('/crossword');
  },

  async check(puzzleId: string, answers: Record<string, string>): Promise<{
    correct: string[];
    incorrect: string[];
  }> {
    return fetchJson('/crossword/check', {
      method: 'POST',
      body: JSON.stringify({ puzzleId, answers }),
    });
  },

  async getHint(puzzleId: string, clueNumber: number, direction: string): Promise<{
    hint: string;
    revealed: number;
    total: number;
  }> {
    return fetchJson('/crossword/hint', {
      method: 'POST',
      body: JSON.stringify({ puzzleId, clueNumber, direction }),
    });
  },

  async delete(id: string): Promise<void> {
    await fetchJson(`/crossword/${id}`, { method: 'DELETE' });
  },
};

// Seika (AssistantSeika) API
export interface SeikaConfig {
  enabled: boolean;
  host: string;
  port: number;
  speakerId: number;
  randomSpeaker: boolean;
  enabledSpeakers: number[];
  username: string;
  password: string;
}

export interface SeikaSpeaker {
  cid: number;
  name: string;
  prod: string;
}

export interface SpeakerSettings {
  volume?: number;
  speed?: number;
}

export type AllSpeakerSettings = Record<string, SpeakerSettings>;

export const seikaApi = {
  async getConfig(): Promise<{ config: SeikaConfig }> {
    return fetchJson('/seika/config');
  },

  async saveConfig(config: Partial<SeikaConfig>): Promise<{ config: SeikaConfig }> {
    return fetchJson('/seika/config', {
      method: 'POST',
      body: JSON.stringify(config),
    });
  },

  async getSpeakers(): Promise<{ speakers: SeikaSpeaker[] }> {
    return fetchJson('/seika/speakers');
  },

  async getStatus(): Promise<{ available: boolean; error?: string }> {
    return fetchJson('/seika/status');
  },

  async testSpeak(text?: string): Promise<{ success: boolean }> {
    return fetchJson('/seika/test', {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
  },

  async getSpeakerSettings(): Promise<{ settings: AllSpeakerSettings }> {
    return fetchJson('/seika/speaker-settings');
  },

  async updateSpeakerSettings(cid: number, settings: SpeakerSettings): Promise<{ settings: AllSpeakerSettings }> {
    return fetchJson(`/seika/speaker-settings/${cid}`, {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  },
};
