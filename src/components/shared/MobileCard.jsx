import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function MobileCard({ title, subtitle, badge, accent, children, actions }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={cn('rounded-xl border bg-card shadow-sm overflow-hidden', expanded && 'ring-1 ring-primary/20')}>
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 p-3 text-left active:bg-muted/50 transition-colors"
      >
        <div className="flex-shrink-0 mt-0.5">
          {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-sm truncate">{title}</p>
            {badge && <span className="text-xs">{badge}</span>}
          </div>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5 truncate">{subtitle}</p>}
        </div>
        {accent && <div className="flex-shrink-0 text-right">{accent}</div>}
      </button>
      {expanded && (
        <div className="px-3 pb-3 pt-1 space-y-2 border-t border-border/50">
          {children}
          {actions && <div className="flex gap-2 pt-2">{actions}</div>}
        </div>
      )}
    </div>
  );
}

export function MobileCardGrid({ children }) {
  return <div className="space-y-2 md:hidden">{children}</div>;
}

export function MobileDetailRow({ label, value, highlight }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground flex-shrink-0">{label}</span>
      <span className={cn('text-sm font-medium text-right', highlight && 'text-primary font-semibold')}>{value ?? '—'}</span>
    </div>
  );
}