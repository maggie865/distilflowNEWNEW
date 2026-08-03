import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, FlaskConical, Droplets, Flame, Wine, Cylinder, TrendingUp, BookOpen, Users, Warehouse, Building2, FileText, Settings, ChevronDown, PackagePlus, Truck, ClipboardList, ShieldCheck, Thermometer, Wrench, Bug, AlertTriangle, LogOut, CheckSquare , Leaf } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/AuthContext';

const crewPaths = ['/bottling-floor', '/food-recall', '/maintenance', '/pest-control', '/temperature-logs'];

const navGroups = [
  {
    name: 'Production',
    items: [
      { label: 'Tanks', icon: Cylinder, path: '/tanks' },
      { label: 'Dilutions', icon: Droplets, path: '/dilutions' },
      { label: 'Distillations', icon: Flame, path: '/distillation' },
      { label: 'SNS Distillation', icon: Flame, path: '/sns-distillation' },
      { label: 'Bottling Floor', icon: Wine, path: '/bottling-floor' },
    ]
  },
  {
    name: 'Inventory',
    items: [
      { label: 'Raw Materials', icon: Droplets, path: '/raw-materials' },
      { label: 'Finished Goods', icon: Warehouse, path: '/inventory' },
      { label: 'Warehouse (3PL)', icon: Building2, path: '/warehouse' },
      { label: 'Receiving', icon: PackagePlus, path: '/receiving' },
      { label: 'Stock Takes', icon: ClipboardList, path: '/stock-takes' },
    ]
  },
  {
    name: 'Sales',
    items: [
      { label: 'Batch Tracker', icon: FlaskConical, path: '/batch-tracker' },
      { label: 'Dispatch', icon: TrendingUp, path: '/dispatch' },
      { label: 'Customers', icon: Users, path: '/customers' },
      { label: 'Suppliers', icon: Truck, path: '/suppliers' },
    ]
  },
  {
    name: 'Compliance',
    items: [
      { label: 'Checklists', icon: CheckSquare, path: '/checklists' },
      { label: 'Temperature Logs', icon: Thermometer, path: '/temperature-logs' },
      { label: 'Maintenance', icon: Wrench, path: '/maintenance' },
      { label: 'Pest Control', icon: Bug, path: '/pest-control' },
      { label: 'Food Recall', icon: AlertTriangle, path: '/food-recall' },
      { label: 'Waste Tracker', icon: Leaf, path: '/waste-tracker' },
    ]
  },
];

export default function Sidebar() {
  const location = useLocation();
  const { user, logout } = useAuth();
  const isCrew = user?.role === 'crew';
  // Auto-expand the group containing the current page
  const activeGroup = navGroups.find(g => g.items.some(i => location.pathname === i.path || location.pathname.startsWith(i.path + '/')))?.name;
  const [expandedGroups, setExpandedGroups] = useState(() => {
    const init = {};
    for (const g of navGroups) init[g.name] = true; // start all open
    return init;
  });

  const toggleGroup = (groupName) => {
    setExpandedGroups(prev => ({ ...prev, [groupName]: !prev[groupName] }));
  };

  const visibleGroups = isCrew
    ? navGroups.map(g => ({ ...g, items: g.items.filter(i => crewPaths.includes(i.path)) })).filter(g => g.items.length > 0)
    : navGroups;

  return (
    <aside className="fixed top-0 left-0 h-full w-[240px] bg-sidebar flex flex-col z-40 border-r border-sidebar-border">
      <div className="px-5 py-5 border-b border-sidebar-border">
        <h1 className="text-lg font-display font-bold text-sidebar-primary">Distillery OS</h1>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-1">
        {!isCrew && (
          <Link
            to="/"
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              location.pathname === '/'
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            )}
          >
            <Home className="w-4 h-4" />
            Dashboard
          </Link>
        )}

        {visibleGroups.map((group) => (
          <Collapsible
            key={group.name}
            open={expandedGroups[group.name]}
            onOpenChange={() => toggleGroup(group.name)}
          >
            <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors mt-2">
              {group.name}
              <ChevronDown className={cn("w-3 h-3 transition-transform", expandedGroups[group.name] && "rotate-180")} />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-0.5 mt-0.5">
              {group.items.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                      isActive
                        ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    )}
                  >
                    <item.icon className="w-4 h-4 shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
            </CollapsibleContent>
          </Collapsible>
        ))}
      </nav>

      <div className="px-3 py-3 border-t border-sidebar-border space-y-0.5">
        {!isCrew && (
          <>
            <Link
              to="/reports"
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                location.pathname === '/reports'
                  ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <FileText className="w-4 h-4" />
              Reports
            </Link>
            <Link
              to="/settings"
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                location.pathname === '/settings'
                  ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <Settings className="w-4 h-4" />
              Settings
            </Link>
          </>
        )}
      </div>

      {/* User info + logout */}
      <div className="px-3 py-3 border-t border-sidebar-border">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg">
          <div className="w-7 h-7 rounded-full bg-sidebar-primary/20 flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-sidebar-primary">
              {(user?.email || user?.name || '?')[0].toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-sidebar-foreground truncate">{user?.name || user?.email || 'User'}</p>
            <p className="text-xs text-sidebar-foreground/50 truncate">{user?.role || ''}</p>
          </div>
          <button
            onClick={() => logout()}
            title="Log out"
            className="shrink-0 p-1.5 rounded-md text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}