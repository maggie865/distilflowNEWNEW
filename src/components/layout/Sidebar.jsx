import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  PackagePlus,
  Droplets,
  Flame,
  Wine,
  Warehouse,
  Package,
  GitBranch,
  Cylinder,
  FlaskConical,
  TrendingUp,
  Users,
  Building2,
  BarChart2,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Trash2,
  Settings as SettingsIcon } from
'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/AuthContext';
import { ChevronDown } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

const navItems = [
{ label: 'Dashboard', icon: LayoutDashboard, path: '/' },
{ label: 'Receiving', icon: PackagePlus, path: '/receiving' },
{ 
  label: 'Production',
  icon: Flame,
  children: [
    { label: 'Dilutions', icon: Droplets, path: '/dilutions' },
    { label: 'Distillation', icon: Flame, path: '/distillation' },
    { label: 'Tanks', icon: Cylinder, path: '/tanks' },
    { label: 'Recipes', icon: FlaskConical, path: '/recipes' }
  ]
},
{ label: 'Bottling Floor', icon: Wine, path: '/bottling-floor' },
{
  label: 'Planning',
  icon: GitBranch,
  children: [
    { label: 'Batch Tracker', icon: GitBranch, path: '/batch-tracker' },
    { label: 'Raw Materials', icon: Package, path: '/raw-materials' },
    { label: 'Inventory', icon: Warehouse, path: '/inventory' }
  ]
},
{
  label: 'Sales',
  icon: TrendingUp,
  children: [
    { label: 'Sales & Dispatch', icon: TrendingUp, path: '/sales' },
    { label: '3PL Warehouse', icon: Building2, path: '/warehouse' },
    { label: 'Customers', icon: Users, path: '/customers' }
  ]
},
{ label: 'Reports', icon: BarChart2, path: '/reports' },
{ label: 'Settings', icon: SettingsIcon, path: '/settings' }
];


export default function Sidebar() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState({});
  const { logout } = useAuth();

  const toggleGroup = (label) => {
    setExpandedGroups(prev => ({ ...prev, [label]: !prev[label] }));
  };

  const isPathActive = (path) => location.pathname === path;
  
  const isGroupActive = (children) => {
    return children.some(child => isPathActive(child.path));
  };

  return (
    <aside className={cn(
      "fixed left-0 top-0 h-screen bg-sidebar text-sidebar-foreground border-r border-sidebar-border z-50 transition-all duration-300 flex flex-col",
      collapsed ? "w-[68px]" : "w-[240px]"
    )}>
      {/* Logo */}
      <div className="p-5 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-sidebar-primary flex items-center justify-center flex-shrink-0">
            <Flame className="w-5 h-5 text-sidebar-primary-foreground" />
          </div>
          {!collapsed &&
          <div>
              <h1 className="font-display text-lg font-semibold tracking-tight text-sidebar-foreground">Distillery</h1>
              <p className="text-[11px] text-sidebar-foreground/50 -mt-0.5">Operations</p>
            </div>
          }
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          if (item.children) {
            const isExpanded = expandedGroups[item.label];
            const hasActiveChild = isGroupActive(item.children);
            return (
              <div key={item.label}>
                <button
                  onClick={() => !collapsed && toggleGroup(item.label)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                    hasActiveChild || isExpanded ?
                    "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm" :
                    "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                  )}>
                  <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-left">{item.label}</span>
                      <ChevronDown className={cn(
                        "w-4 h-4 transition-transform",
                        isExpanded ? "rotate-180" : ""
                      )} />
                    </>
                  )}
                </button>
                {isExpanded && !collapsed && (
                  <div className="pl-6 space-y-1 mt-1">
                    {item.children.map(child => {
                      const isActive = isPathActive(child.path);
                      return (
                        <Link
                          key={child.path}
                          to={child.path}
                          className={cn(
                            "flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200",
                            isActive ?
                            "bg-sidebar-primary/80 text-sidebar-primary-foreground" :
                            "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                          )}>
                          <child.icon className="w-[16px] h-[16px] flex-shrink-0" />
                          <span>{child.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }
          const isActive = isPathActive(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                isActive ?
                "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm" :
                "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
              )}>
              <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer with user actions */}
      <div className="border-t border-sidebar-border p-3 space-y-2">
        <Link
          to="/settings"
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-all duration-200">
          <SettingsIcon className="w-[18px] h-[18px] flex-shrink-0" />
          {!collapsed && <span>Settings</span>}
        </Link>
        <button
          onClick={() => logout()}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-all duration-200">
          <LogOut className="w-[18px] h-[18px] flex-shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center p-3 text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors">
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>


    </aside>);

}