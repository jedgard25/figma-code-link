"use client";

import { useEffect, useMemo, useState } from "react";
import type { TaskFile } from "../types";

interface FigmaCodeLinkProps {
  serverUrl?: string;
  healthPollMs?: number;
}

const DEFAULT_URL = "http://localhost:7842";

async function readHealth(serverUrl: string): Promise<boolean> {
  const response = await fetch(`${serverUrl}/health`, { cache: "no-store" });
  if (!response.ok) {
    return false;
  }

  const payload = (await response.json()) as { ok?: boolean };
  return payload.ok === true;
}

async function readTasks(serverUrl: string): Promise<number> {
  const response = await fetch(`${serverUrl}/tasks`, { cache: "no-store" });
  if (!response.ok) {
    return 0;
  }

  const payload = (await response.json()) as TaskFile;
  return Array.isArray(payload.entries) ? payload.entries.length : 0;
}

export function FigmaCodeLink({
  serverUrl = DEFAULT_URL,
  healthPollMs = 5000,
}: FigmaCodeLinkProps) {
  const [connected, setConnected] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [taskCount, setTaskCount] = useState(0);

  const dotColor = useMemo(
    () => (connected ? "#22C55E" : "#DC2626"),
    [connected],
  );

  useEffect(() => {
    let active = true;

    const run = async () => {
      try {
        const ok = await readHealth(serverUrl);
        if (active) {
          setConnected(ok);
        }
      } catch {
        if (active) {
          setConnected(false);
        }
      }
    };

    void run();
    const interval = window.setInterval(run, healthPollMs);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [healthPollMs, serverUrl]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let active = true;

    const run = async () => {
      try {
        const count = await readTasks(serverUrl);
        if (active) {
          setTaskCount(count);
        }
      } catch {
        if (active) {
          setTaskCount(0);
        }
      }
    };

    void run();
    const interval = window.setInterval(run, 5000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [isOpen, serverUrl]);

  if (process.env.NODE_ENV !== "development") {
    return null;
  }

  return (
    <div
      style={{ position: "fixed", right: 16, bottom: 16, zIndex: 2147483647 }}
    >
      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        style={{
          border: "1px solid #E5E5E5",
          background: "#FFFFFF",
          color: "#1A1A1A",
          borderRadius: 9999,
          minWidth: 42,
          minHeight: 42,
          padding: "0 12px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 11,
          fontWeight: 600,
          cursor: "pointer",
          boxShadow: "0 4px 16px rgba(0, 0, 0, 0.1)",
        }}
      >
        <span
          aria-hidden
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: dotColor,
            display: "inline-block",
          }}
        />
        Link
      </button>

      {isOpen && (
        <div
          style={{
            marginTop: 8,
            width: 220,
            background: "#FFFFFF",
            border: "1px solid #E5E5E5",
            borderRadius: 10,
            padding: 12,
            boxShadow: "0 8px 30px rgba(0, 0, 0, 0.14)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <strong style={{ fontSize: 12 }}>Figma Code Link</strong>
            <span
              style={{ color: connected ? "#22C55E" : "#DC2626", fontSize: 11 }}
            >
              {connected ? "Connected" : "Offline"}
            </span>
          </div>
          <div style={{ fontSize: 12, color: "#555" }}>
            Queued tasks: {taskCount}
          </div>
        </div>
      )}
    </div>
  );
}
