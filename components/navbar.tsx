"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu"

import { cn } from "@/lib/utils"

const routes = [
  {
    href: "/",
    label: "Library",
  },
  {
    href: "/about",
    label: "About",
  },
]

export function Navbar() {

  return (
    <NavigationMenu>
      <NavigationMenuList>
        {routes.map((route) => {

          return (
            <NavigationMenuItem key={route.href}>
              <Link
                href={route.href}
                className={cn(
                  navigationMenuTriggerStyle(),
                )}
                suppressHydrationWarning
              >
                {route.label}
              </Link>
            </NavigationMenuItem>
          )
        })}
      </NavigationMenuList>
    </NavigationMenu>
  )
}
