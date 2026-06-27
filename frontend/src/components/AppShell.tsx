import { type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Banknote,
  BarChart3,
  Bell,
  CalendarDays,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  PiggyBank,
  Settings,
  Sparkles,
  Sun,
  Users,
  User,
  Zap,
} from "lucide-react";
import { logout } from "@/api";
import { useTheme } from "@/theme";
import { useFamily } from "@/lib/store";
import { useNotifications } from "@/lib/notifications";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/accounts", label: "Accounts & Cards", icon: CreditCard },
  { to: "/investments", label: "Investments", icon: PiggyBank },
  { to: "/loans", label: "Loans", icon: Banknote },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/assistant", label: "Assistant", icon: Sparkles },
  { to: "/settings", label: "Settings", icon: Settings },
  { to: "/profile", label: "Profile", icon: User },
];

function NotificationBell() {
  const navigate = useNavigate();
  const { items, unreadCount, markAllRead } = useNotifications();
  return (
    <DropdownMenu onOpenChange={(open) => open && markAllRead()}>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="relative" />}>
        <Bell className="size-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white">
            {unreadCount}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-sm font-semibold">Notifications</span>
          {items.length > 0 && (
            <button onClick={markAllRead} className="text-xs text-primary hover:underline">
              Mark all read
            </button>
          )}
        </div>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <div className="px-2 py-6 text-center text-sm text-muted-foreground">You're all caught up. 🎉</div>
        ) : (
          items.map((n) => (
            <DropdownMenuItem key={n.id} onClick={() => navigate(n.href)} className="items-start gap-2.5 py-2">
              <span className="mt-1 size-2 shrink-0 rounded-full" style={{ backgroundColor: n.color }} />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{n.title}</div>
                <div className="text-xs text-muted-foreground">{n.message}</div>
                <div className="text-[10px] text-muted-foreground">{formatDate(n.date)}</div>
              </div>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MemberSwitcher() {
  const { members, activeId, setActiveId } = useFamily();
  const label = (m: { name: string; relation: string }) =>
    m.relation === "Self" || m.relation === "All" ? m.name : `${m.name} · ${m.relation}`;
  const items = [
    { value: "all", label: "All members" },
    ...members.map((m) => ({ value: m.id, label: label(m) })),
  ];
  return (
    <Select items={items} value={activeId} onValueChange={(v) => setActiveId(v ?? "all")}>
      <SelectTrigger className="h-9 w-[190px]">
        <Users className="size-4 text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((it) => (
          <SelectItem key={it.value} value={it.value}>
            {it.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <Button variant="ghost" size="icon" onClick={toggle} title="Toggle theme">
      {theme === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
    </Button>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2 px-2 py-1">
      <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
        <Zap className="size-5" />
      </div>
      <div className="leading-tight">
        <div className="font-semibold tracking-tight">Jarvis</div>
        <div className="text-xs text-muted-foreground">Finance</div>
      </div>
    </div>
  );
}

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )
          }
        >
          <Icon className="size-4" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const signOut = () => {
    logout();
    navigate("/login");
  };
  const showFab = location.pathname !== "/assistant";

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-sidebar px-3 py-4 md:flex">
        <Brand />
        <div className="mt-6 flex-1">
          <NavItems />
        </div>
        <div className="flex items-center justify-between border-t pt-3">
          <ThemeToggle />
          <Button variant="ghost" size="sm" onClick={signOut} className="gap-2">
            <LogOut className="size-4" /> Logout
          </Button>
        </div>
      </aside>

      <div className="md:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-background px-4">
          <div className="flex items-center gap-2 md:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon" />}>
                <Menu className="size-5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {NAV.map(({ to, label, icon: Icon }) => (
                  <DropdownMenuItem key={to} onClick={() => navigate(to)}>
                    <Icon className="size-4" /> {label}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut}>
                  <LogOut className="size-4" /> Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Brand />
          </div>
          <div className="hidden md:block" />
          <div className="flex items-center gap-2">
            <NotificationBell />
            <MemberSwitcher />
            <span className="md:hidden">
              <ThemeToggle />
            </span>
          </div>
        </header>

        <main className="mx-auto max-w-7xl p-4 md:p-6">{children}</main>
      </div>

      {showFab && (
        <button
          type="button"
          onClick={() => navigate("/assistant")}
          title="Ask the assistant"
          className="fixed right-5 bottom-5 z-40 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Sparkles className="size-6" />
        </button>
      )}
    </div>
  );
}
