'use client';

import { CheckCircle2, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useDiagnostics } from '@/hooks/use-settings';
import { SettingRow, SettingsCard, SettingsPage } from '../settings-ui';

export function AboutSection() {
   const { data: diag } = useDiagnostics();

   return (
      <SettingsPage title="About" description="Task Studio, Taskmaster AI, and this installation.">
         <SettingsCard title="Task Studio">
            <SettingRow
               label="What it is"
               description="A local, Linear-inspired UI for the Taskmaster task management system. It reads and watches .taskmaster JSON files and can trigger Taskmaster + Claude Code runs locally."
            />
            <SettingRow label="Version">
               <span className="text-sm font-mono text-muted-foreground">
                  {diag?.appVersion ?? '…'}
               </span>
            </SettingRow>
            <SettingRow label="License">
               <span className="text-sm text-muted-foreground">MIT</span>
            </SettingRow>
            <SettingRow label="Source">
               <Link
                  href="https://github.com/udecode/task-studio"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline"
               >
                  github.com/udecode/task-studio
               </Link>
            </SettingRow>
         </SettingsCard>

         <SettingsCard title="Taskmaster AI">
            <SettingRow
               label="What it is"
               description="A tagged, AI-powered task management CLI. Task Studio visualizes its task files and drives its start/loop commands through the local runner."
            />
            <SettingRow label="Docs">
               <Link
                  href="https://github.com/eyaltoledano/claude-task-master"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline"
               >
                  Taskmaster on GitHub
               </Link>
            </SettingRow>
         </SettingsCard>

         <SettingsCard title="This installation">
            <SettingRow label="Config file">
               <span
                  className="text-xs font-mono text-muted-foreground max-w-[340px] truncate"
                  title={diag?.settingsFilePath}
               >
                  {diag?.settingsFilePath ?? '…'}
               </span>
            </SettingRow>
            <SettingRow label="Taskmaster CLI">
               <span className="flex items-center gap-1.5 text-xs font-mono">
                  {diag ? (
                     diag.taskmaster.ok ? (
                        <>
                           <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                           {diag.taskmaster.version}
                        </>
                     ) : (
                        <>
                           <XCircle className="h-3.5 w-3.5 text-red-500" />
                           not detected
                        </>
                     )
                  ) : (
                     '…'
                  )}
               </span>
            </SettingRow>
            <SettingRow label="Claude Code runner">
               <span className="flex items-center gap-1.5 text-xs font-mono">
                  {diag ? (
                     diag.claude.ok ? (
                        <>
                           <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                           {diag.claude.version}
                        </>
                     ) : (
                        <>
                           <XCircle className="h-3.5 w-3.5 text-red-500" />
                           not detected
                        </>
                     )
                  ) : (
                     '…'
                  )}
               </span>
            </SettingRow>
         </SettingsCard>
      </SettingsPage>
   );
}
