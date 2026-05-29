import * as React from "react"
import {
    ColumnDef,
    ColumnFiltersState,
    SortingState,
    VisibilityState,
    flexRender,
    getCoreRowModel,
    getFilteredRowModel,
    getSortedRowModel,
    useReactTable,
} from "@tanstack/react-table"
import { Settings2 } from "lucide-react"

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import { SongContextMenu } from "./song-context-menu"
import type { Item } from "@/lib/music/database"

interface DataTableProps<TData, TValue> {
    columns: ColumnDef<TData, TValue>[]
    data: TData[]
}

export function SongsDataTable<TData, TValue>({
    columns,
    data,
}: DataTableProps<TData, TValue>) {
    const [sorting, setSorting] = React.useState<SortingState>([])
    const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
    const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})

    const table = useReactTable({
        data,
        columns,
        onSortingChange: setSorting,
        onColumnFiltersChange: setColumnFilters,
        onColumnVisibilityChange: setColumnVisibility,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        state: {
            sorting,
            columnFilters,
            columnVisibility,
        },
    })

    return (
        <div className="flex mb-4 flex-col h-full space-y-4 overflow-hidden">
            <div className="flex items-center gap-2 shrink-0">
                <Input
                    placeholder="Filter songs..."
                    value={(table.getColumn("title")?.getFilterValue() as string) ?? ""}
                    onChange={(event) =>
                        table.getColumn("title")?.setFilterValue(event.target.value)
                    }
                    className="max-w-sm bg-white/[0.06] border-white/10 placeholder:text-white/40 rounded-full transition-all duration-200 focus:bg-white/[0.1] focus:border-white/20"
                />
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="ml-auto shrink-0 bg-white/[0.06] border-white/10 hover:bg-white/[0.1] hover:border-white/20 rounded-full transition-all duration-200 active:scale-[0.97] data-[state=open]:bg-white/[0.12]">
                            <Settings2 className="mr-2 h-4 w-4" />
                            Columns
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-[150px]" sideOffset={8}>
                        <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {table
                            .getAllColumns()
                            .filter((column) => column.getCanHide())
                            .map((column) => {
                                return (
                                    <DropdownMenuCheckboxItem
                                        key={column.id}
                                        className="capitalize"
                                        checked={column.getIsVisible()}
                                        onCheckedChange={(value) =>
                                            column.toggleVisibility(!!value)
                                        }
                                    >
                                        {column.id}
                                    </DropdownMenuCheckboxItem>
                                )
                            })}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            <Table>
                <TableHeader className="sticky top-0 bg-zinc-950/80 backdrop-blur-md z-10">
                    {table.getHeaderGroups().map((headerGroup) => (
                        <TableRow key={headerGroup.id} className="border-white/[0.06] hover:bg-transparent">
                            {headerGroup.headers.map((header) => {
                                return (
                                    <TableHead key={header.id} className="text-[10px] uppercase tracking-[0.12em] text-white/50 font-semibold">
                                        {header.isPlaceholder
                                            ? null
                                            : flexRender(
                                                header.column.columnDef.header,
                                                header.getContext()
                                            )}
                                    </TableHead>
                                )
                            })}
                        </TableRow>
                    ))}
                </TableHeader>
                <TableBody>
                    {table.getRowModel().rows?.length ? (
                        table.getRowModel().rows.map((row) => {
                            const item = row.original as Item
                            const missing = item.missing_since != null
                            return (
                                <SongContextMenu key={row.id} item={item}>
                                    <TableRow
                                        data-state={row.getIsSelected() && "selected"}
                                        className={`border-white/[0.04] hover:bg-white/[0.04] data-[state=open]:bg-white/[0.06] transition-colors duration-150 ${missing ? "text-white/40" : ""}`}
                                    >
                                        {row.getVisibleCells().map((cell) => (
                                            <TableCell key={cell.id}>
                                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                </SongContextMenu>
                            )
                        })
                    ) : (
                        <TableRow>
                            <TableCell colSpan={columns.length} className="h-24 text-center text-white/60">
                                No results.
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </div>
    )
}
