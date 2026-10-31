export interface MenuItem {
  id?: number | string;
  name: string;
  route?: string;
  icon?: string;
  minName?: string;
  /** Listed but not clickable, e.g. a page that is planned but not built yet. */
  disabled?: boolean;
  meta?: Record<string, unknown>;
}

export interface MenuGroup {
  id?: number;
  name: string;
  minName?: string;
  options: MenuItem[];
  meta?: Record<string, unknown>;
}

export interface MobileMenuItem {
  id: number | string;
  name: string;
  icon?: string;
}
