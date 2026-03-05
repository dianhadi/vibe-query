import { NextRequest, NextResponse } from "next/server";
import { getActiveProvider, setActiveProvider } from "@/lib/ai/provider-store";

export interface ProviderInfo {
  id: string;
  label: string;
  description: string;
  available: boolean;
  requiredEnvLabel: string;
}

interface ProviderDef {
  id: string;
  label: string;
  description: string;
  /** Env var that must be set for this provider to be available */
  requiredEnv: string;
  requiredEnvLabel: string;
}

const PROVIDERS: ProviderDef[] = [
  { id: "anthropic", label: "Anthropic",      description: "Claude Sonnet 4.6",          requiredEnv: "ANTHROPIC_API_KEY", requiredEnvLabel: "ANTHROPIC_API_KEY" },
  { id: "openai",    label: "OpenAI",          description: "GPT-4o (or custom base URL)", requiredEnv: "OPENAI_API_KEY",    requiredEnvLabel: "OPENAI_API_KEY" },
  { id: "gemini",    label: "Google Gemini",   description: "Gemini 2.0 Flash",            requiredEnv: "GEMINI_API_KEY",    requiredEnvLabel: "GEMINI_API_KEY" },
  { id: "ollama",    label: "Ollama",          description: "Local model",                 requiredEnv: "OLLAMA_BASE_URL",   requiredEnvLabel: "OLLAMA_BASE_URL" },
];

function isAvailable(p: ProviderDef): boolean {
  return !!process.env[p.requiredEnv];
}

export async function GET() {
  const current = getActiveProvider();
  const providers: ProviderInfo[] = PROVIDERS.map((p) => ({
    id: p.id,
    label: p.label,
    description: p.description,
    available: isAvailable(p),
    requiredEnvLabel: p.requiredEnvLabel,
  }));
  return NextResponse.json({ providers, current });
}

export async function POST(req: NextRequest) {
  const { provider } = await req.json();
  const found = PROVIDERS.find((p) => p.id === provider);
  if (!found) {
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
  }
  if (!isAvailable(found)) {
    return NextResponse.json(
      { error: `Provider not configured — set ${found.requiredEnvLabel} in .env.local` },
      { status: 400 }
    );
  }
  setActiveProvider(provider);
  return NextResponse.json({ provider });
}
