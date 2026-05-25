"use client";

import * as React from "react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArchiveRestore,
  CalendarSync,
  ChevronRight,
  ChevronsUpDown,
  KeyRound,
  LayoutList,
  ListTree,
  Paintbrush,
  PieChart,
  Play,
  Send,
  Settings2,
  TextAlignStart,
  UsersRound,
  Zap,
} from "lucide-react";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  buildContentNavigationTree,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  normalizeContentNavigationNameOrder,
  type ContentNavigationTreeNode,
  useSidebar,
} from "@cms0/ui";

import { Logo } from "@/components/logo";

import { authClient } from "@/lib/auth/client";
import type { SchemaCollectionEntry } from "@/lib/schema-view";

type NavigationProps = {
  descriptorRoots: Record<string, unknown> | null;
  docsBaseUrl: string;
  models: SchemaCollectionEntry[];
  modelsOrderHint?: string[] | null;
  rootsOrderHint?: string[] | null;
  roots: SchemaCollectionEntry[];
  userEmail?: string | null;
  userName?: string | null;
};

type StaticItem = {
  external?: boolean;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
};

const staticItems = {
  settings: [
    { href: "/settings", icon: Settings2, label: "General" },
    { href: "/settings/appearance", icon: Paintbrush, label: "Appearance" },
    { href: "/settings/api-keys", icon: KeyRound, label: "API Keys" },
    { href: "/settings/backups", icon: ArchiveRestore, label: "Backups" },
    { href: "/settings/triggers", icon: Zap, label: "Triggers" },
    { href: "/settings/team", icon: UsersRound, label: "Team" },
    { href: "/settings/usage", icon: PieChart, label: "Usage" },
  ] satisfies StaticItem[],
};

const isActivePath = (pathname: string, href: string) => pathname === href;
const isWithinPath = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

const docsHref = (baseUrl: string, path: string) =>
  `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;

const humanizeName = (value: string) =>
  value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());

const buildContentPath = (segments: string[]) =>
  `/content/${segments.map((segment) => encodeURIComponent(segment)).join("/")}`;

function ContentTreeNode({
  currentPath,
  node,
}: Readonly<{ currentPath: string; node: ContentNavigationTreeNode }>) {
  const hasChildren = (node.children?.length ?? 0) > 0;
  const nodeUrl = buildContentPath(node.pathSegments);

  if (!hasChildren) {
    const content = (
      <>
        <TextAlignStart />
        {humanizeName(node.label)}
      </>
    );

    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          asChild
          isActive={isActivePath(currentPath, nodeUrl)}
        >
          <Link href={nodeUrl as Route} className="whitespace-nowrap">
            {content}
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  return (
    <SidebarMenuItem>
      <Collapsible
        className="group/collapsible [&[data-state=open]>button>svg:first-child]:rotate-90"
        defaultOpen={isWithinPath(currentPath, nodeUrl)}
      >
        <div className="flex items-center">
          <CollapsibleTrigger asChild className="group">
            <SidebarMenuButton
              asChild
              isActive={isActivePath(currentPath, nodeUrl)}
            >
              <Link href={nodeUrl as Route} className="whitespace-nowrap">
                <ChevronRight className="group-data-[state=open]:rotate-90" />
                <LayoutList />
                {humanizeName(node.label)}
                <span className="sr-only">Toggle</span>
              </Link>
            </SidebarMenuButton>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          <SidebarMenuSub>
            {node.children?.map((child) => (
              <ContentTreeNode
                currentPath={currentPath}
                key={child.pathSegments.join("/")}
                node={child}
              />
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </Collapsible>
    </SidebarMenuItem>
  );
}

function ProfileMenu({
  userEmail,
  userName,
}: Readonly<{ userEmail?: string | null; userName: string }>) {
  const router = useRouter();
  const { isMobile } = useSidebar();
  const [isPending, startTransition] = React.useTransition();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="size-8 rounded-lg">
                <AvatarImage alt={userName} src="" />
                <AvatarFallback className="rounded-lg">
                  {userName.slice(0, 1).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{userName}</span>
                <span className="truncate text-xs">{userEmail ?? ""}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="size-8 rounded-lg">
                  <AvatarImage alt={userName} src="" />
                  <AvatarFallback className="rounded-lg">
                    {userName.slice(0, 1).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{userName}</span>
                  <span className="truncate text-xs">{userEmail ?? ""}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                disabled={isPending}
                onClick={() => {
                  startTransition(async () => {
                    await authClient.signOut();
                    router.push("/login" as Route);
                    router.refresh();
                  });
                }}
              >
                {isPending ? "Signing out..." : "Log out"}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

export function Navigation({
  descriptorRoots,
  docsBaseUrl,
  models,
  modelsOrderHint,
  rootsOrderHint,
  roots,
  userEmail,
  userName,
}: Readonly<NavigationProps>) {
  const pathname = usePathname() ?? "/";
  const displayName = userName?.trim() || "Admin";
  const rootsTree = React.useMemo(
    () => buildContentNavigationTree(descriptorRoots, rootsOrderHint),
    [descriptorRoots, rootsOrderHint],
  );
  const orderedModels = React.useMemo(() => {
    const orderedNames = normalizeContentNavigationNameOrder(
      models.map((entry) => entry.name),
      modelsOrderHint,
    );
    const indexMap = new Map(orderedNames.map((name, index) => [name, index]));
    return [...models].sort((a, b) => {
      const aIndex = indexMap.get(a.name);
      const bIndex = indexMap.get(b.name);
      if (aIndex === undefined && bIndex === undefined) return 0;
      if (aIndex === undefined) return 1;
      if (bIndex === undefined) return -1;
      return aIndex - bIndex;
    });
  }, [models, modelsOrderHint]);

  const contentIsActive =
    pathname === "/dashboard" || isWithinPath(pathname, "/content");
  const modelsIsActive = isWithinPath(pathname, "/models");
  const documentationItems: StaticItem[] = [
    { href: "/documentation/api", icon: Send, label: "API" },
    {
      external: true,
      href: docsHref(docsBaseUrl, "/getting-started/"),
      icon: Play,
      label: "Get Started",
    },
    {
      external: true,
      href: docsHref(docsBaseUrl, "/changelog/"),
      icon: CalendarSync,
      label: "Changelog",
    },
  ];

  return (
    <Sidebar variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href={"/dashboard" as Route}>
                <div className="bg-sidebar-primary text-sidebar-primary-foreground flex size-8 items-center justify-center rounded-lg">
                  <Logo uniColor className="size-5" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">cms0</span>
                  <span className="sr-only">cms0 admin</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <Collapsible asChild defaultOpen={contentIsActive}>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={contentIsActive}>
                  <Link href={"/dashboard" as Route}>
                    <ListTree />
                    <span>Content</span>
                  </Link>
                </SidebarMenuButton>
                <CollapsibleTrigger asChild>
                  <SidebarMenuAction className="data-[state=open]:rotate-90">
                    <ChevronRight />
                    <span className="sr-only">Toggle</span>
                  </SidebarMenuAction>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {rootsTree.length
                      ? rootsTree.map((node) => (
                          <ContentTreeNode
                            currentPath={pathname}
                            key={node.pathSegments.join("/")}
                            node={node}
                          />
                        ))
                      : roots.map((root) => {
                          const href = `/content/${encodeURIComponent(root.name)}`;
                          return (
                            <SidebarMenuSubItem key={root.name}>
                              <SidebarMenuSubButton
                                asChild
                                isActive={isActivePath(pathname, href)}
                              >
                                <Link href={href as Route}>
                                  <TextAlignStart />
                                  <span>{humanizeName(root.name)}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          );
                        })}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </SidebarMenuItem>
            </Collapsible>

            <Collapsible asChild defaultOpen={false}>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={modelsIsActive}>
                  <Link href={"/models" as Route}>
                    <LayoutList />
                    <span>Models</span>
                  </Link>
                </SidebarMenuButton>
                <CollapsibleTrigger asChild>
                  <SidebarMenuAction className="data-[state=open]:rotate-90">
                    <ChevronRight />
                    <span className="sr-only">Toggle</span>
                  </SidebarMenuAction>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {orderedModels.map((model) => {
                      const href = `/models/${encodeURIComponent(model.name)}`;
                      return (
                        <SidebarMenuSubItem key={model.name}>
                          <SidebarMenuSubButton
                            asChild
                            isActive={isActivePath(pathname, href)}
                          >
                            <Link href={href as Route}>
                              <TextAlignStart />
                              <span>{humanizeName(model.name)}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      );
                    })}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </SidebarMenuItem>
            </Collapsible>
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Settings</SidebarGroupLabel>
          <SidebarMenu>
            {staticItems.settings.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  isActive={isActivePath(pathname, item.href)}
                >
                  <Link href={item.href as Route}>
                    <item.icon />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Documentation</SidebarGroupLabel>
          <SidebarMenu>
            {documentationItems.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  isActive={!item.external && isActivePath(pathname, item.href)}
                >
                  {item.external ? (
                    <a href={item.href} target="_blank" rel="noreferrer">
                      <item.icon />
                      <span>{item.label}</span>
                    </a>
                  ) : (
                    <Link href={item.href as Route}>
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <ProfileMenu userEmail={userEmail} userName={displayName} />
      </SidebarFooter>
    </Sidebar>
  );
}
