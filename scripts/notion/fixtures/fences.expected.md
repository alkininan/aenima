# Fences
A fence with no language must not let Notion guess one:
```text
dev        pnpm dev
test       pnpm test                 # vitest, whole suite
```
A fence that declares its language keeps it:
```sql
delete from membership m using auth.users u
 where m.user_id = u.id;
```
```css
:root { --bg-base: #08090C; }
```
