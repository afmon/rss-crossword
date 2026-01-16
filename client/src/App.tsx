import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { ArticlesPage } from './pages/ArticlesPage';
import { FeedsPage } from './pages/FeedsPage';
import { CrosswordPage } from './pages/CrosswordPage';
import { SettingsPage } from './pages/SettingsPage';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<Navigate to="/articles" replace />} />
          <Route path="articles" element={<ArticlesPage />} />
          <Route path="feeds" element={<FeedsPage />} />
          <Route path="crossword" element={<CrosswordPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
