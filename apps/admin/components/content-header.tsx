"use client";

import { usePathname } from "next/navigation";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Separator,
  SidebarTrigger,
} from "@cms0/ui";

import { ExportDataButton } from "@/components/export-data-button";
import { ImportDataDialog } from "@/components/import-data-dialog";
import { useSelfHostedAdminPermissions } from "@/lib/auth/use-admin-permissions";

const shouldShowDataActions = (pathname: string) =>
  pathname === "/dashboard" ||
  pathname.startsWith("/dashboard/") ||
  pathname === "/models" ||
  pathname.startsWith("/models/");

export function ContentHeader() {
  const pathname = usePathname() ?? "/";
  const permissions = useSelfHostedAdminPermissions();
  const segments = pathname.split("/").filter(Boolean);
  const showDataActions =
    shouldShowDataActions(pathname) && permissions.canPublishDescriptor;

  return (
    <header className="flex h-16 shrink-0 items-center gap-2">
      <div className="flex items-center gap-2 px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mr-2 data-[orientation=vertical]:h-4"
        />
        <Breadcrumb>
          <BreadcrumbList>
            {segments.map((segment, index) => {
              const href = `/${segments.slice(0, index + 1).join("/")}`;
              const isLast = index === segments.length - 1;
              return (
                <div key={href} className="contents">
                  {index > 0 ? <BreadcrumbSeparator className="hidden md:block" /> : null}
                  <BreadcrumbItem className="hidden md:block">
                    {isLast ? (
                      <BreadcrumbPage>{decodeURIComponent(segment)}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink asChild>
                        <a href={href}>{decodeURIComponent(segment)}</a>
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                </div>
              );
            })}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      {showDataActions ? (
        <div className="ml-auto px-4">
          <div className="flex items-center gap-2">
            <ImportDataDialog triggerLabel="Import data" triggerSize="sm" />
            <ExportDataButton size="sm" />
          </div>
        </div>
      ) : null}
    </header>
  );
}
