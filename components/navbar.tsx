"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Library, Info, Search, Upload, Wrench, Settings } from "lucide-react"
import { Input } from "@/components/ui/input"
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu"

import { cn } from "@/lib/utils"

const routes = [
  {
    href: "/",
    icon: Library,
    label: "Library",
  },
]

export function Navbar() {
  const pathname = usePathname()

  return (
    <div className="flex items-center w-full relative justify-center">
      {/* Center: Library + Search Bar + Action Buttons */}
      <div className="flex items-center gap-2 w-full max-w-2xl">
        {/* Library Button */}
        {routes.map((route) => {
          const isActive = pathname === route.href
          const Icon = route.icon

          return (
            <Link
              key={route.href}
              href={route.href}
              className={cn(
                "p-2 rounded-full transition-all",
                isActive
                  ? "bg-white/20 text-white"
                  : "text-white/70 hover:text-white hover:bg-white/10"
              )}
              aria-label={route.label}
            >
              <Icon className="w-5 h-5" />
            </Link>
          )
        })}

        {/* Upload Button */}
        <Link
          href="/upload"
          className="p-2 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-all"
          aria-label="Upload"
        >
          <Upload className="w-5 h-5" />
        </Link>

        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50" />
          <Input
            placeholder="Search albums, artists, tracks..."
            className="pl-10 h-9 text-sm bg-white/10 border-white/20 text-white placeholder:text-white/50 focus:bg-white/15 focus:border-white/30 transition-all rounded-full"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Tools Menu */}
          <NavigationMenu>
            <NavigationMenuList>
              <NavigationMenuItem>
                <NavigationMenuTrigger className="p-2 h-auto rounded-full bg-transparent text-white/70 hover:text-white hover:bg-white/10 border-0 focus:bg-white/10 data-open:bg-white/10 data-open:text-white">
                  <Wrench className="w-5 h-5" />
                </NavigationMenuTrigger>
                <NavigationMenuContent className="bg-black/95 backdrop-blur-md border border-white/10">
                  <ul className="w-48 p-2">
                    <li>
                      <NavigationMenuLink className="text-white/70 hover:text-white hover:bg-white/10">
                        Import Library
                      </NavigationMenuLink>
                    </li>
                    <li>
                      <NavigationMenuLink className="text-white/70 hover:text-white hover:bg-white/10">
                        Export Playlist
                      </NavigationMenuLink>
                    </li>
                    <li>
                      <NavigationMenuLink className="text-white/70 hover:text-white hover:bg-white/10">
                        Scan Files
                      </NavigationMenuLink>
                    </li>
                  </ul>
                </NavigationMenuContent>
              </NavigationMenuItem>
            </NavigationMenuList>
          </NavigationMenu>

          {/* Settings Menu */}
          <NavigationMenu>
            <NavigationMenuList>
              <NavigationMenuItem>
                <NavigationMenuTrigger className="p-2 h-auto rounded-full bg-transparent text-white/70 hover:text-white hover:bg-white/10 border-0 focus:bg-white/10 data-open:bg-white/10 data-open:text-white">
                  <Settings className="w-5 h-5" />
                </NavigationMenuTrigger>
                <NavigationMenuContent className="bg-black/95 backdrop-blur-md border border-white/10">
                  <ul className="w-48 p-2">
                    <li>
                      <NavigationMenuLink className="text-white/70 hover:text-white hover:bg-white/10">
                        Preferences
                      </NavigationMenuLink>
                    </li>
                    <li>
                      <NavigationMenuLink className="text-white/70 hover:text-white hover:bg-white/10">
                        Audio Quality
                      </NavigationMenuLink>
                    </li>
                    <li>
                      <NavigationMenuLink className="text-white/70 hover:text-white hover:bg-white/10">
                        Privacy
                      </NavigationMenuLink>
                    </li>
                  </ul>
                </NavigationMenuContent>
              </NavigationMenuItem>
            </NavigationMenuList>
          </NavigationMenu>
        </div>
      </div>
    </div>
  )
}
