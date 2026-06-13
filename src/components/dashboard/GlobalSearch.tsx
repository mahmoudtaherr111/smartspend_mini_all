import { useState, useEffect } from "react";
import { Search, Loader2 } from "lucide-react";
import { trpc } from "../../providers/trpc";
import { Input } from "../ui/input";
import { Card, CardContent } from "../ui/card";
import { format } from "date-fns";
import { arEG } from "date-fns/locale";
import { Badge } from "../ui/badge";

export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 500);
    return () => clearTimeout(timer);
  }, [query]);

  const { data: results, isFetching } =
    trpc.expense.searchTransactions.useQuery(
      { query: debouncedQuery },
      { enabled: debouncedQuery.length >= 2 },
    );

  return (
    <div className="relative w-full max-w-sm">
      <div className="relative">
        <Search className="absolute end-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="ابحث عن عملية (كارفور، أوبر، ...)"
          className="pe-9"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {isFetching && (
          <Loader2 className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {query.length >= 2 && results && (
        <Card className="absolute top-full mt-2 w-full max-w-md bg-white dark:bg-slate-900 shadow-xl z-50 max-h-[400px] overflow-auto">
          <CardContent className="p-2 space-y-1">
            {results.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                لا توجد نتائج مطابقة
              </div>
            ) : (
              results.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col gap-1 p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-md cursor-pointer border-b last:border-0 border-slate-100 dark:border-slate-800"
                >
                  <div className="flex justify-between items-start">
                    <span className="font-bold text-sm truncate">
                      {item.category}
                    </span>
                    <span
                      className={`font-bold text-sm whitespace-nowrap ${item.type === "expense" ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}
                    >
                      {Number(item.amount).toLocaleString()} ج
                    </span>
                  </div>
                  {(item.subCategory || item.description || item.rawText) && (
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {item.subCategory !== "عام"
                        ? item.subCategory + " - "
                        : ""}
                      {item.description || item.rawText}
                    </p>
                  )}
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-[10px] text-muted-foreground">
                      {format(new Date(item.date), "d MMM yyyy, h:mm a", {
                        locale: arEG,
                      })}
                    </span>
                    <Badge
                      variant="outline"
                      className="text-[9px] px-1 py-0 h-4"
                    >
                      {item.source}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
