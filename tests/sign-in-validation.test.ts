// Logic-only smoke test for the sign-in + change-password validation rules.
// No RTL / jsdom in this repo — we test the pure functions extracted to
// lib/auth-validation.ts which both /sign-in and the PasswordCard import.

import { describe, expect, it } from "vitest";
import {
  canSendMagicLink,
  isEmailShape,
  isPasswordLongEnough,
  nameFromEmail,
  validateSignInForm,
  validateChangePassword,
  MIN_PASSWORD_LENGTH,
} from "@/lib/auth-validation";

describe("isEmailShape", () => {
  it("accepts simple shapes", () => {
    expect(isEmailShape("a@b.co")).toBe(true);
  });
  it("rejects missing @ or TLD", () => {
    expect(isEmailShape("a.b.co")).toBe(false);
    expect(isEmailShape("a@b")).toBe(false);
    expect(isEmailShape("")).toBe(false);
  });
});

describe("isPasswordLongEnough", () => {
  it("hits the configured minimum", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
    expect(isPasswordLongEnough("12345678")).toBe(true);
    expect(isPasswordLongEnough("1234567")).toBe(false);
  });
});

describe("nameFromEmail", () => {
  it("returns the local-part", () => {
    expect(nameFromEmail("doctor@example.com")).toBe("doctor");
  });
  it("returns empty string for non-emails", () => {
    expect(nameFromEmail("")).toBe("");
  });
});

describe("canSendMagicLink", () => {
  it("requires a valid email shape", () => {
    expect(canSendMagicLink("a@b.co")).toBe(true);
    expect(canSendMagicLink("")).toBe(false);
  });
});

describe("validateSignInForm — signin mode", () => {
  it("ok when email valid and password non-empty", () => {
    const r = validateSignInForm({
      mode: "signin",
      email: "a@b.co",
      password: "x",
      confirmPassword: "",
    });
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual({});
  });

  it("rejects missing password without forcing the 8-char rule (sign-in path)", () => {
    const r = validateSignInForm({
      mode: "signin",
      email: "a@b.co",
      password: "",
      confirmPassword: "",
    });
    expect(r.ok).toBe(false);
    expect(r.errors.password).toBeDefined();
  });

  it("ignores confirmPassword in signin mode", () => {
    const r = validateSignInForm({
      mode: "signin",
      email: "a@b.co",
      password: "anything",
      confirmPassword: "mismatch-but-irrelevant-here",
    });
    expect(r.ok).toBe(true);
  });
});

describe("validateSignInForm — signup mode", () => {
  it("requires ≥8 char password and matching confirm", () => {
    const ok = validateSignInForm({
      mode: "signup",
      email: "a@b.co",
      password: "12345678",
      confirmPassword: "12345678",
    });
    expect(ok.ok).toBe(true);
  });

  it("rejects mismatched confirm", () => {
    const r = validateSignInForm({
      mode: "signup",
      email: "a@b.co",
      password: "12345678",
      confirmPassword: "12345679",
    });
    expect(r.ok).toBe(false);
    expect(r.errors.confirmPassword).toBeDefined();
  });

  it("rejects short password even when confirm matches", () => {
    const r = validateSignInForm({
      mode: "signup",
      email: "a@b.co",
      password: "1234567",
      confirmPassword: "1234567",
    });
    expect(r.ok).toBe(false);
    expect(r.errors.password).toBeDefined();
  });

  it("rejects empty confirm field", () => {
    const r = validateSignInForm({
      mode: "signup",
      email: "a@b.co",
      password: "12345678",
      confirmPassword: "",
    });
    expect(r.ok).toBe(false);
    expect(r.errors.confirmPassword).toBeDefined();
  });
});

describe("validateChangePassword", () => {
  it("ok when all three fields valid", () => {
    const r = validateChangePassword({
      currentPassword: "oldsecret",
      newPassword: "newsecret123",
      confirmNewPassword: "newsecret123",
    });
    expect(r.ok).toBe(true);
  });

  it("rejects new === current (would 400 server-side)", () => {
    const r = validateChangePassword({
      currentPassword: "samesecret",
      newPassword: "samesecret",
      confirmNewPassword: "samesecret",
    });
    expect(r.ok).toBe(false);
    expect(r.errors.password).toBeDefined();
  });

  it("rejects mismatched confirm", () => {
    const r = validateChangePassword({
      currentPassword: "oldsecret",
      newPassword: "newsecret123",
      confirmNewPassword: "newsecret124",
    });
    expect(r.ok).toBe(false);
    expect(r.errors.confirmPassword).toBeDefined();
  });

  it("rejects short new password", () => {
    const r = validateChangePassword({
      currentPassword: "oldsecret",
      newPassword: "short",
      confirmNewPassword: "short",
    });
    expect(r.ok).toBe(false);
    expect(r.errors.password).toBeDefined();
  });

  it("rejects empty current password", () => {
    const r = validateChangePassword({
      currentPassword: "",
      newPassword: "newsecret123",
      confirmNewPassword: "newsecret123",
    });
    expect(r.ok).toBe(false);
    expect(r.errors.password).toBeDefined();
  });
});
