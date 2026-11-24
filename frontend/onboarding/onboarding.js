import { supabase } from "../scripts/auth/auth.js";
import { getCurrentSession } from "../scripts/auth/session.js";
import { addProject, loadProjects } from "../scripts/data/source.js";

const STATE_KEY_PREFIX = "bzade_onboarding:";
const ONBOARDING_PATH = "/onboarding";
const onboardingState = {
  fullName: "",
  useCase: "",
  timezone: "",
  projectType: null,
  projectName: "",
  businessName: "",
};

const stepCount = document.getElementById("step-count");
const stepProgress = document.getElementById("step-progress");
const stepProgressFill = document.getElementById("step-progress-fill");
const progressSteps = [...document.querySelectorAll("[data-progress-step]")];
const steps = [
  document.getElementById("step-1"),
  document.getElementById("step-2"),
  document.getElementById("step-3"),
];
const profileForm = document.getElementById("profile-form");
const projectForm = document.getElementById("project-form");
const fullNameInput = document.getElementById("full-name");
const useCaseSelect = document.getElementById("use-case");
const timezoneSelect = document.getElementById("timezone");
const timezoneHint = document.getElementById("timezone-hint");
const projectNameInput = document.getElementById("project-name");
const businessNameInput = document.getElementById("business-name");
const projectTypeSummary = document.getElementById("project-type-summary");
const continueButton = document.getElementById("continue-to-step-3");
const finishButton = document.getElementById("finish-onboarding");
const projectOptions = [...document.querySelectorAll("[data-project-type]")];
const stepErrors = [
  document.getElementById("step-1-error"),
  document.getElementById("step-2-error"),
  document.getElementById("step-3-error"),
];
let session = null;
let visibleStep = 1;
let isSubmitting = false;

const timezoneSuggestions = {
  Africa: ["Africa/Lagos", "Africa/Accra", "Africa/Johannesburg", "Africa/Nairobi"],
  America: ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles"],
  Asia: ["Asia/Dubai", "Asia/Kolkata", "Asia/Singapore", "Asia/Tokyo"],
  Australia: ["Australia/Perth", "Australia/Brisbane", "Australia/Adelaide", "Australia/Sydney"],
  Europe: ["Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Rome"],
};

function detectedTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Africa/Lagos";
  } catch {
    return "Africa/Lagos";
  }
}

function timezoneLabel(value) {
  return value === "UTC" ? "UTC \u2014 Coordinated Universal Time" : value.replace(/_/g, " ");
}

function stateStorageKey() {
  return `${STATE_KEY_PREFIX}${session.user.id}`;
}

function saveDraft() {
  if (!session?.user?.id) return;
  try {
    sessionStorage.setItem(stateStorageKey(), JSON.stringify(onboardingState));
  } catch (error) {
    console.warn("Could not save onboarding progress in this browser session.", error);
  }
}

function restoreDraft() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(stateStorageKey()) || "null");
    if (!saved || typeof saved !== "object") return;
    for (const key of Object.keys(onboardingState)) {
      if (typeof saved[key] === typeof onboardingState[key]) onboardingState[key] = saved[key];
    }
  } catch (error) {
    console.warn("Could not restore onboarding progress from this browser session.", error);
  }
}

function populateTimezoneOptions() {
  const detected = detectedTimezone();
  const nearby = timezoneSuggestions[detected.split("/")[0]] || [
    "UTC",
    "Europe/London",
    "America/New_York",
    "Asia/Singapore",
  ];
  const values = [detected, ...nearby, "UTC"]
    .filter((value, index, list) => list.indexOf(value) === index)
    .slice(0, 6);

  timezoneSelect.replaceChildren();
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = timezoneLabel(value);
    timezoneSelect.append(option);
  });
  timezoneSelect.value = values.includes(onboardingState.timezone)
    ? onboardingState.timezone
    : detected;
  onboardingState.timezone = timezoneSelect.value;
  timezoneHint.textContent = `Suggested from your device timezone: ${detected}.`;
}

function setProjectType(button) {
  projectOptions.forEach((option) => {
    const selected = option === button;
    option.classList.toggle("selected", selected);
    option.setAttribute("aria-checked", String(selected));
  });
  onboardingState.projectType = button.dataset.projectType;
  continueButton.disabled = false;
  stepErrors[1].textContent = "";
  saveDraft();
}

function updateProjectTypeSummary() {
  const isApi = onboardingState.projectType === "api";
  projectTypeSummary.replaceChildren();
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("fill", "none");
  icon.setAttribute("stroke", "currentColor");
  icon.setAttribute("stroke-width", "1.8");
  icon.setAttribute("stroke-linecap", "round");
  icon.setAttribute("stroke-linejoin", "round");
  if (isApi) {
    icon.innerHTML = '<path d="M8 9l-4 3 4 3M16 9l4 3-4 3M14 5l-4 14"/>';
  } else {
    icon.innerHTML = '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>';
  }
  const label = document.createElement("span");
  label.textContent = isApi ? "API Project selected" : "Email Project selected";
  projectTypeSummary.append(icon, label);
}

function validateProfile() {
  onboardingState.fullName = fullNameInput.value.trim();
  onboardingState.useCase = useCaseSelect.value;
  onboardingState.timezone = timezoneSelect.value;

  if (!onboardingState.fullName) {
    fullNameInput.setCustomValidity("Enter your full name.");
    fullNameInput.reportValidity();
    fullNameInput.focus();
    return false;
  }
  fullNameInput.setCustomValidity("");

  if (!onboardingState.useCase) {
    useCaseSelect.setCustomValidity("Choose what you will use Bzade for.");
    useCaseSelect.reportValidity();
    useCaseSelect.focus();
    return false;
  }
  useCaseSelect.setCustomValidity("");
  return true;
}

function showStep(step, { updateUrl = true, focus = true } = {}) {
  visibleStep = Math.max(1, Math.min(3, step));
  steps.forEach((element, index) => {
    element.hidden = index + 1 !== visibleStep;
  });
  stepCount.textContent = `Step ${visibleStep} of 3`;
  stepProgress?.setAttribute("aria-valuenow", String(visibleStep));
  stepProgress?.setAttribute("aria-valuetext", `Step ${visibleStep} of 3`);
  if (stepProgressFill) stepProgressFill.style.width = `${(visibleStep / steps.length) * 100}%`;
  progressSteps.forEach((element, index) => {
    const stepNumber = index + 1;
    element.classList.toggle("is-complete", stepNumber < visibleStep);
    if (stepNumber === visibleStep) element.setAttribute("aria-current", "step");
    else element.removeAttribute("aria-current");
  });
  if (visibleStep === 3) updateProjectTypeSummary();

  if (updateUrl) {
    window.history.pushState({ step: visibleStep }, "", `${ONBOARDING_PATH}?t=${visibleStep}`);
  }
  if (!focus) return;

  const focusTarget = visibleStep === 1
    ? fullNameInput
    : visibleStep === 2
      ? projectOptions[0]
      : projectNameInput;
  focusTarget.focus();
}

function restoreInputs() {
  fullNameInput.value = onboardingState.fullName;
  useCaseSelect.value = onboardingState.useCase;
  projectNameInput.value = onboardingState.projectName;
  businessNameInput.value = onboardingState.businessName;
  projectOptions.forEach((option) => {
    const selected = option.dataset.projectType === onboardingState.projectType;
    option.classList.toggle("selected", selected);
    option.setAttribute("aria-checked", String(selected));
  });
  continueButton.disabled = !onboardingState.projectType;
}

async function ensureSignedInAndNewUser() {
  session = await getCurrentSession();
  if (!session?.user?.id) {
    window.location.replace("/login");
    return false;
  }

  const { data: profile, error } = await supabase
    .from("users")
    .select("onboarding_completed_at")
    .eq("id", session.user.id)
    .maybeSingle();
  if (error) throw error;

  if (profile?.onboarding_completed_at) {
    window.location.replace("/dashboard");
    return false;
  }
  return true;
}

async function finishOnboarding(event) {
  event.preventDefault();
  if (isSubmitting || !session?.user?.id) return;

  onboardingState.projectName = projectNameInput.value.trim();
  onboardingState.businessName = businessNameInput.value.trim();
  stepErrors[2].textContent = "";

  if (!onboardingState.projectType) {
    stepErrors[2].textContent = "Go back and select a project type.";
    return;
  }
  if (!onboardingState.projectName) {
    projectNameInput.setCustomValidity("Enter a project name.");
    projectNameInput.reportValidity();
    projectNameInput.focus();
    return;
  }
  projectNameInput.setCustomValidity("");
  if (!onboardingState.businessName) {
    businessNameInput.setCustomValidity("Enter your business name.");
    businessNameInput.reportValidity();
    businessNameInput.focus();
    return;
  }
  businessNameInput.setCustomValidity("");

  saveDraft();
  isSubmitting = true;
  finishButton.disabled = true;
  finishButton.textContent = "Creating project\u2026";

  try {
    const projects = await loadProjects();
    const matchingProject = projects.find((project) =>
      project.project_name?.toLowerCase() === onboardingState.projectName.toLowerCase() &&
      project.business_name?.toLowerCase() === onboardingState.businessName.toLowerCase() &&
      (project.project_type || "email") === onboardingState.projectType,
    );
    if (!matchingProject) {
      await addProject({
        project_name: onboardingState.projectName,
        business_name: onboardingState.businessName,
        project_type: onboardingState.projectType,
      });
    }

    const { error } = await supabase
      .from("users")
      .upsert({
        id: session.user.id,
        email: session.user.email || null,
        full_name: onboardingState.fullName,
        business_name: onboardingState.businessName,
        primary_use_case: onboardingState.useCase,
        timezone: onboardingState.timezone,
        onboarding_completed_at: new Date().toISOString(),
      }, { onConflict: "id" });
    if (error) throw error;

    try {
      sessionStorage.removeItem(stateStorageKey());
    } catch (error) {
      console.warn("Could not clear the completed onboarding draft.", error);
    }
    window.location.assign("/dashboard");
  } catch (error) {
    console.error("[ONBOARDING] Could not finish setup:", error);
    stepErrors[2].textContent = error.message || "We could not finish setting up your account. Please try again.";
  } finally {
    isSubmitting = false;
    finishButton.disabled = false;
    finishButton.textContent = "Create project";
  }
}

profileForm.addEventListener("submit", (event) => {
  event.preventDefault();
  stepErrors[0].textContent = "";
  if (!validateProfile()) return;
  saveDraft();
  showStep(2);
});

fullNameInput.addEventListener("input", () => {
  fullNameInput.setCustomValidity("");
  onboardingState.fullName = fullNameInput.value.trim();
  saveDraft();
});
useCaseSelect.addEventListener("change", () => {
  useCaseSelect.setCustomValidity("");
  onboardingState.useCase = useCaseSelect.value;
  saveDraft();
});
timezoneSelect.addEventListener("change", () => {
  onboardingState.timezone = timezoneSelect.value;
  saveDraft();
});

projectOptions.forEach((button) => {
  button.addEventListener("click", () => setProjectType(button));
});
document.getElementById("back-to-step-1").addEventListener("click", () => showStep(1));
continueButton.addEventListener("click", () => {
  stepErrors[1].textContent = "";
  if (!onboardingState.projectType) {
    stepErrors[1].textContent = "Select a project type to continue.";
    return;
  }
  showStep(3);
});
document.getElementById("back-to-step-2").addEventListener("click", () => showStep(2));
projectNameInput.addEventListener("input", () => {
  projectNameInput.setCustomValidity("");
  onboardingState.projectName = projectNameInput.value.trim();
  saveDraft();
});
businessNameInput.addEventListener("input", () => {
  businessNameInput.setCustomValidity("");
  onboardingState.businessName = businessNameInput.value.trim();
  saveDraft();
});
projectForm.addEventListener("submit", finishOnboarding);

window.addEventListener("popstate", () => {
  const requested = Number(new URLSearchParams(window.location.search).get("t")) || 1;
  if (requested >= 2 && (!onboardingState.fullName || !onboardingState.useCase)) {
    window.history.replaceState({ step: 1 }, "", `${ONBOARDING_PATH}?t=1`);
    showStep(1, { updateUrl: false, focus: false });
    return;
  }
  if (requested === 3 && !onboardingState.projectType) {
    window.history.replaceState({ step: 2 }, "", `${ONBOARDING_PATH}?t=2`);
    showStep(2, { updateUrl: false, focus: false });
    return;
  }
  showStep(requested, { updateUrl: false, focus: false });
});

try {
  if (await ensureSignedInAndNewUser()) {
    restoreDraft();
    populateTimezoneOptions();
    restoreInputs();

    const requestedStep = Number(new URLSearchParams(window.location.search).get("t")) || 1;
    const initialStep = requestedStep >= 3 && onboardingState.projectType
      ? 3
      : requestedStep >= 2 && onboardingState.fullName && onboardingState.useCase
        ? 2
        : 1;
    window.history.replaceState({ step: initialStep }, "", `${ONBOARDING_PATH}?t=${initialStep}`);
    showStep(initialStep, { updateUrl: false, focus: false });
  }
} catch (error) {
  console.error("[ONBOARDING] Could not verify account setup:", error);
  stepErrors[0].textContent = "We could not verify your account. Refresh the page or sign in again.";
}
