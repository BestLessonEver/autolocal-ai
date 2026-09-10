import test from "node:test";
import assert from "node:assert/strict";
import {
  validBusinessPhone,
  validateOnboardingStep,
} from "../src/lib/onboarding-validation";
const draft = {
  businessName: "Test Business",
  city: "Town",
  state: "State",
  goal: "new",
  website: "",
  category: "Home services",
  phone: "(555) 555-0100",
  contactEmail: "hello@example.com",
  serviceAreas: "Town",
  privateAddress: true,
  address: "",
  description:
    "A test business with a real description of the services it offers.",
  services: [
    {
      name: "Painting",
      description: "Interior room painting and preparation.",
    },
  ],
  question: "",
  answer: "",
  confirmed: true,
};
test("invalid phone and email cannot pass contact step or final review", () => {
  for (const phone of [
    "x",
    "abcdefg",
    "123",
    "1234567890123456",
    "5555555<script>",
  ]) {
    assert.equal(validBusinessPhone(phone), false);
    assert.equal(validateOnboardingStep({ ...draft, phone }, 1)?.step, 1);
    assert.equal(validateOnboardingStep({ ...draft, phone }, 3)?.step, 1);
  }
  assert.equal(
    validateOnboardingStep({ ...draft, contactEmail: "invalid" }, 1)?.step,
    1,
  );
  assert.equal(validateOnboardingStep(draft, 3), null);
});
test("private addresses stay optional; public addresses and real service details are required", () => {
  assert.equal(
    validateOnboardingStep({ ...draft, privateAddress: false }, 1)?.step,
    1,
  );
  assert.equal(validateOnboardingStep({ ...draft, services: [] }, 2)?.step, 2);
  assert.equal(
    validateOnboardingStep(
      { ...draft, services: [{ name: "Painting", description: "" }] },
      3,
    )?.step,
    2,
  );
  assert.equal(
    validateOnboardingStep({ ...draft, question: "What?", answer: "" }, 2)
      ?.step,
    2,
  );
});
test("website replacement accepts web addresses only and final consent is required", () => {
  for (const website of [
    "javascript:alert(1)",
    "https://",
    "file:///tmp/a",
    "example.com",
  ])
    assert.equal(
      validateOnboardingStep({ ...draft, goal: "improve", website }, 0)?.step,
      0,
    );
  assert.equal(
    validateOnboardingStep(
      { ...draft, goal: "improve", website: "https://example.com" },
      0,
    ),
    null,
  );
  assert.equal(
    validateOnboardingStep({ ...draft, confirmed: false }, 3)?.step,
    3,
  );
});

test("business hours preserve supplied facts and never invent missing hours", async () => {
  const { parseBusinessHours } =
    await import("../src/lib/onboarding-validation");
  assert.deepEqual(parseBusinessHours(""), {});
  assert.deepEqual(
    parseBusinessHours("Mon: 9:00 AM – 5:00 PM\nTuesday: Closed"),
    { Monday: "9:00 AM – 5:00 PM", Tuesday: "Closed" },
  );
  assert.throws(() => parseBusinessHours("Monday"));
  assert.throws(() => parseBusinessHours("Monday:"));
  assert.throws(() =>
    parseBusinessHours("Monday: Closed\nMon: By appointment"),
  );
});
