# Task Management System

A full-stack web app for managing applications/projects, their plans/milestones, and the tasks that flow through them. Access is authenticated, and what a user can do is controlled by their user groups.

---

## 1. Overview

This system lets you:

- define **applications** (the top-level thing you’re working on),
- define **plans** (milestones/sprints) under an application,
- create **tasks** tied to an application (optionally to a plan),
- move tasks through a **fixed workflow** (Open → To Do ⇄ Doing ⇄ Done → Closed),
- enforce **per-state permissions** so only the right groups can perform actions,
- manage **applications** themselves (view for everyone, edit for privileged users),
- optionally send **email notifications** to users in a permitted group.

It’s meant for small internal teams that already have user groups and want a lightweight Jira-like flow without a ton of config.

---

## 2. Features

- **Authentication**
  - Users must be logged in to see anything.
  - User accounts are stored in the database with username as primary key.
  - Each account has an email and a list of user groups.

- **Application Management**
  - All authenticated users can view the list of applications.
  - A privileged group (e.g. `project lead`) can **create** new applications.
  - The same privileged group can **edit** existing application rows inline:
    - description
    - start / end date
    - all 5 permission lists
  - Some fields are **not** editable (e.g. the acronym/key, running task counter).

- **Plan Management**
  - Everyone can read/list plans.
  - A specific group (e.g. `project manager`) can create new plans for an application.
  - Plans have start/end dates and are linked to an application.

- **Task Management**
  - Everyone (authenticated) can **view** tasks.
  - Only users whose **group is in the application’s “create” list** can create a task for that application.
  - Task IDs are derived from the application (e.g. `<APP>_<number>`), so tasks are easy to trace back.
  - Tasks can have notes, owner, creator, state, optional plan.

- **Kanban-style Task Page**
  - Tasks are shown in columns by state.
  - Clicking a task opens a modal with details.
  - There are modals for “add task” and “add plan”.
  - Available buttons in the modal depend on the task’s current state and your groups.

- **Per-State Permissions**
  - Each application stores **which groups** can act on tasks in:
    - Create
    - Open
    - To Do
    - Doing
    - Done
  - When a task is in a given state, **that state’s list** is used to check if the user can do anything to it.
  - Closed tasks are read-only.

- **Email (optional)**
  - Can send an email to all users whose groups match the application’s “create” list.
  - Uses Nodemailer + Ethereal test mail (can be per-call or fixed account).

---

## 3. Architecture / Tech Stack

- **Frontend**: React (SPA)
  - Login screen
  - Application management page (table with inline edit, plus create row)
  - Task board (columns, modals)
  - Uses date inputs (`yyyy-MM-dd`) and chips/multi-select for groups

- **Backend**: Node.js + Express
  - REST-style endpoints under `/api/...`
  - Authentication middleware
  - Role/group checks on protected routes
  - Uses DB transactions for important updates (e.g. application update, task-related updates)

- **Database**: MySQL (schema in `init.sql`)
  - `accounts` (users, emails, groups)
  - `applications` (acronym, description, start/end, permits, running number)
  - `plans` (per-application milestones)
  - `tasks` (stateful items referencing application + optional plan)

- **Notifications**: Nodemailer + Ethereal (dev-friendly)

---

## 4. Data & Permissions Model

- **Users**:
  - Stored in `accounts`
  - Each has: `username` (PK), `email`, `password` (hashed), `userGroups` (JSON array)

- **Groups**:
  - A user can belong to multiple groups
  - There isn’t a separate “users in group” table; the group membership lives on the user

- **Applications**:
  - Each application defines 5 arrays of groups:
    - who can create tasks
    - who can act on “Open”
    - who can act on “To Do”
    - who can act on “Doing”
    - who can act on “Done”
  - These drive both the UI (which buttons show) and the backend (which actions are allowed)

- **Tasks**:
  - Always tied to an application
  - Optionally tied to a plan
  - State determines what actions are available
  - State transition permission = groups listed for the **current** state

---

## 5. Task Workflow

- **States** (final version):
  - `Open`
  - `To Do`
  - `Doing`
  - `Done`
  - `Closed` (fully locked)

- **Typical transitions**:
  - Open → To Do (Release)
  - To Do → Doing (Pick up)
  - Doing → Done (Review)
  - Doing → To Do (Drop / send back)
  - Done → Closed (Approve; only if plan not changed)
  - Done → Doing (Reject; can commit plan change)

- **Plan editing rules** (final version):
  - In **Open** and **Done** the user can change the plan **in the modal**, but the change is **only sent when they click the state action button**.
  - In **To Do** and **Doing** the plan is disabled.
  - In **Closed** everything is read-only.

---

## 6. API (High-Level)

- **Auth**
  - `POST /api/login`
  - `POST /api/logout`
  - `GET /api/me` to get current user + groups

- **Applications**
  - `GET /api/applications` — anyone authenticated
  - `POST /api/applications` — group: “project lead”
  - `PATCH /api/applications/:acronym` — group: “project lead”, **wrapped in DB transaction**

- **Plans**
  - `GET /api/plans` — authenticated
  - `POST /api/plans` — group: “project manager”

- **Tasks**
  - `GET /api/tasks` — authenticated
  - `POST /api/tasks` — user must be in the app’s “create” permit
  - `PATCH /api/tasks/:taskId` — uses the **current** task state to check if user can perform the requested change; also uses a transaction

- **Notifications** (optional helper)
  - `triggerEmailSend(taskId, appAcronym)` — looks up app, finds groups in create-permit, finds accounts with those groups, dedupes, sends mail via Ethereal

---
