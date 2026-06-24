export type NavItem = {
  to: string;
  icon: string;
  label: string;
  showDot?: boolean;
};

export const overviewNavItems: NavItem[] = [
  { to: '/', icon: 'dashboard', label: 'nav.dashboard', showDot: true },
  { to: '/groups', icon: 'group', label: 'nav.groups' },
  { to: '/activity', icon: 'history', label: 'nav.activity' },
  { to: '/live-log', icon: 'terminal', label: 'nav.liveLog' },
  { to: '/test-chat', icon: 'science', label: 'nav.testChat' },
  { to: '/how-it-works', icon: 'menu_book', label: 'nav.howItWorks' },
];

export const agentNavItems: NavItem[] = [{ to: '/connect', icon: 'link', label: 'nav.whatsapp' }];

export const mobileQuickNavItems: NavItem[] = [
  { to: '/', icon: 'dashboard', label: 'nav.dashboard', showDot: true },
  { to: '/groups', icon: 'group', label: 'nav.groups' },
];

export function isNavActive(path: string, to: string): boolean {
  if (to === '/') return path === '/';
  return path === to || path.startsWith(`${to}/`);
}
