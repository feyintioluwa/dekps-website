-- Adds the Basic 6 class (between Basic 5 = 80 and JSS 1 = 90). Safe to run more than once.
-- Student Login IDs for this class start with DKPSPRY6.
insert into classes (id, name, sort_order, id_prefix)
select gen_random_uuid(), 'Basic 6', 85, 'DKPSPRY6'
where not exists (select 1 from classes where name = 'Basic 6');

notify pgrst, 'reload schema';
