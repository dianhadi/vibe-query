"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface PromptInputProps {
  onSubmit: (prompt: string) => void;
  loading: boolean;
}

export default function PromptInput({ onSubmit, loading }: PromptInputProps) {
  const [prompt, setPrompt] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (prompt.trim()) onSubmit(prompt.trim());
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      if (prompt.trim() && !loading) onSubmit(prompt.trim());
    }
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
      <Button type="submit" disabled={loading || !prompt.trim()} className="self-end px-6">
        {loading ? "Generating..." : "Run"}
      </Button>
    </form>
  );
}
