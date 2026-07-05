'use client';

import * as React from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
} from '@/components/ui/select';
import {
   AlertDialog,
   AlertDialogAction,
   AlertDialogCancel,
   AlertDialogContent,
   AlertDialogDescription,
   AlertDialogFooter,
   AlertDialogHeader,
   AlertDialogTitle,
   AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

// --- Page & layout ----------------------------------------------------------

export function SettingsPage({
   title,
   description,
   children,
}: {
   title: string;
   description: string;
   children: React.ReactNode;
}) {
   return (
      <div className="w-full max-w-3xl mx-auto px-6 py-8 pb-24">
         <div className="mb-8">
            <h1 className="text-xl font-semibold mb-1">{title}</h1>
            <p className="text-sm text-muted-foreground">{description}</p>
         </div>
         <div className="space-y-8">{children}</div>
      </div>
   );
}

export function SettingsCard({
   title,
   description,
   children,
   actions,
}: {
   title: string;
   description?: string;
   children: React.ReactNode;
   actions?: React.ReactNode;
}) {
   return (
      <section className="rounded-lg border bg-card">
         <div className="flex items-start justify-between gap-4 px-4 py-3 border-b">
            <div>
               <h2 className="text-sm font-medium">{title}</h2>
               {description && (
                  <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
               )}
            </div>
            {actions}
         </div>
         <div className="divide-y">{children}</div>
      </section>
   );
}

export function SettingRow({
   label,
   description,
   children,
   vertical = false,
}: {
   label: string;
   description?: string;
   children?: React.ReactNode;
   /** Stack the control under the label (for wide controls). */
   vertical?: boolean;
}) {
   return (
      <div
         className={cn(
            'px-4 py-3 gap-3',
            vertical ? 'flex flex-col' : 'flex items-center justify-between'
         )}
      >
         <div className={cn(!vertical && 'min-w-0 pr-4')}>
            <div className="text-sm font-medium">{label}</div>
            {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
         </div>
         {children && <div className={cn(!vertical && 'shrink-0')}>{children}</div>}
      </div>
   );
}

/** Collapsible "Advanced" group inside a card. */
export function AdvancedGroup({ children }: { children: React.ReactNode }) {
   const [open, setOpen] = React.useState(false);
   return (
      <Collapsible open={open} onOpenChange={setOpen}>
         <CollapsibleTrigger asChild>
            <button className="w-full flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
               <ChevronRight
                  className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-90')}
               />
               Advanced
            </button>
         </CollapsibleTrigger>
         <CollapsibleContent className="divide-y border-t">{children}</CollapsibleContent>
      </Collapsible>
   );
}

/** Sticky footer bar shown while a section has unsaved changes. */
export function SettingsSaveBar({
   isDirty,
   isSaving,
   onSave,
   onDiscard,
}: {
   isDirty: boolean;
   isSaving: boolean;
   onSave: () => void;
   onDiscard: () => void;
}) {
   if (!isDirty) return null;
   return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 rounded-lg border bg-background px-4 py-2.5 shadow-lg">
         <span className="text-sm text-muted-foreground">
            <span className="inline-block h-2 w-2 rounded-full bg-amber-500 mr-2" />
            Unsaved changes
         </span>
         <Button variant="ghost" size="sm" onClick={onDiscard} disabled={isSaving}>
            Discard
         </Button>
         <Button size="sm" onClick={onSave} disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Save changes'}
         </Button>
      </div>
   );
}

export function PlaceholderBadge({ label = 'Not implemented yet' }: { label?: string }) {
   return (
      <Badge variant="secondary" className="text-[10px] font-normal text-muted-foreground">
         {label}
      </Badge>
   );
}

// --- Field controls -----------------------------------------------------------

export function SelectField<T extends string>({
   value,
   onChange,
   options,
   className,
}: {
   value: T;
   onChange: (value: T) => void;
   options: Array<{ value: T; label: string }>;
   className?: string;
}) {
   return (
      <Select value={value} onValueChange={(v) => onChange(v as T)}>
         <SelectTrigger className={cn('h-8 w-[180px] text-sm', className)}>
            <SelectValue />
         </SelectTrigger>
         <SelectContent>
            {options.map((option) => (
               <SelectItem key={option.value} value={option.value}>
                  {option.label}
               </SelectItem>
            ))}
         </SelectContent>
      </Select>
   );
}

export function NumberField({
   value,
   onChange,
   min,
   max,
   step,
   unit,
   className,
}: {
   value: number | null;
   onChange: (value: number | null) => void;
   min?: number;
   max?: number;
   step?: number;
   unit?: string;
   className?: string;
}) {
   const [text, setText] = React.useState(value === null ? '' : String(value));
   const [error, setError] = React.useState<string | null>(null);

   React.useEffect(() => {
      setText(value === null ? '' : String(value));
   }, [value]);

   const commit = (raw: string) => {
      setText(raw);
      if (raw.trim() === '') {
         setError(null);
         onChange(null);
         return;
      }
      const num = Number(raw);
      if (!Number.isFinite(num)) {
         setError('Must be a number');
         return;
      }
      if (min !== undefined && num < min) {
         setError(`Minimum is ${min}`);
         return;
      }
      if (max !== undefined && num > max) {
         setError(`Maximum is ${max}`);
         return;
      }
      setError(null);
      onChange(num);
   };

   return (
      <div className="flex flex-col items-end gap-1">
         <div className="flex items-center gap-2">
            <Input
               type="number"
               inputMode="numeric"
               value={text}
               min={min}
               max={max}
               step={step}
               onChange={(e) => commit(e.target.value)}
               className={cn('h-8 w-28 text-sm', error && 'border-red-500', className)}
            />
            {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
         </div>
         {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
      </div>
   );
}

export function TextField({
   value,
   onChange,
   placeholder,
   className,
   mono = false,
}: {
   value: string;
   onChange: (value: string) => void;
   placeholder?: string;
   className?: string;
   mono?: boolean;
}) {
   return (
      <Input
         value={value}
         placeholder={placeholder}
         onChange={(e) => onChange(e.target.value)}
         className={cn('h-8 w-[260px] text-sm', mono && 'font-mono', className)}
      />
   );
}

/**
 * Secret input: shows the mask sentinel for stored values; typing replaces
 * the secret, clearing removes it. The real value never reaches the client.
 */
export function SecretField({
   value,
   onChange,
   placeholder,
   className,
}: {
   value: string;
   onChange: (value: string) => void;
   placeholder?: string;
   className?: string;
}) {
   return (
      <Input
         type="password"
         value={value}
         placeholder={placeholder || 'Not set'}
         onChange={(e) => onChange(e.target.value)}
         autoComplete="off"
         className={cn('h-8 w-[260px] text-sm font-mono', className)}
      />
   );
}

export function SwitchRow({
   label,
   description,
   checked,
   onChange,
   disabled,
}: {
   label: string;
   description?: string;
   checked: boolean;
   onChange: (checked: boolean) => void;
   disabled?: boolean;
}) {
   return (
      <SettingRow label={label} description={description}>
         <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
      </SettingRow>
   );
}

/** Editable list of short strings rendered as removable chips. */
export function StringListField({
   values,
   onChange,
   placeholder,
   validate,
}: {
   values: string[];
   onChange: (values: string[]) => void;
   placeholder?: string;
   validate?: (value: string) => string | null;
}) {
   const [input, setInput] = React.useState('');
   const [error, setError] = React.useState<string | null>(null);

   const add = () => {
      const value = input.trim();
      if (!value) return;
      const validationError = validate?.(value) ?? null;
      if (validationError) {
         setError(validationError);
         return;
      }
      if (values.includes(value)) {
         setError('Already in the list');
         return;
      }
      setError(null);
      onChange([...values, value]);
      setInput('');
   };

   return (
      <div className="w-full space-y-2">
         <div className="flex flex-wrap gap-1.5">
            {values.map((value) => (
               <Badge key={value} variant="secondary" className="gap-1 font-mono text-xs">
                  {value}
                  <button
                     onClick={() => onChange(values.filter((v) => v !== value))}
                     className="hover:text-foreground text-muted-foreground"
                  >
                     <X className="h-3 w-3" />
                  </button>
               </Badge>
            ))}
            {values.length === 0 && (
               <span className="text-xs text-muted-foreground">Nothing added yet.</span>
            )}
         </div>
         <div className="flex items-center gap-2">
            <Input
               value={input}
               placeholder={placeholder}
               onChange={(e) => {
                  setInput(e.target.value);
                  setError(null);
               }}
               onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                     e.preventDefault();
                     add();
                  }
               }}
               className="h-8 text-sm font-mono"
            />
            <Button variant="outline" size="sm" onClick={add}>
               <Plus className="h-3.5 w-3.5" />
               Add
            </Button>
         </div>
         {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      </div>
   );
}

/** Key/value editor for environment variables (structured, never shell text). */
export function EnvVarsField({
   values,
   onChange,
}: {
   values: Record<string, string>;
   onChange: (values: Record<string, string>) => void;
}) {
   const [key, setKey] = React.useState('');
   const [value, setValue] = React.useState('');
   const [error, setError] = React.useState<string | null>(null);

   const add = () => {
      const trimmedKey = key.trim();
      if (!trimmedKey) return;
      if (!/^[A-Z_][A-Z0-9_]*$/.test(trimmedKey)) {
         setError('Keys must be UPPER_SNAKE_CASE');
         return;
      }
      if (['PATH', 'NODE_OPTIONS', 'LD_PRELOAD', 'DYLD_INSERT_LIBRARIES'].includes(trimmedKey)) {
         setError(`${trimmedKey} cannot be overridden`);
         return;
      }
      setError(null);
      onChange({ ...values, [trimmedKey]: value });
      setKey('');
      setValue('');
   };

   const entries = Object.entries(values);

   return (
      <div className="w-full space-y-2">
         {entries.length > 0 ? (
            <div className="space-y-1">
               {entries.map(([k, v]) => (
                  <div key={k} className="flex items-center gap-2 text-xs font-mono">
                     <span className="rounded bg-muted px-1.5 py-0.5">{k}</span>
                     <span className="text-muted-foreground truncate flex-1">{v}</span>
                     <button
                        onClick={() => {
                           const next = { ...values };
                           delete next[k];
                           onChange(next);
                        }}
                        className="text-muted-foreground hover:text-foreground"
                     >
                        <X className="h-3 w-3" />
                     </button>
                  </div>
               ))}
            </div>
         ) : (
            <span className="text-xs text-muted-foreground">No variables set.</span>
         )}
         <div className="flex items-center gap-2">
            <Input
               value={key}
               placeholder="KEY"
               onChange={(e) => {
                  setKey(e.target.value.toUpperCase());
                  setError(null);
               }}
               className="h-8 w-40 text-sm font-mono"
            />
            <Input
               value={value}
               placeholder="value"
               onChange={(e) => setValue(e.target.value)}
               className="h-8 flex-1 text-sm font-mono"
            />
            <Button variant="outline" size="sm" onClick={add}>
               <Plus className="h-3.5 w-3.5" />
            </Button>
         </div>
         {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
         <p className="text-xs text-muted-foreground">
            Do not store secrets here - values are saved in plain text in the local settings file.
         </p>
      </div>
   );
}

/** Button that requires confirmation before running a destructive action. */
export function ConfirmActionButton({
   label,
   title,
   description,
   confirmLabel = 'Confirm',
   variant = 'destructive',
   size = 'sm',
   disabled,
   onConfirm,
   skipConfirm = false,
}: {
   label: React.ReactNode;
   title: string;
   description: string;
   confirmLabel?: string;
   variant?: 'destructive' | 'outline' | 'default';
   size?: 'sm' | 'default';
   disabled?: boolean;
   onConfirm: () => void;
   skipConfirm?: boolean;
}) {
   if (skipConfirm) {
      return (
         <Button variant={variant} size={size} disabled={disabled} onClick={onConfirm}>
            {label}
         </Button>
      );
   }
   return (
      <AlertDialog>
         <AlertDialogTrigger asChild>
            <Button variant={variant} size={size} disabled={disabled}>
               {label}
            </Button>
         </AlertDialogTrigger>
         <AlertDialogContent>
            <AlertDialogHeader>
               <AlertDialogTitle>{title}</AlertDialogTitle>
               <AlertDialogDescription>{description}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
               <AlertDialogCancel>Cancel</AlertDialogCancel>
               <AlertDialogAction onClick={onConfirm}>{confirmLabel}</AlertDialogAction>
            </AlertDialogFooter>
         </AlertDialogContent>
      </AlertDialog>
   );
}
