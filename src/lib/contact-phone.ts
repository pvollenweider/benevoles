/**
 * The phone number to show admins and sector leaders for a registration: the one given on the
 * public form for this very registration first (Registration.phone), else the volunteer
 * profile's. The profile isn't updated from an unverified public submission (#285), so a phone
 * required by the event (Event.requirePhone) only lives on the registration for an
 * already-known volunteer.
 */
export function contactPhone(reg: { phone?: string | null; volunteer: { phone: string | null } }): string | null {
  return reg.phone?.trim() || reg.volunteer.phone?.trim() || null
}
