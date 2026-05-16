"use client"

import { ColumnDef } from "@tanstack/react-table"
import { Button } from "@/components/ui/button"
import { ArrowUpDown, Play } from "lucide-react"
import type { Item } from "@/lib/beets/db"

const formatDuration = (seconds: number | null) => {
  if (!seconds) return "--:--"
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

export const tracksColumns: ColumnDef<Item>[] = [
  {
    accessorKey: "track",
    header: "#",
    cell: ({ row }) => {
      return (
        <div className="w-8 text-white/60 text-sm">
          {row.getValue("track") || "-"}
        </div>
      )
    },
  },
  {
    accessorKey: "title",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="text-white/60 hover:text-white hover:bg-white/10 -ml-4"
        >
          Title
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
      return (
        <div className="flex items-center gap-3">
          <button className="p-1.5 rounded-full bg-white/5 text-white/70 hover:bg-white/15 hover:text-white transition-all hover:scale-110">
            <Play className="w-3 h-3 fill-current" />
          </button>
          <span className="font-medium text-white">{row.getValue("title")}</span>
        </div>
      )
    },
  },
  {
    accessorKey: "artist",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="text-white/60 hover:text-white hover:bg-white/10 -ml-4"
        >
          Artist
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
      return <div className="text-white/70">{row.getValue("artist")}</div>
    },
  },
  {
    accessorKey: "album",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="text-white/60 hover:text-white hover:bg-white/10 -ml-4"
        >
          Album
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
      return <div className="text-white/70">{row.getValue("album")}</div>
    },
  },
  {
    accessorKey: "year",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="text-white/60 hover:text-white hover:bg-white/10 -ml-4"
        >
          Year
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
      return <div className="text-white/60">{row.getValue("year") || "-"}</div>
    },
  },
  {
    accessorKey: "length",
    header: "Duration",
    cell: ({ row }) => {
      return (
        <div className="text-white/60 text-sm">
          {formatDuration(row.getValue("length"))}
        </div>
      )
    },
  },
]
