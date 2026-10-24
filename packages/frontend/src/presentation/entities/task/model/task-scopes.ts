import { CalendarDays, Check, Inbox, List, type LucideIcon, Sun, Trash2 } from 'lucide-react';

interface TaskScope {
  id: 'list:inbox' | 'today' | 'next' | 'all' | 'completed' | 'trash';
  label: string;
  icon: LucideIcon;
  context?: string;
}

// Sidebar, page identity and narrow navigation share the same built-in scopes.
export const taskScopes: readonly TaskScope[] = [
  { id: 'list:inbox', label: 'lists.inbox', icon: Inbox },
  { id: 'today', label: 'dates.today', icon: Sun },
  { id: 'next', label: 'tasks.nextSevenDays', icon: CalendarDays },
  { id: 'all', label: 'tasks.all', icon: List },
  { id: 'completed', label: 'common.complete', context: 'status', icon: Check },
  { id: 'trash', label: 'tasks.trash', icon: Trash2 },
];
