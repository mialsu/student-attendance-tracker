import * as React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableCaption,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from '@/components/ui/pagination';
import { cn } from '@/lib/utils';

/**
 * Column definition for the data table
 */
export interface ColumnDef<TData> {
  /** Column ID (maps to data key) */
  id: string;
  /** Column header text/component */
  header: string | React.ReactNode;
  /** Header alignment */
  headerAlign?: 'left' | 'center' | 'right';
  /** Custom accessor function to extract value from row */
  accessorFn?: (row: TData) => unknown;
  /** Custom cell renderer */
  cell?: (row: TData, value: unknown) => React.ReactNode;
  /** CSS width class (e.g., 'w-32', 'w-[40%]') */
  width?: string;
  /** Hide column on mobile (< 768px) */
  hideOnMobile?: boolean;
}

/**
 * Configuration for expandable rows
 */
export interface ExpandableConfig<TData> {
  /** Render function for expanded content */
  renderExpanded: (row: TData) => React.ReactNode;
  /** Optional: determine if row can expand */
  canExpand?: (row: TData) => boolean;
  /** Get unique ID from row */
  getRowId: (row: TData) => string;
}

/**
 * Row action button configuration
 */
export interface RowAction<TData> {
  /** Accessibility label */
  label: string;
  /** Icon component (lucide-react) */
  icon: React.ReactNode;
  /** Click handler */
  onClick: (row: TData) => void;
  /** Button variant */
  variant?: 'default' | 'destructive' | 'ghost';
  /** Conditional visibility */
  show?: (row: TData) => boolean;
  /** Disable action */
  disabled?: (row: TData) => boolean;
}

/**
 * Pagination configuration
 */
export interface PaginationConfig {
  /** Current page (1-indexed) */
  currentPage: number;
  /** Total items count */
  totalItems: number;
  /** Items per page */
  pageSize: number;
  /** Page change handler */
  onPageChange: (page: number) => void;
}

/**
 * DataTable component props
 */
export interface DataTableProps<TData> {
  /** Column definitions */
  columns: ColumnDef<TData>[];
  /** Array of data items */
  data: TData[];
  /** Loading state */
  isLoading?: boolean;
  /** Skeleton rows count (default: 5) */
  loadingRows?: number;
  /** Empty state message */
  emptyMessage?: string | React.ReactNode;
  /** Expandable row config */
  expandable?: ExpandableConfig<TData>;
  /** Row action buttons */
  rowActions?: RowAction<TData>[];
  /** Pagination config */
  pagination?: PaginationConfig;
  /** Custom table className */
  className?: string;
  /** Row click handler */
  onRowClick?: (row: TData) => void;
  /** Row className function */
  rowClassName?: (row: TData) => string;
  /** Table caption for accessibility */
  caption?: string;
}

/**
 * Get cell value from row using column definition
 */
function getCellValue<TData>(row: TData, column: ColumnDef<TData>): unknown {
  if (column.accessorFn) {
    return column.accessorFn(row);
  }
  return (row as Record<string, unknown>)[column.id];
}

/**
 * Get alignment class for header
 */
function getAlignmentClass(align?: 'left' | 'center' | 'right'): string {
  switch (align) {
    case 'center':
      return 'text-center';
    case 'right':
      return 'text-right';
    default:
      return 'text-left';
  }
}

/**
 * The density folded in from the /prototype run (variant A, "Tilikirja", 2026-09-07): 36px rows,
 * 13px text and tight padding, so the whole register reads in one glance instead of a screenful of
 * padding. `min-w-[34rem]` is the other half of the decision — this is now the ONLY implementation
 * of the surface, at every width, so below about 544px the table scrolls sideways inside the
 * overflow container shadcn's Table already provides. The page body never scrolls sideways.
 *
 * Deliberately NOT sticky-headered, even though variant A's style guidance calls for it: sticky
 * needs a scroll container with a bounded height, and this container has none, so the class would
 * have looked like a feature and done nothing. With ~14 rows there is nothing to stick.
 */
const DENSITY =
  'min-w-[34rem] text-[13px] [&_th]:h-9 [&_th]:px-3 [&_th]:py-0 [&_td]:h-9 [&_td]:px-3 [&_td]:py-1.5';

/**
 * General reusable DataTable component with TypeScript generics
 */
export function DataTable<TData>({
  columns,
  data,
  isLoading = false,
  loadingRows = 5,
  emptyMessage = 'Ei tietoja näytettävänä',
  expandable,
  rowActions,
  pagination,
  className,
  onRowClick,
  rowClassName,
  caption,
}: DataTableProps<TData>) {
  // Each row manages own expansion state
  const [expandedRows, setExpandedRows] = React.useState<Set<string>>(new Set());

  const isExpanded = (rowId: string) => expandedRows.has(rowId);

  const toggleExpansion = (rowId: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  };

  // Calculate column span for expanded content
  const expandedColSpan =
    columns.length + (expandable ? 1 : 0) + (rowActions && rowActions.length > 0 ? 1 : 0);

  // Render loading skeleton
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="rounded-md border">
          <Table className={cn(DENSITY, className)}>
            {caption && <TableCaption>{caption}</TableCaption>}
            <TableHeader>
              <TableRow>
                {expandable && <TableHead className="w-12" />}
                {columns.map((column) => (
                  <TableHead
                    key={column.id}
                    className={cn(
                      getAlignmentClass(column.headerAlign),
                      column.width,
                      column.hideOnMobile && 'hidden md:table-cell'
                    )}
                  >
                    {column.header}
                  </TableHead>
                ))}
                {rowActions && rowActions.length > 0 && (
                  <TableHead className="w-24 text-right">Toiminnot</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: loadingRows }).map((_, index) => (
                <TableRow key={index}>
                  {expandable && (
                    <TableCell>
                      <Skeleton className="h-8 w-8" />
                    </TableCell>
                  )}
                  {columns.map((column) => (
                    <TableCell
                      key={column.id}
                      className={cn(column.hideOnMobile && 'hidden md:table-cell')}
                    >
                      <Skeleton className="h-6 w-full" />
                    </TableCell>
                  ))}
                  {rowActions && rowActions.length > 0 && (
                    <TableCell>
                      <Skeleton className="h-8 w-8 ml-auto" />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {pagination && <Skeleton className="h-10 w-full" />}
      </div>
    );
  }

  // Render empty state
  if (data.length === 0) {
    return (
      <div className="rounded-md border">
        <Table className={cn(DENSITY, className)}>
          {caption && <TableCaption>{caption}</TableCaption>}
          <TableHeader>
            <TableRow>
              {expandable && <TableHead className="w-12" />}
              {columns.map((column) => (
                <TableHead
                  key={column.id}
                  className={cn(
                    getAlignmentClass(column.headerAlign),
                    column.width,
                    column.hideOnMobile && 'hidden md:table-cell'
                  )}
                >
                  {column.header}
                </TableHead>
              ))}
              {rowActions && rowActions.length > 0 && (
                <TableHead className="w-24 text-right">Toiminnot</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell colSpan={expandedColSpan} className="h-24 text-center">
                {typeof emptyMessage === 'string' ? (
                  <p className="text-muted-foreground">{emptyMessage}</p>
                ) : (
                  emptyMessage
                )}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    );
  }

  // Render data table
  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table className={cn(DENSITY, className)}>
          {caption && <TableCaption>{caption}</TableCaption>}
          <TableHeader>
            <TableRow>
              {expandable && <TableHead className="w-12" />}
              {columns.map((column) => (
                <TableHead
                  key={column.id}
                  className={cn(
                    getAlignmentClass(column.headerAlign),
                    column.width,
                    column.hideOnMobile && 'hidden md:table-cell'
                  )}
                >
                  {column.header}
                </TableHead>
              ))}
              {rowActions && rowActions.length > 0 && (
                <TableHead className="w-24 text-right">Toiminnot</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row) => {
              const rowId = expandable ? expandable.getRowId(row) : String(data.indexOf(row));
              const canExpand = expandable?.canExpand ? expandable.canExpand(row) : true;
              const expanded = isExpanded(rowId);

              return (
                <Collapsible
                  key={rowId}
                  open={expanded}
                  onOpenChange={() => expandable && canExpand && toggleExpansion(rowId)}
                  asChild
                >
                  <>
                    {/* Main Data Row */}
                    <TableRow
                      onClick={() => {
                        if (expandable && canExpand) {
                          toggleExpansion(rowId);
                        }
                        onRowClick?.(row);
                      }}
                      className={cn(
                        expandable && canExpand && 'cursor-pointer',
                        rowClassName?.(row)
                      )}
                    >
                      {/* Expansion Toggle Cell */}
                      {expandable && (
                        <TableCell className="w-12">
                          {canExpand && (
                            <CollapsibleTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={(e) => {
                                  e.stopPropagation();
                                }}
                                className="h-8 w-8"
                                aria-label={expanded ? 'Sulje rivi' : 'Avaa rivi'}
                              >
                                {expanded ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </Button>
                            </CollapsibleTrigger>
                          )}
                        </TableCell>
                      )}

                      {/* Data Cells */}
                      {columns.map((column) => {
                        const value = getCellValue(row, column);
                        return (
                          <TableCell
                            key={column.id}
                            className={cn(column.hideOnMobile && 'hidden md:table-cell')}
                          >
                            {column.cell ? column.cell(row, value) : value}
                          </TableCell>
                        );
                      })}

                      {/* Actions Cell */}
                      {rowActions && rowActions.length > 0 && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {rowActions.map((action, index) => {
                              const shouldShow = action.show ? action.show(row) : true;
                              const isDisabled = action.disabled ? action.disabled(row) : false;

                              if (!shouldShow) return null;

                              return (
                                <Button
                                  key={index}
                                  variant={action.variant || 'ghost'}
                                  size="icon"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    action.onClick(row);
                                  }}
                                  disabled={isDisabled}
                                  aria-label={action.label}
                                  className="h-8 w-8"
                                >
                                  {action.icon}
                                </Button>
                              );
                            })}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>

                    {/* Expanded Content Row */}
                    {expandable && canExpand && (
                      <CollapsibleContent asChild>
                        <TableRow>
                          <TableCell colSpan={expandedColSpan} className="p-0">
                            {expandable.renderExpanded(row)}
                          </TableCell>
                        </TableRow>
                      </CollapsibleContent>
                    )}
                  </>
                </Collapsible>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {pagination && pagination.totalItems > pagination.pageSize && (
        <DataTablePagination {...pagination} />
      )}
    </div>
  );
}

/**
 * Pagination component with smart ellipsis rendering
 */
function DataTablePagination({
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
}: PaginationConfig) {
  const totalPages = Math.ceil(totalItems / pageSize);

  // Generate page numbers with smart ellipsis
  const getPageNumbers = (): (number | 'ellipsis')[] => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const pages: (number | 'ellipsis')[] = [];

    // Always show first page
    pages.push(1);

    if (currentPage <= 3) {
      // Near start: 1 2 3 4 ... last
      pages.push(2, 3, 4, 'ellipsis', totalPages);
    } else if (currentPage >= totalPages - 2) {
      // Near end: 1 ... n-3 n-2 n-1 n
      pages.push('ellipsis', totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
    } else {
      // Middle: 1 ... current-1 current current+1 ... last
      pages.push('ellipsis', currentPage - 1, currentPage, currentPage + 1, 'ellipsis', totalPages);
    }

    return pages;
  };

  const pageNumbers = getPageNumbers();

  return (
    <Pagination>
      <PaginationContent>
        {/* Previous Button */}
        <PaginationItem>
          <PaginationPrevious
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            className={cn(
              currentPage === 1 && 'pointer-events-none opacity-50',
              'cursor-pointer'
            )}
            aria-disabled={currentPage === 1}
          />
        </PaginationItem>

        {/* Page Numbers */}
        {pageNumbers.map((page, index) => {
          if (page === 'ellipsis') {
            return (
              <PaginationItem key={`ellipsis-${index}`}>
                <PaginationEllipsis />
              </PaginationItem>
            );
          }

          return (
            <PaginationItem key={page}>
              <PaginationLink
                onClick={() => onPageChange(page)}
                isActive={page === currentPage}
                className="cursor-pointer"
              >
                {page}
              </PaginationLink>
            </PaginationItem>
          );
        })}

        {/* Next Button */}
        <PaginationItem>
          <PaginationNext
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            className={cn(
              currentPage === totalPages && 'pointer-events-none opacity-50',
              'cursor-pointer'
            )}
            aria-disabled={currentPage === totalPages}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
