UPDATE public.profiles
SET plan = 'scale',
    trial_ends_at = now() + interval '365 days',
    updated_at = now()
WHERE id = '437f7c16-46a1-43e0-9ced-31fbf6c31aff';