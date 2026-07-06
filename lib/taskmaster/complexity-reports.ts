import path from 'path';
import { promises as fs } from 'fs';
import { TaskmasterTask } from '@/types/taskmaster';

/**
 * Optional complexity-report enrichment. Reports live at
 * `<projectRoot>/.taskmaster/reports/task-complexity-report_<tag>.json`.
 * Missing or unreadable reports are not errors - tasks are returned as-is.
 */

interface ComplexityAnalysis {
   taskId: number;
   taskTitle: string;
   complexityScore: number;
   recommendedSubtasks: number;
   expansionPrompt: string;
   reasoning: string;
}

interface ComplexityReport {
   complexityAnalysis: ComplexityAnalysis[];
}

function reportPathForTag(projectRoot: string, tagName: string): string {
   return path.join(
      projectRoot,
      '.taskmaster',
      'reports',
      `task-complexity-report_${tagName}.json`
   );
}

async function readReport(filePath: string): Promise<ComplexityReport | null> {
   try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.complexityAnalysis)) {
         return parsed as ComplexityReport;
      }
      return null;
   } catch {
      return null;
   }
}

/** Merges a tag's complexity report into its tasks (no-op when absent). */
export async function mergeComplexityIntoTasks(
   projectRoot: string,
   tagName: string,
   tasks: TaskmasterTask[]
): Promise<TaskmasterTask[]> {
   // Tag names come from the tasks file itself, but they are used in a file
   // path - reject anything that could escape the reports directory.
   if (!/^[A-Za-z0-9._-]+$/.test(tagName)) return tasks;

   const report = await readReport(reportPathForTag(projectRoot, tagName));
   if (!report) return tasks;

   const byTaskId = new Map<number, ComplexityAnalysis>();
   for (const analysis of report.complexityAnalysis) {
      byTaskId.set(analysis.taskId, analysis);
   }

   return tasks.map((task) => {
      const analysis = byTaskId.get(task.id);
      if (!analysis) return task;
      return {
         ...task,
         complexity: {
            score: analysis.complexityScore,
            expansionPrompt: analysis.expansionPrompt,
            reasoning: analysis.reasoning,
            recommendedSubtasks: analysis.recommendedSubtasks,
         },
      };
   });
}
