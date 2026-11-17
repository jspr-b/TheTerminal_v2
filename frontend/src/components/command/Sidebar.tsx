"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const NAV: { href: string; label: string }[] = [
  { href: "/", label: "Command" },
  { href: "/products", label: "Products" },
  { href: "/customers", label: "Customers" },
  { href: "/ads", label: "Ads" },
  { href: "/support", label: "Support" },
  { href: "/money", label: "Money" },
  { href: "/connections", label: "Connections" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname() ?? "/";
  return (
    <aside className={`flex flex-none flex-col border-r border-edge bg-land px-2.5 py-3.5 ${collapsed ? "w-16" : "w-60"}`}>
      <div className="overflow-hidden whitespace-nowrap px-2 pb-4 font-semibold">{collapsed ? "T" : "The Terminal"}</div>
      <nav className="flex flex-col gap-0.5" aria-label="Main">
        {NAV.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-2.5 rounded-md p-2 ${active ? "bg-accent/15 text-[#e7e7f0]" : "text-muted hover:bg-white/[0.04] hover:text-[#e7e7f0]"}`}
            >
              <i className="h-4 w-4 flex-none rounded border-[1.5px] border-current" />
              {!collapsed && <span className="whitespace-nowrap">{item.label}</span>}
            </Link>
          );
        })}
      </nav>
      <div className="flex-1" />
      <button onClick={() => setCollapsed(!collapsed)} className="flex items-center gap-2.5 rounded-md p-2 text-muted">
        <i className="h-4 w-4 flex-none rounded border-[1.5px] border-current" />
        {!collapsed && <span>Collapse</span>}
      </button>
    </aside>
  );
}
