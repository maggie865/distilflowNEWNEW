import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';
import MobileNav from './MobileNav.jsx';

export default function AppLayout() {
  return (
    <div className="min-h-screen bg-background overflow-x-hidden w-full">
      {/* Desktop sidebar */}
      <div className="hidden md:block">
        <Sidebar />
      </div>
      {/* Mobile nav */}
      <div className="md:hidden">
        <MobileNav />
      </div>
      {/* Main content */}
      <main className="md:ml-[240px] min-h-screen overflow-x-hidden min-w-0">
        <div className="p-4 md:p-8 max-w-7xl mx-auto w-full min-w-0">
          <Outlet />
        </div>
      </main>
    </div>
  );
}