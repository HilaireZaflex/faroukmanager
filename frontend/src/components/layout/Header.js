import React, { useState } from 'react';
import { Menu, LogOut, User, ChevronDown } from 'lucide-react';
import './Header.css';

function Header({ title, user, onLogout, onMenuToggle }) {
  const [showUserMenu, setShowUserMenu] = useState(false);

  const userInitials = user?.name
    ? user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
    : 'U';

  return (
    <header className="header">
      <div className="header-left">
        <button className="header-menu-btn" onClick={onMenuToggle}>
          <Menu size={24} />
        </button>
        <h1 className="header-title">{title}</h1>
      </div>

      <div className="header-actions">
        <div className="header-user-menu">
          <button
            className="header-user"
            onClick={() => setShowUserMenu(!showUserMenu)}
          >
            <div className="user-avatar">{userInitials}</div>
            <div className="user-info">
              <div className="user-name">{user?.name || 'User'}</div>
              <div className="user-role">{user?.role || 'Admin'}</div>
            </div>
            <ChevronDown size={18} />
          </button>

          {showUserMenu && (
            <div className="user-dropdown">
              <a href="#profile" className="user-dropdown-item">
                <User size={18} />
                <span>My Profile</span>
              </a>
              <button
                className="user-dropdown-item user-dropdown-logout"
                onClick={onLogout}
              >
                <LogOut size={18} />
                <span>Logout</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default Header;
