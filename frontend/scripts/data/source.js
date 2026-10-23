import { authenticatedFetch } from "../auth/api.js";
import { BACKEND_URL } from "../config.js";
import { getProjects, createProject } from "../api/projects.js";
import { listEmailConnections } from "../api/emailConnections.js";
import { getSchedules, pauseSchedule, resumeSchedule, cancelSchedule } from "../api/schedules.js";

/* One switch. true: the pages use the sample data below. false: the pages call the backend. */
export const USE_MOCK = false;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const HOUR = 3600000;
const DAY = 24 * HOUR;

function ago(days) {
  return new Date(Date.now() - days * DAY).toISOString();
}

const BASE_PROJECTS = [
  { id: "mock-1", project_name: "Saja Restaurant", business_name: "Saja Foods Ltd", email_connection_id: "mock-c1", schedule_count: 6, created_at: ago(30) },
  { id: "mock-2", project_name: "Matchsub", business_name: "Matchsub Sports", email_connection_id: null, schedule_count: 4, created_at: ago(12) },
  { id: "mock-3", project_name: "Glassdoor schedules", business_name: "Glassdoor Inc", email_connection_id: null, schedule_count: 2, created_at: ago(5) },
];

const MOCK_CONNECTIONS = [
  { id: "mock-c1", provider: "google", connection_type: "oauth2", email_address: "zade@example.com", status: "active" },
  { id: "mock-c2", provider: "custom", connection_type: "smtp", email_address: "hello@saja.example", status: "active" },
  { id: "mock-c3", provider: "google", connection_type: "oauth2", email_address: "usenvictor40@gmail.com", status: "active" },
];

const RECIPIENTS = ["ada@example.com", "tunde@example.com", "ngozi@example.com", "emeka@example.com", "bola@example.com"];

/* Projects added in the modal survive page changes for this browser tab. */
const STORE_KEY = "bzade_mock_projects";

function readExtra() {
  try {
    return JSON.parse(sessionStorage.getItem(STORE_KEY)) || [];
  } catch {
    return [];
  }
}

function writeExtra(list) {
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify(list));
  } catch {
    /* storage blocked: the project stays only until the page changes */
  }
}

let mockSchedules = null;

function buildSchedules(projectId, count) {
  const names = ["Weekend offer", "Monthly newsletter", "Order reminder", "Fee notice", "Welcome series", "Birthday greeting"];
  const now = Date.now();

  return names.slice(0, count).map((name, i) => {
    const recurring = i % 2 === 1;
    const status = i === 4 ? "paused" : "active";
    const first = new Date(now + (i + 1) * 9 * HOUR).toISOString();

    return {
      id: `${projectId}-s${i + 1}`,
      project_id: projectId,
      name,
      job_type: "email",
      status,
      schedule_type: recurring ? "recurring" : "one_time",
      schedule_rule: recurring ? { every: "weekly" } : null,
      timezone: "Africa/Lagos",
      scheduled_for: first,
      next_run_at: status === "paused" ? null : first,
      config: { recipients: RECIPIENTS, subject: name, body: "", body_type: "html" },
      run_count: recurring ? 3 : 0,
      created_at: ago(20 - i * 2),
      updated_at: ago(i),
    };
  });
}

function schedulesStore() {
  if (!mockSchedules) {
    mockSchedules = { "mock-1": [], "mock-2": [] };
  }
  return mockSchedules;
}

export async function loadProjects() {
  if (!USE_MOCK) return (await getProjects()).data;
  await delay(900);
  return [...BASE_PROJECTS, ...readExtra()];
}

export async function loadProject(id) {
  const list = await loadProjects();
  return list.find((project) => project.id === id) || null;
}

/* The real backend stores no default mail account on a project yet, so email_connection_id is used only in mock mode. */
export async function addProject({ project_name, business_name, email_connection_id }) {
  if (!USE_MOCK) return (await createProject({ project_name, business_name })).data;

  await delay(700);

  const project = {
    id: `mock-${Date.now()}`,
    project_name,
    business_name,
    email_connection_id: email_connection_id || null,
    schedule_count: 0,
    created_at: new Date().toISOString(),
  };

  writeExtra([...readExtra(), project]);
  return project;
}

export async function addSchedule(payload) {
  if (USE_MOCK) {
    await delay(600);
    const store = schedulesStore();
    const pid = payload.project_id || "mock-1";
    const newSchedule = {
      id: `mock-${Date.now()}`,
      ...payload,
      status: "active",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (!store[pid]) store[pid] = [];
    store[pid].unshift(newSchedule);
    return newSchedule;
  }

  const json = await authenticatedFetch("/api/schedules", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return json.data;
}

export async function updateSchedule(id, payload) {
  if (USE_MOCK) {
    await delay(600);
    const store = schedulesStore();
    for (const key of Object.keys(store)) {
      const idx = store[key].findIndex((item) => item.id === id);
      if (idx !== -1) {
        store[key][idx] = { ...store[key][idx], ...payload, updated_at: new Date().toISOString() };
        return store[key][idx];
      }
    }
    return { id, ...payload };
  }

  const json = await authenticatedFetch(`/api/schedules/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return json.data;
}

export async function loadConnections() {
  if (!USE_MOCK) return listEmailConnections();
  await delay(500);
  return MOCK_CONNECTIONS;
}

export async function loadSchedules(projectId) {
  if (!USE_MOCK) return (await getSchedules(projectId)).data;
  await delay(2200); // 2.2 seconds delay for loading empty state / jobs
  const store = schedulesStore();
  return JSON.parse(JSON.stringify(store[projectId] || []));
}

/* action: "pause", "resume" or "remove". Returns how many of the ids failed. */
export async function changeStatus(action, ids) {
  if (USE_MOCK) {
    await delay(600);
    const store = schedulesStore();

    for (const key of Object.keys(store)) {
      store[key] = store[key].flatMap((row) => {
        if (!ids.includes(row.id)) return [row];
        if (action === "remove") return [];
        if (action === "pause" && row.status === "active") {
          return [{ ...row, status: "paused", next_run_at: null, updated_at: new Date().toISOString() }];
        }
        if (action === "resume" && row.status === "paused") {
          return [{ ...row, status: "active", next_run_at: new Date(Date.now() + HOUR).toISOString(), updated_at: new Date().toISOString() }];
        }
        return [row];
      });
    }
    return 0;
  }

  const call = { pause: pauseSchedule, resume: resumeSchedule, remove: cancelSchedule }[action];
  const results = await Promise.allSettled(ids.map((id) => call(id)));
  return results.filter((result) => result.status === "rejected").length;
}