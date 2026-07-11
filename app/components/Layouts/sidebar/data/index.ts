import * as Icons from "../icons";

interface NavSubItem {
  title: string;
  url: string;
}

interface NavItem {
  title: string;
  icon: any;
  items: NavSubItem[];
  url?: string;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

export const NAV_DATA: NavSection[] = [
  {
    label: "MAIN MENU",
    items: [
      {
        title: "Dashboard",
        url: "/admin",
        icon: Icons.HomeIcon,
        items: [],
      },
      {
        title: "Manage User",
        url: "/admin/users",
        icon: Icons.User,
        items: [],
      },
      {
        title: "Token Usage",
        url: "/admin/token-usage",
        icon: Icons.PieChart,
        items: [],
      },
      {
        title: "Database Sources",
        url: "/admin/databases",
        icon: Icons.Table,
        items: [],
      },
    ],
  },
];
