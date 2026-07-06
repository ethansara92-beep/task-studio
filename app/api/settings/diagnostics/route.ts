import { NextResponse } from 'next/server';
import path from 'node:path';
import { getSettingsFilePath, loadSettings } from '@/lib/settings/settings-service';
import { validateBinary } from '@/lib/settings/validate-tools';
import { getConfiguredProjectRoot } from '@/lib/runner/runner-validation';
import { getDbStatus } from '@/lib/db';
import packageJson from '@/package.json';

export async function GET() {
   try {
      const settings = await loadSettings();
      const projectRoot = getConfiguredProjectRoot();

      const [tm, claude] = await Promise.all([
         validateBinary(settings.taskmaster.tmPath),
         validateBinary(settings.claude.claudePath),
      ]);

      return NextResponse.json({
         success: true,
         data: {
            appVersion: packageJson.version,
            nodeVersion: process.version,
            platform: `${process.platform} ${process.arch}`,
            projectRoot,
            settingsFilePath: getSettingsFilePath(),
            tasksFilePath: path.join(projectRoot, '.taskmaster', 'tasks', 'tasks.json'),
            runsDirPath: path.join(projectRoot, '.taskmaster', 'runs'),
            taskmaster: { path: settings.taskmaster.tmPath, ...tm },
            claude: { path: settings.claude.claudePath, ...claude },
            database: getDbStatus(),
         },
         timestamp: new Date().toISOString(),
      });
   } catch (error) {
      return NextResponse.json(
         {
            success: false,
            error: error instanceof Error ? error.message : 'Diagnostics failed',
            timestamp: new Date().toISOString(),
         },
         { status: 500 }
      );
   }
}
