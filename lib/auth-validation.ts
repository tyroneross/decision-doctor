// Pure validation helpers shared by /sign-in and /app/account password card.
// No React, no Better Auth — keeps the unit test logic-only (no jsdom needed).

export const MIN_PASSWORD_LENGTH = 8;

export function isEmailShape(value: string): boolean {
  // Same loose check the prior sign-in page used. Server is the real validator.
  return /.+@.+\..+/.test(value);
}

export function isPasswordLongEnough(value: string): boolean {
  return value.length >= MIN_PASSWORD_LENGTH;
}

export function nameFromEmail(email: string): string {
  return email.split("@")[0] ?? "";
}

export type SignInMode = "signin" | "signup";

export interface SignInFormState {
  email: string;
  password: string;
  confirmPassword: string;
  mode: SignInMode;
}

export interface ValidationResult {
  ok: boolean;
  /** Field-keyed errors. Empty when ok=true. */
  errors: Partial<Record<"email" | "password" | "confirmPassword", string>>;
}

/** Sign-in submit gating. signin mode needs email + non-empty password.
 *  signup mode also needs ≥8 char password + matching confirm. */
export function validateSignInForm(state: SignInFormState): ValidationResult {
  const errors: ValidationResult["errors"] = {};
  if (!isEmailShape(state.email)) errors.email = "Enter a valid email.";
  if (state.password.length === 0) {
    errors.password = "Password required.";
  } else if (state.mode === "signup" && !isPasswordLongEnough(state.password)) {
    errors.password = `Must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (state.mode === "signup") {
    if (state.confirmPassword.length === 0) {
      errors.confirmPassword = "Confirm your password.";
    } else if (state.confirmPassword !== state.password) {
      errors.confirmPassword = "Passwords don't match.";
    }
  }
  return { ok: Object.keys(errors).length === 0, errors };
}

/** Magic link gating — just an email shape check. */
export function canSendMagicLink(email: string): boolean {
  return isEmailShape(email);
}

export interface ChangePasswordFormState {
  currentPassword: string;
  newPassword: string;
  confirmNewPassword: string;
}

/** /app/account change-password gating. Enable button only when:
 *   - all three fields non-empty
 *   - new ≥ 8 chars
 *   - new === confirm
 *   - new !== current (cheap server-load saver — Better Auth would 400 anyway) */
export function validateChangePassword(
  state: ChangePasswordFormState
): ValidationResult {
  const errors: ValidationResult["errors"] = {};
  if (state.currentPassword.length === 0) {
    errors.password = "Current password required.";
  }
  if (state.newPassword.length === 0) {
    errors.password = errors.password ?? "New password required.";
  } else if (!isPasswordLongEnough(state.newPassword)) {
    errors.password = `New password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  } else if (state.newPassword === state.currentPassword) {
    errors.password = "New password must differ from current.";
  }
  if (state.confirmNewPassword.length === 0) {
    errors.confirmPassword = "Confirm the new password.";
  } else if (state.confirmNewPassword !== state.newPassword) {
    errors.confirmPassword = "Passwords don't match.";
  }
  return { ok: Object.keys(errors).length === 0, errors };
}
