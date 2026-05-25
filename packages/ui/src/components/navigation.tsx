"use client";

import type {
  ComponentProps,
  ComponentType,
  ElementType,
  ReactNode,
  SVGProps,
} from "react";
import { ChevronsUpDown, Command } from "lucide-react";

import { Badge } from "./badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "./sidebar";
import { cn } from "../lib/utils";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;
type BadgeVariant = ComponentProps<typeof Badge>["variant"];

type LinkLikeProps = {
  children: ReactNode;
  className?: string;
  href: string;
};

export type NavigationItem = {
  active?: boolean;
  badge?: ReactNode;
  badgeVariant?: BadgeVariant;
  children?: NavigationItem[];
  disabled?: boolean;
  href: string;
  icon?: IconComponent;
  label: ReactNode;
};

export type NavigationSection = {
  emptyLabel?: string;
  items: NavigationItem[];
  title: string;
};

export type NavigationBrandMenuItem = {
  disabled?: boolean;
  href?: string;
  label: ReactNode;
};

export type NavigationBrand = {
  icon?: ReactNode;
  menuItems?: NavigationBrandMenuItem[];
  subtitle?: ReactNode;
  title: ReactNode;
};

type SidebarNavigationProps = {
  brand: NavigationBrand;
  footer?: ReactNode;
  linkComponent?: ElementType<LinkLikeProps>;
  sections: NavigationSection[];
};

type UserMenuProps = {
  action?: ReactNode;
  email?: ReactNode;
  name: string;
};

const DefaultLink = ({ href, ...props }: LinkLikeProps) => (
  <a href={href} {...props} />
);

function SidebarLink({
  children,
  className,
  href,
  linkComponent,
}: {
  children: ReactNode;
  className?: string;
  href: string;
  linkComponent?: ElementType<LinkLikeProps>;
}) {
  const LinkComponent = linkComponent ?? DefaultLink;

  return (
    <LinkComponent className={className} href={href}>
      {children}
    </LinkComponent>
  );
}

function SidebarBadge({
  children,
  variant = "outline",
}: {
  children: ReactNode;
  variant?: BadgeVariant;
}) {
  if (children === null || children === undefined || children === false) {
    return null;
  }

  return (
    <Badge className="ml-auto" variant={variant}>
      {children}
    </Badge>
  );
}

function NavigationMenuItem({
  item,
  linkComponent,
}: {
  item: NavigationItem;
  linkComponent?: ElementType<LinkLikeProps>;
}) {
  const Icon = item.icon;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild={!item.disabled}
        disabled={item.disabled}
        isActive={item.active}
      >
        {item.disabled ? (
          <>
            {Icon ? <Icon /> : null}
            <span>{item.label}</span>
            <SidebarBadge variant={item.badgeVariant}>{item.badge}</SidebarBadge>
          </>
        ) : (
          <SidebarLink href={item.href} linkComponent={linkComponent}>
            {Icon ? <Icon /> : null}
            <span>{item.label}</span>
            <SidebarBadge variant={item.badgeVariant}>{item.badge}</SidebarBadge>
          </SidebarLink>
        )}
      </SidebarMenuButton>
      {item.children?.length ? (
        <div className="ml-6 mt-1 flex flex-col gap-1 group-data-[collapsible=icon]:hidden">
          {item.children.map((child) => (
            <SidebarLink
              className={cn(
                "flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs",
                child.active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
              href={child.href}
              key={child.href}
              linkComponent={linkComponent}
            >
              <span className="truncate">{child.label}</span>
              <SidebarBadge variant={child.badgeVariant}>{child.badge}</SidebarBadge>
            </SidebarLink>
          ))}
        </div>
      ) : null}
    </SidebarMenuItem>
  );
}

export function SidebarNavigation({
  brand,
  footer,
  linkComponent,
  sections,
}: Readonly<SidebarNavigationProps>) {
  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                    {brand.icon ?? <Command className="size-4" />}
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{brand.title}</span>
                    {brand.subtitle ? (
                      <span className="truncate text-xs">{brand.subtitle}</span>
                    ) : null}
                  </div>
                  {brand.menuItems?.length ? <ChevronsUpDown className="ml-auto" /> : null}
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              {brand.menuItems?.length ? (
                <DropdownMenuContent
                  align="start"
                  className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
                  side="right"
                  sideOffset={4}
                >
                  {brand.menuItems.map((item, index) =>
                    item.href && !item.disabled ? (
                      <DropdownMenuItem asChild key={`${item.href}-${index}`}>
                        <SidebarLink href={item.href} linkComponent={linkComponent}>
                          {item.label}
                        </SidebarLink>
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem disabled={item.disabled ?? true} key={index}>
                        {item.label}
                      </DropdownMenuItem>
                    ),
                  )}
                </DropdownMenuContent>
              ) : null}
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {sections.map((section) => (
          <SidebarGroup key={section.title}>
            <SidebarGroupLabel>{section.title}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.length ? (
                  section.items.map((item) => (
                    <NavigationMenuItem
                      item={item}
                      key={item.href}
                      linkComponent={linkComponent}
                    />
                  ))
                ) : (
                  <SidebarMenuItem>
                    <SidebarMenuButton disabled>
                      <span>{section.emptyLabel ?? "No items yet"}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      {footer ? (
        <SidebarFooter>
          <SidebarMenu>{footer}</SidebarMenu>
        </SidebarFooter>
      ) : null}
    </Sidebar>
  );
}

export function UserMenu({
  action,
  email,
  name,
}: Readonly<UserMenuProps>) {
  return (
    <>
      {action ? <SidebarMenuItem>{action}</SidebarMenuItem> : null}
      <SidebarMenuItem>
        <div className="flex items-center gap-3 rounded-md px-2 py-2 text-sm">
          <div className="flex size-8 items-center justify-center rounded-lg bg-sidebar-accent text-sidebar-accent-foreground">
            {name.slice(0, 1).toUpperCase()}
          </div>
          <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
            <span className="truncate font-medium">{name}</span>
            {email ? (
              <span className="truncate text-xs text-muted-foreground">{email}</span>
            ) : null}
          </div>
        </div>
      </SidebarMenuItem>
    </>
  );
}
