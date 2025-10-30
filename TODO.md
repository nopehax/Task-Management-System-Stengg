# TODO



## Changes made

- Task_owner should be whoever picks up the task. ['Open', 'ToDo'] unassigned, ['Doing', 'Done', 'Closed'] cannot be null.
    - anyone can transition the state of a task as long as their permitted
- task_description can be empty
- task no need to have a plan (ANYTIME) i.e. plan can be empty
- when adding note, reject if status changed by another user before
- application is editable (except for name)
- use local time in notes
- when creating application, fields can be empty i.e. everything except acronym
- use transactions when updating applications
- send email (using nodemailer and ethereal mail) to project lead when task change from 'doing' to 'done'.
