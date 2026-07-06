import {
   FolderKanban,
   Settings,
   Bell,
   KeyRound,
   Users,
   Tag,
   Layers,
   FileText,
   MessageSquare,
   Clock,
   Zap,
   UserRound,
   FocusIcon,
   LayoutList,
} from 'lucide-react';

export const inboxItems = [];

export const workspaceItems = [
   {
      name: 'Active tasks',
      url: '/tasks?active=true',
      icon: FocusIcon,
   },
   {
      name: 'All tasks',
      url: '/tasks',
      icon: LayoutList,
   },
   {
      name: 'Tags',
      url: '/tags',
      icon: Tag,
   },
];

export const accountItems = [
   {
      name: 'Account',
      url: '/settings/account',
      icon: UserRound,
   },
   {
      name: 'Preferences',
      url: '/settings/preferences',
      icon: Settings,
   },
   {
      name: 'Profile',
      url: '/settings/profile',
      icon: UserRound,
   },
   {
      name: 'Notifications',
      url: '/settings/notifications',
      icon: Bell,
   },
   {
      name: 'Security & access',
      url: '/settings/security',
      icon: KeyRound,
   },
   {
      name: 'Connected accounts',
      url: '/settings/connected-accounts',
      icon: Users,
   },
];

export const featuresItems = [
   {
      name: 'Labels',
      url: '/settings/labels',
      icon: Tag,
   },
   {
      name: 'Tags',
      url: '/settings/tags',
      icon: Tag,
   },
   {
      name: 'Initiatives',
      url: '/settings/initiatives',
      icon: Layers,
   },
   {
      name: 'Customer requests',
      url: '/settings/customer-requests',
      icon: MessageSquare,
   },
   {
      name: 'Templates',
      url: '/settings/templates',
      icon: FileText,
   },
   {
      name: 'Asks',
      url: '/settings/asks',
      icon: MessageSquare,
   },
   {
      name: 'SLAs',
      url: '/settings/slas',
      icon: Clock,
   },
   {
      name: 'Emojis',
      url: '/settings/emojis',
      icon: MessageSquare,
   },
   {
      name: 'Integrations',
      url: '/settings/integrations',
      icon: Zap,
   },
];
