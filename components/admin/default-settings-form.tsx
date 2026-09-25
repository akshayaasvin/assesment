"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { updateDefaultSettings, type DefaultSettingsInput } from "@/lib/actions/settings";

export function DefaultSettingsForm({ initial }: { initial: DefaultSettingsInput }) {
  const [state, setState] = useState(initial);
  const [isPending, startTransition] = useTransition();

  function set<K extends keyof DefaultSettingsInput>(key: K, value: DefaultSettingsInput[K]) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <Card className="max-w-2xl border-border/70">
      <CardHeader>
        <CardTitle className="text-base">Default assessment rules</CardTitle>
        <CardDescription>Applied as the starting point whenever you create a new assessment.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5 max-w-xs">
          <Label>Maximum warnings before disqualification</Label>
          <Input type="number" min={1} value={state.maxWarnings} onChange={(e) => set("maxWarnings", Number(e.target.value))} />
        </div>

        <ToggleRow label="Camera required" checked={state.cameraRequired} onChange={(v) => set("cameraRequired", v)} />
        <ToggleRow label="Microphone required" checked={state.micRequired} onChange={(v) => set("micRequired", v)} />
        <ToggleRow label="Fullscreen required" checked={state.fullscreenRequired} onChange={(v) => set("fullscreenRequired", v)} />
        <ToggleRow label="Tab-switch monitoring" checked={state.tabSwitchMonitoring} onChange={(v) => set("tabSwitchMonitoring", v)} />
        <ToggleRow label="Block copy / paste / right-click" checked={state.copyPasteBlock} onChange={(v) => set("copyPasteBlock", v)} />
        <ToggleRow label="Auto-submit when time expires" checked={state.autoSubmit} onChange={(v) => set("autoSubmit", v)} />
        <ToggleRow label="Show result to candidate after submit" checked={state.resultVisibleToCandidate} onChange={(v) => set("resultVisibleToCandidate", v)} />

        <div className="flex justify-end pt-2">
          <Button
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                try {
                  const result = await updateDefaultSettings(state);
                  if (result?.error) toast.error(result.error);
                  else toast.success("Default settings saved.");
                } catch (e) {
                  console.error(e);
                  toast.error("Unable to save settings.");
                }
              })
            }
          >
            {isPending ? "Saving..." : "Save settings"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
      <Label className="font-normal">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
