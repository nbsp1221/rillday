import { Field } from '@base-ui/react/field';
import { Select as SelectPrimitive } from '@base-ui/react/select';
import {
  Select,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@repo/ui/components/select';
import { cn } from 'cn';
import { Fragment } from 'react';

export interface WorkspaceChoiceProps<Value extends string | number> {
  name: string;
  value: Value;
  summary?: string;
  options: readonly { value: Value; label: string; description?: string; group?: string }[];
  onChange: (value: Value) => void;
}

export function WorkspaceChoice<Value extends string | number>({
  id,
  describedBy,
  className,
  contentClassName,
  name,
  value,
  summary,
  options,
  onChange,
}: WorkspaceChoiceProps<Value> & {
  id?: string;
  describedBy?: string;
  className?: string;
  contentClassName?: string;
}) {
  const groups = Object.groupBy(options, (option) => option.group ?? '');

  return (
    <Select
      items={options}
      value={value}
      onValueChange={(next) => {
        if (next !== null) {
          onChange(next);
        }
      }}
    >
      <SelectTrigger
        id={id}
        data-value={value}
        className={cn(
          'choice-field-trigger w-full border-control-border data-[size=default]:h-(--control-height) data-[size=sm]:h-(--control-height)',
          className,
        )}
        aria-label={name}
        aria-describedby={describedBy}
      >
        <SelectValue>{summary}</SelectValue>
      </SelectTrigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Positioner
          alignItemWithTrigger={false}
          align="start"
          sideOffset={8}
          collisionPadding={8}
          className="isolate z-50"
        >
          <SelectPrimitive.Popup
            className={cn(
              'choice-field-panel relative w-76 max-w-[calc(100vw-16px)] max-h-(--available-height) overflow-auto rounded-md ring-1 ring-foreground/10 bg-popover p-1 text-sm text-popover-foreground shadow-md outline-none',
              contentClassName,
            )}
          >
            <SelectPrimitive.List aria-label={name}>
              {Object.entries(groups).map(([group, items], index) => (
                <Fragment key={group}>
                  {index > 0 && <SelectSeparator />}
                  <SelectGroup aria-label={group || undefined}>
                    {group && <SelectLabel>{group}</SelectLabel>}
                    {items?.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={option.value}
                        label={option.label}
                        data-value={option.value}
                        title={option.label}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="choice-option-label block truncate">{option.label}</span>
                          {option.description && (
                            <small className="mt-0.5 block text-xs text-muted-foreground">
                              {option.description}
                            </small>
                          )}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </Fragment>
              ))}
            </SelectPrimitive.List>
          </SelectPrimitive.Popup>
        </SelectPrimitive.Positioner>
      </SelectPrimitive.Portal>
    </Select>
  );
}

export function WorkspaceChoiceField<Value extends string | number>({
  label,
  ...props
}: Omit<WorkspaceChoiceProps<Value>, 'name'> & { label: string }) {
  return (
    <Field.Root className="form-field flex min-w-0 flex-col gap-(--layout-field-gap)">
      <Field.Label className="w-fit text-sm text-muted-foreground">{label}</Field.Label>
      <WorkspaceChoice {...props} name={label} />
    </Field.Root>
  );
}
