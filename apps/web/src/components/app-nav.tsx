"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = {
  href: string;
  label: string;
};

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1 max-[980px]:flex-row max-[980px]:flex-wrap max-[980px]:overflow-visible">
      {items.map((item) => (
        <Link className={`nav-link ${isActive(pathname, item.href) ? "nav-link-active" : ""}`} href={item.href} key={item.href}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
