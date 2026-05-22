"use client"

import { Item } from "@/lib/music/database"
import { ColumnDef } from "@tanstack/react-table"
import { ArrowUpDown, MoreHorizontal, Play, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"


export const columns: ColumnDef<Item>[] = [
    {
        accessorKey: "track",
        header: ({ column }) => {
            return (
                <Button
                    variant="ghost"
                    onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                    className="h-8 px-2"
                >
                    #
                    <ArrowUpDown className="ml-2 h-3 w-3" />
                </Button>
            )
        },
        cell: ({ getValue }) => {
            const track = getValue<number>()
            return <div className="text-center w-8">{track}</div>
        },
    },
    {
        accessorKey: "title",
        header: ({ column }) => {
            return (
                <Button
                    variant="ghost"
                    onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                    className="h-8 px-2"
                >
                    Title
                    <ArrowUpDown className="ml-2 h-3 w-3" />
                </Button>
            )
        },
    },
    {
        accessorKey: "artists",
        header: ({ column }) => {
            return (
                <Button
                    variant="ghost"
                    onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                    className="h-8 px-2"
                >
                    Artists
                    <ArrowUpDown className="ml-2 h-3 w-3" />
                </Button>
            )
        },
    },
    {
        accessorKey: "length",
        header: ({ column }) => {
            return (
                <Button
                    variant="ghost"
                    onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                    className="h-8 px-2"
                >
                    Duration
                    <ArrowUpDown className="ml-2 h-3 w-3" />
                </Button>
            )
        },
        cell: ({ getValue }) => {
            const duration = getValue<number>()
            if (!duration) return ""
            const minutes = Math.floor(duration / 60)
            const seconds = duration % 60
            return <p className="font-mono text-sm">{`${minutes}:${Math.trunc(seconds).toString().padStart(2, "0")}`}</p>
        }
    },
    {
        accessorKey: "format",
        header: "Type",
        cell: ({ getValue }) => {
            const format = getValue<string>()
            return <p className="font-mono text-sm">{format?.toLowerCase() || ""}</p>
        }
    },
]
