# TODO

- Task_owner should be whoever picks up the task. ['Open', 'ToDo'] unassigned, ['Doing', 'Done', 'Closed'] cannot be null.
- send email (using nodemailer and ethereal mail) to project lead when task change from 'doing' to 'done'.
- UI colours match with figma


## Changes made

- fix issue now checks current state to see if can switch to target state.
- fix issue now display error messages
- remove handleImmediatePlanChange
- fix issue now allow no plan when creating tasks