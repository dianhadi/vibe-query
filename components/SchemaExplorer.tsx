"use client";

import { Schema } from "@/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

interface SchemaExplorerProps {
  schema: Schema;
}

export default function SchemaExplorer({ schema }: SchemaExplorerProps) {
  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b">
        <h2 className="text-sm font-semibold">Schema</h2>
        <p className="text-xs text-muted-foreground">{schema.tables.length} tables</p>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {schema.tables.map((table) => (
            <details key={table.name} className="group">
              <summary className="flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer hover:bg-muted text-sm font-medium list-none">
                <span className="text-muted-foreground group-open:rotate-90 transition-transform inline-block">▶</span>
                {table.name}
                <Badge variant="secondary" className="ml-auto text-xs px-1 py-0">
                  {table.columns.length}
                </Badge>
              </summary>
              <div className="ml-4 mt-0.5 space-y-0.5">
                {table.columns.map((col) => (
                  <div key={col.name} className="px-2 py-0.5 text-xs flex items-center gap-2">
                    <span className="text-foreground/80">{col.name}</span>
                    <span className="text-muted-foreground text-[10px] ml-auto">{col.type}</span>
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
