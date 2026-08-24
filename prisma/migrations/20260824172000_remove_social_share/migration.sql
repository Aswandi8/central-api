-- Remove Social Share RBAC assignments first.
DELETE FROM "role_permission"
WHERE "permissionId" IN (
  SELECT "id"
  FROM "permission"
  WHERE "name" IN (
    'social_share.read',
    'social_share.create',
    'social_share.update',
    'social_share.delete'
  )
);

-- Remove Social Share permissions.
DELETE FROM "permission"
WHERE "name" IN (
  'social_share.read',
  'social_share.create',
  'social_share.update',
  'social_share.delete'
);

-- Remove Social Share data/model.
DROP TABLE IF EXISTS "social_share";
DROP TYPE IF EXISTS "SocialShareStatus";
