import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import {
  LayoutDashboard, PackageOpen, Flame, Droplets, Wine, Factory, Boxes, Leaf,
  ListTree, Cylinder, FlaskConical, Truck, Users, Building2, ClipboardList,
  ShieldAlert, Wrench, Bug, Thermometer, BarChart3, Settings, ChevronRight
} from 'lucide-react';

const ICON_MAP = {
  LayoutDashboard, PackageOpen, Flame, Droplets, Wine, Factory, Boxes, Leaf,
  ListTree, Cylinder, FlaskConical, Truck, Users, Building2, ClipboardList,
  ShieldAlert, Wrench, Bug, Thermometer, BarChart3, Settings,
};

export default function QuickLinks() {
  const navigate = useNavigate();

  const { data: links = [] } = useQuery({
    queryKey: ['dashboardLinks'],
    queryFn: () => base44.entities.DashboardLink.list('sort_order', 50),
  });

  if (links.length === 0) return null;

  return (
    <Card className="p-4 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
        <p className="text-xs font-medium text-muted-foreground">Quick Links</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {links.map(link => {
          const IconComp = ICON_MAP[link.icon] || LayoutDashboard;
          return (
            <button
              key={link.id}
              onClick={() => navigate(link.path)}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <IconComp className="w-4 h-4 text-primary" />
              {link.label}
            </button>
          );
        })}
      </div>
    </Card>
  );
}