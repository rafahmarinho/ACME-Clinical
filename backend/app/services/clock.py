from datetime import datetime, timezone


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def parse(value: str | datetime | None) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    v = value.replace("Z", "+00:00")
    # PostgREST may return fractional seconds with fewer than 6 digits.
    if "." in v:
        head, rest = v.split(".", 1)
        frac = ""
        tz = ""
        for i, ch in enumerate(rest):
            if not ch.isdigit():
                frac, tz = rest[:i], rest[i:]
                break
        else:
            frac = rest
        v = f"{head}.{frac[:6].ljust(6, '0')}{tz}"
    dt = datetime.fromisoformat(v)
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()
