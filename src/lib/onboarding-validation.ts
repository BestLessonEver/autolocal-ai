export function validBusinessPhone(value: string) {
  return (
    /^[+\d\s().-]+$/.test(value) &&
    value.replace(/\D/g, "").length >= 7 &&
    value.replace(/\D/g, "").length <= 15
  );
}
type DraftInput = {
  businessName: string;
  city: string;
  state: string;
  goal: string;
  website: string;
  category: string;
  phone: string;
  contactEmail: string;
  serviceAreas: string;
  privateAddress: boolean;
  address: string;
  description: string;
  services: { name: string; description: string }[];
  question: string;
  answer: string;
  confirmed: boolean;
  hours?: string;
};
export function validateOnboardingStep(
  draft: DraftInput,
  step: number,
): { step: number; message: string } | null {
  const fail = (message: string) => ({ step, message });
  if (step === 0) {
    if (!draft.businessName.trim() || !draft.city.trim() || !draft.state.trim())
      return fail("Add your business name, city, and state or region.");
    if (draft.goal === "improve") {
      try {
        const url = new URL(draft.website);
        if (!["https:", "http:"].includes(url.protocol)) throw Error();
      } catch {
        return fail(
          "Enter your current website address, starting with https://.",
        );
      }
    }
  }
  if (step === 1) {
    if (!draft.category) return fail("Choose a business category.");
    if (!validBusinessPhone(draft.phone))
      return fail("Enter a valid business phone number with 7 to 15 digits.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.contactEmail))
      return fail("Enter a valid customer contact email.");
    if (!draft.serviceAreas.trim())
      return fail("Add at least one area you serve.");
    if (!draft.privateAddress && !draft.address.trim())
      return fail("Add the business address customers can visit.");
    if (draft.description.trim().length < 30)
      return fail(
        "Tell customers a little more about your business, using at least 30 characters.",
      );
  }
  if (step === 1 && draft.hours) {
    try {
      parseBusinessHours(draft.hours);
    } catch (error) {
      return fail(
        error instanceof Error ? error.message : "Check your business hours.",
      );
    }
  }
  if (step === 2) {
    if (
      !draft.services.length ||
      draft.services.some(
        (x) => !x.name.trim() || x.description.trim().length < 15,
      )
    )
      return fail(
        "Give each service a name and a useful description of at least 15 characters.",
      );
    if (draft.question.trim() && !draft.answer.trim())
      return fail("Add your answer, or remove the optional question for now.");
  }
  if (step === 3) {
    for (let i = 0; i < 3; i++) {
      const problem = validateOnboardingStep(draft, i);
      if (problem) return problem;
    }
    if (!draft.confirmed)
      return fail(
        "Confirm that you checked your business details before continuing.",
      );
  }
  return null;
}

export function parseBusinessHours(text: string): Record<string, string> {
  const hours: Record<string, string> = {};
  const days = new Map([
    ["mon", "Monday"],
    ["monday", "Monday"],
    ["tue", "Tuesday"],
    ["tuesday", "Tuesday"],
    ["wed", "Wednesday"],
    ["wednesday", "Wednesday"],
    ["thu", "Thursday"],
    ["thursday", "Thursday"],
    ["fri", "Friday"],
    ["friday", "Friday"],
    ["sat", "Saturday"],
    ["saturday", "Saturday"],
    ["sun", "Sunday"],
    ["sunday", "Sunday"],
  ]);
  for (const line of text.split("\n").filter((value) => value.trim())) {
    const colon = line.indexOf(":");
    const day =
      colon > 0
        ? days.get(line.slice(0, colon).trim().toLowerCase())
        : undefined;
    const value = colon > 0 ? line.slice(colon + 1).trim() : "";
    if (!day || !value)
      throw new Error(
        "Write each day with its hours, such as Monday: 9:00 AM – 5:00 PM. Leave unknown hours blank.",
      );
    if (hours[day])
      throw new Error(
        `List ${day} once, with all of its opening periods on the same line.`,
      );
    hours[day] = value;
  }
  return hours;
}
