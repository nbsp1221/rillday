import { Field as FieldPrimitive } from '@base-ui/react/field';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@repo/ui/components/field';
import { cn } from 'cn';

function Root(props: Omit<FieldPrimitive.Root.Props, 'render'>) {
  return (
    <FieldPrimitive.Root
      {...props}
      render={(elementProps, state) => (
        <Field
          {...elementProps}
          data-invalid={state.valid === false || undefined}
          className={cn('min-w-0 gap-(--layout-field-gap)', elementProps.className)}
        />
      )}
    />
  );
}

function Label(props: Omit<FieldPrimitive.Label.Props, 'render'>) {
  return (
    <FieldContent>
      <FieldPrimitive.Label {...props} render={<FieldLabel />} />
    </FieldContent>
  );
}

function Description(props: Omit<FieldPrimitive.Description.Props, 'render'>) {
  return <FieldPrimitive.Description {...props} render={<FieldDescription />} />;
}

function Error(props: Omit<FieldPrimitive.Error.Props, 'render'>) {
  return <FieldPrimitive.Error {...props} render={<FieldError />} />;
}

export const WorkspaceField = { Root, Label, Description, Error };
