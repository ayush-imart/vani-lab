import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  FlaskConical,
  FileText,
  ChartNoAxesColumnIncreasing,
  Layers,
  Workflow,
  Bell,
  ChevronDown,
  ArrowUpRight,
  PanelLeftClose,
  PanelLeftOpen,
  CircleHelp,
  Check,
  Settings2,
  ShieldCheck,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Modal, Note, Pill, Tip } from "./common";
import { PageTransition } from "./motion-kit";
import { api, useBackendStatus } from "@/lib/api";
import { notificationPrefsSchema } from "@/lib/api-contract";
import { markAllRead, startNotificationSync, useNotifications } from "./notifications";
const nav = [
  { label: "Performance", path: "/", icon: Activity },
  { label: "Experiment setup", path: "/setup", icon: FlaskConical },
  { label: "Prompts", path: "/prompts", icon: FileText },
  { label: "Scorecard", path: "/scorecard", icon: ChartNoAxesColumnIncreasing },
  { label: "Scale-up", path: "/scale-up", icon: Layers },
  { label: "Live pipeline", path: "/pipeline", icon: Workflow },
] as const;
type Prefs = { inApp: boolean; gchat: boolean; whatsapp: boolean };
const PREF_ROWS: { key: keyof Prefs; label: string }[] = [
  { key: "inApp", label: "In-app alerts and toasts" },
  { key: "gchat", label: "Google Chat (stub, nothing is sent yet)" },
  { key: "whatsapp", label: "WhatsApp (stub, nothing is sent yet)" },
];

function PrefsModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!open) return;
    setFailed(false);
    api<Prefs>("/notifications/preferences", { schema: notificationPrefsSchema })
      .then(setPrefs)
      .catch(() => {
        setPrefs(null);
        setFailed(true);
      });
  }, [open]);
  const toggle = (key: keyof Prefs, value: boolean) => {
    if (!prefs) return;
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    api("/notifications/preferences", { method: "PUT", body: next }).catch(() => {
      setPrefs(prefs);
      toast("Could not save: backend unreachable");
    });
  };
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Notification preferences">
      {failed && <Note>Backend unreachable: preferences cannot be loaded or saved.</Note>}
      {PREF_ROWS.map((r) => (
        <label className="setting-row" key={r.key}>
          <span>{r.label}</span>
          <Switch
            checked={prefs?.[r.key] ?? false}
            disabled={!prefs}
            onCheckedChange={(v) => toggle(r.key, v)}
          />
        </label>
      ))}
    </Modal>
  );
}

const COLLAPSE_KEY = "vani.sidebar.collapsed";
export function AppShell({ children }: { children: React.ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [collapsed, setCollapsedState] = useState(false);
  // Restore after hydration (avoids an SSR mismatch); storage can throw in private windows.
  useEffect(() => {
    try {
      setCollapsedState(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* storage unavailable: keep default */
    }
  }, []);
  const setCollapsed = (next: boolean) => {
    setCollapsedState(next);
    try {
      localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
    } catch {
      /* storage unavailable: state still works for this session */
    }
  };
  const [alerts, setAlerts] = useState(false);
  const [settings, setSettings] = useState(false);
  const [user, setUser] = useState(false);
  const notifications = useNotifications();
  const backend = useBackendStatus();
  useEffect(() => startNotificationSync(), []);
  const unreadCount = notifications.filter((n) => n.unread).length;
  return (
    <div className={`app-shell ${collapsed ? "is-collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="brand-row">
          <Link to="/" className="brand">
            <img
              className="brand-symbol"
              src="/indiamart-icon.png"
              alt="IndiaMART"
              width="34"
              height="34"
            />
            <span className="fade-collapse" aria-hidden={collapsed}>
              VANI <b>Lab</b>
            </span>
          </Link>
          <Tip label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            <Button
              variant="ghost"
              size="icon"
              className="collapse-toggle"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              onClick={() => setCollapsed(!collapsed)}
            >
              {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            </Button>
          </Tip>
        </div>
        <div className="workspace-label">
          <span className="fade-collapse">WORKSPACE</span>
        </div>
        <nav aria-label="Main navigation">
          {nav.map((n) => (
            <Button
              key={n.path}
              asChild
              variant="ghost"
              className={`nav-item ${path === n.path ? "active" : ""}`}
              aria-label={n.label}
            >
              <Link to={n.path}>
                <n.icon size={18} />
                <span className="fade-collapse">{n.label}</span>
                {path === n.path && <span className="nav-dot fade-collapse" />}
              </Link>
            </Button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="fade-collapse-block" aria-hidden={collapsed}>
            <>
              <div className="safety-mark">
                <ShieldCheck size={16} />
                <span>Built for safer decisions</span>
              </div>
              <Button
                variant="ghost"
                className="nav-item"
                onClick={() => toast("VANI Lab · experiment → evaluate → test → decide → scale")}
              >
                <CircleHelp />
                Help & resources
                <ArrowUpRight size={14} />
              </Button>
            </>
          </div>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <Pill tone="green">
            <i className="live-dot" />
            Live
          </Pill>
          {backend === "online" ? (
            <Pill tone="green">Live backend</Pill>
          ) : (
            <Pill tone="amber">
              {backend === "offline" ? "Backend unreachable: synthetic data" : "Synthetic data"}
            </Pill>
          )}
          <div className="topbar-right">
            {backend !== "online" && <span className="sample-label">Synthetic data</span>}
            <Tip label="Notifications">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Notifications"
                onClick={() => setAlerts(!alerts)}
                className="bell-button"
              >
                <Bell />
                <i />
              </Button>
            </Tip>
            <span className="header-divider" />
            <Button variant="ghost" onClick={() => setUser(!user)} aria-label="User menu">
              <span className="user-avatar">AS</span>
              <ChevronDown />
            </Button>
          </div>
          <AnimatePresence>
            {alerts && (
              <motion.div
                className="notification-panel"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.16, ease: "easeOut" }}
              >
                <div className="flex justify-between items-center">
                  <h3>
                    Notifications <Pill>{unreadCount} new</Pill>
                  </h3>
                  <Tip label="Notification settings">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Notification settings"
                      onClick={() => {
                        setAlerts(false);
                        setSettings(true);
                      }}
                    >
                      <Settings2 />
                    </Button>
                  </Tip>
                </div>
                {notifications.map((n) => (
                  <div className="notification" key={n.id}>
                    <span className={`notification-dot ${n.unread ? "unread" : ""}`} />
                    <div>
                      <strong>{n.title}</strong>
                      <p>{n.source === "autoscale" ? n.detail : "Live test"}</p>
                      <small>
                        {n.source === "autoscale" ? "Just now" : n.detail}{" "}
                        {n.source === "autoscale" ? "· Autoscale" : ""}
                      </small>
                    </div>
                    <Button asChild variant="link" size="sm">
                      <Link to={n.to} onClick={() => setAlerts(false)}>
                        Review
                      </Link>
                    </Button>
                  </div>
                ))}
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => {
                    setAlerts(false);
                    markAllRead();
                    toast.success("All notifications marked as read");
                  }}
                >
                  Mark all as read
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {user && (
              <motion.div
                className="user-panel"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.16, ease: "easeOut" }}
              >
                <strong>Ayush Srivastava</strong>
                <p>Voice AI team · Demo workspace</p>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setUser(false);
                    setSettings(true);
                  }}
                >
                  <Settings2 />
                  Notification preferences
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </header>
        <main className="page-content">
          <PageTransition id={path}>{children}</PageTransition>
        </main>
        <footer className="app-footer">
          <span>
            <ShieldCheck size={13} /> Synthetic data only. No live calls are placed.
          </span>
          <span>
            VANI Lab <span className="footer-dot">·</span> IndiaMART Voice AI
          </span>
        </footer>
      </div>
      <PrefsModal open={settings} onOpenChange={setSettings} />
    </div>
  );
}
