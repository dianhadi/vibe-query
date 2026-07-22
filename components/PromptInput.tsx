"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Play } from "lucide-react";

interface PromptInputProps {
  onSubmit: (prompt: string) => void;
  loading: boolean;
  loadingLabel?: string;
  value?: string;
  onChange?: (value: string) => void;
}

export default function PromptInput({ onSubmit, loading, loadingLabel = "Generating...", value, onChange }: PromptInputProps) {
  const [localPrompt, setLocalPrompt] = useState("");
  const prompt = value !== undefined ? value : localPrompt;

  function setPrompt(v: string) {
    if (onChange) onChange(v);
    else setLocalPrompt(v);
  }

  function submitPrompt() {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt || loading) return;
    onSubmit(trimmedPrompt);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    submitPrompt();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    submitPrompt();
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <Textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask anything about your data... (e.g. 'show me the 10 most recent orders with customer names')"
        className="min-h-[80px] resize-none flex-1"
        disabled={loading}
      />
      <Button type="submit" disabled={loading || !prompt.trim()} className="self-end px-5 gap-2">
        <Play className="h-4 w-4" />
        {loading ? loadingLabel : "Run"}
      </Button>
    </form>
  );
}
