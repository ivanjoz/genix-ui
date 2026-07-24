export interface MenuItem {
  id?: number | string;
  name: string;
  route?: string;
  icon?: string;
  minName?: string;
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
