-- 032: a new account role for property managers / caretakers.
-- Kept in its own migration: a new enum value cannot be used in the transaction that adds it.
-- What a manager may actually touch is decided per property by `property_staff` (033); the role alone grants nothing.
alter type public.user_role add value if not exists 'manager';
