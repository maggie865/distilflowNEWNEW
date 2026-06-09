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
  Trash2 } from
'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/AuthContext';
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
{ label: 'Dilutions', icon: Droplets, path: '/dilutions' },
{ label: 'Distillation', icon: Flame, path: '/distillation' },
{ label: 'Recipes', icon: FlaskConical, path: '/recipes' },
{ label: 'Bottling Floor', icon: Wine, path: '/bottling-floor' },
{ label: "Tanks", icon: Cylinder, path: '/tanks' },
{ label: 'Batch Tracker', icon: GitBranch, path: '/batch-tracker' },
{ label: 'Raw Materials', icon: Package, path: '/raw-materials' },
{ label: 'Inventory', icon: Warehouse, path: '/inventory' },
{ label: 'Sales & Dispatch', icon: TrendingUp, path: '/sales' },
{ label: '3PL Warehouse', icon: Building2, path: '/warehouse' },
{ label: 'Customers', icon: Users, path: '/customers' },
{ label: 'Reports', icon: BarChart2, path: '/reports' }];


export default function Sidebar() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const { logout, deleteAccount } = useAuth();

  const handleDeleteAccount = async () => {
    try {
      await deleteAccount();
    } catch (error) {
      console.error('Failed to delete account:', error);
    }
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

      {/* Footer with user actions */}
      <div className="border-t border-sidebar-border p-3 space-y-2">
        <button
          onClick={() => logout()}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-all duration-200">
          <LogOut className="w-[18px] h-[18px] flex-shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>
        <button
          onClick={() => setShowDeleteDialog(true)}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-destructive/70 hover:text-destructive hover:bg-destructive/10 transition-all duration-200">
          <Trash2 className="w-[18px] h-[18px] flex-shrink-0" />
          {!collapsed && <span>Delete Account</span>}
        </button>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center p-3 text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors">
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Your Account?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. All your data will be permanently deleted from the system.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 mt-4">
            <Trash2 className="w-4 h-4 text-destructive flex-shrink-0" />
            <p className="text-sm text-destructive font-medium">This will delete your account and all associated data.</p>
          </div>
          <div className="flex gap-3 mt-6">
            <AlertDialogCancel asChild>
              <Button variant="outline">Cancel</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button variant="destructive" onClick={handleDeleteAccount}>Delete Account</Button>
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </aside>);

}