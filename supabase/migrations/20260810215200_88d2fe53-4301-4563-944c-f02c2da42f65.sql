DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sandbox_exec') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.products, public.brands TO sandbox_exec';
  END IF;
END $$;