import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import clsx from "clsx";
import { useAuth } from "@/auth/AuthContext";

export default function StudioLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close drawer on route change
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  async function onSignOut() {
    navigate("/studio/login", { replace: true });
    await logout();
  }

  const navItems = (
    <>
      <SidebarLink to="/studio/posts" label="Posts" />
      {user?.role === "superadmin" && (
        <>
          <SidebarLink to="/studio/admins" label="Admins" />
          <SidebarLink to="/studio/audit-logs" label="Audit Log" />
        </>
      )}
      <SidebarLink to="/studio/profile" label="Profile" />
    </>
  );

  const userBlock = (
    <div className="border-t border-gray-200 pt-4">
      <div className="truncate text-xs font-medium text-brand-charcoal">
        {user?.email}
      </div>
      <div className="mt-0.5 text-xs capitalize text-brand-muted">
        {user?.role}
      </div>
      <button
        type="button"
        onClick={onSignOut}
        className="mt-3 text-sm font-medium text-brand-green-dark transition-colors hover:text-brand-green"
      >
        Sign out
      </button>
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col bg-white md:flex-row">
      {/* Mobile top bar */}
      <header className="flex h-14 items-center justify-between border-b border-gray-100 bg-brand-bg px-4 md:hidden">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
          className="-ml-2 rounded p-2 text-brand-charcoal hover:bg-gray-100"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path
              d="M3 5h14M3 10h14M3 15h14"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <div className="text-base font-extrabold tracking-tight">
          Bi<span className="text-brand-green">T</span>S
          <span className="ml-1 text-xs font-medium text-brand-muted">
            studio
          </span>
        </div>
        <div className="w-9" />
      </header>

      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-gray-100 bg-brand-bg p-6 md:flex">
        <div className="mb-8 text-xl font-extrabold tracking-tight">
          Bi<span className="text-brand-green">T</span>S
          <span className="ml-1 text-xs font-medium text-brand-muted">
            studio
          </span>
        </div>
        <nav className="flex flex-col gap-1">{navItems}</nav>
        <div className="mt-auto">{userBlock}</div>
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          onClick={() => setDrawerOpen(false)}
        >
          <div className="absolute inset-0 bg-black/40" />
          <aside
            onClick={(e) => e.stopPropagation()}
            className="absolute left-0 top-0 flex h-full w-64 flex-col bg-brand-bg p-6 shadow-xl"
          >
            <div className="mb-8 flex items-center justify-between">
              <div className="text-xl font-extrabold tracking-tight">
                Bi<span className="text-brand-green">T</span>S
                <span className="ml-1 text-xs font-medium text-brand-muted">
                  studio
                </span>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close menu"
                className="rounded p-1 text-brand-muted hover:bg-gray-100 hover:text-brand-charcoal"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path
                    d="M4 4l10 10M14 4l-10 10"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
            <nav className="flex flex-col gap-1">{navItems}</nav>
            <div className="mt-auto">{userBlock}</div>
          </aside>
        </div>
      )}

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}

function SidebarLink({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        clsx(
          "rounded-md px-3 py-2 text-sm font-medium transition-colors",
          isActive
            ? "bg-brand-green/10 text-brand-green-dark"
            : "text-brand-charcoal hover:bg-gray-100",
        )
      }
    >
      {label}
    </NavLink>
  );
}
