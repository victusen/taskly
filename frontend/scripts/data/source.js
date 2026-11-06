import { authenticatedFetch } from "../auth/api.js";
import { getCurrentSession } from "../auth/session.js";
import { BACKEND_URL } from "../config.js";
import { getProjects, createProject, deleteProject } from "../api/projects.js";
import { getProjectEmailConnection, listEmailConnections } from "../api/emailConnections.js";
import { getSchedules, pauseSchedule, resumeSchedule, cancelSchedule } from "../api/schedules.js";

/* One switch. true: the pages use the sample data below. false: the pages call the backend. */
export const USE_MOCK = false;

const PROJECTS_CACHE_KEY = "bzade_projects_cache";
const PROJECTS_CACHE_TS_KEY = "bzade_projects_cache_ts";
const PROJECT_CONNECTIONS_CACHE_KEY = "bzade_project_connections_cache";

const userCacheKey = (key, userId) => userId ? `${key}:${userId}` : key;

function readProjectConnectionsCache(userId) {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(userCacheKey(PROJECT_CONNECTIONS_CACHE_KEY, userId));
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) return { projectIds: [], connections: parsed };
    if (parsed && Array.isArray(parsed.connections) && Array.isArray(parsed.projectIds)) return parsed;
    return null;
  } catch {
    return null;
  }
}

export function cacheProjectConnections(connections, projectIds, userId) {
  if (!userId) return;
  const safeConnections = (Array.isArray(connections) ? connections : []).map((connection) => ({
    id: connection.id,
    project_id: connection.project_id,
    provider: connection.provider,
    connection_type: connection.connection_type,
    email_address: connection.email_address,
    status: connection.status,
    last_used_at: connection.last_used_at || null,
    created_at: connection.created_at || null,
    updated_at: connection.updated_at || null,
  }));
  try {
    localStorage.setItem(userCacheKey(PROJECT_CONNECTIONS_CACHE_KEY, userId), JSON.stringify({
      projectIds: Array.isArray(projectIds) ? projectIds : [],
      connections: safeConnections,
    }));
  } catch (error) {
    console.warn("Could not cache project mail account details:", error);
  }
}

export function readProjectsCache(userId) {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(userCacheKey(PROJECTS_CACHE_KEY, userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
}

export function writeProjectsCache(data, userId) {
  if (!userId) return;
  try {
    if (Array.isArray(data)) {
      localStorage.setItem(userCacheKey(PROJECTS_CACHE_KEY, userId), JSON.stringify(data));
      localStorage.setItem(userCacheKey(PROJECTS_CACHE_TS_KEY, userId), String(Date.now()));
    }
  } catch { /* storage full: ignore */ }
}

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
  { id: "mock-c1", project_id: "mock-1", provider: "google", connection_type: "oauth2", email_address: "zade@example.com", status: "active" },
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

/* Sample projects for explicit mock mode. */
export function mockProjects() {
  return [...BASE_PROJECTS, ...readExtra()];
}

export async function loadProjects() {
  const session = await getCurrentSession();
  const userId = session?.user?.id;
  if (USE_MOCK) {
    await delay(500);
    const mockList = mockProjects();
    writeProjectsCache(mockList, userId);
    return mockList;
  }
  try {
    const result = await getProjects();
    const projects = result?.data || (Array.isArray(result) ? result : []);
    if (Array.isArray(projects)) {
      writeProjectsCache(projects, userId);
      return projects;
    }
    return projects;
  } catch (error) {
    const cachedProjects = readProjectsCache(userId);
    if (cachedProjects) {
      Object.defineProperty(cachedProjects, "__fromCache", { value: true, enumerable: false });
      return cachedProjects;
    }
    throw error;
  }
}

export async function loadProject(id) {
  const list = await loadProjects();
  return list.find((project) => project.id === id) || null;
}

/* The real backend stores no default mail account on a project yet, so email_connection_id is used only in mock mode. */
export async function addProject({ project_name, business_name, email_connection_id }) {
  let created = null;
  if (!USE_MOCK) {
    const res = await createProject({ project_name, business_name });
    created = res?.data || res;
    if (!created?.id) throw new Error("The project was created without a valid ID.");
  }

  if (!created) {
    created = {
      id: `proj-${Date.now()}`,
      project_name,
      business_name,
      email_connection_id: email_connection_id || null,
      schedule_count: 0,
      created_at: new Date().toISOString(),
    };
  }

  const session = await getCurrentSession();
  const userId = session?.user?.id;
  const current = readProjectsCache(userId) || [];
  const updated = [created, ...current.filter((p) => p.id !== created.id)];
  writeProjectsCache(updated, userId);
  if (USE_MOCK) writeExtra([...readExtra(), created]);
  return created;
}

export async function removeProject(id) {
  if (!USE_MOCK) await deleteProject(id);
  const session = await getCurrentSession();
  const userId = session?.user?.id;
  const current = readProjectsCache(userId) || [];
  const updated = current.filter((p) => p.id !== id);
  writeProjectsCache(updated, userId);
  const extra = readExtra().filter((p) => p.id !== id);
  writeExtra(extra);
  const idx = BASE_PROJECTS.findIndex((p) => p.id === id);
  if (idx !== -1) BASE_PROJECTS.splice(idx, 1);
  return true;
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
  const session = await getCurrentSession();
  const userId = session?.user?.id;
  if (!USE_MOCK) {
    const cached = readProjectConnectionsCache(userId);
    try {
      const connections = await listEmailConnections();
      const projects = readProjectsCache(userId) || [];
      cacheProjectConnections(connections, projects.map((project) => project.id), userId);
      return connections;
    } catch (error) {
      if (!cached) throw error;
      console.warn("Could not refresh mail accounts; using the last authenticated project snapshot.", error);
      return cached.connections;
    }
  }
  await delay(500);
  cacheProjectConnections(MOCK_CONNECTIONS, mockProjects().map((project) => project.id), userId);
  return MOCK_CONNECTIONS;
}

export async function loadProjectConnection(projectId, { refresh = false } = {}) {
  const session = await getCurrentSession();
  const userId = session?.user?.id;
  const cached = readProjectConnectionsCache(userId);
  if (!refresh && cached?.projectIds.includes(projectId)) {
    return cached.connections.find((connection) => connection.project_id === projectId) || null;
  }
  if (!USE_MOCK) {
    const connection = await getProjectEmailConnection(projectId);
    const connections = (cached?.connections || []).filter((item) => item.project_id !== projectId);
    if (connection) connections.push(connection);
    const projectIds = [...new Set([...(cached?.projectIds || []), projectId])];
    cacheProjectConnections(connections, projectIds, userId);
    return connection;
  }
  await delay(250);
  const project = BASE_PROJECTS.find((item) => item.id === projectId);
  if (!project?.email_connection_id) return null;
  return MOCK_CONNECTIONS.find((item) => item.id === project.email_connection_id) || null;
}

export async function loadSchedules(projectId, options = {}) {
  if (!USE_MOCK) return (await getSchedules(projectId, options)).data;
  await delay(2200); // 2.2 seconds delay for loading empty state / jobs
  const store = schedulesStore();
  let all = store[projectId] || [];
  const filter = options.filter || "all";
  const jobType = options.jobType || "email";
  all = all.filter((schedule) => String(schedule.job_type || "email").toLowerCase() === jobType);
  if (filter === "running") all = all.filter((schedule) => schedule.status === "active");
  if (filter === "new") all = all.filter((schedule) => schedule.run_count === 0);
  if (filter === "paused") all = all.filter((schedule) => schedule.status === "paused");
  const page = Number(options.page || 1);
  const pageSize = Number(options.pageSize || 5);
  const start = (page - 1) * pageSize;
  const items = JSON.parse(JSON.stringify(all.slice(start, start + pageSize)));
  return {
    items,
    page,
    pageSize,
    total: all.length,
    hasMore: start + items.length < all.length,
  };
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