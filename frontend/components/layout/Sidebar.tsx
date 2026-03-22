"use client";

import Link from "next/link";
import Image, { type StaticImageData } from "next/image";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  ChevronRight,
  ChevronLeft,
  Settings,
  Sun,
  Moon,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import { useState } from "react";
import { WalletConnectButton } from "@/components/wallet/WalletConnectButton";
import announcementMegaphoneIcon from "@/svg/announcement-megaphone.svg";
import calendarIcon from "@/svg/calendar.svg";
import storeIcon from "@/svg/store.svg";
import appLogo from "@/images/logo.png";

interface NavItem {
  href: string;
  label: string;
  description: string;
  icon?: typeof LayoutDashboard;
  iconSrc?: StaticImageData;
}

const navItems: NavItem[] = [
  {
    href: "/compose",
    label: "Compose",
    iconSrc: announcementMegaphoneIcon,
    description: "Build your post",
  },
  {
    href: "/schedule",
    label: "Schedule",
    iconSrc: calendarIcon,
    description: "Set time & audience",
  },
  {
    href: "/dashboard",
    label: "Dashboard",
    iconSrc: storeIcon,
    description: "Posts & payments",
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile top bar */}
      <div
        className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center px-4  border-b"
        style={{
          background: "var(--sidebar-bg)",
          borderColor: "var(--sidebar-border)",
        }}
      >
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 rounded-xl mr-3 transition-all hover:bg-black/[0.06] dark:hover:bg-white/[0.06]"
        >
          <Menu className="w-5 h-5" style={{ color: "var(--text-primary)" }} />
        </button>
        <div className="flex items-center">
          <Image
            src={appLogo}
            alt=""
            width={224}
            height={64}
            className="w-[100px] h-auto object-contain object-left shrink-0"
          />
        </div>
        <button
          onClick={toggleTheme}
          className="ml-auto p-2 rounded-xl transition-all hover:bg-black/[0.06] dark:hover:bg-white/[0.06]"
        >
          {theme === "dark" ? (
            <Sun className="w-4.5 h-4.5 text-yellow-400" />
          ) : (
            <Moon
              className="w-4.5 h-4.5"
              style={{ color: "var(--text-secondary)" }}
            />
          )}
        </button>
      </div>

      {/* Mobile overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="md:hidden fixed inset-0 z-40 bg-black/50"
            />
            <motion.div
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: "spring", stiffness: 400, damping: 40 }}
              className="md:hidden fixed top-0 left-0 bottom-0 w-64 z-50 flex flex-col border-r"
              style={{
                background: "var(--sidebar-bg)",
                borderColor: "var(--sidebar-border)",
              }}
            >
              <SidebarContent
                pathname={pathname}
                collapsed={false}
                theme={theme}
                toggleTheme={toggleTheme}
                onNavClick={() => setMobileOpen(false)}
                showCloseButton
                onClose={() => setMobileOpen(false)}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Desktop sidebar */}
      <aside
        onClick={() => collapsed && setCollapsed(false)}
        className={cn(
          "hidden md:flex flex-col h-screen overflow-visible border-r transition-all duration-300 shrink-0 relative group z-30",
          collapsed
            ? "w-[72px] cursor-pointer hover:bg-[var(--bg-elevated)]"
            : "w-64",
        )}
        style={{
          background: "var(--sidebar-bg)",
          borderColor: "var(--sidebar-border)",
        }}
      >
        <SidebarContent
          pathname={pathname}
          collapsed={collapsed}
          theme={theme}
          toggleTheme={toggleTheme}
          onNavClick={() => {}}
          onCollapseToggle={() => setCollapsed(!collapsed)}
        />
      </aside>
    </>
  );
}

/* ── Sidebar content shared between desktop and mobile ─────────── */
interface SidebarContentProps {
  pathname: string;
  collapsed: boolean;
  theme: string;
  toggleTheme: () => void;
  onNavClick: () => void;
  onCollapseToggle?: () => void;
  showCloseButton?: boolean;
  onClose?: () => void;
}

function SidebarContent({
  pathname,
  collapsed,
  theme,
  toggleTheme,
  onNavClick,
  onCollapseToggle,
  showCloseButton,
  onClose,
}: SidebarContentProps) {
  const isSettingsActive = pathname.startsWith("/settings");

  return (
    <div className="flex h-full flex-col">
      {/* Absolute toggle button for desktop */}
      {onCollapseToggle && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onCollapseToggle();
          }}
          className={cn(
            "absolute -right-3 top-6 w-6 h-6 rounded-full flex items-center justify-center border transition-all z-40",
            "bg-[var(--bg-primary)] border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--brand-green)]",
            collapsed ? "opacity-0 group-hover:opacity-100" : "",
          )}
        >
          {collapsed ? (
            <ChevronRight className="w-3.5 h-3.5" />
          ) : (
            <ChevronLeft className="w-3.5 h-3.5" />
          )}
        </button>
      )}

      {/* Logo container */}
      <div
        className={cn(
          "flex items-center border-b",
          collapsed ? "px-1 justify-center" : "px-5 justify-between",
        )}
        style={{ borderColor: "var(--sidebar-border)" }}
      >
        {!collapsed ? (
          <Link
            href="/compose"
            onClick={onNavClick}
            className="flex items-center"
          >
            <Image
              src={appLogo}
              alt=""
              width={288}
              height={80}
              className="w-[116px] h-auto object-contain object-left shrink-0"
            />
          </Link>
        ) : (
          <Image
            src={appLogo}
            alt=""
            width={160}
            height={48}
            className="w-[56px] h-auto object-contain object-left shrink-0"
          />
        )}

        {showCloseButton && (
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-all hover:bg-black/[0.06] dark:hover:bg-white/[0.06]"
          >
            <X className="w-4 h-4" style={{ color: "var(--text-secondary)" }} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className={cn("flex-1 py-4 space-y-1", collapsed ? "px-2" : "px-3")}>
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} onClick={onNavClick}>
              <motion.div
                whileHover={{ x: collapsed ? 0 : 2 }}
                whileTap={{ scale: 0.98 }}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "nav-link",
                  isActive && "active",
                  collapsed && "justify-center px-2",
                )}
              >
                {item.iconSrc ? (
                  <Image
                    src={item.iconSrc}
                    alt=""
                    width={item.href === "/dashboard" ? 18 : 16}
                    height={item.href === "/dashboard" ? 18 : 16}
                    className={cn(
                      "shrink-0",
                      item.href === "/dashboard"
                        ? "w-[18px] h-[18px]"
                        : "w-4 h-4",
                    )}
                  />
                ) : Icon ? (
                  <Icon className="w-4 h-4 shrink-0" />
                ) : null}
                {!collapsed && (
                  <>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm leading-tight">
                        {item.label}
                      </p>
                      <p className="text-[11px] opacity-70 truncate">
                        {item.description}
                      </p>
                    </div>
                    {isActive && (
                      <ChevronRight className="w-3.5 h-3.5 opacity-50 shrink-0" />
                    )}
                  </>
                )}
              </motion.div>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div
        className={cn("border-t py-4", collapsed ? "px-2" : "px-4")}
        style={{ borderColor: "var(--sidebar-border)" }}
      >
        {!collapsed && (
          <Link
            href="/settings#telegram-link-settings"
            onClick={onNavClick}
            className="block mb-3"
          >
            <motion.div
              whileHover={{ x: 2 }}
              whileTap={{ scale: 0.98 }}
              className={cn("nav-link", isSettingsActive && "active")}
            >
              <div className="flex items-start gap-2">
                <Settings className="w-4 h-4 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="font-semibold text-sm leading-tight">
                    Settings
                  </p>
                  <p className="text-[11px] opacity-70 truncate">
                    Link Telegram
                  </p>
                </div>
                {isSettingsActive && (
                  <ChevronRight className="w-3.5 h-3.5 opacity-50 shrink-0" />
                )}
              </div>
            </motion.div>
          </Link>
        )}

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          title={theme === "dark" ? "Switch to light" : "Switch to dark"}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
            collapsed && "justify-center px-2",
          )}
          style={{ color: "var(--text-secondary)" }}
        >
          {theme === "dark" ? (
            <Sun className="w-4 h-4 text-yellow-400 shrink-0" />
          ) : (
            <Moon
              className="w-4 h-4 shrink-0"
              style={{ color: "var(--text-secondary)" }}
            />
          )}
          {!collapsed && (
            <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
          )}
        </button>

        <div
          className={cn(
            "mt-3",
            collapsed && "flex items-center justify-center",
          )}
        >
          <WalletConnectButton compact={collapsed} />
        </div>
      </div>
    </div>
  );
}
