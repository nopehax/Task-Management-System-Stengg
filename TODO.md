# TODO
- createdAdmin cannot edit hardcoded admin details
- hardcoded admin cannot remove admin from itself
- after updating groups in user management page, when an admin goes to update profile page, the groups isn't updated. have to refresh first then the groups will update

## Changes made
- Multiple user groups (use JSON to store)
- no more user id in db schema, use username as primary key
- use checkGroup function (i.e. checkGroup(userId, group))
