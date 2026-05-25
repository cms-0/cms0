import type { ReactNode } from "react";

import { SidebarInset, SidebarProvider } from "./sidebar";

type AppLayoutProps = {
  children: ReactNode;
  navigation: ReactNode;
};

export function AppLayout({ children, navigation }: Readonly<AppLayoutProps>) {
  return (
    <SidebarProvider className="flex flex-1 h-full">
      {navigation}
      <SidebarInset className="h-[calc(100svh-var(--header-height))] overflow-y-auto">
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
