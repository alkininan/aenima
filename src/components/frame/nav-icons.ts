import { DashboardIcon, GraveyardIcon, SettingsIcon, TriageIcon } from "@/components/ui/icons";
import type { NavEntry } from "@/lib/routes";

/**
 * §4's four glyphs, by the row they belong to: "Dashboard `dashboard-dots` · Triage
 * `mail-in` · Graveyard `archive` · Settings `settings`". One table for the sidebar's rows
 * and the hand-chrome menu's, so the two chromes cannot disagree about a glyph.
 */
export const NAV_ICONS: Record<NavEntry["label"], typeof DashboardIcon> = {
  dashboard: DashboardIcon,
  triage: TriageIcon,
  graveyard: GraveyardIcon,
  settings: SettingsIcon,
};
