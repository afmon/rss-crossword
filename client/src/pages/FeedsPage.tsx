import { useState, useEffect } from 'react';
import { feedsApi } from '../services/api';
import type { Feed, Folder } from '../types';

export function FeedsPage() {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingFeed, setEditingFeed] = useState<Feed | null>(null);
  const [refreshingFeedId, setRefreshingFeedId] = useState<number | null>(null);

  // Add form state
  const [newFeedUrl, setNewFeedUrl] = useState('');
  const [newFeedTitle, setNewFeedTitle] = useState('');
  const [newFeedFolder, setNewFeedFolder] = useState<number | undefined>(undefined);
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    loadFeeds();
  }, []);

  const loadFeeds = async () => {
    try {
      const data = await feedsApi.getAll();
      setFeeds(data.feeds);
      setFolders(data.folders);
    } catch (error) {
      console.error('Failed to load feeds:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddFeed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFeedUrl.trim()) return;

    setAdding(true);
    setAddError(null);

    try {
      await feedsApi.add(newFeedUrl.trim(), newFeedTitle.trim() || undefined, newFeedFolder);
      setShowAddModal(false);
      setNewFeedUrl('');
      setNewFeedTitle('');
      setNewFeedFolder(undefined);
      await loadFeeds();
    } catch (error) {
      setAddError(error instanceof Error ? error.message : 'フィードの追加に失敗しました');
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteFeed = async (feed: Feed) => {
    if (!confirm(`「${feed.title}」を削除しますか？`)) return;

    try {
      await feedsApi.delete(feed.id);
      await loadFeeds();
    } catch (error) {
      console.error('Failed to delete feed:', error);
    }
  };

  const handleRefreshFeed = async (feed: Feed) => {
    setRefreshingFeedId(feed.id);
    try {
      const result = await feedsApi.refresh(feed.id);
      alert(`${result.newArticles}件の新着記事を取得しました`);
      await loadFeeds();
    } catch (error) {
      console.error('Failed to refresh feed:', error);
      alert('更新に失敗しました');
    } finally {
      setRefreshingFeedId(null);
    }
  };

  const handleUpdateFeed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFeed) return;

    try {
      await feedsApi.update(editingFeed.id, {
        title: editingFeed.title,
        folder_id: editingFeed.folder_id,
      });
      setEditingFeed(null);
      await loadFeeds();
    } catch (error) {
      console.error('Failed to update feed:', error);
    }
  };

  const handleInitializeDefaults = async () => {
    if (!confirm('Yahoo!ニュースのデフォルトフィードを追加しますか？')) return;

    try {
      await feedsApi.initialize();
      await loadFeeds();
    } catch (error) {
      console.error('Failed to initialize:', error);
    }
  };

  // Group feeds by folder
  const feedsByFolder = new Map<number | null, Feed[]>();
  feeds.forEach((feed) => {
    const folderId = feed.folder_id;
    if (!feedsByFolder.has(folderId)) {
      feedsByFolder.set(folderId, []);
    }
    feedsByFolder.get(folderId)!.push(feed);
  });

  if (loading) {
    return (
      <div className="feeds-page">
        <div className="loading">読み込み中...</div>
      </div>
    );
  }

  return (
    <div className="feeds-page">
      <div className="feeds-header">
        <h2>フィード管理</h2>
        <div className="feeds-actions">
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
            + フィード追加
          </button>
          <button className="btn btn-secondary" onClick={handleInitializeDefaults}>
            デフォルトフィード追加
          </button>
        </div>
      </div>

      {feeds.length === 0 ? (
        <div className="empty-state">
          <p>フィードがまだ登録されていません</p>
          <p className="empty-hint">フィードを追加するか、デフォルトフィードを追加してください</p>
        </div>
      ) : (
        <div className="feeds-list">
          {/* Folders with feeds */}
          {folders.map((folder) => {
            const folderFeeds = feedsByFolder.get(folder.id) || [];
            if (folderFeeds.length === 0) return null;

            return (
              <div key={folder.id} className="feed-folder-section">
                <div className="folder-title" style={{ borderLeftColor: folder.color }}>
                  {folder.name}
                </div>
                {folderFeeds.map((feed) => (
                  <FeedRow
                    key={feed.id}
                    feed={feed}
                    folders={folders}
                    refreshing={refreshingFeedId === feed.id}
                    onRefresh={() => handleRefreshFeed(feed)}
                    onEdit={() => setEditingFeed(feed)}
                    onDelete={() => handleDeleteFeed(feed)}
                  />
                ))}
              </div>
            );
          })}

          {/* Uncategorized feeds */}
          {feedsByFolder.get(null) && feedsByFolder.get(null)!.length > 0 && (
            <div className="feed-folder-section">
              <div className="folder-title">未分類</div>
              {feedsByFolder.get(null)!.map((feed) => (
                <FeedRow
                  key={feed.id}
                  feed={feed}
                  folders={folders}
                  refreshing={refreshingFeedId === feed.id}
                  onRefresh={() => handleRefreshFeed(feed)}
                  onEdit={() => setEditingFeed(feed)}
                  onDelete={() => handleDeleteFeed(feed)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add Feed Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>フィード追加</h3>
              <button className="modal-close" onClick={() => setShowAddModal(false)}>
                ×
              </button>
            </div>
            <form onSubmit={handleAddFeed}>
              <div className="form-group">
                <label htmlFor="feedUrl">RSS URL *</label>
                <input
                  id="feedUrl"
                  type="url"
                  value={newFeedUrl}
                  onChange={(e) => setNewFeedUrl(e.target.value)}
                  placeholder="https://example.com/rss.xml"
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="feedTitle">タイトル (任意)</label>
                <input
                  id="feedTitle"
                  type="text"
                  value={newFeedTitle}
                  onChange={(e) => setNewFeedTitle(e.target.value)}
                  placeholder="自動取得されます"
                />
              </div>
              <div className="form-group">
                <label htmlFor="feedFolder">フォルダ</label>
                <select
                  id="feedFolder"
                  value={newFeedFolder ?? ''}
                  onChange={(e) =>
                    setNewFeedFolder(e.target.value ? Number(e.target.value) : undefined)
                  }
                >
                  <option value="">未分類</option>
                  {folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
                </select>
              </div>
              {addError && <div className="form-error">{addError}</div>}
              <div className="modal-actions">
                <button type="button" className="btn" onClick={() => setShowAddModal(false)}>
                  キャンセル
                </button>
                <button type="submit" className="btn btn-primary" disabled={adding}>
                  {adding ? '追加中...' : '追加'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Feed Modal */}
      {editingFeed && (
        <div className="modal-overlay" onClick={() => setEditingFeed(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>フィード編集</h3>
              <button className="modal-close" onClick={() => setEditingFeed(null)}>
                ×
              </button>
            </div>
            <form onSubmit={handleUpdateFeed}>
              <div className="form-group">
                <label>URL</label>
                <input type="text" value={editingFeed.url} disabled />
              </div>
              <div className="form-group">
                <label htmlFor="editTitle">タイトル</label>
                <input
                  id="editTitle"
                  type="text"
                  value={editingFeed.title}
                  onChange={(e) => setEditingFeed({ ...editingFeed, title: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label htmlFor="editFolder">フォルダ</label>
                <select
                  id="editFolder"
                  value={editingFeed.folder_id ?? ''}
                  onChange={(e) =>
                    setEditingFeed({
                      ...editingFeed,
                      folder_id: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                >
                  <option value="">未分類</option>
                  {folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn" onClick={() => setEditingFeed(null)}>
                  キャンセル
                </button>
                <button type="submit" className="btn btn-primary">
                  保存
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// Feed row component
interface FeedRowProps {
  feed: Feed;
  folders: Folder[];
  refreshing: boolean;
  onRefresh: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function FeedRow({ feed, refreshing, onRefresh, onEdit, onDelete }: FeedRowProps) {
  return (
    <div className="feed-row">
      <div className="feed-info">
        <span className="feed-title">{feed.title}</span>
        <span className="feed-url">{feed.url}</span>
        <div className="feed-stats">
          <span className="feed-unread">{feed.unread_count}件未読</span>
          {feed.last_fetched_at && (
            <span className="feed-last-update">
              最終更新: {new Date(feed.last_fetched_at).toLocaleString('ja-JP')}
            </span>
          )}
          {feed.last_error && <span className="feed-error">エラー: {feed.last_error}</span>}
        </div>
      </div>
      <div className="feed-actions">
        <button
          className="btn btn-sm"
          onClick={onRefresh}
          disabled={refreshing}
          title="更新"
        >
          {refreshing ? '更新中...' : '🔄'}
        </button>
        <button className="btn btn-sm" onClick={onEdit} title="編集">
          ✏️
        </button>
        <button className="btn btn-sm btn-danger" onClick={onDelete} title="削除">
          🗑️
        </button>
      </div>
    </div>
  );
}
