"""Offline action-card library.

Cards are EXAMPLE content for the prototype. Real cards must be written and approved
by flight surgeons and follow the mission's flight rules. They are stored in code so the
app works with no network and no uplink. Environment-first steps come before anything
that involves medication.
"""
from __future__ import annotations

CARDS: dict[str, dict] = {
    "co2_environment": {
        "title": "Check the air first",
        "why": "Cabin CO2 is the most likely contributor to this pattern.",
        "steps": [
            "Check the CO2 readout for your module and the nearest ventilation path.",
            "Make sure vents and returns near your work and sleep area are not blocked.",
            "Ask the crew to check CO2 removal status with ground, if not already known.",
            "Spend time in a module with lower CO2 and note whether symptoms ease.",
            "Re-run the CrewCheck tomorrow; the app will track whether the link persists.",
        ],
        "escalate": "Symptoms worsen, or CO2 stays above the limit: contact ground and the crew medical officer.",
    },
    "humidity_temp": {
        "title": "Adjust the thermal environment",
        "why": "Temperature or humidity lines up with the change in symptoms.",
        "steps": [
            "Check the module's temperature and humidity set points.",
            "Adjust clothing layers and airflow near your sleep station.",
            "Log whether congestion or fatigue changes over the next two days.",
        ],
        "escalate": "Persistent congestion with fever or breathing difficulty: contact the crew medical officer.",
    },
    "radiation_context": {
        "title": "Note the radiation context",
        "why": "Symptoms line up with higher radiation dose rates.",
        "steps": [
            "Review recent dose-rate data and any solar or passage alerts from ground.",
            "Follow the mission's radiation protocol for shelter, if it applies.",
            "Record how you feel in the CrewCheck so the trend stays visible.",
        ],
        "escalate": "Nausea, vomiting or marked fatigue: contact the crew medical officer.",
    },
    "sleep_support": {
        "title": "Protect sleep",
        "why": "Sleep quality has dropped below your own baseline.",
        "steps": [
            "Keep a consistent sleep schedule and dim light 1 hour before sleep.",
            "Check noise and airflow at the sleep station.",
            "Check CO2 in the sleep area; poor air often shows up as poor sleep.",
        ],
        "escalate": "Sleep stays poor for a week or mood drops: tell the crew medical officer.",
    },
    "fatigue_load": {
        "title": "Ease the load",
        "why": "Fatigue and reaction time are both worse than your baseline.",
        "steps": [
            "Ask the commander to rebalance tasks that need fast reactions.",
            "Add a short break between demanding tasks.",
            "Avoid safety-critical solo tasks until reaction time recovers.",
        ],
        "escalate": "Reaction time stays slow for several days: contact the crew medical officer.",
    },
    "vision_escalate": {
        "title": "Contact the medical officer",
        "why": "A persistent vision change must be reviewed by a clinician.",
        "steps": [
            "Tell the crew medical officer today.",
            "Note what changed (blur, near or far, one or both eyes) and when it started.",
            "Follow ground medical guidance for any follow-up checks.",
        ],
        "escalate": "Sudden change, loss of vision, or severe headache: urgent contact now.",
    },
    "baseline_wait": {
        "title": "Keep checking in",
        "why": "CrewCompass is still learning your normal.",
        "steps": ["Complete the daily CrewCheck. A personal baseline needs about 12 check-ins."],
        "escalate": "Any severe or sudden symptom: contact the crew medical officer.",
    },
    "all_clear": {
        "title": "No action needed",
        "why": "Today looks like your normal.",
        "steps": ["Keep up the daily CrewCheck."],
        "escalate": "Anything that feels wrong: tell the crew medical officer.",
    },
}

ENV_TO_CARD = {"co2_mmhg": "co2_environment", "temp_c": "humidity_temp",
               "humidity_pct": "humidity_temp", "dose_rate_usv_h": "radiation_context"}


def recommend(status: dict, insights: list[dict]) -> list[dict]:
    """Pick cards for an astronaut from their status and cause analysis."""
    ids: list[str] = []
    level = status["level"]
    persistent = set(status.get("persistent", []))
    watching = set(status.get("watching", []))
    flagged = persistent | watching

    if level == "calibrating":
        ids = ["baseline_wait"]
    else:
        if "vision" in persistent:
            ids.append("vision_escalate")
        for ins in insights:
            if ins.get("status") == "ok" and ins["confidence"] != "none" and ins["symptom"] in flagged:
                ids.append(ENV_TO_CARD[ins["env"]])
        if {"sleep_quality"} & flagged:
            ids.append("sleep_support")
        if {"fatigue", "reaction_ms"} <= flagged or "reaction_ms" in persistent:
            ids.append("fatigue_load")
        if not ids and flagged:
            ids.append("co2_environment" if "headache" in flagged else "sleep_support")
        if not ids:
            ids = ["all_clear"]

    seen, out = set(), []
    for i in ids:
        if i not in seen:
            seen.add(i)
            out.append({"id": i, **CARDS[i]})
    return out
