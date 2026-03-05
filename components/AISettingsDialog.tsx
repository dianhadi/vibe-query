"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Settings2, Loader2 } from "lucide-react";
import type { ProviderInfo } from "@/app/api/ai-settings/route";

export default function AISettingsDialog() {
  const [open, setOpen] = useState(false);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [saved, setSaved] = useState<string>("");
  const [selected, setSelected] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchSettings() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai-settings");
      const data = await res.json();
      setProviders(data.providers);
      setSaved(data.current);
      setSelected(data.current);
    } catch {
      setError("Failed to load AI settings");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) fetchSettings();
  }, [open]);

  async function handleSave() {
    if (selected === saved) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/ai-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: selected }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setSaved(data.provider);
        setOpen(false);
      }
    } catch {
      setError("Failed to save provider");
    } finally {
      setSaving(false);
    }
  }

  const hasChanged = selected !== saved;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-muted-foreground"
          title="AI Provider Settings"
        >
          <Settings2 className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">AI Provider</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {providers.map((p) => {
                const isSelected = p.id === selected;
                const isSaved = p.id === saved;

                return (
                  <button
                    key={p.id}
                    disabled={!p.available}
                    onClick={() => setSelected(p.id)}
                    className={cn(
                      "w-full flex items-center justify-between rounded-md border px-3 py-2.5 text-left text-sm transition-colors",
                      isSelected && "border-primary bg-primary/5",
                      p.available && !isSelected && "cursor-pointer hover:bg-muted/60",
                      !p.available && "cursor-not-allowed opacity-40 bg-muted/20",
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className={cn(
                          "h-2 w-2 shrink-0 rounded-full",
                          p.available ? "bg-green-500" : "bg-muted-foreground/30",
                        )}
                      />
                      <div>
                        <p className="font-medium leading-none">{p.label}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{p.description}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 pl-2 shrink-0">
                      {!p.available && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 font-mono">
                          {p.requiredEnvLabel}
                        </Badge>
                      )}
                      {isSaved && p.available && (
                        <Badge variant="outline" className="text-[10px] px-1.5">
                          active
                        </Badge>
                      )}
                    </div>
                  </button>
                );
              })}

              {error && <p className="text-xs text-destructive">{error}</p>}

              <p className="pt-1 text-xs text-muted-foreground">
                Add API keys to{" "}
                <code className="rounded bg-muted px-1">.env.local</code> and
                restart the server to enable providers.
              </p>
            </div>

            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!hasChanged || saving}
              >
                {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Set Provider
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
