"""Smallest check for the DB-layer helpers: run `python test_db.py`."""
from app import _norm_roll, _num

assert _norm_roll("042") == "42"
assert _norm_roll("42") == "42"
assert _norm_roll("000") == "0"
assert _norm_roll("") == "0"
assert _norm_roll(" 7 ") == "7"
assert _num("12.00") == 12.0
assert _num(None) == 0.0
assert _num("bad") == 0.0
print("ok")
