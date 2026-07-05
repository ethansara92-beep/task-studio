import { GeneralSection } from './general-section';
import { PreferencesSection } from './preferences-section';
import { WorkspaceSection } from './workspace-section';
import { ProjectsSection } from './projects-section';
import { TaskmasterClaudeSection } from './taskmaster-claude-section';
import { RunnerSection } from './runner-section';
import { WorkflowSection } from './workflow-section';
import { LabelsSection } from './labels-section';
import { TemplatesSection } from './templates-section';
import { NotificationsSection } from './notifications-section';
import { IntegrationsSection } from './integrations-section';
import { WebhooksSection } from './webhooks-section';
import { ImportExportSection } from './import-export-section';
import { DeveloperSection } from './developer-section';
import { SecuritySection } from './security-section';
import { AboutSection } from './about-section';

export const SETTINGS_SECTIONS: Record<string, { title: string; component: React.ComponentType }> =
   {
      'general': { title: 'General', component: GeneralSection },
      'preferences': { title: 'Preferences', component: PreferencesSection },
      'workspace': { title: 'Workspace', component: WorkspaceSection },
      'projects': { title: 'Projects', component: ProjectsSection },
      'taskmaster-claude': {
         title: 'Taskmaster & Claude Code',
         component: TaskmasterClaudeSection,
      },
      'runner': { title: 'Runner', component: RunnerSection },
      'workflow': { title: 'Workflow', component: WorkflowSection },
      'labels': { title: 'Labels', component: LabelsSection },
      'templates': { title: 'Templates', component: TemplatesSection },
      'notifications': { title: 'Notifications', component: NotificationsSection },
      'integrations': { title: 'Integrations', component: IntegrationsSection },
      'webhooks': { title: 'Webhooks', component: WebhooksSection },
      'import-export': { title: 'Import / Export', component: ImportExportSection },
      'developer': { title: 'Developer', component: DeveloperSection },
      'security': { title: 'Security & Access', component: SecuritySection },
      'about': { title: 'About', component: AboutSection },
   };
