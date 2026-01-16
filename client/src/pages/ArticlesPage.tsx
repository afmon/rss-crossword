import { useState, useEffect } from 'react';
import { articlesApi } from '../services/api';
import { useLayoutContext } from '../components/layout/AppLayout';
import type { Article } from '../types';

type FilterType = 'all' | 'unread' | 'favorites' | 'unprocessed';

export function ArticlesPage() {
  const { selectedFeedId, refreshKey } = useLayoutContext();
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [extracting, setExtracting] = useState(false);
  const [contentTab, setContentTab] = useState<'ai' | 'html' | 'original'>('html');

  useEffect(() => {
    loadArticles();
  }, [selectedFeedId, filter, debouncedSearch, refreshKey]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Clear selection when filter changes
  useEffect(() => {
    setSelectedIds(new Set());
  }, [filter]);

  // Auto-refresh every 30 seconds (only when not viewing article details)
  useEffect(() => {
    if (selectedArticle) return;

    const interval = setInterval(() => {
      loadArticles();
    }, 30000);

    return () => clearInterval(interval);
  }, [selectedFeedId, filter, debouncedSearch, selectedArticle]);

  const loadArticles = async () => {
    setLoading(true);
    try {
      const data = await articlesApi.getAll({
        feedId: selectedFeedId ?? undefined,
        filter,
        search: debouncedSearch || undefined,
        limit: 100,
      });
      setArticles(data.articles);
    } catch (error) {
      console.error('Failed to load articles:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkRead = async (article: Article) => {
    try {
      await articlesApi.markRead(article.id, !article.is_read);
      setArticles((prev) =>
        prev.map((a) =>
          a.id === article.id ? { ...a, is_read: a.is_read ? 0 : 1 } : a
        )
      );
      if (selectedArticle?.id === article.id) {
        setSelectedArticle({ ...selectedArticle, is_read: selectedArticle.is_read ? 0 : 1 });
      }
    } catch (error) {
      console.error('Failed to mark article:', error);
    }
  };

  const handleToggleFavorite = async (article: Article) => {
    try {
      await articlesApi.toggleFavorite(article.id, !article.is_favorite);
      setArticles((prev) =>
        prev.map((a) =>
          a.id === article.id ? { ...a, is_favorite: a.is_favorite ? 0 : 1 } : a
        )
      );
      if (selectedArticle?.id === article.id) {
        setSelectedArticle({ ...selectedArticle, is_favorite: selectedArticle.is_favorite ? 0 : 1 });
      }
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
    }
  };

  const handleSelectArticle = async (article: Article) => {
    setSelectedArticle(article);
    setContentTab('html');
    if (!article.is_read) {
      await handleMarkRead(article);
    }
  };

  // Multi-select handlers
  const handleToggleSelect = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedIds(new Set(articles.map((a) => a.id)));
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  const handleExtractContent = async () => {
    if (selectedIds.size === 0) return;

    setExtracting(true);
    try {
      const result = await articlesApi.extractContent(Array.from(selectedIds));
      alert(`処理完了: ${result.updated}件成功, ${result.failed}件失敗`);
      setSelectedIds(new Set());
      await loadArticles();
    } catch (error) {
      console.error('Failed to extract content:', error);
      alert('AI抽出に失敗しました');
    } finally {
      setExtracting(false);
    }
  };

  const isNotFetched = (article: Article) => {
    return !article.content_html || article.content_html.length === 0;
  };

  const isUnprocessed = (article: Article) => {
    return !article.is_ai_processed && !isNotFetched(article);
  };

  if (selectedArticle) {
    return (
      <div className="article-reader">
        <div className="article-reader-header">
          <button className="btn btn-sm" onClick={() => setSelectedArticle(null)}>
            ← 戻る
          </button>
          <div className="article-reader-actions">
            <button
              className={`btn btn-sm ${selectedArticle.is_favorite ? 'btn-warning' : ''}`}
              onClick={() => handleToggleFavorite(selectedArticle)}
            >
              {selectedArticle.is_favorite ? '★' : '☆'}
            </button>
            <a
              href={selectedArticle.link}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-sm btn-secondary"
            >
              元記事を開く
            </a>
          </div>
        </div>
        <article className="article-content">
          <h1>{selectedArticle.title}</h1>
          <div className="article-meta">
            <span className="article-source">{selectedArticle.feed_title}</span>
            {selectedArticle.published_at && (
              <span className="article-date">
                {new Date(selectedArticle.published_at).toLocaleDateString('ja-JP')}
              </span>
            )}
            {isNotFetched(selectedArticle) && (
              <span className="not-fetched-badge">未取得</span>
            )}
            {isUnprocessed(selectedArticle) && (
              <span className="unprocessed-badge">AI未処理</span>
            )}
            {selectedArticle.is_content_truncated === 1 && (
              <span className="truncated-badge">長文のため一部省略</span>
            )}
          </div>
          <div className="content-tabs">
            <button
              className={`content-tab ${contentTab === 'original' ? 'active' : ''}`}
              onClick={() => setContentTab('original')}
            >
              RSS抽出
            </button>
            <button
              className={`content-tab ${contentTab === 'html' ? 'active' : ''}`}
              onClick={() => setContentTab('html')}
            >
              HTML抽出
            </button>
            <button
              className={`content-tab ${contentTab === 'ai' ? 'active' : ''}`}
              onClick={() => setContentTab('ai')}
            >
              AI抽出
            </button>
          </div>
          <div className="article-body">
            {contentTab === 'original' && (selectedArticle.summary || '')}
            {contentTab === 'html' && (selectedArticle.content_html || '')}
            {contentTab === 'ai' && (selectedArticle.is_ai_processed ? selectedArticle.content : '')}
          </div>
        </article>
      </div>
    );
  }

  return (
    <div className="articles-page">
      <div className="articles-header">
        <div className="articles-filters">
          <button
            className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            すべて
          </button>
          <button
            className={`filter-btn ${filter === 'unread' ? 'active' : ''}`}
            onClick={() => setFilter('unread')}
          >
            未読
          </button>
          <button
            className={`filter-btn ${filter === 'favorites' ? 'active' : ''}`}
            onClick={() => setFilter('favorites')}
          >
            お気に入り
          </button>
          <button
            className={`filter-btn ${filter === 'unprocessed' ? 'active' : ''}`}
            onClick={() => setFilter('unprocessed')}
          >
            未処理
          </button>
        </div>
        <div className="articles-search">
          <input
            type="text"
            placeholder="検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
          {searchQuery && (
            <button
              className="search-clear"
              onClick={() => setSearchQuery('')}
              title="クリア"
            >
              ×
            </button>
          )}
        </div>
        <span className="articles-count">{articles.length} 件</span>
      </div>

      {/* Selection bar */}
      {selectedIds.size > 0 && (
        <div className="selection-bar">
          <span className="selection-count">{selectedIds.size}件選択中</span>
          <div className="selection-actions">
            <button className="btn btn-sm" onClick={handleSelectAll}>
              全選択
            </button>
            <button className="btn btn-sm" onClick={handleClearSelection}>
              選択解除
            </button>
            <button
              className="btn btn-sm btn-primary"
              onClick={handleExtractContent}
              disabled={extracting}
            >
              {extracting ? '処理中...' : 'AI抽出'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="loading">読み込み中...</div>
      ) : articles.length === 0 ? (
        <div className="empty-state">
          <p>記事がありません</p>
          <p className="empty-hint">フィードを更新するか、フィルターを変更してください</p>
        </div>
      ) : (
        <div className="article-list">
          {articles.map((article) => (
            <div
              key={article.id}
              className={`article-item ${article.is_read ? 'read' : 'unread'} ${selectedIds.has(article.id) ? 'selected' : ''}`}
              onClick={() => handleSelectArticle(article)}
            >
              <div className="article-checkbox">
                <input
                  type="checkbox"
                  checked={selectedIds.has(article.id)}
                  onChange={() => {}}
                  onClick={(e) => handleToggleSelect(article.id, e)}
                />
              </div>
              <div className="article-item-main">
                <div className="article-title-row">
                  <h3 className="article-title">{article.title}</h3>
                  {isNotFetched(article) && (
                    <span className="not-fetched-badge">未取得</span>
                  )}
                  {isUnprocessed(article) && (
                    <span className="unprocessed-badge">AI未処理</span>
                  )}
                </div>
                <p className="article-summary">
                  {article.summary?.substring(0, 120)}
                  {(article.summary?.length ?? 0) > 120 ? '...' : ''}
                </p>
              </div>
              <div className="article-item-meta">
                <span className="article-source">{article.feed_title}</span>
                {article.published_at && (
                  <span className="article-date">
                    {new Date(article.published_at).toLocaleDateString('ja-JP')}
                  </span>
                )}
                <button
                  className={`favorite-btn ${article.is_favorite ? 'active' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleFavorite(article);
                  }}
                >
                  {article.is_favorite ? '★' : '☆'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
