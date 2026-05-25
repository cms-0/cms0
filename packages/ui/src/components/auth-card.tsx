import type { ReactNode } from "react";

import { cn } from "../lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./card";

type AuthCardProps = {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  description: ReactNode;
  title: ReactNode;
};

export function AuthCard({
  children,
  className,
  contentClassName,
  description,
  title,
}: Readonly<AuthCardProps>) {
  return (
    <Card className={cn("w-full", className)}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className={contentClassName}>{children}</CardContent>
    </Card>
  );
}
