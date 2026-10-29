import { Input } from '@repo/ui/components/input';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@repo/ui/components/input-group';
import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { useI18n } from '#shared/i18n';
import { WorkspaceField as Field } from '#shared/ui/WorkspaceField';

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
  return (
    <>
      <Field.Root className="gap-2" name="email" disabled={disabled}>
        <Field.Label>{t('auth.email')}</Field.Label>
        <Input
          name="email"
          type="email"
          value={email}
          onChange={(event) => onEmailChange(event.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={254}
          required
          disabled={disabled}
          className="h-(--control-height) pointer-coarse:h-11"
        />
        <Field.Error match="valueMissing">{t('auth.requiredField')}</Field.Error>
        <Field.Error match="typeMismatch">{t('auth.invalidEmail')}</Field.Error>
      </Field.Root>
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
  const [visible, setVisible] = useState(false);
  return (
    <Field.Root
      className="gap-2"
      name={newPassword ? 'new-password' : 'password'}
      disabled={disabled}
    >
      <Field.Label>{label}</Field.Label>
      <InputGroup className="h-(--control-height) pointer-coarse:h-11">
        <InputGroupInput
          className="h-full [&::-ms-reveal]:hidden"
          name={newPassword ? 'new-password' : 'password'}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={newPassword ? 'new-password' : 'current-password'}
          minLength={newPassword ? 12 : undefined}
          maxLength={128}
          required
          disabled={disabled}
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
      {newPassword && <Field.Description>{t('auth.passwordLength')}</Field.Description>}
      <Field.Error match="valueMissing">{t('auth.requiredField')}</Field.Error>
      <Field.Error match="tooShort">{t('auth.passwordLength')}</Field.Error>
      <Field.Error match="tooLong">{t('auth.passwordLength')}</Field.Error>
    </Field.Root>
  );
}
