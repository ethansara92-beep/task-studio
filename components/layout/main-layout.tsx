import { AppSidebar } from '@/components/layout/sidebar/app-sidebar';
import { SidebarProvider } from '@/components/ui/sidebar';
import { CreateTaskModalProvider } from '@/components/common/tasks/create-task-modal-provider';
import { RunnerNotifications } from '@/components/runner/runner-notifications';
import { SettingsEffects } from '@/components/common/settings/settings-effects';
import { TaskViewOverlay } from '@/components/task-view-overlay';
import { UnifiedHeader } from '@/components/layout/headers/unified-header';
import { cn } from '@/lib/utils';

interface MainLayoutProps {
   children: React.ReactNode;
   headersNumber?: 1 | 2;
}

export default function MainLayout({ children, headersNumber = 2 }: MainLayoutProps) {
   const height = {
      1: 'h-[calc(100svh-40px)] lg:h-[calc(100svh-56px)]',
      2: 'h-[calc(100svh-80px)] lg:h-[calc(100svh-96px)]',
   };
   return (
      <SidebarProvider>
         <CreateTaskModalProvider />
         <RunnerNotifications />
         <SettingsEffects />
         <AppSidebar />
         <div className="h-svh overflow-hidden lg:p-2 w-full">
            <div className="lg:border lg:rounded-md overflow-hidden flex flex-col items-center justify-start bg-container h-full w-full relative">
               <UnifiedHeader />
               <div
                  className={cn(
                     'overflow-auto w-full',
                     height[headersNumber as keyof typeof height]
                  )}
               >
                  {children}
               </div>
               <TaskViewOverlay />
            </div>
         </div>
      </SidebarProvider>
   );
}
