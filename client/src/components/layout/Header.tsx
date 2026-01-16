import { Link, useLocation } from 'react-router-dom';

export function Header() {
  const location = useLocation();

  const navItems = [
    { path: '/articles', label: '記事' },
    { path: '/feeds', label: 'フィード' },
    { path: '/crossword', label: 'クロスワード' },
    { path: '/settings', label: '設定' },
  ];

  return (
    <header className="header">
      <div className="header-brand">
        <h1>RSS Crossword</h1>
        <span className="header-subtitle">ニュースで遊ぶクロスワード</span>
      </div>

      <nav className="header-nav">
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`nav-link ${location.pathname.startsWith(item.path) ? 'active' : ''}`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
