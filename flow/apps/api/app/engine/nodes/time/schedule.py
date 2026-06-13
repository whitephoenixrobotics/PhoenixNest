from datetime import datetime
from app.engine.nodes.base import BaseNodeHandler

# Maps Python datetime.weekday() index → human label
_DAY_NAMES = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"]


class ScheduleHandler(BaseNodeHandler):
    """
    Outputs True at the configured time.

    Modes:
      'once':  True once the target datetime has passed (stays True).
      'daily': True at the target time-of-day, only on selected weekdays.
               If `days` is empty, treats it as "every day".
    """

    async def execute(self, config: dict, inputs: dict) -> dict:
        target = str(config.get("datetime", "")).strip()
        mode = str(config.get("mode", "once"))
        days = config.get("days") or []  # list[int] 0=Mon..6=Sun

        if not target:
            return {"result": False, "on": False, "text": "ยังไม่ตั้งเวลา"}

        try:
            target_dt = datetime.fromisoformat(target)
        except ValueError:
            return {"result": False, "on": False, "text": "รูปแบบเวลาไม่ถูกต้อง"}

        now = datetime.now()

        if mode == "daily":
            now_minutes = now.hour * 60 + now.minute
            tgt_minutes = target_dt.hour * 60 + target_dt.minute
            time_matches = now_minutes == tgt_minutes
            day_matches = (not days) or (now.weekday() in days)
            active = time_matches and day_matches

            day_label = (
                ", ".join(_DAY_NAMES[d] for d in sorted(days)) if days else "ทุกวัน"
            )
            text = f"⏰ {target_dt.strftime('%H:%M')} ({day_label})"
        else:
            # 'once' — sticky True once the moment has passed
            active = now >= target_dt
            text = (
                "✅ ผ่านมาแล้ว"
                if active
                else f"⏰ {target_dt.strftime('%Y-%m-%d %H:%M')}"
            )

        return {
            "result": active,
            "on": active,
            "text": text,
            "now": now.strftime("%H:%M:%S"),
        }
