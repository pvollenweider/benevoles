#!/usr/bin/env python3
"""
Anonymizes a pg_dump plain-SQL dump for local test use: replaces real names, emails, phone
numbers and password hashes with deterministic fake values, keyed off each row's id so the
same person keeps the same fake identity across tables (Volunteer/AdminUser) for readable
test data. Everything else (events, shifts, registrations, orgs) is left untouched.

Usage: python3 scripts/anonymize-dump.py <input.sql> <output.sql>

Never modifies the input file.
"""
import sys
import hashlib

FIRST_NAMES = [
    "Alice", "Benoit", "Camille", "David", "Elise", "Farid", "Gabrielle", "Hugo",
    "Ines", "Julien", "Karim", "Laura", "Marc", "Nadia", "Olivier", "Pauline",
    "Quentin", "Romane", "Samuel", "Tina", "Ugo", "Valerie", "William", "Yasmine",
]
LAST_NAMES = [
    "Dupont", "Martin", "Bernard", "Petit", "Durand", "Leroy", "Moreau", "Simon",
    "Laurent", "Lefebvre", "Michel", "Garcia", "David", "Bertrand", "Roux", "Vincent",
    "Fontaine", "Chevalier", "Robin", "Masson", "Sanchez", "Gerard", "Nguyen", "Boyer",
]

FAKE_PASSWORD_HASH = "ANONYMIZED-NOT-A-VALID-HASH-DO-NOT-USE"


def pick(pool, seed, salt):
    h = hashlib.sha256(f"{salt}:{seed}".encode()).hexdigest()
    return pool[int(h, 16) % len(pool)]


def fake_identity(row_id: str):
    first = pick(FIRST_NAMES, row_id, "first")
    last = pick(LAST_NAMES, row_id, "last")
    email = f"anon-{row_id.lower()}@example.test"
    phone = "0791234567"
    return first, last, email, phone


def process_volunteer(line: str) -> str:
    parts = line.rstrip("\n").split("\t")
    # id, firstName, lastName, email, phone, createdAt, updatedAt, organizationId, tags, active, notes
    row_id = parts[0]
    first, last, email, phone = fake_identity(row_id)
    parts[1] = first
    parts[2] = last
    parts[3] = email
    if parts[4] != "\\N":
        parts[4] = phone
    parts[10] = "\\N"  # notes may contain free text about the person; drop it
    return "\t".join(parts) + "\n"


def process_admin_user(line: str) -> str:
    parts = line.rstrip("\n").split("\t")
    # id, organizationId, email, name, passwordHash, role, isActive, setupToken,
    # setupTokenExpiresAt, passwordResetToken, passwordResetExpiresAt, createdAt, updatedAt
    row_id = parts[0]
    first, last, email, _phone = fake_identity(row_id)
    parts[2] = email
    parts[3] = f"{first} {last}"
    parts[4] = FAKE_PASSWORD_HASH
    parts[7] = "\\N"  # setupToken
    parts[9] = "\\N"  # passwordResetToken
    return "\t".join(parts) + "\n"


def main():
    if len(sys.argv) != 3:
        print("Usage: anonymize-dump.py <input.sql> <output.sql>", file=sys.stderr)
        sys.exit(1)

    src, dst = sys.argv[1], sys.argv[2]

    current_table = None
    counts = {"Volunteer": 0, "AdminUser": 0, "PushSubscription": 0}

    with open(src, "r", encoding="utf-8") as fin, open(dst, "w", encoding="utf-8") as fout:
        for line in fin:
            stripped = line.rstrip("\n")

            if stripped.startswith('COPY public."'):
                table = stripped.split('"')[1]
                current_table = table if table in counts else None
                fout.write(line)
                continue

            if stripped == "\\.":
                current_table = None
                fout.write(line)
                continue

            if current_table == "Volunteer":
                counts["Volunteer"] += 1
                fout.write(process_volunteer(line))
            elif current_table == "AdminUser":
                counts["AdminUser"] += 1
                fout.write(process_admin_user(line))
            elif current_table == "PushSubscription":
                # Device push tokens: no anonymization benefit, just drop the rows.
                counts["PushSubscription"] += 1
                continue
            else:
                fout.write(line)

    print(f"Anonymized: {counts['Volunteer']} volunteers, {counts['AdminUser']} admins, "
          f"dropped {counts['PushSubscription']} push subscriptions.")
    print(f"Written to {dst}")


if __name__ == "__main__":
    main()
