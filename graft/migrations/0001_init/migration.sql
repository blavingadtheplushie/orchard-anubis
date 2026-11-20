CREATE TABLE protected_apps (
  deployment_id uuid PRIMARY KEY REFERENCES public.deployments(id) ON DELETE CASCADE,
  excluded_paths text[] NOT NULL DEFAULT '{}',
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
