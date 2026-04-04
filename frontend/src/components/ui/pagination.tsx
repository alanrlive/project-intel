import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;

interface PaginationProps {
  total: number;
  page: number;
  onPage: (p: number) => void;
}

export function Pagination({ total, page, onPage }: PaginationProps) {
  const totalPages = Math.ceil(total / PAGE_SIZE);
  if (totalPages <= 1) return null;

  const start = page * PAGE_SIZE + 1;
  const end = Math.min((page + 1) * PAGE_SIZE, total);

  return (
    <div className="flex items-center justify-between pt-3 border-t border-zinc-800 text-xs text-zinc-500">
      <span>{start}–{end} of {total}</span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPage(page - 1)}
          disabled={page === 0}
          className={cn(
            "p-1 rounded hover:bg-zinc-700 transition-colors",
            page === 0 && "opacity-30 cursor-not-allowed"
          )}
        >
          <ChevronLeft size={14} />
        </button>
        {Array.from({ length: totalPages }, (_, i) => (
          <button
            key={i}
            onClick={() => onPage(i)}
            className={cn(
              "w-6 h-6 rounded text-xs transition-colors",
              i === page
                ? "bg-blue-600 text-white"
                : "hover:bg-zinc-700 text-zinc-400"
            )}
          >
            {i + 1}
          </button>
        ))}
        <button
          onClick={() => onPage(page + 1)}
          disabled={page === totalPages - 1}
          className={cn(
            "p-1 rounded hover:bg-zinc-700 transition-colors",
            page === totalPages - 1 && "opacity-30 cursor-not-allowed"
          )}
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

export { PAGE_SIZE };
