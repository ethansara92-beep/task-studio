'use client';

import * as React from 'react';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { validateProjectRoot } from '@/lib/api/settings';

/**
 * Absolute-path input with server-side validation: the path must exist and
 * contain `.taskmaster/tasks/tasks.json`. Calls onValid with the normalized
 * path returned by the server.
 */
export function ProjectRootField({
   onValid,
   buttonLabel = 'Add',
}: {
   onValid: (normalizedRoot: string) => void;
   buttonLabel?: string;
}) {
   const [value, setValue] = React.useState('');
   const [checking, setChecking] = React.useState(false);
   const [result, setResult] = React.useState<{ ok: boolean; message: string } | null>(null);

   const validateAndAdd = async () => {
      const candidate = value.trim();
      if (!candidate) return;
      setChecking(true);
      setResult(null);
      const response = await validateProjectRoot(candidate);
      setChecking(false);
      if (response.success && response.data?.ok && response.data.normalizedRoot) {
         setResult({ ok: true, message: 'Valid Taskmaster project' });
         onValid(response.data.normalizedRoot);
         setValue('');
      } else {
         setResult({
            ok: false,
            message: response.data?.error || response.error || 'Validation failed',
         });
      }
   };

   return (
      <div className="w-full space-y-1.5">
         <div className="flex items-center gap-2">
            <Input
               value={value}
               placeholder="/absolute/path/to/project"
               onChange={(e) => {
                  setValue(e.target.value);
                  setResult(null);
               }}
               onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                     e.preventDefault();
                     validateAndAdd();
                  }
               }}
               className="h-8 text-sm font-mono"
            />
            <Button variant="outline" size="sm" onClick={validateAndAdd} disabled={checking}>
               {checking && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
               {buttonLabel}
            </Button>
         </div>
         {result && (
            <p
               className={
                  result.ok
                     ? 'flex items-center gap-1 text-xs text-green-600 dark:text-green-400'
                     : 'flex items-center gap-1 text-xs text-red-600 dark:text-red-400'
               }
            >
               {result.ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
               {result.message}
            </p>
         )}
      </div>
   );
}
