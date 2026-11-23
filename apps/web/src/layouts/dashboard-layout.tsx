import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  CalendarClock,
  Clapperboard,
  FolderKanban,
  LogOut,
  MoreHorizontal,
  Plus,
  Film,
  Share2,
  X,
} from 'lucide-react';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/button';
import { useJobSocket } from '@/hooks/use-job-socket';
import { cn } from '@/lib/utils';

const desktopNavClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'rounded-md px-3 py-2 text-sm font-medium text-mist hover:text-white',
    isActive && 'bg-ink-800 text-white',
  );

export function DashboardLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  useJobSocket();

  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

  const moreActive =
    location.pathname.startsWith('/dashboard/accounts') || moreOpen;

  return (
    <div className="min-h-screen bg-grain">
      <header className="sticky top-0 z-40 border-b border-white/5 bg-ink-950/80 backdrop-blur supports-[backdrop-filter]:bg-ink-950/70">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 md:py-4">
          <Link to="/dashboard" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-ink-950 shadow-glow">
              <Clapperboard className="h-5 w-5" />
            </div>
            <div>
              <div className="font-display text-lg font-bold tracking-tight">
                PIWU
              </div>
              <div className="hidden text-xs text-mist sm:block">
                Viral clipping studio
              </div>
            </div>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            <NavLink to="/dashboard" end className={desktopNavClass}>
              <span className="inline-flex items-center gap-2">
                <Film className="h-4 w-4" /> Library
              </span>
            </NavLink>
            <NavLink to="/dashboard/projects" className={desktopNavClass}>
              <span className="inline-flex items-center gap-2">
                <FolderKanban className="h-4 w-4" /> Projects
              </span>
            </NavLink>
            <NavLink to="/dashboard/automations" className={desktopNavClass}>
              <span className="inline-flex items-center gap-2">
                <CalendarClock className="h-4 w-4" /> Diario
              </span>
            </NavLink>
            <NavLink to="/dashboard/accounts" className={desktopNavClass}>
              <span className="inline-flex items-center gap-2">
                <Share2 className="h-4 w-4" /> Cuentas
              </span>
            </NavLink>
            <NavLink to="/dashboard/create" className={desktopNavClass}>
              <span className="inline-flex items-center gap-2">
                <Plus className="h-4 w-4" /> Create
              </span>
            </NavLink>
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <div className="text-right text-sm">
              <div className="font-medium text-white">
                {user?.name || 'Creator'}
              </div>
              <div className="text-xs text-mist">{user?.email}</div>
            </div>
            <Button variant="outline" size="sm" onClick={() => void logout()}>
              <LogOut className="h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 pb-[calc(4.75rem+env(safe-area-inset-bottom))] md:py-8 md:pb-8">
        <Outlet />
      </main>

      {/* Mobile bottom tab bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-ink-950/95 backdrop-blur md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        aria-label="Primary"
      >
        <div className="mx-auto grid h-[4.25rem] max-w-6xl grid-cols-5 items-end px-1">
          <MobileTab
            to="/dashboard"
            end
            icon={Film}
            label="Library"
          />
          <MobileTab
            to="/dashboard/automations"
            icon={CalendarClock}
            label="Diario"
          />
          <MobileTab
            to="/dashboard/create"
            icon={Plus}
            label="Create"
            emphasize
          />
          <MobileTab
            to="/dashboard/projects"
            icon={FolderKanban}
            label="Projects"
          />
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            className={cn(
              'flex min-h-[44px] flex-col items-center justify-center gap-0.5 px-1 pb-2 pt-1 text-[10px] font-medium',
              moreActive ? 'text-accent' : 'text-mist',
            )}
            aria-expanded={moreOpen}
            aria-haspopup="dialog"
          >
            <MoreHorizontal className="h-5 w-5" />
            More
          </button>
        </div>
      </nav>

      {/* More sheet (mobile) */}
      {moreOpen ? (
        <div className="fixed inset-0 z-[60] md:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            aria-label="Close menu"
            onClick={() => setMoreOpen(false)}
          />
          <div
            className="absolute inset-x-0 bottom-0 rounded-t-2xl border border-white/10 bg-ink-900 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 shadow-glow"
          >
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="font-medium text-white">
                  {user?.name || 'Creator'}
                </div>
                <div className="text-xs text-mist">{user?.email}</div>
              </div>
              <button
                type="button"
                className="flex h-11 w-11 items-center justify-center rounded-full text-mist hover:bg-ink-800 hover:text-white"
                onClick={() => setMoreOpen(false)}
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-1">
              <Link
                to="/dashboard/accounts"
                className="flex min-h-[48px] items-center gap-3 rounded-xl px-3 text-sm font-medium text-white hover:bg-ink-800"
                onClick={() => setMoreOpen(false)}
              >
                <Share2 className="h-5 w-5 text-mist" />
                Cuentas
              </Link>
              <button
                type="button"
                className="flex min-h-[48px] w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-white hover:bg-ink-800"
                onClick={() => {
                  setMoreOpen(false);
                  void logout();
                }}
              >
                <LogOut className="h-5 w-5 text-mist" />
                Logout
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MobileTab({
  to,
  end,
  icon: Icon,
  label,
  emphasize,
}: {
  to: string;
  end?: boolean;
  icon: typeof Film;
  label: string;
  emphasize?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex min-h-[44px] flex-col items-center justify-center gap-0.5 px-1 pb-2 pt-1 text-[10px] font-medium',
          isActive ? 'text-accent' : 'text-mist',
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={cn(
              'flex items-center justify-center',
              emphasize &&
                'mb-0.5 h-11 w-11 -translate-y-1 rounded-full bg-accent text-ink-950 shadow-glow',
              emphasize && isActive && 'ring-2 ring-white/30',
            )}
          >
            <Icon className={cn('h-5 w-5', emphasize && 'h-6 w-6')} />
          </span>
          {label}
        </>
      )}
    </NavLink>
  );
}
