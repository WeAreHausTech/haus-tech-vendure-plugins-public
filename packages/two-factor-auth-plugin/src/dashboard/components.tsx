import { Button, Input, Label } from '@vendure/dashboard'
import { CopyIcon } from 'lucide-react'
import { FormEvent, ReactNode, useState } from 'react'
import { toast } from 'sonner'

import type { EnrolmentSecret } from './gql'

/** QR code plus the secret in text, for apps that cannot scan. */
export function EnrolmentInstructions({ enrolment }: Readonly<{ enrolment: EnrolmentSecret }>) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <p className="text-sm text-muted-foreground">
        Scan this QR code with an authenticator app, such as 1Password, Google Authenticator or
        Microsoft Authenticator.
      </p>
      <img
        src={enrolment.qrCodeDataUrl}
        alt="QR code for your authenticator app"
        width={200}
        height={200}
        className="rounded-md bg-white p-2"
      />
      <p className="text-xs text-muted-foreground">Or enter this key by hand:</p>
      <code className="break-all rounded bg-muted px-2 py-1 text-sm font-mono">
        {enrolment.secret.match(/.{1,4}/g)?.join(' ')}
      </code>
    </div>
  )
}

export function BackupCodeList({ codes }: Readonly<{ codes: string[] }>) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(codes.join('\n'))
      toast.success('Backup codes copied')
    } catch {
      toast.error('Could not copy. Select the codes and copy them by hand.')
    }
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Save these backup codes somewhere safe, such as your password manager. Each code signs you
        in once if you lose your device. They are shown only now.
      </p>
      <ul className="grid grid-cols-2 gap-2 rounded-md border p-3 font-mono text-sm">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <Button type="button" variant="outline" onClick={copy}>
        <CopyIcon className="h-4 w-4" />
        Copy codes
      </Button>
    </div>
  )
}

/** A single code field that takes a 6-digit code or a backup code. */
export function CodeForm({
  label = 'Authentication code',
  submitLabel,
  isPending,
  allowBackupCode = true,
  onSubmit,
  children,
}: Readonly<{
  label?: string
  submitLabel: string
  isPending: boolean
  allowBackupCode?: boolean
  onSubmit: (code: string) => void
  children?: ReactNode
}>) {
  const [code, setCode] = useState('')
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (code.trim()) {
      onSubmit(code.trim())
    }
  }
  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-2">
        <Label htmlFor="two-factor-code">{label}</Label>
        <Input
          id="two-factor-code"
          name="code"
          autoComplete="one-time-code"
          inputMode={allowBackupCode ? 'text' : 'numeric'}
          autoFocus
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder={allowBackupCode ? '123456 or a backup code' : '123456'}
        />
      </div>
      {children}
      <Button type="submit" disabled={isPending || !code.trim()}>
        {submitLabel}
      </Button>
    </form>
  )
}
