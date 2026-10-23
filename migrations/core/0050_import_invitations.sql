-- Source review may request one native invitation, never an active membership.
CREATE TABLE bw_import_invitations(source_key TEXT PRIMARY KEY, import_id TEXT NOT NULL, account_id TEXT NOT NULL, invitation_id TEXT NOT NULL);
