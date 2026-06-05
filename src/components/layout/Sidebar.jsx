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
  ChevronLeft,
  ChevronRight } from
'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

const navItems = [
{ label: 'Dashboard', icon: LayoutDashboard, path: '/' },
{ label: 'Receiving', icon: PackagePlus, path: '/receiving' },
{ label: 'Dilutions', icon: Droplets, path: '/dilutions' },
{ label: 'Distillation', icon: Flame, path: '/distillation' },
{ label: 'Recipes', icon: FlaskConical, path: '/recipes' },
{ label: 'Bottling Floor', icon: Wine, path: '/bottling-floor' },
{ label: "Tanks", icon: Cylinder, path: '/tanks' },
{ label: 'Batch Tracker', icon: GitBranch, path: '/batch-tracker' },
{ label: 'Raw Materials', icon: Package, path: '/raw-materials' },
{ label: 'Inventory', icon: Warehouse, path: '/inventory' }];


export default function Sidebar() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

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
      <nav className="flex-1 py-4 px-3 space-y-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
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
            </Link>);

        })}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="p-3 border-t border-sidebar-border text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors flex items-center justify-center">
        
        {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>
    </aside>);

}