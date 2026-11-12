"use client";
// One place for every icon the dashboard uses (Phosphor). Names describe the job, so pages don't care about the icon set.
import { IconContext } from "@phosphor-icons/react";

export {
  // Navigation
  SquaresFour as NavOverview, Kanban as NavPipeline, Buildings as NavLeads, ChatsCircle as NavConversations,
  CalendarBlank as NavCalendar, ClockClockwise as NavFollowUps, WhatsappLogo as WhatsAppIcon, Robot as NavAgent,
  GearSix as NavSettings, UsersThree as NavTeam,
  // Actions
  Play, Pause, PauseCircle, MagnifyingGlass as Search, UploadSimple as Upload, DownloadSimple as Download, Database,
  CalendarPlus, PaperPlaneRight as Send, HandPalm as Hand, Robot as Bot, SignOut as LogOut, SignIn as LogIn, UserPlus, UserCheck,
  ArrowsClockwise as Refresh, ArrowCounterClockwise as Reset, LinkSimple as Link, Plus, X, List as Menu,
  Eye, EyeSlash as EyeOff, CaretLeft as ChevronLeft, CaretRight as ChevronRight,
  // Meaning
  MapPin, Phone, Check, CheckCircle, WarningCircle, Info, Sun, TrendUp, ShieldCheck, Clock, Repeat, CalendarCheck,
  Prohibit, Hourglass, PaperPlaneTilt as Outbox, ChatCircleDots as Replies, Tray as EmptyTray,
} from "@phosphor-icons/react";

/** Small icons inside buttons read best a little heavier; large ones pass weight="regular" themselves. */
export function IconDefaults({ children }) {
  return <IconContext.Provider value={{ size: 16, weight: "bold" }}>{children}</IconContext.Provider>;
}
