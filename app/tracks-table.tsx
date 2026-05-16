"use client"

import * as React from "react"
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ChevronLeft, ChevronRight } from "lucide-react"

interface TracksTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
}

export function TracksTable<TData, TValue>({
  columns,
  data,
}: TracksTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [currentPage, setCurrentPage] = React.useState(0)

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    state: {
      sorting,
      columnFilters,
      pagination: {
        pageIndex: currentPage,
        pageSize: 50,
      },
    },
  })

  const totalPages = table.getPageCount()

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-white/10 overflow-hidden">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="border-white/10 hover:bg-white/5">
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id} className="text-white/60">
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
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className="border-white/10 hover:bg-white/5 transition-colors"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-white/40">
                  No tracks found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => {
              table.previousPage()
              setCurrentPage(currentPage - 1)
            }}
            disabled={!table.getCanPreviousPage()}
            className="p-2 rounded-lg bg-white/10 border border-white/20 text-white transition-all hover:bg-white/20 hover:border-white/30 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white/10"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum
              if (totalPages <= 5) {
                pageNum = i
              } else if (currentPage < 3) {
                pageNum = i
              } else if (currentPage > totalPages - 3) {
                pageNum = totalPages - 5 + i
              } else {
                pageNum = currentPage - 2 + i
              }

              const isActive = pageNum === currentPage

              return (
                <button
                  key={pageNum}
                  onClick={() => {
                    table.setPageIndex(pageNum)
                    setCurrentPage(pageNum)
                  }}
                  className={`min-w-9 h-9 px-2 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-white/20 text-white border border-white/30'
                      : 'text-white/70 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {pageNum + 1}
                </button>
              )
            })}
          </div>

          <button
            onClick={() => {
              table.nextPage()
              setCurrentPage(currentPage + 1)
            }}
            disabled={!table.getCanNextPage()}
            className="p-2 rounded-lg bg-white/10 border border-white/20 text-white transition-all hover:bg-white/20 hover:border-white/30 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white/10"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}
