import { Link, NavLink, Outlet } from 'react-router-dom';
import { Clapperboard, LogOut, Plus, Film } from 'lucide-react';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/button';
import { useJobSocket } from '@/hooks/use-job-socket';
import { cn } from '@/lib/utils';

export function DashboardLayout() {
  const { user, logout } = useAuth();
  useJobSocket();

  return (
    <div className="min-h-screen bg-grain">
      <header className="border-b border-white/5 bg-ink-950/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <Link to="/dashboard" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-ink-950 shadow-glow">
              <Clapperboard className="h-5 w-5" />
            </div>
            <div>
              <div className="font-display text-lg font-bold tracking-tight">
                PIWU
              </div>
              <div className="text-xs text-mist">Viral clipping studio</div>
            </div>
          </Link>

          <nav className="flex items-center gap-1">
            <NavLink
              to="/dashboard"
              end
              className={({ isActive }) =>
                cn(
                  'rounded-md px-3 py-2 text-sm font-medium text-mist hover:text-white',
                  isActive && 'bg-ink-800 text-white',
                )
              }
            >
              <span className="inline-flex items-center gap-2">
                <Film className="h-4 w-4" /> Library
              </span>
            </NavLink>
            <NavLink
              to="/dashboard/create"
              className={({ isActive }) =>
                cn(
                  'rounded-md px-3 py-2 text-sm font-medium text-mist hover:text-white',
                  isActive && 'bg-ink-800 text-white',
                )
              }
            >
              <span className="inline-flex items-center gap-2">
                <Plus className="h-4 w-4" /> Create
              </span>
            </NavLink>
          </nav>

          <div className="flex items-center gap-3">
            <div className="hidden text-right text-sm sm:block">
              <div className="font-medium text-white">{user?.name || 'Creator'}</div>
              <div className="text-xs text-mist">{user?.email}</div>
            </div>
            <Button variant="outline" size="sm" onClick={() => void logout()}>
              <LogOut className="h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
