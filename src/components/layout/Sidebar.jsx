import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, FlaskConical, Droplets, Flame, Wine, Cylinder, TrendingUp, BookOpen, Users, Warehouse, FileText, Settings, ChevronDown, PackagePlus, Truck, ClipboardList, ShieldCheck, Thermometer, Wrench, Bug, AlertTriangle } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/AuthContext';

const crewPaths = ['/bottling-floor', '/food-recall', '/maintenance', '/pest-control', '/temperature-logs'];

const navGroups = [
  {
    name: 'Production',
    items: [
      { label: 'Dilutions', icon: Droplets, path: '/dilutions' },
      { label: 'Distillations', icon: Flame, path: '/distillation' },
      { label: 'SNS Distillation', icon: Flame, path: '/sns-distillation' },
      { label: 'Tanks', icon: Cylinder, path: '/tanks' },
      { label: 'Bottling Floor', icon: Wine, path: '/bottling-floor' },
    ]
  },
  {
    name: 'Planning',
    items: [
      { label: 'Batch Tracker', icon: FlaskConical, path: '/batch-tracker' },
      { label: 'Raw Materials', icon: Droplets, path: '/raw-materials' },
      { label: 'Inventory', icon: Warehouse, path: '/inventory' },
      { label: 'Stock Takes', icon: ClipboardList, path: '/stock-takes' },
    ]
  },
  {
    name: 'Compliance',
    items: [
      { label: 'Food Recall', icon: AlertTriangle, path: '/food-recall' },
      { label: 'Maintenance', icon: Wrench, path: '/maintenance' },
      { label: 'Pest Control', icon: Bug, path: '/pest-control' },
      { label: 'Temperature Logs', icon: Thermometer, path: '/temperature-logs' },
    ]
  },
  {
    name: 'Inwards/Outwards',
    items: [
      { label: 'Receiving', icon: PackagePlus, path: '/receiving' },
      { label: 'Suppliers', icon: Truck, path: '/suppliers' },
      { label: 'Sales & Dispatch', icon: TrendingUp, path: '/dispatch' },
      { label: 'Customers', icon: Users, path: '/customers' },
    ]
  },
];

export default function Sidebar() {
  const location = useLocation();
  const { user } = useAuth();
  const isCrew = user?.role === 'crew';
  const [expandedGroups, setExpandedGroups] = useState({ Production: true, Planning: true, 'Inwards/Outwards': true });

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
    </aside>
  );
}