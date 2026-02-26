"use client";

import { QueryHistoryItem } from "@/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

interface QueryHistoryProps {
  history: QueryHistoryItem[];
  onSelect: (item: QueryHistoryItem) => void;
}

const typeColors: Record<string, string> = {
  SELECT: "secondary",
  INSERT: "default",
  UPDATE: "default",
  DELETE: "destructive",
  DDL: "destructive",
};

export default function QueryHistory({ history, onSelect }: QueryHistoryProps) {
  if (history.length === 0) {
    return (
      <div className="p-3 text-xs text-muted-foreground">
        No queries yet. Run a query to see history here.
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-2 space-y-1">
        {[...history].reverse().map((item) => (
          <button
            key={item.id}
            onClick={() => onSelect(item)}
            className="w-full text-left px-2 py-2 rounded hover:bg-muted transition-colors group"
          >
            <div className="flex items-center gap-1.5 mb-0.5">
              <Badge variant={typeColors[item.queryType] as "secondary" | "default" | "destructive"} className="text-[10px] px-1 py-0">
                {item.queryType}
              </Badge>
              <span className="text-[10px] text-muted-foreground ml-auto">
                {item.timestamp.toLocaleTimeString()}
              </span>
            </div>
            <p className="text-xs text-foreground/80 truncate">{item.prompt}</p>
            <p className="text-[10px] text-muted-foreground font-mono truncate mt-0.5">
              {item.sql.slice(0, 80)}
            </p>
          </button>
        ))}
      </div>
    </ScrollArea>
  );
}
