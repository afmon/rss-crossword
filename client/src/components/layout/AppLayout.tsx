import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { Sidebar } from './Sidebar';

export function AppLayout() {
  const [selectedFeedId, setSelectedFeedId] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefreshFeeds = () => {
    setRefreshKey((k) => k + 1);
  };

  return (
    <div className="app-layout">
      <Header />
      <div className="app-content">
        <Sidebar
          selectedFeedId={selectedFeedId}
          onSelectFeed={setSelectedFeedId}
          onRefreshFeeds={handleRefreshFeeds}
        />
        <main className="main-content">
          <Outlet context={{ selectedFeedId, refreshKey }} />
        </main>
      </div>
    </div>
  );
}

// Hook to access layout context
import { useOutletContext } from 'react-router-dom';

export function useLayoutContext() {
  return useOutletContext<{ selectedFeedId: number | null; refreshKey: number }>();
}
