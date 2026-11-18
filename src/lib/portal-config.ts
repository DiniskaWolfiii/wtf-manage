export interface QuickLink {
  id: number;
  icon: string;
  title: string;
  url: string;
}

export interface PortalSettings {
  conventionName: string;
  quickLinks: QuickLink[];
}

export interface IdentityDisplayConfig {
  issuerUrl: string;
  realm: string;
}

export const DEFAULT_PORTAL_SETTINGS: PortalSettings = {
  conventionName: 'WinterFur 2026',
  quickLinks: [
    { id: 1, icon: '💬', title: 'Telegram Crew Chat', url: 'https://t.me/joinchat/example' },
    { id: 2, icon: '📁', title: 'Nextcloud Con-Drive', url: 'https://cloud.winterfur.org' },
    { id: 3, icon: '📋', title: 'Shift Schedule (Ops)', url: 'https://shifts.winterfur.org' },
  ],
};
