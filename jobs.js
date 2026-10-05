import {
  requireAuth,
} from "./scripts/auth/session.js";

import {
  getSchedules,
  createSchedule,
} from "./scripts/api/schedules.js";

import {
  success,
  error,
  loading,
  updateToast,
  dismissToast,
} from "./scripts/ui/toast.js";


const session =
  await requireAuth();

if (!session) {
  throw new Error(
    "Authentication required."
  );
}


const addTaskBtn =
  document.getElementById(
    "add-schedule"
  );

const closeBtn =
  document.getElementById(
    "close-btn"
  );

const overlay =
  document.getElementById(
    "schedule-overlay"
  );

const scheduleForm =
  document.getElementById(
    "schedule-form"
  );

const taskList =
  document.getElementById(
    "task-list"
  );

const emptyState =
  document.getElementById(
    "schedule-empty"
  );

const scheduleType =
  document.getElementById(
    "schedule-type"
  );

const oneTimeFields =
  document.getElementById(
    "one-time-fields"
  );

const recurringFields =
  document.getElementById(
    "recurring-fields"
  );


scheduleType?.addEventListener(
  "change",
  () => {

    const recurring =
      scheduleType.value ===
      "recurring";

    oneTimeFields.hidden =
      recurring;

    recurringFields.hidden =
      !recurring;
  }
);


/*
 * --------------------------------
 * OPEN / CLOSE FORM
 * --------------------------------
 */

addTaskBtn?.addEventListener(
  "click",
  () => {
    overlay?.classList.add(
      "open"
    );
  }
);


closeBtn?.addEventListener(
  "click",
  () => {
    overlay?.classList.remove(
      "open"
    );
  }
);


/*
 * --------------------------------
 * LOAD SCHEDULES
 * --------------------------------
 */

async function loadSchedules() {

  try {

    const result =
      await getSchedules();

    const schedules =
      Array.isArray(result.data)
        ? result.data
        : [];

    renderSchedules(
      schedules
    );

  } catch (err) {

    console.error(
      "[LOAD SCHEDULES]",
      err
    );

    if (
      err.status === 401
    ) {
      window.location.href =
        "login.html";

      return;
    }

    error(
      err.message ||
      "Unable to load schedules."
    );
  }
}


/*
 * --------------------------------
 * RENDER SCHEDULES
 * --------------------------------
 */

function renderSchedules(
  schedules
) {

  taskList.innerHTML = "";

  if (
    schedules.length === 0
  ) {

    emptyState.hidden = false;

    return;
  }

  emptyState.hidden = true;

  for (
    const schedule of schedules
  ) {

    const element =
      document.createElement(
        "article"
      );

    element.className =
      "task";

    element.dataset.scheduleId =
      schedule.id;

    const subject =
      schedule.config?.subject ||
      "Untitled email";

    const status =
      schedule.status ||
      "active";

    const nextRun =
      schedule.next_run_at
        ? new Date(
            schedule.next_run_at
          ).toLocaleString()
        : "Calculating";

    element.innerHTML = `
      <div class="task-header">
        <strong></strong>
        <span></span>
      </div>

      <div class="task-details">
        <p>
          Type:
          <strong></strong>
        </p>

        <p>
          Schedule:
          <strong></strong>
        </p>

        <p>
          Next run:
          <strong></strong>
        </p>
      </div>
    `;

    element
      .querySelector(
        ".task-header strong"
      )
      .textContent = subject;

    element
      .querySelector(
        ".task-header span"
      )
      .textContent = status;

    element
      .querySelectorAll(
        ".task-details strong"
      )[0]
      .textContent =
      schedule.job_type;

    element
      .querySelectorAll(
        ".task-details strong"
      )[1]
      .textContent =
      schedule.schedule_type;

    element
      .querySelectorAll(
        ".task-details strong"
      )[2]
      .textContent =
      nextRun;

    taskList.appendChild(
      element
    );
  }
}


/*
 * --------------------------------
 * CREATE SCHEDULE
 * --------------------------------
 */

scheduleForm?.addEventListener(
  "submit",
  async (event) => {

    event.preventDefault();

    const form =
      new FormData(
        scheduleForm
      );

    const recipient =
      String(
        form.get(
          "recipient"
        ) || ""
      )
        .trim()
        .toLowerCase();

    const subject =
      String(
        form.get(
          "subject"
        ) || ""
      ).trim();

    const body =
      String(
        form.get(
          "body"
        ) || ""
      );

    const timezone =
      String(
        form.get(
          "timezone"
        ) ||
        "Africa/Lagos"
      ).trim();

    const scheduledFor =
      String(
        form.get(
          "scheduled_for"
        ) || ""
      );

    const scheduleType =
      String(
        form.get(
          "schedule_type"
        ) ||
        "one_time"
      );

    const scheduleExpression =
      String(
        form.get(
          "schedule_expression"
        ) ||
        ""
      ).trim();


    const schedule = {

      job_type:
        "email",

      schedule_type:
        scheduleType,

      timezone,

      scheduled_for:
        scheduleType ===
        "one_time"
          ? scheduledFor
          : null,

      schedule_expression:
        scheduleType ===
        "recurring"
          ? scheduleExpression
          : null,

      config: {

        recipients:
          recipient
            .split(",")
            .map(
              email =>
                email.trim()
            )
            .filter(Boolean),

        subject,

        body,

        body_type:
          "html",
      },
    };


    const toastId =
      loading(
        "Creating schedule...",
        {
          title:
            "Schedule"
        }
      );


    try {

      const result =
        await createSchedule(
          schedule
        );

      updateToast(
        toastId,
        "success",
        "Schedule created successfully.",
        {
          title:
            "Schedule created"
        }
      );

      overlay?.classList.remove(
        "open"
      );

      scheduleForm.reset();

      await loadSchedules();

    } catch (err) {

      console.error(
        "[CREATE SCHEDULE]",
        err
      );

      updateToast(
        toastId,
        "error",
        err.message ||
          "Unable to create schedule.",
        {
          title:
            "Schedule failed"
        }
      );
    }
  }
);


/*
 * --------------------------------
 * INITIAL PAGE LOAD
 * --------------------------------
 */

await loadSchedules();