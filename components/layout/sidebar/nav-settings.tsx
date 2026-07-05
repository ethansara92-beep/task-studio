'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
   Bell,
   Blocks,
   Bot,
   Braces,
   FolderGit2,
   Import,
   Info,
   LayoutGrid,
   Play,
   Settings2,
   Shield,
   SlidersHorizontal,
   Tag,
   FileText,
   Webhook,
   Workflow,
} from 'lucide-react';
import {
   SidebarGroup,
   SidebarGroupLabel,
   SidebarMenu,
   SidebarMenuButton,
   SidebarMenuItem,
} from '@/components/ui/sidebar';

const NAV_GROUPS: Array<{
   label: string;
   items: Array<{ slug: string; title: string; icon: React.ComponentType<{ className?: string }> }>;
}> = [
   {
      label: 'Workspace',
      items: [
         { slug: 'general', title: 'General', icon: Settings2 },
         { slug: 'preferences', title: 'Preferences', icon: SlidersHorizontal },
         { slug: 'workspace', title: 'Workspace', icon: LayoutGrid },
         { slug: 'projects', title: 'Projects', icon: FolderGit2 },
      ],
   },
   {
      label: 'Automation',
      items: [
         { slug: 'taskmaster-claude', title: 'Taskmaster & Claude Code', icon: Bot },
         { slug: 'runner', title: 'Runner', icon: Play },
         { slug: 'workflow', title: 'Workflow', icon: Workflow },
      ],
   },
   {
      label: 'Organization',
      items: [
         { slug: 'labels', title: 'Labels', icon: Tag },
         { slug: 'templates', title: 'Templates', icon: FileText },
      ],
   },
   {
      label: 'Connectivity',
      items: [
         { slug: 'notifications', title: 'Notifications', icon: Bell },
         { slug: 'integrations', title: 'Integrations', icon: Blocks },
         { slug: 'webhooks', title: 'Webhooks', icon: Webhook },
      ],
   },
   {
      label: 'System',
      items: [
         { slug: 'import-export', title: 'Import / Export', icon: Import },
         { slug: 'developer', title: 'Developer', icon: Braces },
         { slug: 'security', title: 'Security & Access', icon: Shield },
         { slug: 'about', title: 'About', icon: Info },
      ],
   },
];

export function NavSettings() {
   const pathname = usePathname();

   return (
      <>
         {NAV_GROUPS.map((group) => (
            <SidebarGroup key={group.label}>
               <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
               <SidebarMenu>
                  {group.items.map((item) => {
                     const href = `/settings/${item.slug}`;
                     const isActive = pathname === href;
                     return (
                        <SidebarMenuItem key={item.slug}>
                           <SidebarMenuButton asChild isActive={isActive}>
                              <Link href={href}>
                                 <item.icon className="size-4" />
                                 <span>{item.title}</span>
                              </Link>
                           </SidebarMenuButton>
                        </SidebarMenuItem>
                     );
                  })}
               </SidebarMenu>
            </SidebarGroup>
         ))}
      </>
   );
}
