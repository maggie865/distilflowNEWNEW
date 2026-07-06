import { useState } from 'react';
import { Menu } from 'lucide-react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';
import MobileNav from './MobileNav.jsx';

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* Toggle button for desktop/tablet */}
      <button
        onClick={() => setSidebarOpen(true)}
        className="hidden md:flex fixed top-4 left-4 z-30 items-center justify-center h-10 w-10 rounded-lg bg-card border border-border shadow-sm hover:bg-accent transition-colors"
        aria-label="Open navigation menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Desktop/tablet sidebar */}
      <div className="hidden md:block">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Mobile nav */}
      <div className="md:hidden">
        <MobileNav />
      </div>

      {/* Main content */}
      <main className="min-h-screen">
        <div className="p-4 md:p-8 max-w-7xl mx-auto md:pl-16">
          <Outlet />
        </div>
      </main>
    </div>
  );
}