"use client";

import { Schema } from "@/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw } from "lucide-react";

interface SchemaExplorerProps {
  schema: Schema;
  dbSchemas: string[];
  currentDbSchema: string;
  onDbSchemaChange: (schema: string) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
}

export default function SchemaExplorer({
  schema,
  dbSchemas,
  currentDbSchema,
  onDbSchemaChange,
  onRefresh,
  refreshing = false,
}: SchemaExplorerProps) {
  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b space-y-2">
        <div className="flex items-center gap-1.5">
          {dbSchemas.length > 0 && (
            <Select value={currentDbSchema} onValueChange={onDbSchemaChange}>
              <SelectTrigger className="h-7 min-w-0 flex-1 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {dbSchemas.map((s) => (
                  <SelectItem key={s} value={s} className="text-xs">
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {onRefresh && (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={onRefresh}
              disabled={refreshing}
              title="Refresh schema"
              className="shrink-0"
            >
              <RefreshCw className={refreshing ? "animate-spin" : ""} />
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {refreshing ? "Refreshing..." : `${schema.tables.length} tables`}
        </p>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {schema.tables.map((table) => (
            <details key={table.name} className="group">
              <summary className="flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer hover:bg-muted text-sm font-medium list-none">
                <span className="text-muted-foreground group-open:rotate-90 transition-transform inline-block shrink-0">▶</span>
                <span className="truncate" title={table.name}>{table.name}</span>
                <Badge variant="secondary" className="ml-auto shrink-0 text-xs px-1 py-0">
                  {table.columns.length}
                </Badge>
              </summary>
              <div className="ml-4 mt-0.5 space-y-0.5">
                {table.columns.map((col) => (
                  <div key={col.name} className="px-2 py-0.5 text-xs flex items-center gap-2 min-w-0">
                    <span className="truncate text-foreground/80" title={col.name}>{col.name}</span>
                    <span className="text-muted-foreground text-[10px] ml-auto shrink-0">{col.type}</span>
                    {!col.nullable && (
                      <span className="text-orange-500 text-[10px]">NN</span>
                    )}
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
