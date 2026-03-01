"use client";

import { useState } from "react";
import Image from "next/image";
import { ConnectionConfig, Schema, Dialect } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ConnectionFormProps {
  onConnected: (config: ConnectionConfig, schema: Schema, dbSchemas: string[]) => void;
}

const DEFAULT_PORTS: Record<Dialect, number> = {
  postgresql: 5432,
  mysql: 3306,
};

export default function ConnectionForm({ onConnected }: ConnectionFormProps) {
  const [dialect, setDialect] = useState<Dialect>("postgresql");
  const [config, setConfig] = useState<ConnectionConfig>({
    host: "localhost",
    port: 5432,
    user: "",
    password: "",
    database: "",
    dialect: "postgresql",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleDialectChange(newDialect: Dialect) {
    setDialect(newDialect);
    setConfig((prev) => ({
      ...prev,
      dialect: newDialect,
      port: DEFAULT_PORTS[newDialect],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const payload: ConnectionConfig = { ...config, dialect };
    try {
      const res = await fetch("/api/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "Connection failed");
      } else {
        onConnected(payload, data.schema, data.dbSchemas ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setLoading(false);
    }
  }

  const dbLabel = dialect === "mysql" ? "Connect to your MySQL database" : "Connect to your PostgreSQL database";

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>
            <Image src="/vibeQL-logo.svg" alt="vibeQL" width={160} height={50} priority />
          </CardTitle>
          <CardDescription>{dbLabel}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Dialect selector */}
            <div className="space-y-1">
              <Label>Database Type</Label>
              <div className="flex gap-3">
                {(["postgresql", "mysql"] as Dialect[]).map((d) => (
                  <label key={d} className="flex items-center gap-1.5 cursor-pointer text-sm">
                    <input
                      type="radio"
                      name="dialect"
                      value={d}
                      checked={dialect === d}
                      onChange={() => handleDialectChange(d)}
                      className="accent-primary"
                    />
                    {d === "postgresql" ? "PostgreSQL" : "MySQL"}
                  </label>
                ))}
              </div>
            </div>

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
