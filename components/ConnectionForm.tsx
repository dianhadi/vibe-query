"use client";

import { useState } from "react";
import { ConnectionConfig, Schema } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ConnectionFormProps {
  onConnected: (config: ConnectionConfig, schema: Schema) => void;
}

export default function ConnectionForm({ onConnected }: ConnectionFormProps) {
  const [config, setConfig] = useState<ConnectionConfig>({
    host: "localhost",
    port: 5432,
    user: "",
    password: "",
    database: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "Connection failed");
      } else {
        onConnected(config, data.schema);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">vibe-query</CardTitle>
          <CardDescription>Connect to your PostgreSQL database to get started.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2 space-y-1">
                <Label htmlFor="host">Host</Label>
                <Input
                  id="host"
                  value={config.host}
                  onChange={(e) => setConfig({ ...config, host: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="port">Port</Label>
                <Input
                  id="port"
                  type="number"
                  value={config.port}
                  onChange={(e) => setConfig({ ...config, port: parseInt(e.target.value) })}
                  required
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="database">Database</Label>
              <Input
                id="database"
                value={config.database}
                onChange={(e) => setConfig({ ...config, database: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="user">Username</Label>
              <Input
                id="user"
                value={config.user}
                onChange={(e) => setConfig({ ...config, user: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={config.password}
                onChange={(e) => setConfig({ ...config, password: e.target.value })}
              />
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Connecting..." : "Connect"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
