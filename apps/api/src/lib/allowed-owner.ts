export function getAllowedOwnerEmail(): string | null {
  const email = process.env.ALLOWED_OWNER_EMAIL?.trim().toLowerCase();
  return email || null;
}

export function isOwnerEmail(email: string | undefined | null): boolean {
  const allowed = getAllowedOwnerEmail();
  if (!allowed) return true;
  return email?.trim().toLowerCase() === allowed;
}
