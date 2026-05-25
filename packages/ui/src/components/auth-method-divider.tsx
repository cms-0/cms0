import { Separator } from "./separator";

export function AuthMethodDivider({
  label = "or",
}: Readonly<{
  label?: string;
}>) {
  return (
    <div className="flex items-center gap-4">
      <Separator className="flex-1" />
      <span className="text-xs text-muted-foreground">{label}</span>
      <Separator className="flex-1" />
    </div>
  );
}
