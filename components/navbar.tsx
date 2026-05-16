"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Library, Info } from "lucide-react"

import { cn } from "@/lib/utils"

const routes = [
  {
    href: "/",
    label: "Library",
    icon: Library,
  },
  {
    href: "/about",
    label: "About",
    icon: Info,
  },
]

export function Navbar() {
  const pathname = usePathname()

  return (
    <nav className="flex items-center gap-2">
      {routes.map((route) => {
        const isActive = pathname === route.href
        const Icon = route.icon

        return (
          <Link
            key={route.href}
            href={route.href}
            className={cn(
              "px-4 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-2",
              isActive
                ? "bg-white/20 text-white border border-white/30"
                : "text-white/70 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/20"
            )}
          >
            <Icon className="w-4 h-4" />
            {route.label}
          </Link>
        )
      })}
    </nav>
  )
}
