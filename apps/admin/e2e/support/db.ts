import { Pool } from "pg";

type CountRow = {
  count: number;
};

type InvitationRow = {
  id: string;
};

type UserExistsRow = {
  exists: boolean;
};

let pool: Pool | null = null;

const getRequiredDatabaseUrl = () => {
  const value = process.env.DATABASE_URL?.trim();

  if (!value) {
    throw new Error("DATABASE_URL is required for core E2E database helpers.");
  }

  return value;
};

const getPool = () => {
  if (!pool) {
    pool = new Pool({
      connectionString: getRequiredDatabaseUrl(),
    });
  }

  return pool;
};

export const getLatestInvitationId = async (email: string) => {
  const result = await getPool().query<InvitationRow>(
    `
      select id
      from invitation
      where lower(email) = lower($1)
      order by created_at desc
      limit 1
    `,
    [email],
  );

  return result.rows[0]?.id ?? null;
};

export const userExists = async (email: string) => {
  const result = await getPool().query<UserExistsRow>(
    `
      select exists(
        select 1
        from "user"
        where lower(email) = lower($1)
      ) as exists
    `,
    [email],
  );

  return result.rows[0]?.exists ?? false;
};

export const getOrganizationMembershipCount = async (email: string) => {
  const result = await getPool().query<CountRow>(
    `
      select count(*)::int as count
      from member m
      join "user" u on u.id = m.user_id
      where lower(u.email) = lower($1)
    `,
    [email],
  );

  return result.rows[0]?.count ?? 0;
};

export const getTeamMembershipCount = async (email: string) => {
  const result = await getPool().query<CountRow>(
    `
      select count(*)::int as count
      from team_member tm
      join "user" u on u.id = tm.user_id
      where lower(u.email) = lower($1)
    `,
    [email],
  );

  return result.rows[0]?.count ?? 0;
};

export const closeCoreE2EDb = async () => {
  if (!pool) {
    return;
  }

  await pool.end();
  pool = null;
};
