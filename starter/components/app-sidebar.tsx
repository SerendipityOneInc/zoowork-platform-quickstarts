"use client";

// The sidebar chrome around assistant-ui's <ThreadList/>. The list itself is
// the copy-in assistant-ui component; it renders this app's conversations.

import { MessageSquareIcon } from "lucide-react";
import type * as React from "react";
import { appConfig } from "@/app.config";
import { ThreadList } from "@/components/assistant-ui/thread-list";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar {...props}>
      <SidebarHeader className="mb-2 border-b">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <div>
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <MessageSquareIcon className="size-4" />
                </div>
                <div className="flex min-w-0 flex-col gap-0.5 leading-none">
                  <span className="truncate font-semibold">{appConfig.name}</span>
                  <span className="truncate text-muted-foreground text-xs">{appConfig.description}</span>
                </div>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="px-2">
        <ThreadList />
      </SidebarContent>
      <SidebarRail />
      <SidebarFooter className="border-t p-3">
        <p className="text-[11px] text-muted-foreground leading-relaxed">{appConfig.footnote}</p>
      </SidebarFooter>
    </Sidebar>
  );
}
