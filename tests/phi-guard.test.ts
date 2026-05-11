// tests/phi-guard.test.ts — S1: PHI guard unit tests.
//
// 5+ true-positives (PHI that MUST be blocked).
// 5+ true-negatives (benign text that MUST NOT be blocked).
// Edge cases: 4-digit year alone, 5-digit ZIP, phone in URL context.

import { describe, it, expect } from "vitest";
import { detectPHI } from "@/lib/phi-guard";

describe("detectPHI — true positives (MUST be blocked)", () => {
  it("full PHI sentence with name, MRN, DOB", () => {
    const result = detectPHI(
      "My patient John Smith (MRN 123456) born 03/15/1980 needs a referral.",
    );
    expect(result.hasPHI).toBe(true);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it("doctor name + phone number", () => {
    const result = detectPHI("Contact Dr. Sarah Jones at 555-123-4567.");
    expect(result.hasPHI).toBe(true);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it("SSN pattern", () => {
    const result = detectPHI("Patient SSN is 123-45-6789.");
    expect(result.hasPHI).toBe(true);
    expect(result.reasons.some((r) => r.includes("SSN"))).toBe(true);
  });

  it("street address", () => {
    const result = detectPHI("Patient lives at 456 Maple Avenue.");
    expect(result.hasPHI).toBe(true);
    expect(result.reasons.some((r) => r.includes("address"))).toBe(true);
  });

  it("email address in patient context", () => {
    const result = detectPHI("Send records to patient.jane@example.com.");
    expect(result.hasPHI).toBe(true);
    expect(result.reasons.some((r) => r.includes("email"))).toBe(true);
  });

  it("MRN: 8-digit number", () => {
    const result = detectPHI("MRN 00123456 admitted yesterday.");
    expect(result.hasPHI).toBe(true);
    expect(result.reasons.some((r) => r.includes("long numeric ID"))).toBe(true);
  });

  it("date of birth in different separator style", () => {
    const result = detectPHI("DOB 07.22.1975 — hypertension history.");
    expect(result.hasPHI).toBe(true);
    expect(result.reasons.some((r) => r.includes("date-of-birth"))).toBe(true);
  });

  it("patient title + two names", () => {
    const result = detectPHI("Patient Maria Gonzalez has a follow-up today.");
    expect(result.hasPHI).toBe(true);
    expect(result.reasons.some((r) => r.includes("name with title prefix"))).toBe(true);
  });

  it("phone number with parentheses format", () => {
    const result = detectPHI("Call (800) 555-1234 for appointment.");
    expect(result.hasPHI).toBe(true);
    expect(result.reasons.some((r) => r.includes("phone"))).toBe(true);
  });
});

describe("detectPHI — true negatives (MUST NOT be blocked)", () => {
  it("generic AI triage question", () => {
    const result = detectPHI("What's the best AI tool for triage?");
    expect(result.hasPHI).toBe(false);
    expect(result.reasons).toHaveLength(0);
  });

  it("follow-up email question", () => {
    const result = detectPHI("How do I draft a follow-up email for no-shows?");
    expect(result.hasPHI).toBe(false);
  });

  it("aggregate patient outcome data without specifics", () => {
    const result = detectPHI(
      "Patient outcome data suggests AI reduces admin time by 20% on average.",
    );
    expect(result.hasPHI).toBe(false);
  });

  it("pricing question", () => {
    const result = detectPHI(
      "I see about 25 patients per week and charge $180 per session. Should I raise rates?",
    );
    expect(result.hasPHI).toBe(false);
  });

  it("practice stage question", () => {
    const result = detectPHI(
      "I've been in practice for 8 years and have a growing waitlist of about 30 people.",
    );
    expect(result.hasPHI).toBe(false);
  });

  it("admin-hire question", () => {
    const result = detectPHI(
      "My admin work takes about 12 hours a week. I have a budget of 1500 per month.",
    );
    expect(result.hasPHI).toBe(false);
  });
});

describe("detectPHI — edge cases", () => {
  it("4-digit year alone does NOT trigger (not 6+ digits)", () => {
    const result = detectPHI("Started practice in 2019.");
    // '2019' is 4 digits, not 6+, so LONG_NUMERIC_PATTERN does not match.
    expect(result.reasons.filter((r) => r.includes("long numeric ID"))).toHaveLength(0);
  });

  it("standalone 5-digit ZIP does NOT trigger long-numeric pattern", () => {
    const result = detectPHI("Our office is in the 90210 area.");
    // 5 digits — does not match \d{6,}.
    expect(result.reasons.filter((r) => r.includes("long numeric ID"))).toHaveLength(0);
    expect(result.hasPHI).toBe(false);
  });

  it("year range does NOT trigger DOB (no month/day in pattern)", () => {
    const result = detectPHI("Practice open from 2018 to 2024.");
    expect(result.reasons.filter((r) => r.includes("date-of-birth"))).toHaveLength(0);
  });

  it("empty string returns clean", () => {
    const result = detectPHI("");
    expect(result.hasPHI).toBe(false);
    expect(result.reasons).toHaveLength(0);
  });

  it("multiple PHI types aggregate into multiple reasons", () => {
    const result = detectPHI(
      "Patient Jane Doe (SSN 987-65-4321) born 01/01/1965 lives at 789 Oak Street.",
    );
    expect(result.hasPHI).toBe(true);
    expect(result.reasons.length).toBeGreaterThanOrEqual(3);
  });
});
