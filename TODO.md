# TODO
- hardcoded admin (cannot be disabled), normal admin
- too many normalizeGroup functions throughout the codebase, remove them. only need when validating user input in frontend

## Changes made
- Multiple user groups (use JSON to store)
- no more user id in db schema, use username as primary key
- use checkGroup function (i.e. checkGroup(userId, group))
