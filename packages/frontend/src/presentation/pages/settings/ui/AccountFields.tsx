import { Field, FieldDescription, FieldError, FieldLabel } from '@repo/ui/components/field';
import { Input } from '@repo/ui/components/input';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@repo/ui/components/input-group';
import { Eye, EyeOff } from 'lucide-react';
import { useId, useState } from 'react';
import { useI18n } from '#shared/i18n';

export function AccountFields({
  email,
  onEmailChange,
  password,
  onPasswordChange,
  newPassword,
  disabled,
}: {
  email: string;
  onEmailChange: (value: string) => void;
  password: string;
  onPasswordChange: (value: string) => void;
  newPassword: boolean;
  disabled: boolean;
}) {
  const { t } = useI18n();
  const id = useId();
  const [error, setError] = useState('');
  return (
    <>
      <Field className="gap-2" data-invalid={Boolean(error)}>
        <FieldLabel htmlFor={id}>{t('auth.email')}</FieldLabel>
        <Input
          id={id}
          name="email"
          type="email"
          value={email}
          onChange={(event) => {
            setError('');
            onEmailChange(event.target.value);
          }}
          onInvalid={(event) => {
            event.preventDefault();
            setError(
              t(
                event.currentTarget.validity.valueMissing
                  ? 'auth.requiredField'
                  : 'auth.invalidEmail',
              ),
            );
          }}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={254}
          required
          disabled={disabled}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className="h-(--control-height) pointer-coarse:h-11"
        />
        {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
      </Field>
      <PasswordField
        label={t('auth.password')}
        value={password}
        onChange={onPasswordChange}
        newPassword={newPassword}
        disabled={disabled}
      />
    </>
  );
}

export function PasswordField({
  label,
  value,
  onChange,
  newPassword,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  newPassword: boolean;
  disabled: boolean;
}) {
  const { t } = useI18n();
  const id = useId();
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');
  return (
    <Field className="gap-2" data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <InputGroup className="h-(--control-height) pointer-coarse:h-11">
        <InputGroupInput
          className="h-full"
          id={id}
          name={newPassword ? 'new-password' : 'password'}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => {
            setError('');
            onChange(event.target.value);
          }}
          onInvalid={(event) => {
            event.preventDefault();
            setError(
              t(
                event.currentTarget.validity.valueMissing
                  ? 'auth.requiredField'
                  : 'auth.passwordLength',
              ),
            );
          }}
          autoComplete={newPassword ? 'new-password' : 'current-password'}
          minLength={newPassword ? 12 : undefined}
          maxLength={128}
          required
          disabled={disabled}
          aria-invalid={Boolean(error)}
          aria-describedby={
            [newPassword ? `${id}-help` : '', error ? `${id}-error` : '']
              .filter(Boolean)
              .join(' ') || undefined
          }
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            type="button"
            size="icon-xs"
            aria-label={t(visible ? 'auth.hidePassword' : 'auth.showPassword')}
            aria-pressed={visible}
            disabled={disabled}
            onClick={() => setVisible(!visible)}
            className="pointer-coarse:size-9"
          >
            {visible ? <EyeOff /> : <Eye />}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      {newPassword && (
        <FieldDescription id={`${id}-help`}>{t('auth.passwordLength')}</FieldDescription>
      )}
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </Field>
  );
}
