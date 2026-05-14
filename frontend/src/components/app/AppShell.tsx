import { type ReactNode, useState } from 'react';
import { CaretDown, ClipboardText, FileText, GearSix, House, List, Question, SidebarSimple, SlidersHorizontal, SquaresFour, X } from '@phosphor-icons/react';
import { BrandMark } from '../shared/BrandMark';

export type AppRouteKey = 'home' | 'dashboard' | 'reviews' | 'reports' | 'settings' | 'help' | 'casebook' | 'transparency' | 'not-found';

export type Navigate = (href: string) => void;

type Props = {
  active: AppRouteKey;
  title: string;
  onNavigate: Navigate;
  children: ReactNode;
  dashboardNav?: ReactNode;
  panelActions?: TopbarToggleAction[];
  filterAction?: {
    visible: boolean;
    expanded: boolean;
    onToggle: () => void;
  };
};

export type TopbarToggleAction = {
  key: string;
  label: string;
  expandedLabel: string;
  controls: string;
  expanded: boolean;
  onToggle: () => void;
  icon: ReactNode;
  visible?: boolean;
};

const sidebarItems = [
  { key: 'home', label: 'Home', href: '/home', icon: House },
  { key: 'dashboard', label: 'Dashboard', href: '/dashboard/overview', icon: SquaresFour },
  { key: 'reviews', label: 'Review Desk', href: '/reviews', icon: ClipboardText },
  { key: 'reports', label: 'Reports', href: '/reports', icon: FileText },
  { key: 'settings', label: 'Settings', href: '/settings', icon: GearSix },
  { key: 'help', label: 'Help', href: '/help', icon: Question },
] as const;

export function AppShell({ active, title, onNavigate, children, dashboardNav, panelActions = [], filterAction }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [panelsMenuOpen, setPanelsMenuOpen] = useState(false);
  const visiblePanelActions = panelActions.filter((action) => action.visible !== false);
  const visiblePanelCount = visiblePanelActions.filter((action) => action.expanded).length;

  const navigate = (href: string) => {
    setSidebarOpen(false);
    setPanelsMenuOpen(false);
    onNavigate(href);
  };
  const toggleSidebar = () => setSidebarOpen((current) => !current);

  return (
    <div className={`app-shell app-shell--with-sidebar ${sidebarOpen ? 'app-shell--drawer-open' : ''}`}>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <aside
        className={`app-sidebar ${sidebarOpen ? 'app-sidebar--open' : ''}`}
        role="navigation"
        aria-label="App sidebar navigation"
        aria-expanded={sidebarOpen}
        aria-hidden={!sidebarOpen}
      >
        <div className="app-sidebar__brand">
          <BrandMark size={42} compact />
          <div>
            <strong>LPSE-X</strong>
          </div>
          <button className="app-sidebar__close" type="button" aria-label="Close sidebar drawer" onClick={() => setSidebarOpen(false)}>
            <X size={17} weight="bold" />
          </button>
        </div>
        <nav className="app-sidebar__nav" aria-label="Primary pages">
          {sidebarItems.map((item) => {
            const Icon = item.icon;
            const selected = active === item.key || (active === 'dashboard' && item.key === 'dashboard');
            return (
              <a
                key={item.key}
                href={item.href}
                aria-label={item.label}
                aria-current={selected ? 'page' : undefined}
                title={item.label}
                onClick={(event) => {
                  event.preventDefault();
                  navigate(item.href);
                }}
              >
                <Icon size={17} weight="fill" />
                <span>{item.label}</span>
              </a>
            );
          })}
        </nav>
        <p className="safe-copy app-sidebar__guardrail">triase risiko · prioritas review · bukan tuduhan pelanggaran</p>
      </aside>
      {sidebarOpen && <button className="app-sidebar__scrim" aria-label="Dismiss sidebar" type="button" onClick={() => setSidebarOpen(false)} />}

      <div className={`app-main app-main--${active}`}>
        <header className="app-topbar" aria-label="Application topbar">
          <button
            className="app-menu-button app-menu-button--toggle"
            type="button"
            aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
            aria-expanded={sidebarOpen}
            onClick={toggleSidebar}
          >
            <List size={22} weight="bold" />
          </button>
          <div className="brand-lockup app-topbar__title">
            <BrandMark size={40} compact />
            <div>
              <p className="brand-subtitle">{active === 'dashboard' ? 'Dashboard' : 'LPSE-X'}</p>
              <h1 className="brand-title">{title}</h1>
            </div>
          </div>
          <div className="topbar-actions app-topbar__actions">
            {visiblePanelActions.length > 0 && (
              <div className="topbar-panel-control">
                <button
                  className="topbar-filter-button topbar-panel-button"
                  type="button"
                  aria-controls="dashboard-panels-menu"
                  aria-expanded={panelsMenuOpen}
                  aria-haspopup="true"
                  aria-label={`Panels ${visiblePanelCount} of ${visiblePanelActions.length} visible`}
                  title={`${visiblePanelCount} of ${visiblePanelActions.length} side panels visible`}
                  aria-pressed={panelsMenuOpen}
                  onClick={() => setPanelsMenuOpen((current) => !current)}
                >
                  <SidebarSimple size={16} weight="fill" />
                  <span>Panels</span>
                  <span className="topbar-panel-count">{visiblePanelCount}/{visiblePanelActions.length}</span>
                  <CaretDown className="topbar-toggle-chevron" data-expanded={panelsMenuOpen ? 'true' : 'false'} aria-hidden="true" size={15} weight="fill" />
                </button>
                {panelsMenuOpen && (
                  <div id="dashboard-panels-menu" className="topbar-panel-menu" role="group" aria-label="Dashboard panels">
                    <div className="topbar-panel-menu__header">
                      <strong>Visible panels</strong>
                      <small>Show or hide the right rail.</small>
                    </div>
                    {visiblePanelActions.map((action) => (
                      <button
                        key={action.key}
                        className="topbar-panel-menu__item"
                        type="button"
                        aria-label={action.expanded ? action.expandedLabel : `Show ${action.label.toLocaleLowerCase('en-US')}`}
                        aria-controls={action.controls}
                        aria-pressed={action.expanded}
                        onClick={action.onToggle}
                      >
                        <span className="topbar-panel-menu__icon">{action.icon}</span>
                        <span className="topbar-panel-menu__copy">
                          <strong>{action.label}</strong>
                          <small>{action.expanded ? 'Visible in right rail' : 'Hidden from right rail'}</small>
                        </span>
                        <span className="topbar-panel-menu__state">{action.expanded ? 'On' : 'Off'}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {filterAction?.visible && (
              <button
                className="topbar-filter-button"
                type="button"
                aria-controls="dashboard-filter-panel"
                aria-expanded={filterAction.expanded}
                aria-pressed={filterAction.expanded}
                onClick={filterAction.onToggle}
              >
                <SlidersHorizontal size={16} weight="fill" />
                <span>{filterAction.expanded ? 'Hide filters' : 'Filters'}</span>
                <CaretDown className="topbar-toggle-chevron" data-expanded={filterAction.expanded ? 'true' : 'false'} aria-hidden="true" size={15} weight="fill" />
              </button>
            )}
          </div>
        </header>
        {dashboardNav}
        <div id="main-content" className={dashboardNav ? 'app-content app-content--with-dashboard-nav' : 'app-content'}>
          {children}
        </div>
      </div>
    </div>
  );
}
