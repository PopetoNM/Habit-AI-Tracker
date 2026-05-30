import {
  CalendarDays,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
} from "lucide-react";
import { DashboardPage } from "../pages/DashboardPage";
import { SettingsPage } from "../pages/SettingsPage";
import { WeekPlannerPage } from "../pages/WeekPlannerPage";
import { useUiStore } from "../state/uiStore";

export function App() {
  const page = useUiStore((state) => state.page);
  const setPage = useUiStore((state) => state.setPage);
  const navCollapsed = useUiStore((state) => state.navCollapsed);
  const toggleNavCollapsed = useUiStore((state) => state.toggleNavCollapsed);

  return (
    <div className={navCollapsed ? "app-shell nav-collapsed" : "app-shell"}>
      <aside
        className={navCollapsed ? "app-nav collapsed" : "app-nav"}
        aria-label="Primary navigation"
      >
        <button
          className="nav-collapse-button"
          onClick={toggleNavCollapsed}
          aria-label={
            navCollapsed ? "Expand navigation" : "Collapse navigation"
          }
          data-testid="nav-collapse-toggle"
        >
          {navCollapsed ? (
            <PanelLeftOpen size={17} />
          ) : (
            <PanelLeftClose size={17} />
          )}
        </button>
        <div className="brand-block">
          <span className="brand-mark">H</span>
          <div className="brand-copy">
            <strong>Habit OS</strong>
            <small>Local tracker</small>
          </div>
        </div>
        <button
          className={page === "dashboard" ? "nav-item active" : "nav-item"}
          onClick={() => setPage("dashboard")}
          title="Dashboard"
        >
          <LayoutDashboard size={18} />
          <span>Dashboard</span>
        </button>
        <button
          className={page === "planner" ? "nav-item active" : "nav-item"}
          onClick={() => setPage("planner")}
          title="Week Planner"
        >
          <CalendarDays size={18} />
          <span>Week Planner</span>
        </button>
        <button
          className={page === "settings" ? "nav-item active" : "nav-item"}
          onClick={() => setPage("settings")}
          title="Settings"
        >
          <Settings size={18} />
          <span>Settings</span>
        </button>
      </aside>

      <main className="app-main">
        {page === "dashboard" && <DashboardPage />}
        {page === "planner" && <WeekPlannerPage />}
        {page === "settings" && <SettingsPage />}
      </main>
    </div>
  );
}
