import {
  ActivityIcon,
  BookOpenCheck,
  CalendarClock,
  ClipboardList,
  FileBarChart,
  GraduationCap,
  HistoryIcon,
  Home,
  IdCard,
  LayoutList,
  MessageCircle,
  ScrollText,
  Settings2,
  TableProperties,
  UserCog,
  Users,
  Building2,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/lib/types";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Show an unread-messages badge on this item. */
  chat?: boolean;
  /** List the person's open batches (Batch 1, Batch 2, …) under this item on desktop. */
  batches?: boolean;
}

export const NAV: Record<Role, NavItem[]> = {
  super_admin: [
    { href: "/admin", label: "Overview", icon: Home },
    { href: "/admin/campuses", label: "Campuses", icon: Building2 },
    { href: "/admin/programs", label: "Programs", icon: BookOpenCheck },
    { href: "/admin/users", label: "Users", icon: UserCog },
    { href: "/admin/logs", label: "System logs", icon: ScrollText },
  ],
  campus_head: [
    { href: "/campus-head", label: "Today", icon: LayoutList, batches: true },
    { href: "/campus-head/students", label: "Students", icon: GraduationCap },
    { href: "/campus-head/facilitators", label: "Facilitators", icon: Users },
    { href: "/campus-head/live", label: "Live", icon: ActivityIcon },
    { href: "/campus-head/history", label: "History", icon: HistoryIcon },
    { href: "/campus-head/attendance", label: "Attendance sheet", icon: TableProperties },
    { href: "/campus-head/reports", label: "Daily report", icon: FileBarChart },
    { href: "/campus-head/availability", label: "My availability", icon: CalendarClock },
  ],
  facilitator: [
    { href: "/facilitator", label: "Today", icon: LayoutList, batches: true },
    { href: "/facilitator/students", label: "My students", icon: GraduationCap },
    { href: "/facilitator/chat", label: "Chat", icon: MessageCircle, chat: true },
    { href: "/facilitator/history", label: "History", icon: HistoryIcon },
    { href: "/facilitator/availability", label: "Availability", icon: CalendarClock },
  ],
  student: [
    { href: "/student", label: "My card", icon: IdCard },
    { href: "/student/attendance", label: "Attendance", icon: ClipboardList },
    { href: "/student/chat", label: "Chat", icon: MessageCircle, chat: true },
  ],
};

export const SETTINGS_ICON = Settings2;
