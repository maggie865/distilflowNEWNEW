import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, PackagePlus, Droplets, Flame, Wine, Package, Warehouse } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { label: 'Home', icon: LayoutDashboard, path: '/' },
  { label: 'Receive', icon: PackagePlus, path: '/receiving' },
  { label: 'Distill', icon: Flame, path: '/distillation' },
  { label: 'Bottle', icon: Wine, path: '/bottling' },
  { label: 'Materials', icon: Package, path: '/raw-materials' },
  { label: 'Stock', icon: Warehouse, path: '/inventory' },
];

export default function MobileNav() {
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border px-1 pb-[env(safe-area-inset-bottom)]">
      <div className="flex justify-around">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex flex-col items-center py-2 px-2 text-[10px] font-medium transition-colors",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
            >
              <item.icon className="w-5 h-5 mb-0.5" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}