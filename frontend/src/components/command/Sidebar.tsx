"use client";

import { useState } from "react";

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <aside className={`flex flex-none flex-col border-r border-edge bg-land px-2.5 py-3.5 ${collapsed ? "w-16" : "w-60"}`}>
      <div className="overflow-hidden whitespace-nowrap px-2 pb-4 font-semibold">{collapsed ? "T" : "The Terminal"}</div>
      <div className="flex items-center gap-2.5 rounded-md bg-accent/15 p-2">
        <i className="h-4 w-4 flex-none rounded border-[1.5px] border-current" />
        {!collapsed && <span>Command</span>}
      </div>
      <div className="flex-1" />
      <button onClick={() => setCollapsed(!collapsed)} className="flex items-center gap-2.5 rounded-md p-2 text-muted">
        <i className="h-4 w-4 flex-none rounded border-[1.5px] border-current" />
        {!collapsed && <span>Collapse</span>}
      </button>
    </aside>
  );
}
