"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dropdown } from "@/components/ui/dropdown";
import { Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { updateSettings } from "@/lib/auth-actions";

export function SettingsForm({ displayName, timezone, timezones }: { displayName: string; timezone: string; timezones: string[] }) {
  const { notify } = useToast();
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});

  function submit(fd: FormData) {
    setErrors({});
    start(async () => {
      const r = await updateSettings({ displayName: String(fd.get("displayName") ?? ""), timezone: String(fd.get("timezone") ?? "") });
      if (r.ok) notify("success", r.message);
      else {
        setErrors(r.fieldErrors ?? {});
        notify("error", r.error);
      }
    });
  }

  return (
    <form action={submit} className="space-y-4">
      <Field label="Display name" htmlFor="displayName" error={errors.displayName}>
        <Input id="displayName" name="displayName" defaultValue={displayName} maxLength={80} />
      </Field>
      <Field label="Timezone" htmlFor="timezone" error={errors.timezone} hint="Used for the calendar, schedules, and every date you see.">
        <Dropdown tinted id="timezone" name="timezone" defaultValue={timezone} options={timezones.map((tz) => ({ value: tz, label: tz }))} />
      </Field>
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? "Saving…" : "Save settings"}
      </Button>
    </form>
  );
}
