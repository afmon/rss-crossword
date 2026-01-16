import { useState, useEffect } from 'react';
import { feedsApi, foldersApi } from '../../services/api';
import type { Feed, Folder } from '../../types';

interface SidebarProps {
  selectedFeedId: number | null;
  onSelectFeed: (feedId: number | null) => void;
  onRefreshFeeds: () => void;
}

export function Sidebar({ selectedFeedId, onSelectFeed, onRefreshFeeds }: SidebarProps) {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editingFolder, setEditingFolder] = useState<number | null>(null);
  const [editingFolderName, setEditingFolderName] = useState('');
  const [addingFolder, setAddingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

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

  useEffect(() => {
    loadFeeds();
  }, []);

  const handleRefreshAll = async () => {
    setRefreshing(true);
    try {
      await feedsApi.refreshAll();
      await loadFeeds();
      onRefreshFeeds();
    } catch (error) {
      console.error('Failed to refresh feeds:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const handleAddFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      await foldersApi.create(newFolderName.trim());
      await loadFeeds();
      setNewFolderName('');
      setAddingFolder(false);
    } catch (error) {
      console.error('Failed to create folder:', error);
    }
  };

  const handleEditFolder = async (folderId: number) => {
    if (!editingFolderName.trim()) return;
    try {
      await foldersApi.update(folderId, { name: editingFolderName.trim() });
      await loadFeeds();
      setEditingFolder(null);
      setEditingFolderName('');
    } catch (error) {
      console.error('Failed to update folder:', error);
    }
  };

  const handleDeleteFolder = async (folderId: number, folderName: string) => {
    if (!confirm(`フォルダ「${folderName}」を削除しますか？\nフォルダ内のフィードは削除されません。`)) return;
    try {
      await foldersApi.delete(folderId);
      await loadFeeds();
    } catch (error) {
      console.error('Failed to delete folder:', error);
    }
  };

  const totalUnread = feeds.reduce((sum, f) => sum + (f.unread_count || 0), 0);

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
      <aside className="sidebar">
        <div className="sidebar-loading">読み込み中...</div>
      </aside>
    );
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <button
          className="btn btn-sm btn-primary"
          onClick={handleRefreshAll}
          disabled={refreshing}
        >
          {refreshing ? '更新中...' : '全て更新'}
        </button>
        <button
          className="btn btn-sm btn-secondary"
          onClick={() => setAddingFolder(true)}
          title="フォルダを追加"
        >
          +
        </button>
      </div>

      {/* Add folder form */}
      {addingFolder && (
        <div className="folder-add-form">
          <input
            type="text"
            placeholder="フォルダ名"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddFolder();
              if (e.key === 'Escape') { setAddingFolder(false); setNewFolderName(''); }
            }}
            autoFocus
          />
          <button className="btn btn-xs" onClick={handleAddFolder}>追加</button>
          <button className="btn btn-xs" onClick={() => { setAddingFolder(false); setNewFolderName(''); }}>×</button>
        </div>
      )}

      <div className="feed-list">
        {/* All feeds */}
        <div
          className={`feed-item ${selectedFeedId === null ? 'active' : ''}`}
          onClick={() => onSelectFeed(null)}
        >
          <span className="feed-title">すべての記事</span>
          {totalUnread > 0 && <span className="feed-unread">{totalUnread}</span>}
        </div>

        {/* Folders and feeds */}
        {folders.map((folder) => {
          const folderFeeds = feedsByFolder.get(folder.id) || [];
          const folderUnread = folderFeeds.reduce((sum, f) => sum + (f.unread_count || 0), 0);
          const isEditing = editingFolder === folder.id;

          return (
            <div key={folder.id} className="folder-group">
              <div className="folder-header" style={{ borderLeftColor: folder.color }}>
                {isEditing ? (
                  <input
                    type="text"
                    className="folder-edit-input"
                    value={editingFolderName}
                    onChange={(e) => setEditingFolderName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleEditFolder(folder.id);
                      if (e.key === 'Escape') { setEditingFolder(null); setEditingFolderName(''); }
                    }}
                    onBlur={() => handleEditFolder(folder.id)}
                    autoFocus
                  />
                ) : (
                  <>
                    <span className="folder-name">{folder.name}</span>
                    {folderUnread > 0 && <span className="feed-unread">{folderUnread}</span>}
                    <div className="folder-actions">
                      <button
                        className="folder-action-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingFolder(folder.id);
                          setEditingFolderName(folder.name);
                        }}
                        title="編集"
                      >
                        ✏
                      </button>
                      <button
                        className="folder-action-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteFolder(folder.id, folder.name);
                        }}
                        title="削除"
                      >
                        🗑
                      </button>
                    </div>
                  </>
                )}
              </div>
              {folderFeeds.map((feed) => (
                <div
                  key={feed.id}
                  className={`feed-item feed-item-nested ${selectedFeedId === feed.id ? 'active' : ''}`}
                  onClick={() => onSelectFeed(feed.id)}
                >
                  <span className="feed-title">{feed.title}</span>
                  {feed.unread_count > 0 && (
                    <span className="feed-unread">{feed.unread_count}</span>
                  )}
                </div>
              ))}
            </div>
          );
        })}

        {/* Uncategorized feeds */}
        {feedsByFolder.get(null)?.map((feed) => (
          <div
            key={feed.id}
            className={`feed-item ${selectedFeedId === feed.id ? 'active' : ''}`}
            onClick={() => onSelectFeed(feed.id)}
          >
            <span className="feed-title">{feed.title}</span>
            {feed.unread_count > 0 && <span className="feed-unread">{feed.unread_count}</span>}
          </div>
        ))}
      </div>

      {feeds.length === 0 && (
        <div className="sidebar-empty">
          <p>フィードがありません</p>
          <button
            className="btn btn-sm btn-secondary"
            onClick={async () => {
              await feedsApi.initialize();
              await loadFeeds();
            }}
          >
            デフォルトフィードを追加
          </button>
        </div>
      )}
    </aside>
  );
}
