const allowedOwnerEmail = import.meta.env.VITE_ALLOWED_OWNER_EMAIL?.trim().toLowerCase() || null;

export function isOwnerEmail(email: string | undefined | null): boolean {
  if (!allowedOwnerEmail) return true;
  return email?.trim().toLowerCase() === allowedOwnerEmail;
}
