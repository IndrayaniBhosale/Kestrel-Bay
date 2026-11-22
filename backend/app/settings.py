"""Fixed business settings. Each one traces back to the kickoff call or Dana's email."""
from datetime import date
import os

# The assignment says to treat Monday Nov 16, 2026 as today.
TODAY = date.fromisoformat(os.environ.get("TODAY", "2026-11-16"))

# Stock Dana can actually sell. QA-HOLD and DAMAGED are not inventory (Walt, kickoff call).
SELLABLE_LOCATIONS = {"NB", "PVD", "HCS"}
HARBOR = "HCS"

# "Nobody will take it with less than six months left" (Dana). Lots stop counting
# as sellable stock on expiry date minus this many months.
MIN_MONTHS_LEFT = 6

# Harbor Cold Storage: $30 per pallet per month, about 50 cases per pallet (Dana's email).
HARBOR_COST_PER_PALLET = 30.0
HARBOR_CASES_PER_PALLET = 50

# More than this many weeks of stock at Harbor counts as "too much" (confirmed by Dana).
HARBOR_TOO_MANY_WEEKS = 26

# Dana confirmed these have stopped selling and should be treated as discontinued.
DISCONTINUED_BY_DANA = {"TIL-FIL", "SHR-6170", "PAN-1012"}

# Real lead times and safety stock in days (Dana confirmed). The BlueTide vendor sheet is out of date.
# cover_days: how much demand a suggested order should cover after it arrives.
VENDOR_DEFAULTS = {
    "BXE": {"lead_days": 84, "safety_days": 14, "cover_days": 56},  # Vietnam, 10-12 weeks
    "AFS": {"lead_days": 42, "safety_days": 14, "cover_days": 56},  # Chile, about 6 weeks
    "MNP": {"lead_days": 14, "safety_days": 7, "cover_days": 28},   # Canada, about 2 weeks
    "ASP": {"lead_days": 28, "safety_days": 7, "cover_days": 28},   # Alaska
    "DLC": {"lead_days": 21, "safety_days": 7, "cover_days": 28},   # Maine, 2-3 weeks
    "OCN": {"lead_days": 45, "safety_days": 7, "cover_days": 28},   # old vendor, no longer used
}

# Customers whose orders are not real demand.
TRANSFER_CUSTOMER = "INT01"   # "TRANSFER - PVD": stock moving between buildings
ONE_OFF_CUSTOMERS = {"CRU01"}  # cruise line order last spring, never came back

# How far ahead we project, in days. Covers Vietnam lead time plus safety and the six-month line.
HORIZON_DAYS = 189  # 27 weeks
