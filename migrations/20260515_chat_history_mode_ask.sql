-- Normalize chat_history.mode values from tutor to ask and support ask in the mode constraint
BEGIN;

ALTER TABLE public.chat_history
  DROP CONSTRAINT IF EXISTS chat_history_mode_check;

UPDATE public.chat_history
SET mode = 'ask'
WHERE mode = 'tutor';

ALTER TABLE public.chat_history
  ADD CONSTRAINT chat_history_mode_check CHECK (
    mode = ANY (ARRAY['problem'::text, 'ask'::text, 'research'::text, 'simplify'::text, 'hints'::text, 'rewrites'::text])
  );

COMMIT;
