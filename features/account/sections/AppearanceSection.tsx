import { Palette } from "lucide-react";
import { ThemeSwitcher } from "@/components/theme/ThemeSwitcher";
import { Card, CardHeader } from "@/components/ui/card";

export function AppearanceSection() {
  return (
    <Card>
      <CardHeader icon={Palette} title="Appearance" description="Choose how the app looks on this device." />
      <ThemeSwitcher />
      <p className="mt-3 text-xs text-muted-foreground">Saved on this device only. &ldquo;System&rdquo; follows your phone or computer setting.</p>
    </Card>
  );
}
