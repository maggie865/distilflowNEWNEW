import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, Home, FlaskConical, Droplets, Flame, Wine, Cylinder, TrendingUp, BookOpen, Users, Warehouse, Building2, FileText, Settings, ChevronDown, PackagePlus, Truck, ClipboardList, ShieldCheck, Thermometer, Wrench, Bug, AlertTriangle, LogOut, CheckSquare, Leaf } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/AuthContext';

const crewPaths = ['/bottling-floor', '/food-recall', '/maintenance', '/pest-control', '/temperature-logs', '/checklists', '/waste-tracker'];

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

export default function MobileNav() {
  const location = useLocation();
  const { user, logout } = useAuth();
  const isCrew = user?.role === 'crew';
  const [open, setOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState({});

  const closeNav = () => setOpen(false);

  const toggleGroup = (groupName) => {
    setExpandedGroups(prev => ({ ...prev, [groupName]: !prev[groupName] }));
  };

  const visibleGroups = isCrew
    ? navGroups.map(g => ({ ...g, items: g.items.filter(i => crewPaths.includes(i.path)) })).filter(g => g.items.length > 0)
    : navGroups;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border pb-[env(safe-area-inset-bottom)]">
      <div className="flex justify-between items-center px-4 py-3">
        {!isCrew && (
          <Link
            to="/"
            onClick={closeNav}
            className={cn(
              "flex flex-col items-center py-2 px-2 text-[10px] font-medium transition-colors",
              location.pathname === '/' ? "text-primary" : "text-muted-foreground"
            )}
          >
            <Home className="w-5 h-5 mb-0.5" />
            Home
          </Link>
        )}
        {isCrew && (
          <Link
            to="/bottling-floor"
            onClick={closeNav}
            className={cn(
              "flex flex-col items-center py-2 px-2 text-[10px] font-medium transition-colors",
              location.pathname === '/bottling-floor' ? "text-primary" : "text-muted-foreground"
            )}
          >
            <Wine className="w-5 h-5 mb-0.5" />
            Bottling
          </Link>
        )}

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button className="flex flex-col items-center py-2 px-2 text-[10px] font-medium text-muted-foreground hover:text-primary transition-colors">
              <Menu className="w-5 h-5 mb-0.5" />
              Menu
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[80vh] overflow-y-auto">
            <div className="space-y-2 mt-4">
              {visibleGroups.map((group) => (
                <Collapsible key={group.name} open={expandedGroups[group.name]} onOpenChange={() => toggleGroup(group.name)}>
                  <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2 rounded-lg hover:bg-muted font-medium text-foreground">
                    {group.name}
                    <ChevronDown className={cn("w-4 h-4 transition-transform", expandedGroups[group.name] && "rotate-180")} />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-1">
                    {group.items.map((item) => {
                      const isActive = location.pathname === item.path;
                      return (
                        <Link
                          key={item.path}
                          to={item.path}
                          onClick={closeNav}
                          className={cn(
                            "flex items-center gap-3 px-6 py-2 rounded-md transition-colors text-sm",
                            isActive ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          <item.icon className="w-4 h-4" />
                          {item.label}
                        </Link>
                      );
                    })}
                  </CollapsibleContent>
                </Collapsible>
              ))}
              <div className="border-t pt-2 mt-4">
                {!isCrew && (
                  <>
                    <Link
                      to="/reports"
                      onClick={closeNav}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm",
                        location.pathname === '/reports' ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <FileText className="w-4 h-4" />
                      Reports
                    </Link>
                    <Link
                      to="/settings"
                      onClick={closeNav}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm",
                        location.pathname === '/settings' ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Settings className="w-4 h-4" />
                      Settings
                    </Link>
                  </>
                )}
              </div>

              {/* User info + logout */}
              <div className="border-t border-border pt-3 mt-2">
                <div className="flex items-center justify-between px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-xs font-bold text-primary">
                        {(user?.email || user?.name || '?')[0].toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{user?.name || user?.email || 'User'}</p>
                      <p className="text-xs text-muted-foreground">{user?.role || ''}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => { logout(); closeNav(); }}
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-destructive transition-colors px-2 py-1.5 rounded-md hover:bg-destructive/10"
                  >
                    <LogOut className="w-4 h-4" />
                    Log out
                  </button>
                </div>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}