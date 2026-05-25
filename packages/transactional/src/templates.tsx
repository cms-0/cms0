import { render } from "@react-email/components";
import TeamInviteEmail from "../emails/team-invite.js";
import ResetPasswordEmail from "../emails/reset-password.js";
import type {
  TeamInviteProps,
  ResetPasswordProps,
} from "./types.js";

export async function renderTeamInvite(
  props: TeamInviteProps,
): Promise<string> {
  return await render(<TeamInviteEmail {...props} />);
}

export async function renderResetPassword(
  props: ResetPasswordProps,
): Promise<string> {
  return await render(<ResetPasswordEmail {...props} />);
}
